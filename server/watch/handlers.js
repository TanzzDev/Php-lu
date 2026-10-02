import { z } from 'zod';
import { ok, parse } from '../lib/http.js';
import { ApiError, fromDbError, notFound } from '../lib/errors.js';
import { ID_RE, safeUrl } from '../content/models.js';

const UUID = z.string().uuid();

// Sesi menonton HANYA dipakai untuk: progres & Continue Watching, riwayat, monitoring admin
// ("Sedang menonton"), dan satu-pemutaran-aktif-per-akun. Tidak ada kuota/timer/pembatasan waktu.
// .strict(): field tak dikenal DITOLAK. Server tidak pernah menerima timestamp, user id,
// atau jumlah detik dari klien — waktu selalu dari jam server.
const StartBody = z.object({
  contentType: z.enum(['movie', 'episode']),
  contentId: z.string().regex(ID_RE),
}).strict();

const BeatBody = z.object({
  sessionId: UUID,
  seq: z.number().int().min(1).max(1_000_000),
  state: z.enum(['playing', 'paused', 'buffering', 'ended']),
  position: z.number().finite().min(0).max(172_800).optional(),
  duration: z.number().finite().min(0).max(172_800).optional(),
}).strict();

const asset = (u) => safeUrl(u, { allowRelative: true, allowLocalHttp: true });

export async function start(ctx, req, auth) {
  const body = parse(StartBody, await req.json());
  ctx.limit(`watch-start:${auth.profile.id}`, { limit: 30 });

  const snap = await ctx.content.snapshot(body.contentType, body.contentId);
  if (!snap) throw notFound('Konten');

  const { data, error } = await ctx.db().rpc('mdflix_watch_start', {
    p_user: auth.profile.id,
    p_content_type: snap.contentType,
    p_content_id: snap.contentId,
    p_series_id: snap.seriesId,
    p_season: snap.season,
    p_episode: snap.episode,
    p_title: snap.title,
    p_episode_title: snap.episodeTitle,
    p_poster: asset(snap.poster),
    p_image: asset(snap.image),
  });
  if (error) throw fromDbError(error, 'watch.start');

  if (!data.ok) {
    if (data.code === 'ACCOUNT_DISABLED') throw new ApiError(403, 'ACCOUNT_DISABLED', 'Akun ini dinonaktifkan. Hubungi dukungan MDFlix.');
    throw new ApiError(409, data.code ?? 'WATCH_START_FAILED', 'Tidak dapat memulai pemutaran.');
  }
  return ok({
    sessionId: data.sessionId,
    resume: data.resume ?? null,
    heartbeatSeconds: data.heartbeatSeconds,
    content: { type: snap.contentType, id: snap.contentId, seriesId: snap.seriesId, title: snap.title, episodeTitle: snap.episodeTitle },
  });
}

/** URL sumber video hanya diberikan untuk sesi ACTIVE milik user pada konten yang sama. */
export async function stream(ctx, req, auth, kind) {
  const sessionId = parse(UUID, req.query.session);
  const { data: s, error } = await ctx.db().from('watch_sessions')
    .select('id,status,content_type,content_id').eq('id', sessionId).eq('user_id', auth.profile.id).maybeSingle();
  if (error) throw fromDbError(error, 'watch.stream');
  if (!s || s.status !== 'ACTIVE' || s.content_type !== kind || s.content_id !== req.params.id) {
    throw new ApiError(403, 'NO_ACTIVE_SESSION', 'Sesi pemutaran tidak aktif. Muat ulang halaman untuk menonton.');
  }
  const playback = await ctx.content.playback(kind, req.params.id, { sessionId });
  if (!playback) throw new ApiError(404, 'PLAYBACK_UNAVAILABLE', 'Video belum tersedia untuk judul ini.');
  return ok({ playback }, { cache: 'none' });
}

async function beat(ctx, req, auth, final) {
  const body = parse(BeatBody, await req.json());
  ctx.limit(`watch-beat:${auth.profile.id}`, { limit: 90 });

  const { data, error } = await ctx.db().rpc('mdflix_watch_beat', {
    p_user: auth.profile.id,
    p_session: body.sessionId,
    p_seq: body.seq,
    p_state: body.state,
    p_position: body.position ?? null,
    p_duration: body.duration ?? null,
    p_final: final,
  });
  if (error) throw fromDbError(error, 'watch.beat');

  if (!data.ok) {
    if (data.code === 'SESSION_NOT_FOUND') throw notFound('Sesi');
    const msg = data.code === 'SESSION_STALE'
      ? 'Sesi pemutaran berakhir karena tidak aktif. Muat ulang untuk melanjutkan.'
      : data.reason === 'SUPERSEDED'
        ? 'Pemutaran dipindahkan ke tab atau perangkat lain.'
        : 'Sesi pemutaran sudah berakhir.';
    throw new ApiError(409, data.code, msg, { reason: data.reason ?? null });
  }
  return ok({
    credited: data.credited ?? 0,
    reason: data.reason ?? null,
    duplicate: Boolean(data.duplicate),
    throttled: Boolean(data.throttled),
  });
}

export const heartbeat = (ctx, req, auth) => beat(ctx, req, auth, false);
export const end = (ctx, req, auth) => beat(ctx, req, auth, true);
