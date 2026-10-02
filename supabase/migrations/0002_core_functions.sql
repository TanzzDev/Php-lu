-- =====================================================================
-- MDFlix — fungsi inti (bagian 2)
-- Semua fungsi SECURITY DEFINER di sini hanya boleh dieksekusi service_role
-- (lihat 0005_security.sql). Parameter p_now hanya untuk pengujian.
-- =====================================================================

-- Konstanta perilaku watch-session (satu tempat, dipakai semua fungsi)
create or replace function public._mdflix_const(p_name text)
returns numeric language sql immutable as $$
  select case p_name
    when 'HEARTBEAT_SECONDS'       then 15    -- interval heartbeat nominal dari klien
    when 'MAX_CREDIT_SECONDS'      then 30    -- batas kredit per heartbeat (2 interval)
    when 'STALE_SECONDS'           then 75    -- diam selama ini => sesi dianggap mati
    when 'MIN_GAP_SECONDS'         then 1     -- heartbeat berulang lebih cepat dari ini diabaikan
    when 'WATCHING_WINDOW_SECONDS' then 45    -- jendela "sedang menonton" untuk admin
    when 'COMPLETE_RATIO'          then 0.95  -- >= 95% dianggap selesai
  end
$$;

-- Helper audit (aktor di-snapshot supaya jejak bertahan setelah akun dihapus)
create or replace function public._mdflix_audit(
  p_actor uuid, p_action text, p_target_type text, p_target_id text,
  p_target_user uuid, p_transaction uuid, p_metadata jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text; v_role text; v_label text;
begin
  if p_actor is not null then
    select email, role into v_email, v_role from public.profiles where id = p_actor;
  end if;
  if p_target_user is not null then
    select coalesce(email, display_name) into v_label from public.profiles where id = p_target_user;
  end if;
  insert into public.audit_logs
    (actor_id, actor_email, actor_role, action, target_type, target_id, target_user_id, target_label, transaction_id, metadata)
  values
    (p_actor, v_email, case when p_actor is null then 'SYSTEM' else v_role end,
     p_action, p_target_type, p_target_id, p_target_user, v_label, p_transaction, coalesce(p_metadata, '{}'::jsonb));
end $$;

create or replace function public.mdflix_setting(p_key text, p_default jsonb default null)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.app_settings where key = p_key), p_default);
$$;

-- Plan efektif: plan berbayar yang sudah lewat expires_at otomatis menjadi FREE.
-- Tidak ada data yang dihapus (akun, profil, riwayat, My List tetap utuh).
create or replace function public.mdflix_effective_plan(p_user uuid, p_at timestamptz default null)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select case when m.plan <> 'FREE' and m.expires_at > coalesce(p_at, now()) then m.plan else 'FREE' end
       from public.memberships m where m.user_id = p_user),
    'FREE');
$$;

