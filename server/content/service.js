import { ApiError, notFound } from '../lib/errors.js';
import { createTtlCache } from './cache.js';
import { isValidId, SummarySchema, MovieSchema, SeriesSchema, SeasonSchema, EpisodeSchema, PlaybackSchema } from './models.js';
import { createNativeProvider } from './providers/native.js';
import { createLegacyProvider } from './providers/legacy.js';
import { fixtureProvider } from './providers/fixture.js';
import { unavailableProvider } from './providers/unavailable.js';

const MIN = 60_000;
const TTL = { list: 10 * MIN, detail: 30 * MIN, search: 2 * MIN, reco: 15 * MIN, caps: 30 * MIN };

/** Pilih provider dari konfigurasi. Fixture TIDAK pernah aktif di produksi. */
export function selectProvider(env) {
  const { baseUrl, dialect } = env.content;
  if (baseUrl) {
    if (dialect === 'legacy') return createLegacyProvider({ baseUrl, isProd: env.isProd });
    if (dialect === 'native') return createNativeProvider({ baseUrl, isProd: env.isProd });
    throw new Error(`CONTENT_API_DIALECT tidak dikenal: ${dialect} (gunakan native atau legacy)`);
  }
  return env.isProd ? unavailableProvider : fixtureProvider;
}

const need = (id) => {
  if (!isValidId(id)) throw notFound('Konten');
  return id;
};

const drop = (schema, arr) => arr.map((x) => schema.safeParse(x)).filter((r) => r.success).map((r) => r.data);

function validated(schema, value) {
  if (value === null || value === undefined) return null;
  const r = schema.safeParse(value);
  if (!r.success) {
    const err = new ApiError(502, 'CONTENT_INVALID_RESPONSE', 'Data katalog tidak dapat dibaca.');
    err.internal = `content schema: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`;
    throw err;
  }
  return r.data;
}

