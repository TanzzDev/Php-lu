-- =====================================================================
-- MDFlix — keamanan (bagian 5): RLS, GRANT, REVOKE
-- =====================================================================
-- Catatan penting untuk Supabase: secara default Supabase memberi hak akses
-- (tabel DAN fungsi) kepada anon/authenticated pada objek baru di schema public.
-- Karena itu semuanya dicabut eksplisit di sini, lalu diberikan kembali seminimal
-- mungkin. Tanpa REVOKE pada fungsi, user login biasa bisa memanggil
-- rpc/mdflix_settle_paid lewat Data API dan mengaktifkan membership sendiri.
-- =====================================================================

-- ---------- 1. cabut semua hak bawaan pada objek MDFlix ----------
revoke all on table
  public.app_settings, public.profiles, public.memberships, public.transactions,
  public.watch_sessions, public.watch_usage_daily, public.watch_history,
  public.my_list, public.audit_logs
from public, anon, authenticated;

revoke all on table public.admin_users_v, public.admin_watching_v from public, anon, authenticated;

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

-- ---------- 2. service_role (server) ----------
grant all on table
  public.app_settings, public.profiles, public.memberships, public.transactions,
  public.watch_sessions, public.watch_usage_daily, public.watch_history,
  public.my_list, public.audit_logs
to service_role;
grant select on public.admin_users_v, public.admin_watching_v to service_role;

-- ---------- 3. RLS ----------
alter table public.app_settings      enable row level security;
alter table public.profiles          enable row level security;
alter table public.memberships       enable row level security;
alter table public.transactions      enable row level security;
alter table public.watch_sessions    enable row level security;
alter table public.watch_usage_daily enable row level security;
alter table public.watch_history     enable row level security;
alter table public.my_list           enable row level security;
alter table public.audit_logs        enable row level security;
-- app_settings & audit_logs: RLS aktif TANPA kebijakan => tertutup untuk anon/authenticated.

-- ---------- 4. hak minimal untuk role authenticated (dibatasi RLS) ----------
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, preferences) on public.profiles to authenticated;
grant select on public.memberships, public.transactions, public.watch_sessions, public.watch_usage_daily to authenticated;
grant select, delete on public.watch_history to authenticated;
grant select, insert, delete on public.my_list to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own on public.memberships
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists watch_sessions_select_own on public.watch_sessions;
create policy watch_sessions_select_own on public.watch_sessions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists watch_usage_select_own on public.watch_usage_daily;
create policy watch_usage_select_own on public.watch_usage_daily
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists watch_history_select_own on public.watch_history;
create policy watch_history_select_own on public.watch_history
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists watch_history_delete_own on public.watch_history;
create policy watch_history_delete_own on public.watch_history
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists my_list_select_own on public.my_list;
create policy my_list_select_own on public.my_list
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists my_list_insert_own on public.my_list;
create policy my_list_insert_own on public.my_list
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists my_list_delete_own on public.my_list;
create policy my_list_delete_own on public.my_list
  for delete to authenticated using (user_id = (select auth.uid()));
