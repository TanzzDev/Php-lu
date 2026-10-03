-- =====================================================================
-- MDFlix — fungsi watch-session & pembayaran (bagian 3)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mulai sesi. Menutup sesi lama user (satu sesi aktif per user), lalu memeriksa
-- kuota. Sesi baru dimulai dalam keadaan "paused": tidak ada yang berkurang
-- sampai klien melaporkan playing.
-- ---------------------------------------------------------------------
create or replace function public.mdflix_watch_start(
  p_user uuid, p_content_type text, p_content_id text,
  p_series_id text default null, p_season integer default null, p_episode integer default null,
  p_title text default null, p_episode_title text default null,
  p_poster text default null, p_image text default null, p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_active boolean; v_prev uuid; v_id uuid; q jsonb; v_resume jsonb;
begin
  -- serialisasi start per user (unique index tetap menjadi jaring pengaman terakhir)
  perform pg_advisory_xact_lock(hashtextextended('mdflix_watch:' || p_user::text, 0));

  select is_active into v_active from public.profiles where id = p_user;
  if v_active is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_DISABLED');
  end if;

  -- tutup sesi lama lebih dulu supaya kredit ekor intervalnya ikut terhitung
  select id into v_prev from public.watch_sessions where user_id = p_user and status = 'ACTIVE' for update;
  if v_prev is not null then
    perform public._mdflix_close_session(v_prev, 'SUPERSEDED', 'new_session', v_now);
  end if;

  q := public.mdflix_quota_state(p_user, v_now);
  if not (q->>'unlimited')::boolean and (q->>'remainingSeconds')::numeric <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUOTA_EXHAUSTED', 'quota', q);
  end if;

  insert into public.watch_sessions
    (user_id, content_type, content_id, series_id, season_number, episode_number,
     title, episode_title, poster_url, image_url, plan_at_start, started_at, last_heartbeat_at)
  values
    (p_user, p_content_type, p_content_id, p_series_id, p_season, p_episode,
     left(p_title, 300), left(p_episode_title, 300), p_poster, p_image, q->>'plan', v_now, v_now)
  returning id into v_id;

  select jsonb_build_object('positionSeconds', position_seconds, 'percentage', percentage, 'completed', completed)
    into v_resume
    from public.watch_history
   where user_id = p_user and content_type = p_content_type and content_id = p_content_id;

  return jsonb_build_object(
    'ok', true, 'sessionId', v_id, 'quota', q, 'resume', v_resume,
    'heartbeatSeconds', public._mdflix_const('HEARTBEAT_SECONDS'));
end $$;

-- ---------------------------------------------------------------------
-- Heartbeat (juga dipakai untuk "end" lewat p_final = true).
-- Waktu SELALU dari jam server. Kredit = selisih waktu sejak heartbeat
-- sebelumnya, hanya jika keadaan sebelumnya "playing", dibatasi
-- MAX_CREDIT_SECONDS. Klien tidak pernah mengirim jumlah detik.
-- ---------------------------------------------------------------------
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
  q jsonb; v_stop boolean := false; v_status text := 'ACTIVE'; v_reason text;
begin
  if p_state not in ('playing', 'paused', 'buffering', 'ended') then
    raise exception 'invalid state' using errcode = '22023';
  end if;

  select * into s from public.watch_sessions where id = p_session and user_id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND');
  end if;

  if s.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'code', 'SESSION_ENDED', 'reason', s.status,
                              'quota', public.mdflix_quota_state(p_user, v_now));
  end if;

  -- duplikat / replay: seq harus benar-benar naik, tanpa efek samping
  if p_seq is null or p_seq <= s.last_seq then
    return jsonb_build_object('ok', true, 'duplicate', true, 'credited', 0,
                              'quota', public.mdflix_quota_state(p_user, v_now));
  end if;

  v_gap := greatest(extract(epoch from (v_now - s.last_heartbeat_at)), 0);

  -- klien diam terlalu lama → sesi mati (jam server yang menentukan)
  if v_gap > public._mdflix_const('STALE_SECONDS') then
    perform public._mdflix_close_session(s.id, 'EXPIRED', 'stale', v_now);
    return jsonb_build_object('ok', false, 'code', 'SESSION_STALE',
                              'quota', public.mdflix_quota_state(p_user, v_now));
  end if;

  -- heartbeat terlalu rapat dengan keadaan sama: abaikan
  if v_gap < public._mdflix_const('MIN_GAP_SECONDS') and p_state = s.last_state and not p_final then
    return jsonb_build_object('ok', true, 'throttled', true, 'credited', 0,
                              'quota', public.mdflix_quota_state(p_user, v_now));
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

  q := public.mdflix_quota_state(p_user, v_now);
  if not (q->>'unlimited')::boolean and (q->>'remainingSeconds')::numeric <= 0 then
    v_stop := true; v_status := 'QUOTA_EXCEEDED'; v_reason := 'quota_exhausted';
  elsif p_final or p_state = 'ended' then
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

  return jsonb_build_object('ok', true, 'credited', v_credited, 'quota', q,
                            'stop', v_stop, 'reason', v_reason, 'sessionStatus', v_status);
