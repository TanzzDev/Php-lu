-- =====================================================================
-- MDFlix — 0007: 100% gratis
-- Menghapus membership berbayar, transaksi/pembayaran, dan kuota/timer menonton.
-- =====================================================================
-- Mulai migrasi ini MDFlix tidak lagi punya paket Free/Premium/Pro, transaksi,
-- payment gateway, maupun batas waktu menonton. Setiap user yang login menonton
-- tanpa batas.
--
-- Sesi menonton (watch_sessions) TETAP ada, tetapi HANYA untuk:
--   * progres & Continue Watching (watch_history)
--   * monitoring admin ("Sedang menonton")
--   * satu pemutaran aktif per akun
-- dan tidak pernah dipakai untuk membatasi user.
--
-- PERINGATAN: migrasi ini MENGHAPUS tabel memberships, transactions, dan
-- watch_usage_daily. Bila database Anda punya transaksi berstatus PAID,
-- migrasi berhenti (guard di bawah) agar data uang tidak hilang diam-diam —
-- arsipkan dulu, mis.:  pg_dump -t public.transactions > transactions.sql
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------- 0. Guard: jangan hapus catatan uang yang nyata ----------
do $$
declare v_paid bigint;
begin
  if to_regclass('public.transactions') is not null then
    execute 'select count(*) from public.transactions where status = ''PAID''' into v_paid;
    if v_paid > 0 then
      raise exception 'Migrasi 0007 dihentikan: ditemukan % transaksi berstatus PAID. Arsipkan public.transactions terlebih dahulu (mis. pg_dump -t public.transactions), lalu jalankan ulang.', v_paid
        using errcode = 'P0001';
    end if;
  end if;
end $$;

-- ---------- 1. View yang bergantung pada objek yang akan dihapus ----------
drop view if exists public.admin_watching_v;
drop view if exists public.admin_users_v;

-- ---------- 2. watch_sessions: buang konsep plan & status kuota ----------
update public.watch_sessions
   set status = 'ENDED', end_reason = coalesce(end_reason, 'legacy')
 where status = 'QUOTA_EXCEEDED';
alter table public.watch_sessions drop constraint if exists watch_sessions_status_check;
alter table public.watch_sessions
  add constraint watch_sessions_status_check check (status in ('ACTIVE', 'ENDED', 'EXPIRED', 'SUPERSEDED'));
alter table public.watch_sessions drop column if exists plan_at_start;

-- ---------- 3. Fungsi watch-session tanpa kuota ----------
-- Kredit detik hanya menambah accumulated_seconds pada sesi itu (analytics) —
-- tidak ada pemakaian harian, tidak ada plan, tidak ada batas.
create or replace function public._mdflix_credit_seconds(p_user uuid, p_seconds numeric, p_at timestamptz)
returns numeric language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return round(greatest(coalesce(p_seconds, 0), 0), 3);
end $$;

