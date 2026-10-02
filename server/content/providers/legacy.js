// Adapter untuk tata letak endpoint lama (sumber data aplikasi sebelumnya):
//   {base}/api/movies/popular | /latest | /upcoming | /top-rated | /search | /detail/{slug}
// Hanya METADATA. Playback tidak dipetakan: sumber lama berupa iframe embed pihak ketiga
// yang tidak bisa diukur (kuota Free) dan asal-usul lisensinya tidak dapat diverifikasi.
import { createContentHttp } from '../http.js';
import { mapSummary, mapMovie, mapSeries, inferType, unwrapList, unwrapObject } from '../normalizers.js';

export function createLegacyProvider({ baseUrl, isProd }) {
  const root = baseUrl.replace(/\/api\/movies\/?$/, '');
  const http = createContentHttp({ baseUrl: root });
  const o = { url: { allowLocalHttp: !isProd }, tmdbPaths: true, durationUnit: 'minutes' };
  const P = '/api/movies';
  const items = (json) => unwrapList(json ?? []).map((r) => mapSummary(r, o)).filter(Boolean);
  const LIST_PATHS = { popular: '/popular', latest: '/latest', upcoming: '/upcoming', top_rated: '/top-rated' };

  return {
    id: 'legacy',
    isDevelopmentData: false,
    available: true,
    capabilities: async () => ({
      lists: Object.keys(LIST_PATHS), types: ['movie', 'series'], genres: [],
      episodes: false, playback: false, recommendations: false,
    }),
    async list({ list = 'popular', type = 'all', page = 1 }) {
      const path = LIST_PATHS[list];
      if (!path) return { items: [], page, hasMore: false };
      const json = await http.getJson(P + path, list === 'latest' ? { type } : { page, type });
      return { items: items(json), page, hasMore: false };
    },
    async search(q, { page = 1 } = {}) {
      return { items: items(await http.getJson(`${P}/search`, { q, page })), page, hasMore: false };
    },
    async getMovie(id) {
      const raw = unwrapObject(await http.getJson(`${P}/detail/${encodeURIComponent(id)}`));
      return raw && inferType(raw) === 'movie' ? mapMovie(raw, o) : null;
    },
    async getSeries(id) {
      const raw = unwrapObject(await http.getJson(`${P}/detail/${encodeURIComponent(id)}`));
      return raw && inferType(raw) === 'series' ? mapSeries(raw, o) : null;
    },
    async getSeasons(id) { return (await this.getSeries(id))?.seasons ?? []; },
    async getEpisodes() { return []; },
    async getEpisode() { return null; },
    async getMoviePlayback() { return null; },
    async getEpisodePlayback() { return null; },
    async recommendations() { return []; },
  };
}
