-- =====================================================================
-- MDFlix — skema database (bagian 1: tabel, constraint, index)
-- Target : Supabase (PostgreSQL 15+). Aman dijalankan ulang (idempotent).
-- Urutan : 0001_schema → 0002_functions → 0003_security
-- =====================================================================
-- Prinsip:
--  * Semua perubahan yang menyangkut uang/kuota dilakukan di fungsi SQL
--    atomik (0002) yang HANYA bisa dipanggil service_role dari server.
--  * Browser tidak pernah menulis ke tabel sensitif. RLS (0003) hanya
--    "sabuk pengaman" kedua; jalur utama adalah API server.
--  * Tidak ada secret yang disimpan di database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- app_settings — konfigurasi non-rahasia yang bisa diubah admin
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.]{0,63}$'),
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ---------------------------------------------------------------------
-- profiles — identitas & role (kredensial tetap di Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text,
  display_name     text check (display_name is null or char_length(display_name) <= 80),
  avatar_url       text check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url ~* '^https://')),
  role             text        not null default 'USER' check (role in ('USER', 'ADMIN')),
  is_active        boolean     not null default true,
  preferences      jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_login_at    timestamptz,
  last_activity_at timestamptz
);
create unique index if not exists profiles_email_key   on public.profiles (lower(email)) where email is not null;
create index        if not exists profiles_created_idx on public.profiles (created_at desc);
create index        if not exists profiles_admin_idx   on public.profiles (id) where role = 'ADMIN';

-- ---------------------------------------------------------------------
-- memberships — satu baris per user. Plan efektif dihitung saat dibaca
-- (lihat mdflix_effective_plan): plan berbayar yang lewat expires_at
-- otomatis dianggap FREE tanpa menghapus data apa pun.
-- ---------------------------------------------------------------------
create table if not exists public.memberships (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  plan             text        not null default 'FREE' check (plan in ('FREE', 'PREMIUM', 'PRO')),
  started_at       timestamptz,
  expires_at       timestamptz,
  expiry_logged_at timestamptz,
  updated_at       timestamptz not null default now(),
  constraint memberships_dates_match_plan check (
    (plan = 'FREE'  and started_at is null and expires_at is null) or
    (plan <> 'FREE' and started_at is not null and expires_at is not null and expires_at > started_at)
  )
);
create index if not exists memberships_expiry_idx on public.memberships (expires_at) where plan <> 'FREE';

-- ---------------------------------------------------------------------
-- transactions — catatan pembayaran. Harga di-snapshot saat order dibuat.
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  order_id               text        not null unique check (order_id ~ '^[A-Z0-9-]{8,40}$'),
  user_id                uuid references public.profiles (id) on delete set null,
  customer_email         text,
  plan                   text        not null check (plan in ('PREMIUM', 'PRO')),
  duration_days          integer     not null check (duration_days between 1 and 3660),
  amount                 bigint      not null check (amount > 0),
  currency               text        not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  status                 text        not null default 'PENDING'
                                     check (status in ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED')),
  payment_method         text,
  gateway                text,
  gateway_transaction_id text,
  gateway_reference      text,
  payment_payload        jsonb,            -- info tampilan non-rahasia (QR string, nomor VA, URL bayar)
  paid_amount            bigint,           -- nominal yang dilaporkan gateway
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  expired_at             timestamptz,      -- batas waktu pembayaran
  paid_at                timestamptz,
  last_checked_at        timestamptz,
  metadata               jsonb       not null default '{}'::jsonb,
  constraint transactions_paid_consistency check ((status = 'PAID') = (paid_at is not null))
);
-- Satu pembayaran gateway tidak boleh dipakai untuk dua order.
create unique index if not exists transactions_gateway_txn_key
  on public.transactions (gateway, gateway_transaction_id) where gateway_transaction_id is not null;
-- Satu order PENDING per (user, plan): mencegah spam order & membuat create idempotent.
create unique index if not exists transactions_one_pending_key
  on public.transactions (user_id, plan) where status = 'PENDING';
create index if not exists transactions_user_idx    on public.transactions (user_id, created_at desc);
create index if not exists transactions_status_idx  on public.transactions (status, created_at desc);
create index if not exists transactions_created_idx on public.transactions (created_at desc);