-- Mulai sesi. Menutup sesi lama user (satu pemutaran aktif per akun), lalu membuat
-- sesi baru dalam keadaan "paused". Tidak ada pemeriksaan kuota.
create or replace function public.mdflix_watch_start(
  p_user uuid, p_content_type text, p_content_id text,
  p_series_id text default null, p_season integer default null, p_episode integer default null,
  p_title text default null, p_episode_title text default null,
  p_poster text default null, p_image text default null, p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_active boolean; v_prev uuid; v_id uuid; v_resume jsonb;
begin
  -- serialisasi start per user (unique index tetap menjadi jaring pengaman terakhir)
  perform pg_advisory_xact_lock(hashtextextended('mdflix_watch:' || p_user::text, 0));

  select is_active into v_active from public.profiles where id = p_user;
  if v_active is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_DISABLED');
  end if;

  select id into v_prev from public.watch_sessions where user_id = p_user and status = 'ACTIVE' for update;
  if v_prev is not null then
    perform public._mdflix_close_session(v_prev, 'SUPERSEDED', 'new_session', v_now);
  end if;

  insert into public.watch_sessions
    (user_id, content_type, content_id, series_id, season_number, episode_number,
     title, episode_title, poster_url, image_url, started_at, last_heartbeat_at)
  values
    (p_user, p_content_type, p_content_id, p_series_id, p_season, p_episode,
     left(p_title, 300), left(p_episode_title, 300), p_poster, p_image, v_now, v_now)
  returning id into v_id;

  select jsonb_build_object('positionSeconds', position_seconds, 'percentage', percentage, 'completed', completed)
    into v_resume
    from public.watch_history
   where user_id = p_user and content_type = p_content_type and content_id = p_content_id;

  return jsonb_build_object(
    'ok', true, 'sessionId', v_id, 'resume', v_resume,
    'heartbeatSeconds', public._mdflix_const('HEARTBEAT_SECONDS'));
end $$;

-- Heartbeat (juga dipakai untuk "end" lewat p_final = true). Waktu SELALU dari jam
-- server; klien tidak pernah mengirim jumlah detik. Tidak ada kuota yang bisa
-- menghentikan pemutaran — sesi hanya berakhir karena video selesai, klien menutup
-- player, sesi dipindahkan ke perangkat lain, atau klien diam terlalu lama.
create or replace function public.mdflix_watch_beat(
  p_user uuid, p_session uuid, p_seq integer, p_state text,
  p_position numeric default null, p_duration numeric default null,
  p_final boolean default false, p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.watch_sessions%rowtype;
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_gap numeric; v_credited numeric := 0;
  v_pos numeric; v_dur numeric; v_pct numeric; v_done boolean;
  v_status text := 'ACTIVE'; v_reason text;
begin
  if p_state not in ('playing', 'paused', 'buffering', 'ended') then
    raise exception 'invalid state' using errcode = '22023';
  end if;

  select * into s from public.watch_sessions where id = p_session and user_id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND');
  end if;

  if s.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'code', 'SESSION_ENDED', 'reason', s.status);
  end if;

  -- duplikat / replay: seq harus benar-benar naik, tanpa efek samping
  if p_seq is null or p_seq <= s.last_seq then
    return jsonb_build_object('ok', true, 'duplicate', true, 'credited', 0);
  end if;

  v_gap := greatest(extract(epoch from (v_now - s.last_heartbeat_at)), 0);

  -- klien diam terlalu lama → sesi mati (jam server yang menentukan)
  if v_gap > public._mdflix_const('STALE_SECONDS') then
    perform public._mdflix_close_session(s.id, 'EXPIRED', 'stale', v_now);
    return jsonb_build_object('ok', false, 'code', 'SESSION_STALE');
  end if;

  -- heartbeat terlalu rapat dengan keadaan sama: abaikan (mencegah data abnormal)
  if v_gap < public._mdflix_const('MIN_GAP_SECONDS') and p_state = s.last_state and not p_final then
    return jsonb_build_object('ok', true, 'throttled', true, 'credited', 0);
  end if;

  if s.last_state = 'playing' then
    v_credited := public._mdflix_credit_seconds(
      p_user, least(v_gap, public._mdflix_const('MAX_CREDIT_SECONDS')), v_now);
  end if;

  v_dur := case when p_duration is not null and p_duration > 0 then least(p_duration, 172800) else s.duration_seconds end;
  v_pos := greatest(coalesce(p_position, s.last_position), 0);
  if v_dur is not null and v_dur > 0 then v_pos := least(v_pos, v_dur); end if;
  v_pct  := case when v_dur is not null and v_dur > 0 then least(round(v_pos * 100 / v_dur, 2), 100) else 0 end;
  v_done := p_state = 'ended'
            or (v_dur is not null and v_dur > 0 and v_pos >= v_dur * public._mdflix_const('COMPLETE_RATIO'));

  if p_final or p_state = 'ended' then
    -- klien menutup player, atau video sudah selesai diputar: sesi berakhir
    v_status := 'ENDED'; v_reason := case when p_final then 'client_end' else 'video_ended' end;
  end if;

  update public.watch_sessions set
    last_seq = p_seq, last_state = p_state, last_heartbeat_at = v_now,
    last_position = v_pos, duration_seconds = coalesce(v_dur, duration_seconds),
    accumulated_seconds = accumulated_seconds + v_credited,
    status = v_status, ended_at = case when v_status <> 'ACTIVE' then v_now end, end_reason = v_reason
  where id = s.id;

  if p_position is not null then
    insert into public.watch_history
      (user_id, content_type, content_id, series_id, season_number, episode_number, title, episode_title,
       poster_url, image_url, position_seconds, duration_seconds, percentage, completed, first_watched_at, last_watched_at)
    values
      (p_user, s.content_type, s.content_id, s.series_id, s.season_number, s.episode_number, s.title, s.episode_title,
       s.poster_url, s.image_url, v_pos, v_dur, v_pct, v_done, v_now, v_now)
    on conflict (user_id, content_type, content_id) do update set
      position_seconds = excluded.position_seconds,
      duration_seconds = coalesce(excluded.duration_seconds, public.watch_history.duration_seconds),
      percentage       = excluded.percentage,
      completed        = excluded.completed,
      last_watched_at  = excluded.last_watched_at,
      title            = coalesce(excluded.title, public.watch_history.title),
      episode_title    = coalesce(excluded.episode_title, public.watch_history.episode_title),
      poster_url       = coalesce(excluded.poster_url, public.watch_history.poster_url),
      image_url        = coalesce(excluded.image_url, public.watch_history.image_url);
  end if;

  return jsonb_build_object('ok', true, 'credited', v_credited, 'reason', v_reason, 'sessionStatus', v_status);
end $$;

-- ---------- 4. Profil baru: tidak ada lagi baris membership ----------
create or replace function public.mdflix_handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text; v_avatar text;
begin
  begin
    v_name := nullif(left(btrim(coalesce(
      new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1))), 80), '');
    v_avatar := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
    if v_avatar is null or v_avatar !~* '^https://' or char_length(v_avatar) > 500 then v_avatar := null; end if;

    insert into public.profiles (id, email, display_name, avatar_url, last_login_at)
    values (new.id, new.email, v_name, v_avatar, new.last_sign_in_at)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'mdflix_handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- ---------- 5. Pengaturan: hanya 'support' dan 'branding' ----------