end $$;

-- ---------------------------------------------------------------------
-- Pembayaran: settlement idempotent.
-- Dipanggil HANYA setelah server memverifikasi status ke gateway. Nominal dari
-- gateway harus sama persis dengan snapshot harga order. Row order dikunci
-- (FOR UPDATE) sehingga webhook ganda / polling paralel tidak bisa mengaktifkan
-- membership dua kali.
-- ---------------------------------------------------------------------
create or replace function public.mdflix_settle_paid(
  p_order_id text, p_gateway_txn text, p_gateway_ref text,
  p_paid_amount bigint, p_paid_at timestamptz, p_payment_method text,
  p_gateway_meta jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.transactions%rowtype; v_prev text; v_member jsonb;
begin
  select * into t from public.transactions where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND');
  end if;

  if t.status = 'PAID' then
    return jsonb_build_object('ok', true, 'alreadyPaid', true, 'status', 'PAID', 'paidAt', t.paid_at);
  end if;

  if t.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'USER_GONE', 'status', t.status);
  end if;

  if t.gateway_transaction_id is not null and p_gateway_txn is not null
     and t.gateway_transaction_id <> p_gateway_txn then
    perform public._mdflix_audit(null, 'PAYMENT_REFERENCE_MISMATCH', 'transaction', t.id::text, t.user_id, t.id,
      jsonb_build_object('orderId', t.order_id, 'expected', t.gateway_transaction_id, 'reported', p_gateway_txn));
    return jsonb_build_object('ok', false, 'code', 'REFERENCE_MISMATCH', 'status', t.status);
  end if;

  if p_paid_amount is null or p_paid_amount <> t.amount then
    perform public._mdflix_audit(null, 'PAYMENT_AMOUNT_MISMATCH', 'transaction', t.id::text, t.user_id, t.id,
      jsonb_build_object('orderId', t.order_id, 'expected', t.amount, 'reported', p_paid_amount));
    update public.transactions
       set metadata = metadata || jsonb_build_object('amountMismatchAt', now(), 'reportedAmount', p_paid_amount)
     where id = t.id;
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_MISMATCH', 'status', t.status);
  end if;

  v_prev := t.status;
  update public.transactions set
    status = 'PAID',
    paid_at = coalesce(p_paid_at, now()),
    paid_amount = p_paid_amount,
    gateway_transaction_id = coalesce(gateway_transaction_id, p_gateway_txn),
    gateway_reference = coalesce(gateway_reference, p_gateway_ref),
    payment_method = coalesce(p_payment_method, payment_method),
    last_checked_at = now(),
    metadata = metadata || jsonb_build_object('settledFrom', v_prev, 'gateway', coalesce(p_gateway_meta, '{}'::jsonb))
  where id = t.id;

  perform public._mdflix_audit(null, 'PAYMENT_CONFIRMED', 'transaction', t.id::text, t.user_id, t.id,
    jsonb_build_object('orderId', t.order_id, 'plan', t.plan, 'amount', t.amount, 'currency', t.currency,
                       'previousStatus', v_prev, 'lateAfterExpiry', v_prev <> 'PENDING'));

  v_member := public.mdflix_apply_membership(t.user_id, t.plan, t.duration_days, 'STACK', null, 'payment', t.id, null);

  return jsonb_build_object('ok', true, 'status', 'PAID', 'previousStatus', v_prev, 'membership', v_member);
end $$;

-- Tandai transaksi gagal/kedaluwarsa/dibatalkan. Hanya dari PENDING; PAID tidak pernah diturunkan.
create or replace function public.mdflix_mark_transaction(
  p_order_id text, p_status text, p_reason text default null,
  p_gateway_txn text default null, p_gateway_ref text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.transactions%rowtype;
begin
  if p_status not in ('FAILED', 'EXPIRED', 'CANCELLED') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select * into t from public.transactions where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND');
  end if;
  if t.status <> 'PENDING' then
    return jsonb_build_object('ok', true, 'unchanged', true, 'status', t.status);
  end if;

  update public.transactions set
    status = p_status,
    gateway_transaction_id = coalesce(gateway_transaction_id, p_gateway_txn),
    gateway_reference = coalesce(gateway_reference, p_gateway_ref),
    last_checked_at = now(),
    metadata = metadata || jsonb_build_object('closedReason', p_reason)
  where id = t.id;

  perform public._mdflix_audit(null, 'PAYMENT_' || p_status, 'transaction', t.id::text, t.user_id, t.id,
    jsonb_build_object('orderId', t.order_id, 'plan', t.plan, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'status', p_status);
end $$;
