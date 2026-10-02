-- =====================================================================
-- MDFlix — admin, trigger, view, seed (bagian 4)
-- =====================================================================

-- ---------- updated_at + perlindungan kolom profil ----------
create or replace function public.mdflix_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Lapis kedua di atas GRANT kolom: role/is_active/email tidak bisa diubah oleh
-- klien (role authenticated/anon), meskipun kebijakan RLS suatu saat berubah.
create or replace function public.mdflix_protect_profile()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id            is distinct from old.id
    or new.role          is distinct from old.role
    or new.is_active     is distinct from old.is_active
    or new.email         is distinct from old.email
    or new.created_at    is distinct from old.created_at
    or new.last_login_at is distinct from old.last_login_at then
      raise exception 'protected column' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.mdflix_protect_profile();

drop trigger if exists memberships_touch on public.memberships;
create trigger memberships_touch before update on public.memberships
  for each row execute function public.mdflix_touch_updated_at();

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.mdflix_touch_updated_at();

-- ---------- audit_logs: append-only ----------
create or replace function public.mdflix_audit_immutable()
returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only' using errcode = '42501'; end $$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.mdflix_audit_immutable();
drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.mdflix_audit_immutable();

-- ---------- validasi app_settings ----------
create or replace function public.mdflix_validate_setting()
returns trigger language plpgsql as $$
declare v_ts timestamptz;
begin
  if new.key not in ('pricing', 'free', 'support', 'branding', 'payment') then
    raise exception 'unknown setting key' using errcode = '22023';
  end if;

  if new.key = 'pricing' then
    if new.value->>'currency' !~ '^[A-Z]{3}$'
       or coalesce((new.value #>> '{plans,PREMIUM,price}')::numeric, 0) <= 0
       or coalesce((new.value #>> '{plans,PRO,price}')::numeric, 0) <= 0
       or (new.value #>> '{plans,PREMIUM,price}')::numeric <> trunc((new.value #>> '{plans,PREMIUM,price}')::numeric)
       or (new.value #>> '{plans,PRO,price}')::numeric     <> trunc((new.value #>> '{plans,PRO,price}')::numeric)
       or coalesce((new.value #>> '{plans,PREMIUM,durationDays}')::integer, 0) not between 1 and 3660
       or coalesce((new.value #>> '{plans,PRO,durationDays}')::integer, 0)     not between 1 and 3660 then
      raise exception 'invalid pricing setting' using errcode = '22023';
    end if;
  elsif new.key = 'free' then
    if coalesce((new.value->>'dailySeconds')::numeric, -1) not between 0 and 86400 then
      raise exception 'invalid free.dailySeconds' using errcode = '22023';
    end if;
    begin
      v_ts := now() at time zone (new.value->>'timezone');
    exception when others then
      raise exception 'invalid free.timezone' using errcode = '22023';
    end;
  elsif new.key = 'support' then
    if coalesce(new.value->>'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
       or char_length(coalesce(new.value->>'phone', '')) not between 6 and 32 then
      raise exception 'invalid support setting' using errcode = '22023';
    end if;
  elsif new.key = 'payment' then
    if coalesce((new.value->>'orderExpiryMinutes')::integer, 0) not between 5 and 1440 then
      raise exception 'invalid payment.orderExpiryMinutes' using errcode = '22023';
    end if;
  elsif new.key = 'branding' then
    if char_length(coalesce(new.value->>'name', '')) not between 1 and 40 then
      raise exception 'invalid branding.name' using errcode = '22023';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists app_settings_validate on public.app_settings;
create trigger app_settings_validate before insert or update on public.app_settings
  for each row execute function public.mdflix_validate_setting();

-- ---------- sinkron akun Supabase Auth → profiles ----------
-- Trigger pada auth.users TIDAK boleh menggagalkan login/daftar, jadi semua
-- kesalahan ditelan dengan WARNING; POST /api/auth/sync menutup celahnya.
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
    insert into public.memberships (user_id) values (new.id) on conflict (user_id) do nothing;
  exception when others then
    raise warning 'mdflix_handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

create or replace function public.mdflix_handle_user_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    update public.profiles
       set email = coalesce(new.email, email),
           last_login_at = coalesce(new.last_sign_in_at, last_login_at)
     where id = new.id
       and (email is distinct from new.email or last_login_at is distinct from new.last_sign_in_at);
  exception when others then
    raise warning 'mdflix_handle_user_update failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists mdflix_on_auth_user_created on auth.users;
create trigger mdflix_on_auth_user_created after insert on auth.users
  for each row execute function public.mdflix_handle_new_user();
drop trigger if exists mdflix_on_auth_user_updated on auth.users;
create trigger mdflix_on_auth_user_updated after update of email, last_sign_in_at on auth.users
  for each row execute function public.mdflix_handle_user_update();

-- Backfill untuk akun yang sudah ada sebelum migration ini dijalankan.
insert into public.profiles (id, email, display_name, last_login_at)
select u.id, u.email,
       nullif(left(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
                                  split_part(coalesce(u.email, ''), '@', 1))), 80), ''),
       u.last_sign_in_at
from auth.users u
on conflict (id) do nothing;
insert into public.memberships (user_id) select id from public.profiles on conflict (user_id) do nothing;

-- ---------- fungsi admin (audit di dalam transaksi yang sama) ----------
create or replace function public.mdflix_admin_set_user(
  p_actor uuid, p_user uuid, p_role text default null, p_is_active boolean default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.profiles%rowtype; t public.profiles%rowtype;
begin
  select * into a from public.profiles where id = p_actor;
  if not found or a.role <> 'ADMIN' or not a.is_active then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_role is not null and p_role not in ('USER', 'ADMIN') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_user = p_actor then
    return jsonb_build_object('ok', false, 'code', 'SELF_MODIFICATION');
  end if;
  select * into t from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND');
  end if;

  if p_role is not null and p_role <> t.role then
    update public.profiles set role = p_role where id = p_user;
    perform public._mdflix_audit(p_actor, 'ROLE_CHANGED', 'user', p_user::text, p_user, null,
      jsonb_build_object('from', t.role, 'to', p_role));
  end if;
  if p_is_active is not null and p_is_active <> t.is_active then
    update public.profiles set is_active = p_is_active where id = p_user;
    perform public._mdflix_audit(p_actor, case when p_is_active then 'USER_REACTIVATED' else 'USER_DEACTIVATED' end,
      'user', p_user::text, p_user, null, jsonb_build_object('from', t.is_active, 'to', p_is_active));
  end if;
  return jsonb_build_object('ok', true);
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
  if p_key = 'pricing' and v_old is distinct from p_value then
    perform public._mdflix_audit(p_actor, 'PRICE_CHANGED', 'setting', 'pricing', null, null,
      jsonb_build_object('from', v_old, 'to', p_value));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Ringkasan overview: semua angka dihitung dari data sungguhan.
create or replace function public.mdflix_admin_overview()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with u as (
    select p.is_active, p.role,
           case when m.plan <> 'FREE' and m.expires_at > now() then m.plan else 'FREE' end as eplan
      from public.profiles p left join public.memberships m on m.user_id = p.id
  )
  select jsonb_build_object(
    'totalUsers',          (select count(*) from u),
    'activeUsers',         (select count(*) from u where is_active),
    'activeFree',          (select count(*) from u where is_active and eplan = 'FREE'),
    'activePremium',       (select count(*) from u where is_active and eplan = 'PREMIUM'),
    'activePro',           (select count(*) from u where is_active and eplan = 'PRO'),
    'admins',              (select count(*) from u where role = 'ADMIN'),
    'totalTransactions',   (select count(*) from public.transactions),
    'paidTransactions',    (select count(*) from public.transactions where status = 'PAID'),
    'pendingTransactions', (select count(*) from public.transactions where status = 'PENDING'),
    'revenue', coalesce((select jsonb_object_agg(currency, total)
                           from (select currency, sum(amount) as total
                                   from public.transactions where status = 'PAID' group by currency) r), '{}'::jsonb),
    'currentlyWatching',   (select count(*) from public.watch_sessions
                             where status = 'ACTIVE'
                               and last_heartbeat_at > now() - make_interval(secs => public._mdflix_const('WATCHING_WINDOW_SECONDS'))),
    'generatedAt',         now()
  );
$$;

-- ---------- view admin (hanya service_role; lihat 0005) ----------
create or replace view public.admin_users_v with (security_invoker = true) as
select p.id, p.email, p.display_name, p.avatar_url, p.role, p.is_active,
       p.created_at, p.last_login_at, p.last_activity_at,
       m.plan as membership_plan, m.started_at as membership_started_at, m.expires_at as membership_expires_at,
       case when m.plan <> 'FREE' and m.expires_at > now() then m.plan else 'FREE' end as effective_plan,
       (m.plan <> 'FREE' and m.expires_at <= now()) as membership_lapsed
  from public.profiles p left join public.memberships m on m.user_id = p.id;

create or replace view public.admin_watching_v with (security_invoker = true) as
select s.id, s.user_id, p.email, p.display_name,
       s.content_type, s.content_id, s.series_id, s.season_number, s.episode_number,
       s.title, s.episode_title, s.plan_at_start,
       public.mdflix_effective_plan(s.user_id) as current_plan,
       s.last_state, s.started_at, s.last_heartbeat_at, s.accumulated_seconds, s.last_position, s.duration_seconds,
       greatest(extract(epoch from (now() - s.started_at)), 0)::numeric as elapsed_seconds
  from public.watch_sessions s join public.profiles p on p.id = s.user_id
 where s.status = 'ACTIVE'
   and s.last_heartbeat_at > now() - make_interval(secs => public._mdflix_const('WATCHING_WINDOW_SECONDS'));

-- ---------- seed default (non-rahasia; bisa diubah admin) ----------
insert into public.app_settings (key, value) values
  ('pricing',  '{"currency":"IDR","plans":{"PREMIUM":{"price":10000,"durationDays":30},"PRO":{"price":50000,"durationDays":365}}}'),
  ('free',     '{"dailySeconds":3600,"timezone":"Asia/Jakarta"}'),
  ('support',  '{"email":"supportmdflix@gmail.com","phone":"+62 822-8732-5646"}'),
  ('branding', '{"name":"MDFlix","tagline":"Film dan series pilihan, kapan saja."}'),
  ('payment',  '{"orderExpiryMinutes":30}')
on conflict (key) do nothing;
