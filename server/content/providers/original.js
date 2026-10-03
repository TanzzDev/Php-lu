// Provider "original" — API konten MDFlix Original (ZaamMovie), dibawa ke arsitektur Gen 2.
//
// Sumber referensi: netlify/api/zaam-movies.js pada project original. Fungsi itu hanya
// membungkus satu API publik (tanpa kunci/secret) dengan endpoint path-based berikut:
//
//   {base}/popular?page=&type=      {base}/upcoming?page=
//   {base}/latest?type=             {base}/top-rated?page=&type=
//   {base}/search?q=&page=          {base}/detail/{slug}
//
// ("action=stream" di original hanyalah alias dari detail: sumber video ada di dalam payload
// detail pada blok `stream: { primaryIframe, servers: [{ server, url }] }`.)
//
// Alur data:  API original → normalizer → model internal (zod) → cache → API MDFlix → UI Gen 2.
// UI Gen 2 tidak berubah bentuk data; semua perbedaan struktur diserap di sini.
import { createContentHttp } from '../http.js';
import {
  mapSummary, mapMovie, mapSeries, inferType, unwrapList, unwrapObject,
  mapEmbedPlayback, mapDetailEpisodes, parseEpisodeId, titleStreamId,
} from '../normalizers.js';

/**
 * Base URL API konten dari project original. Ini endpoint publik (bukan secret), jadi
 * sengaja ditanam di source — pengguna tidak perlu mengisi apa pun. Dapat diganti lewat
 * CONTENT_API_BASE_URL bila host-nya pindah (host ini sudah berganti antar versi project).
 */
export const ORIGINAL_API_BASE_URL = 'https://thanz-stream.web.id/api/movies';

// Header permintaan yang sama dengan function original (BASE_HEADERS).
const ORIGINAL_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';

// Daftar list MDFlix → path upstream (mapping endpoint original dipertahankan).
const LIST_PATHS = { popular: '/popular', latest: '/latest', upcoming: '/upcoming', top_rated: '/top-rated' };
const API_PATH = '/api/movies';

/** Ada halaman berikutnya? Hanya dari penanda yang benar-benar dikirim sumber; tidak menebak. */
function hasMoreOf(json, page) {
  const r = json?.results && !Array.isArray(json.results) ? json.results : json;
  const flag = r?.hasMore ?? r?.has_more ?? r?.hasNext ?? r?.has_next;
  if (typeof flag === 'boolean') return flag;
  const total = Number(r?.totalPages ?? r?.total_pages);
  return Number.isFinite(total) && total > 0 ? page < total : false;
}

const warnNoStream = (id) => console.warn(JSON.stringify({ level: 'warn', event: 'content.no_stream', id }));