-- Keadaan kuota user pada waktu p_at. Hari kuota = tanggal kalender di zona waktu
-- settings.free.timezone (default Asia/Jakarta) → reset tiap 00:00 zona tersebut.
create or replace function public.mdflix_quota_state(p_user uuid, p_at timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_at    timestamptz := coalesce(p_at, now());
  v_free  jsonb   := public.mdflix_setting('free', '{"dailySeconds":3600,"timezone":"Asia/Jakarta"}'::jsonb);
  v_tz    text    := coalesce(v_free->>'timezone', 'Asia/Jakarta');
  v_daily numeric := coalesce((v_free->>'dailySeconds')::numeric, 3600);
  v_day   date    := (v_at at time zone v_tz)::date;
  v_plan  text    := public.mdflix_effective_plan(p_user, v_at);
  v_used  numeric;
begin
  select seconds into v_used from public.watch_usage_daily where user_id = p_user and usage_date = v_day;
  v_used := coalesce(v_used, 0);
  return jsonb_build_object(
    'plan',             v_plan,
    'unlimited',        v_plan <> 'FREE',
    'dailySeconds',     v_daily,
    'usedSeconds',      round(v_used, 3),
    'remainingSeconds', case when v_plan = 'FREE' then round(greatest(v_daily - v_used, 0), 3) else null end,
    'resetsAt',         ((v_day + 1)::timestamp at time zone v_tz)
  );
end $$;

-- Tambah pemakaian hari itu. FREE dibatasi sisa kuota; PREMIUM/PRO tetap dicatat
-- (analytics) tetapi tidak dibatasi. Mengembalikan detik yang benar-benar dikreditkan.
create or replace function public._mdflix_credit_seconds(p_user uuid, p_seconds numeric, p_at timestamptz)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_free   jsonb   := public.mdflix_setting('free', '{"dailySeconds":3600,"timezone":"Asia/Jakarta"}'::jsonb);
  v_tz     text    := coalesce(v_free->>'timezone', 'Asia/Jakarta');
  v_daily  numeric := coalesce((v_free->>'dailySeconds')::numeric, 3600);
  v_day    date    := (p_at at time zone v_tz)::date;
  v_credit numeric := greatest(coalesce(p_seconds, 0), 0);
  v_used   numeric;
begin
  if v_credit = 0 then return 0; end if;
  insert into public.watch_usage_daily (user_id, usage_date, seconds) values (p_user, v_day, 0)
    on conflict (user_id, usage_date) do nothing;
  select seconds into v_used from public.watch_usage_daily
    where user_id = p_user and usage_date = v_day for update;
  if public.mdflix_effective_plan(p_user, p_at) = 'FREE' then
    v_credit := least(v_credit, greatest(v_daily - v_used, 0));
  end if;
  update public.watch_usage_daily
     set seconds = round(seconds + v_credit, 3), updated_at = p_at
   where user_id = p_user and usage_date = v_day;
  return round(v_credit, 3);
end $$;

-- Tutup sesi aktif; jika terakhir "playing", kredit ekor interval (dibatasi).
create or replace function public._mdflix_close_session(
  p_session uuid, p_status text, p_reason text, p_at timestamptz)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.watch_sessions%rowtype; v_credited numeric := 0;
begin
  select * into s from public.watch_sessions where id = p_session for update;
  if not found or s.status <> 'ACTIVE' then return 0; end if;
  if s.last_state = 'playing' then
    v_credited := public._mdflix_credit_seconds(
      s.user_id,
      least(greatest(extract(epoch from (p_at - s.last_heartbeat_at)), 0), public._mdflix_const('MAX_CREDIT_SECONDS')),
      p_at);
  end if;
  update public.watch_sessions
     set status = p_status, ended_at = p_at, end_reason = p_reason,
         accumulated_seconds = accumulated_seconds + v_credited
   where id = p_session;
  return v_credited;
end $$;

-- ---------------------------------------------------------------------
-- Membership
-- Aturan (konsisten & terdokumentasi):
--  STACK  (pembelian & perpanjangan admin): masa berlaku ditambahkan dari
--         expires_at yang sedang berjalan (atau dari sekarang jika sudah tidak
--         aktif). Tidak pernah memperpendek. Label plan mengambil tier lebih
--         tinggi (PRO > PREMIUM) selama masa berlaku — Premium dan Pro sama-sama
--         unlimited, sehingga "upgrade" berarti menambah masa aktif.
--  SET    (admin "ubah plan"): plan & masa berlaku ditimpa eksplisit dan di-audit.
--  REVOKE (admin): kembali ke FREE.
-- ---------------------------------------------------------------------
create or replace function public.mdflix_apply_membership(
  p_user uuid, p_plan text, p_days integer, p_mode text,
  p_actor uuid default null, p_source text default 'admin',
  p_transaction uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cur public.memberships%rowtype;
  v_active boolean; v_base timestamptz;
  v_plan text; v_start timestamptz; v_exp timestamptz; v_action text;
  v_rank_cur integer; v_rank_new integer;
begin
  if p_mode not in ('STACK', 'SET', 'REVOKE') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  if p_mode <> 'REVOKE' and (p_plan not in ('PREMIUM', 'PRO') or p_days is null or p_days < 1 or p_days > 3660) then
    raise exception 'invalid plan or days' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND');
  end if;

  insert into public.memberships (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into cur from public.memberships where user_id = p_user for update;
  v_active := cur.plan <> 'FREE' and cur.expires_at > now();

  if p_mode = 'REVOKE' then
    v_plan := 'FREE'; v_start := null; v_exp := null; v_action := 'MEMBERSHIP_REVOKED';
  elsif p_mode = 'SET' then
    v_plan := p_plan; v_start := now(); v_exp := now() + make_interval(days => p_days);
    v_action := 'MEMBERSHIP_CHANGED';
  else
    v_base := case when v_active then cur.expires_at else now() end;
    v_exp  := v_base + make_interval(days => p_days);
    v_rank_cur := case cur.plan when 'PRO' then 2 when 'PREMIUM' then 1 else 0 end;
    v_rank_new := case p_plan   when 'PRO' then 2 else 1 end;
    v_plan  := case when v_active and v_rank_cur > v_rank_new then cur.plan else p_plan end;
    v_start := case when v_active then cur.started_at else now() end;
    v_action := case when v_active then 'MEMBERSHIP_EXTENDED' else 'MEMBERSHIP_ACTIVATED' end;
  end if;

  update public.memberships
     set plan = v_plan, started_at = v_start, expires_at = v_exp, expiry_logged_at = null
   where user_id = p_user;

  perform public._mdflix_audit(p_actor, v_action, 'membership', p_user::text, p_user, p_transaction,
    jsonb_build_object(
      'source', p_source, 'mode', p_mode, 'days', p_days, 'note', p_note,
      'from', jsonb_build_object('plan', cur.plan, 'expiresAt', cur.expires_at, 'active', v_active),
      'to',   jsonb_build_object('plan', v_plan, 'expiresAt', v_exp)));

  return jsonb_build_object('ok', true, 'action', v_action, 'plan', v_plan, 'startedAt', v_start, 'expiresAt', v_exp);
end $$;

-- Catat (sekali) bahwa membership berbayar user sudah lewat masa berlaku.
-- Tidak mengubah plan/expires_at — plan efektif sudah otomatis FREE.
create or replace function public.mdflix_expire_if_needed(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.memberships%rowtype;
begin
  select * into m from public.memberships where user_id = p_user for update;
  if not found then return jsonb_build_object('expired', false); end if;
  if m.plan <> 'FREE' and m.expires_at <= now() and m.expiry_logged_at is null then
    update public.memberships set expiry_logged_at = now() where user_id = p_user;
    perform public._mdflix_audit(null, 'MEMBERSHIP_EXPIRED', 'membership', p_user::text, p_user, null,
      jsonb_build_object('plan', m.plan, 'expiredAt', m.expires_at));
    return jsonb_build_object('expired', true, 'plan', m.plan, 'expiredAt', m.expires_at);
  end if;
  return jsonb_build_object('expired', false);
end $$;
