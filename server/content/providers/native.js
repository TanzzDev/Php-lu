// Adapter untuk Content API yang mengimplementasikan kontrak internal MDFlix:
//   GET /api/movies?list=&type=&genre=&page=        GET /api/movies/search?q=&page=
//   GET /api/movies/{id}   GET /api/movies/{id}/stream
//   GET /api/series/{id}   GET /api/series/{id}/seasons   GET /api/series/{id}/seasons/{n}/episodes
//   GET /api/episodes/{id} GET /api/episodes/{id}/stream  GET /api/recommendations?basedOn=
// Jika Content API produksi memakai struktur lain, ubah PEMETAAN DI SINI saja.
import { createContentHttp } from '../http.js';
import {
  mapSummary, mapMovie, mapSeries, mapEpisode, mapPlayback, mapSeasons, unwrapList, unwrapObject,
} from '../normalizers.js';

export function createNativeProvider({ baseUrl, isProd }) {
  const http = createContentHttp({ baseUrl });
  const o = { url: { allowLocalHttp: !isProd } };
  const enc = encodeURIComponent;
  const summaries = (json) => unwrapList(json).map((r) => mapSummary(r, o)).filter(Boolean);
  const page = (json, items, n) => ({ items, page: n, hasMore: Boolean(json?.hasMore ?? json?.has_more ?? false) });

  return {
    id: 'native',
    isDevelopmentData: false,
    available: true,
    capabilities: async () => ({
      lists: ['trending', 'popular', 'latest', 'top_rated', 'upcoming'],
      types: ['movie', 'series'], genres: [], episodes: true, playback: true, recommendations: true,
    }),

    async list({ list = 'popular', type = 'all', genre, page: n = 1 }) {
      const json = await http.getJson('/api/movies', { list, type, genre, page: n });
      return page(json, summaries(json ?? []), n);
    },
    async search(q, { page: n = 1, type = 'all' } = {}) {
      const json = await http.getJson('/api/movies/search', { q, page: n, type });
      return page(json, summaries(json ?? []), n);
    },
    async getMovie(id) {
      const raw = unwrapObject(await http.getJson(`/api/movies/${enc(id)}`));
      const m = raw && mapMovie(raw, o);
      return m ?? null;
    },
    async getSeries(id) {
      const raw = unwrapObject(await http.getJson(`/api/series/${enc(id)}`));
      return (raw && mapSeries(raw, o)) ?? null;
    },
    async getSeasons(seriesId) {
      const json = await http.getJson(`/api/series/${enc(seriesId)}/seasons`);
      return json ? mapSeasons({ seasons: unwrapList(json) }) : [];
    },
    async getEpisodes(seriesId, season) {
      const json = await http.getJson(`/api/series/${enc(seriesId)}/seasons/${enc(season)}/episodes`);
      return unwrapList(json ?? []).map((r) => mapEpisode({ seriesId, seasonNumber: season, ...r }, o)).filter(Boolean);
    },
    async getEpisode(id) {
      const raw = unwrapObject(await http.getJson(`/api/episodes/${enc(id)}`));
      return (raw && mapEpisode(raw, o)) ?? null;
    },
    async getMoviePlayback(id, { sessionId } = {}) {
      const raw = unwrapObject(await http.getJson(`/api/movies/${enc(id)}/stream`, { session: sessionId }));
      return (raw && mapPlayback(raw, o)) ?? null;
    },
    async getEpisodePlayback(id, { sessionId } = {}) {
      const raw = unwrapObject(await http.getJson(`/api/episodes/${enc(id)}/stream`, { session: sessionId }));
      return (raw && mapPlayback(raw, o)) ?? null;
    },
    async recommendations({ basedOn } = {}) {
      return summaries(await http.getJson('/api/recommendations', { basedOn }) ?? []);
    },
  };
}