export function createOriginalProvider({ baseUrl = ORIGINAL_API_BASE_URL, isProd = false, timeoutMs = 10_000 } = {}) {
  const root = String(baseUrl).trim().replace(/\/+$/, '').replace(/\/api\/movies$/, '');
  const http = createContentHttp({
    baseUrl: root,
    timeoutMs,
    headers: { 'User-Agent': ORIGINAL_USER_AGENT, Referer: `${new URL(root).origin}/`, Accept: '*/*' },
  });
  const o = { url: { allowLocalHttp: !isProd }, tmdbPaths: true, durationUnit: 'minutes' };

  // Sama seperti normalizeItem original: tanpa backdrop, poster dipakai sebagai backdrop (hero beranda).
  const items = (json) => unwrapList(json ?? []).map((r) => mapSummary(r, o)).filter(Boolean)
    .map((i) => ({ ...i, backdrop: i.backdrop ?? i.poster }));
  const byType = (list, type) => (type === 'movie' || type === 'series' ? list.filter((i) => i.type === type) : list);
  const detail = async (id) => unwrapObject(await http.getJson(`${API_PATH}/detail/${encodeURIComponent(id)}`));

  async function seriesRaw(id) {
    const raw = await detail(id);
    return raw && inferType(raw) === 'series' ? raw : null;
  }

  /**
   * Episode dari payload detail — hanya bila minimal satu episode punya stream sendiri. Metadata
   * episode tanpa stream tidak ditampilkan (kliknya pasti berujung "video belum tersedia");
   * series tersebut diputar lewat pemutar level-judul seperti di original.
   */
  function episodesOf(raw, id) {
    const all = mapDetailEpisodes(raw, id, o);
    return all.some((e) => e.embed) ? all : [];
  }

  return {
    id: 'original',
    isDevelopmentData: false,
    available: true,

    capabilities: async () => ({
      lists: Object.keys(LIST_PATHS), types: ['movie', 'series'], genres: [],
      episodes: true, playback: true, recommendations: false,
    }),

    async list({ list = 'popular', type = 'all', page = 1 }) {
      const path = LIST_PATHS[list];
      if (!path) return { items: [], page, hasMore: false };
      // Nilai `type` yang terbukti dipakai original hanya "all" dan "movie". Series diambil dari
      // daftar "all" lalu disaring, bukan lewat nilai type yang tidak terbukti diterima sumber.
      // top-rated pada original selalu type=movie.
      const upstreamType = list === 'top_rated' ? (type === 'series' ? 'all' : 'movie') : (type === 'movie' ? 'movie' : 'all');
      const query = list === 'latest' ? { type: upstreamType } : list === 'upcoming' ? { page } : { page, type: upstreamType };
      const json = await http.getJson(API_PATH + path, query);
      return { items: byType(items(json), type), page, hasMore: list === 'latest' ? false : hasMoreOf(json, page) };
    },

    async search(q, { page = 1 } = {}) {
      const json = await http.getJson(`${API_PATH}/search`, { q, page });
      return { items: items(json), page, hasMore: hasMoreOf(json, page) };
    },

    async getMovie(id) {
      const raw = await detail(id);
      return raw && inferType(raw) === 'movie' ? mapMovie(raw, o) : null;
    },

    async getSeries(id) {
      const raw = await seriesRaw(id);
      const s = raw && mapSeries(raw, o);
      if (!s) return null;
      const eps = episodesOf(raw, id);
      if (!s.seasons.length && eps.length) {
        const nums = [...new Set(eps.map((e) => e.episode.seasonNumber))].sort((a, b) => a - b);
        s.seasons = nums.map((n) => ({ number: n, title: null, episodeCount: eps.filter((e) => e.episode.seasonNumber === n).length }));
      }
      // Tanpa stream per-episode, series diputar lewat pemutar level-judul — sama seperti original.
      s.titleStream = !eps.length && mapEmbedPlayback(raw, o) ? titleStreamId(id) : null;
      return s;
    },

    async getSeasons(id) { return (await this.getSeries(id))?.seasons ?? []; },

    async getEpisodes(seriesId, season) {
      const raw = await seriesRaw(seriesId);
      if (!raw) return [];
      return episodesOf(raw, seriesId).map((e) => e.episode).filter((e) => e.seasonNumber === season);
    },

    async getEpisode(id) {
      const ref = parseEpisodeId(id);
      if (!ref) return null;
      const raw = await seriesRaw(ref.seriesId);
      if (!raw) return null;
      if (ref.titleLevel) {
        const s = mapSeries(raw, o);
        return s && mapEmbedPlayback(raw, o)
          ? { id, seriesId: ref.seriesId, seasonNumber: 0, episodeNumber: 0, title: 'Series', description: null, thumbnail: s.backdrop ?? s.poster, duration: null }
          : null;
      }
      return episodesOf(raw, ref.seriesId).find((e) => e.episode.id === id)?.episode ?? null;
    },

    async getMoviePlayback(id) {
      const raw = await detail(id);
      if (!raw || inferType(raw) !== 'movie') return null;
      const pb = mapEmbedPlayback(raw, o);
      if (!pb) warnNoStream(id);
      return pb;
    },

    async getEpisodePlayback(id) {
      const ref = parseEpisodeId(id);
      if (!ref) return null;
      const raw = await seriesRaw(ref.seriesId);
      if (!raw) return null;
      const pb = ref.titleLevel
        ? mapEmbedPlayback(raw, o)
        : episodesOf(raw, ref.seriesId).find((e) => e.episode.id === id)?.embed ?? null;
      if (!pb) warnNoStream(id);
      return pb;
    },

    // Original tidak punya endpoint rekomendasi per-judul: tidak dipalsukan.
    async recommendations() { return []; },
  };
}