-- ---------------------------------------------------------------------
-- watch_sessions — sesi menonton yang diautoritasi server
-- ---------------------------------------------------------------------
create table if not exists public.watch_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles (id) on delete cascade,
  content_type        text        not null check (content_type in ('movie', 'episode')),
  content_id          text        not null check (char_length(content_id) between 1 and 128),
  series_id           text,
  season_number       integer,
  episode_number      integer,
  title               text,
  episode_title       text,
  poster_url          text,
  image_url           text,
  plan_at_start       text        not null check (plan_at_start in ('FREE', 'PREMIUM', 'PRO')),
  status              text        not null default 'ACTIVE'
                                  check (status in ('ACTIVE', 'ENDED', 'EXPIRED', 'QUOTA_EXCEEDED', 'SUPERSEDED')),
  started_at          timestamptz not null default now(),
  last_heartbeat_at   timestamptz not null default now(),
  last_seq            integer     not null default 0,
  last_state          text        not null default 'paused'
                                  check (last_state in ('playing', 'paused', 'buffering', 'ended')),
  last_position       numeric     not null default 0 check (last_position >= 0),
  duration_seconds    numeric check (duration_seconds is null or duration_seconds >= 0),
  accumulated_seconds numeric     not null default 0 check (accumulated_seconds >= 0),
  ended_at            timestamptz,
  end_reason          text
);
-- Hanya satu sesi ACTIVE per user (multi-session ditolak di level database).
create unique index if not exists watch_sessions_one_active_key
  on public.watch_sessions (user_id) where status = 'ACTIVE';
create index if not exists watch_sessions_active_idx on public.watch_sessions (last_heartbeat_at desc) where status = 'ACTIVE';
create index if not exists watch_sessions_user_idx   on public.watch_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------
-- watch_usage_daily — pemakaian actual playback per hari (zona waktu dari settings)
-- ---------------------------------------------------------------------
create table if not exists public.watch_usage_daily (
  user_id     uuid    not null references public.profiles (id) on delete cascade,
  usage_date  date    not null,
  seconds     numeric not null default 0 check (seconds >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, usage_date)
);

-- ---------------------------------------------------------------------
-- watch_history — progres tontonan (sumber Continue Watching)
-- ---------------------------------------------------------------------
create table if not exists public.watch_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid    not null references public.profiles (id) on delete cascade,
  content_type     text    not null check (content_type in ('movie', 'episode')),
  content_id       text    not null check (char_length(content_id) between 1 and 128),
  series_id        text,
  season_number    integer,
  episode_number   integer,
  title            text,
  episode_title    text,
  poster_url       text,
  image_url        text,
  position_seconds numeric not null default 0 check (position_seconds >= 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  percentage       numeric not null default 0 check (percentage between 0 and 100),
  completed        boolean not null default false,
  first_watched_at timestamptz not null default now(),
  last_watched_at  timestamptz not null default now(),
  unique (user_id, content_type, content_id)
);
create index if not exists watch_history_recent_idx on public.watch_history (user_id, last_watched_at desc);
create index if not exists watch_history_series_idx on public.watch_history (user_id, series_id) where series_id is not null;
create index if not exists watch_history_all_recent_idx on public.watch_history (last_watched_at desc);

-- ---------------------------------------------------------------------
-- my_list — daftar tersimpan user (antar-session, di database)
-- ---------------------------------------------------------------------
create table if not exists public.my_list (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('movie', 'series')),
  content_id   text not null check (char_length(content_id) between 1 and 128),
  title        text not null check (char_length(title) <= 300),
  poster_url   text,
  backdrop_url text,
  year         integer,
  rating       numeric,
  created_at   timestamptz not null default now(),
  unique (user_id, content_type, content_id)
);
create index if not exists my_list_user_idx on public.my_list (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- audit_logs — append-only. Tanpa FK ke profiles supaya jejak tetap ada
-- setelah akun dihapus (email disimpan sebagai snapshot).
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  actor_id       uuid,
  actor_email    text,
  actor_role     text,
  action         text not null check (action ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  target_type    text,
  target_id      text,
  target_user_id uuid,
  target_label   text,
  transaction_id uuid,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists audit_created_idx     on public.audit_logs (created_at desc);
create index if not exists audit_action_idx      on public.audit_logs (action, created_at desc);
create index if not exists audit_target_user_idx on public.audit_logs (target_user_id, created_at desc);
create index if not exists audit_actor_idx       on public.audit_logs (actor_id, created_at desc);