create or replace function public.mdflix_validate_setting()
returns trigger language plpgsql as $$
begin
  if new.key not in ('support', 'branding') then
    raise exception 'unknown setting key' using errcode = '22023';
  end if;

  if new.key = 'support' then
    if coalesce(new.value->>'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
       or char_length(coalesce(new.value->>'phone', '')) not between 6 and 32 then
      raise exception 'invalid support setting' using errcode = '22023';
    end if;
  elsif new.key = 'branding' then
    if char_length(coalesce(new.value->>'name', '')) not between 1 and 40 then
      raise exception 'invalid branding.name' using errcode = '22023';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

create or replace function public.mdflix_admin_set_setting(p_actor uuid, p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.profiles%rowtype; v_old jsonb;
begin
  select * into a from public.profiles where id = p_actor;
  if not found or a.role <> 'ADMIN' or not a.is_active then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select value into v_old from public.app_settings where key = p_key;

  insert into public.app_settings (key, value, updated_by) values (p_key, p_value, p_actor)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;

  perform public._mdflix_audit(p_actor, 'SETTINGS_UPDATED', 'setting', p_key, null, null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 6. Ringkasan admin: semua angka dari data sungguhan, tanpa uang ----------
create or replace function public.mdflix_admin_overview()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'totalUsers',         (select count(*) from public.profiles),
    'activeUsers',        (select count(*) from public.profiles where is_active),
    'admins',             (select count(*) from public.profiles where role = 'ADMIN'),
    'newUsersToday',      (select count(*) from public.profiles where created_at >= date_trunc('day', now())),
    'currentlyWatching',  (select count(*) from public.watch_sessions
                            where status = 'ACTIVE'
                              and last_heartbeat_at > now() - make_interval(secs => public._mdflix_const('WATCHING_WINDOW_SECONDS'))),
    'totalWatchedTitles', (select count(*) from public.watch_history),
    'generatedAt',        now()
  );
$$;

-- ---------- 7. Hapus fungsi & tabel membership/pembayaran/kuota ----------
drop function if exists public.mdflix_settle_paid(text, text, text, bigint, timestamptz, text, jsonb);
drop function if exists public.mdflix_mark_transaction(text, text, text, text, text);
drop function if exists public.mdflix_apply_membership(uuid, text, integer, text, uuid, text, uuid, text);
drop function if exists public.mdflix_expire_if_needed(uuid);
drop function if exists public.mdflix_quota_state(uuid, timestamptz);
drop function if exists public.mdflix_effective_plan(uuid, timestamptz);

drop table if exists public.transactions;
drop table if exists public.memberships;
drop table if exists public.watch_usage_daily;

-- Baris pengaturan lama (harga, kuota, pembayaran) tidak berlaku lagi.
delete from public.app_settings where key in ('pricing', 'free', 'payment');
insert into public.app_settings (key, value) values
  ('support',  '{"email":"supportmdflix@gmail.com","phone":"+62 822-8732-5646"}'),
  ('branding', '{"name":"MDFlix","tagline":"Film dan series pilihan, gratis, kapan saja."}')
on conflict (key) do nothing;
update public.app_settings
   set value = jsonb_set(value, '{tagline}', '"Film dan series pilihan, gratis, kapan saja."', true)
 where key = 'branding' and value->>'tagline' = 'Film dan series pilihan, kapan saja.';

-- ---------- 8. View admin (dibuat ulang tanpa kolom plan/membership) ----------
create or replace view public.admin_users_v with (security_invoker = true) as
select p.id, p.email, p.display_name, p.avatar_url, p.role, p.is_active,
       p.created_at, p.last_login_at, p.last_activity_at
  from public.profiles p;

create or replace view public.admin_watching_v with (security_invoker = true) as
select s.id, s.user_id, p.email, p.display_name,
       s.content_type, s.content_id, s.series_id, s.season_number, s.episode_number,
       s.title, s.episode_title,
       s.last_state, s.started_at, s.last_heartbeat_at, s.accumulated_seconds, s.last_position, s.duration_seconds,
       greatest(extract(epoch from (now() - s.started_at)), 0)::numeric as elapsed_seconds
  from public.watch_sessions s join public.profiles p on p.id = s.user_id
 where s.status = 'ACTIVE'
   and s.last_heartbeat_at > now() - make_interval(secs => public._mdflix_const('WATCHING_WINDOW_SECONDS'));

-- ---------- 9. Hak akses: view baru mewarisi default Supabase (terbuka) → cabut lagi ----------
revoke all on table public.admin_users_v, public.admin_watching_v from public, anon, authenticated;
grant select on public.admin_users_v, public.admin_watching_v to service_role;

-- Pastikan SEMUA fungsi mdflix_* hanya bisa dieksekusi service_role (idempotent, sama dengan 0005).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'mdflix\_%' or p.proname like '\_mdflix\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- Segarkan schema cache PostgREST (Supabase) agar perubahan langsung terlihat.
notify pgrst, 'reload schema';
