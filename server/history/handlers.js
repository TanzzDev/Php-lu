import { z } from 'zod';
import { ok, parse } from '../lib/http.js';
import { fromDbError, notFound } from '../lib/errors.js';
import { ID_RE } from '../content/models.js';

const COLS = 'id,content_type,content_id,series_id,season_number,episode_number,title,episode_title,poster_url,image_url,position_seconds,duration_seconds,percentage,completed,last_watched_at';

export const mapHistory = (r) => ({
  id: r.id,
  contentType: r.content_type,
  contentId: r.content_id,
  seriesId: r.series_id,
  seasonNumber: r.season_number,
  episodeNumber: r.episode_number,
  title: r.title,
  episodeTitle: r.episode_title,
  poster: r.poster_url,
  image: r.image_url,
  positionSeconds: Number(r.position_seconds),
  durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
  percentage: Number(r.percentage),
  completed: r.completed,
  lastWatchedAt: r.last_watched_at,
});

// Semua pembacaan memakai klien atas nama user → RLS memastikan hanya baris miliknya.
export async function list(ctx, req, auth) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), 5000);
  const { data, error, count } = await ctx.userDb(auth.token).from('watch_history')
    .select(COLS, { count: 'exact' }).order('last_watched_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw fromDbError(error, 'history.list');
  return ok({ items: data.map(mapHistory), total: count ?? data.length });
}

/** Continue Watching: hanya progres yang benar-benar tersimpan; satu entri per series (episode terbaru). */
export async function continueWatching(ctx, req, auth) {
  const { data, error } = await ctx.userDb(auth.token).from('watch_history')
    .select(COLS).eq('completed', false).gte('position_seconds', 5)
    .order('last_watched_at', { ascending: false }).limit(60);
  if (error) throw fromDbError(error, 'history.continue');
  const seen = new Set();
  const items = [];
  for (const r of data) {
    const key = r.series_id ?? r.content_id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(mapHistory(r));
    if (items.length >= 20) break;
  }
  return ok({ items });
}

const IdsQuery = z.string().max(4000).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string().regex(ID_RE)).max(100));

/** Progres untuk daftar id konten (mis. semua episode satu musim). */
export async function progress(ctx, req, auth) {
  const ids = parse(IdsQuery, req.query.ids ?? '');
  if (!ids.length) return ok({ progress: {} });
  const { data, error } = await ctx.userDb(auth.token).from('watch_history')
    .select('content_id,position_seconds,percentage,completed').in('content_id', ids);
  if (error) throw fromDbError(error, 'history.progress');
  const out = {};
  for (const r of data) out[r.content_id] = { positionSeconds: Number(r.position_seconds), percentage: Number(r.percentage), completed: r.completed };
  return ok({ progress: out });
}

export async function remove(ctx, req, auth) {
  const id = parse(z.string().uuid(), req.params.id);
  const { data, error } = await ctx.userDb(auth.token).from('watch_history').delete().eq('id', id).select('id');
  if (error) throw fromDbError(error, 'history.remove');
  if (!data.length) throw notFound('Riwayat');
  return ok({ removed: true });
}

export async function clear(ctx, req, auth) {
  const { error } = await ctx.userDb(auth.token).from('watch_history').delete().eq('user_id', auth.profile.id);
  if (error) throw fromDbError(error, 'history.clear');
  return ok({ cleared: true });
}