export function createContentService({ provider, cache = createTtlCache() }) {
  const caps = () => cache.wrap('caps', TTL.caps, () => provider.capabilities());

  async function list(opts = {}) {
    const q = {
      list: opts.list ?? 'popular',
      type: ['movie', 'series'].includes(opts.type) ? opts.type : 'all',
      genre: opts.genre || undefined,
      page: Math.min(Math.max(parseInt(opts.page, 10) || 1, 1), 50),
    };
    const key = `list:${q.list}:${q.type}:${q.genre ?? ''}:${q.page}`;
    return cache.wrap(key, TTL.list, async () => {
      const r = await provider.list(q);
      return { items: drop(SummarySchema, r.items), page: r.page, hasMore: Boolean(r.hasMore) };
    });
  }

  async function search(query, { page = 1, type = 'all' } = {}) {
    const q = String(query ?? '').trim().slice(0, 100);
    if (q.length < 2) return { items: [], page: 1, hasMore: false };
    const n = Math.min(Math.max(parseInt(page, 10) || 1, 1), 50);
    return cache.wrap(`search:${q.toLowerCase()}:${type}:${n}`, TTL.search, async () => {
      const r = await provider.search(q, { page: n, type });
      return { items: drop(SummarySchema, r.items), page: n, hasMore: Boolean(r.hasMore) };
    });
  }

  const movie = (id) => cache.wrap(`movie:${need(id)}`, TTL.detail, async () => validated(MovieSchema, await provider.getMovie(id)));
  const series = (id) => cache.wrap(`series:${need(id)}`, TTL.detail, async () => validated(SeriesSchema, await provider.getSeries(id)));
  const seasons = (id) => cache.wrap(`seasons:${need(id)}`, TTL.detail, async () => drop(SeasonSchema, await provider.getSeasons(id)));
  const episodes = (id, season) => {
    const n = parseInt(season, 10);
    if (!Number.isInteger(n) || n < 0 || n > 200) throw notFound('Musim');
    return cache.wrap(`eps:${need(id)}:${n}`, TTL.detail, async () => drop(EpisodeSchema, await provider.getEpisodes(id, n)));
  };
  const episode = (id) => cache.wrap(`ep:${need(id)}`, TTL.detail, async () => validated(EpisodeSchema, await provider.getEpisode(id)));

  /** Playback TIDAK pernah di-cache: URL bisa bertanda tangan/berumur pendek. */
  async function playback(kind, id, { sessionId } = {}) {
    need(id);
    const raw = kind === 'episode' ? await provider.getEpisodePlayback(id, { sessionId }) : await provider.getMoviePlayback(id, { sessionId });
    return validated(PlaybackSchema, raw);
  }

  async function recommendations({ basedOn } = {}) {
    if (basedOn !== undefined && !isValidId(basedOn)) return [];
    return cache.wrap(`reco:${basedOn ?? ''}`, TTL.reco, async () => drop(SummarySchema, await provider.recommendations({ basedOn })));
  }

  /** Data ringkas tepercaya untuk snapshot (My List / riwayat) — tidak pernah dari klien. */
  async function snapshot(kind, id) {
    if (kind === 'episode') {
      const ep = await episode(id);
      if (!ep) return null;
      const s = await series(ep.seriesId).catch(() => null);
      return {
        contentType: 'episode', contentId: ep.id, seriesId: ep.seriesId, season: ep.seasonNumber, episode: ep.episodeNumber,
        title: s?.title ?? ep.title, episodeTitle: ep.title, poster: s?.poster ?? null, image: ep.thumbnail ?? s?.backdrop ?? null,
        duration: ep.duration,
      };
    }
    const m = await movie(id);
    return m && {
      contentType: 'movie', contentId: m.id, seriesId: null, season: null, episode: null,
      title: m.title, episodeTitle: null, poster: m.poster, image: m.backdrop, duration: m.duration,
    };
  }

  /** Susun baris Home dari kemampuan provider — kategori yang tidak didukung tidak dipalsukan. */
  async function home() {
    if (provider.available === false) {
      throw new ApiError(503, 'CONTENT_UNAVAILABLE', 'Katalog belum tersedia. Content API belum dikonfigurasi.');
    }
    const c = await caps();
    const rows = [];
    const has = (l) => c.lists.includes(l);
    const canType = (t) => c.types.includes(t);
    const jobs = [];
    const add = (id, title, promise) => jobs.push(promise.then((r) => ({ id, title, items: r.items })).catch(() => ({ id, title, items: [] })));

    if (has('trending')) add('trending', 'Sedang tren', list({ list: 'trending' }));
    if (has('popular')) add('popular', 'Populer', list({ list: 'popular' }));
    if (has('latest') && canType('movie')) add('latest-movies', 'Film terbaru', list({ list: 'latest', type: 'movie' }));
    if (has('latest') && canType('series')) add('latest-series', 'Series terbaru', list({ list: 'latest', type: 'series' }));
    if (has('top_rated')) add('top-rated', 'Rating tertinggi', list({ list: 'top_rated' }));
    if (has('upcoming')) add('upcoming', 'Segera tayang', list({ list: 'upcoming' }));
    if (c.recommendations) add('recommended', 'Rekomendasi untukmu', recommendations().then((items) => ({ items })));
    for (const g of (c.genres ?? []).slice(0, 4)) add(`genre-${g}`, g, list({ list: 'popular', genre: g }));

    const settled = await Promise.all(jobs);
    for (const r of settled) if (r.items.length) rows.push(r);
    if (!rows.length) throw new ApiError(502, 'CONTENT_UPSTREAM_ERROR', 'Katalog sedang tidak dapat diakses. Coba lagi beberapa saat.');

    const seen = new Set();
    const hero = [];
    for (const r of rows) {
      if (!['trending', 'top-rated', 'latest-movies', 'popular'].includes(r.id)) continue;
      for (const it of r.items) {
        if (hero.length >= 5) break;
        if (it.backdrop && !seen.has(it.id)) { seen.add(it.id); hero.push(it); }
      }
    }
    return { hero, rows };
  }

  return {
    provider: { id: provider.id, isDevelopmentData: provider.isDevelopmentData, available: provider.available },
    capabilities: caps, home, list, search, movie, series, seasons, episodes, episode, playback,
    recommendations, snapshot,
    clearCache: () => cache.clear(),
  };
}
