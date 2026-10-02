// Provider fixture — DATA PENGEMBANGAN yang jelas ditandai. Bukan katalog berlisensi.
import { MOVIES, SERIES, GENRES, CAST, SAMPLE } from '../fixtures/data.js';

const art = (kind, id) => `/dev/art/${kind}-${id}.svg`;
const summary = (x) => ({
  id: x.id, type: x.type, title: x.title, poster: art('poster', x.id), backdrop: art('backdrop', x.id),
  year: x.year, rating: x.rating, genres: x.genres, description: x.description.slice(0, 300),
});
const cast = () => CAST.slice(0, 4).map((name, i) => ({ name, character: i === 0 ? 'Tokoh utama' : null, photo: null }));

const ALL = [...MOVIES, ...SERIES];
const byRating = (a, b) => b.rating - a.rating;
const byYear = (a, b) => b.year - a.year || b.rating - a.rating;

function pageOf(arr, n, size = 20) {
  const start = (n - 1) * size;
  return { items: arr.slice(start, start + size), page: n, hasMore: start + size < arr.length };
}

export const fixtureProvider = {
  id: 'fixture',
  isDevelopmentData: true,
  available: true,

  capabilities: async () => ({
    lists: ['trending', 'popular', 'latest', 'top_rated'],
    types: ['movie', 'series'], genres: GENRES, episodes: true, playback: true, recommendations: true,
  }),

  async list({ list = 'popular', type = 'all', genre, page = 1 }) {
    let pool = ALL.filter((x) => type === 'all' || x.type === type);
    if (genre) pool = pool.filter((x) => x.genres.includes(genre));
    const sorted = {
      trending: [...pool].sort((a, b) => (b.rating * 3 + b.year) - (a.rating * 3 + a.year)),
      popular: [...pool].sort(byRating),
      latest: [...pool].sort(byYear),
      top_rated: [...pool].sort(byRating),
    }[list] ?? [...pool];
    const p = pageOf(sorted, page);
    return { ...p, items: p.items.map(summary) };
  },

  async search(q, { page = 1 } = {}) {
    const needle = q.toLowerCase();
    const hits = ALL.filter((x) => x.title.toLowerCase().includes(needle) || x.genres.some((g) => g.toLowerCase().includes(needle)));
    const p = pageOf(hits, page);
    return { ...p, items: p.items.map(summary) };
  },

  async getMovie(id) {
    const m = MOVIES.find((x) => x.id === id);
    if (!m) return null;
    return {
      ...summary(m), description: m.description, releaseDate: `${m.year}-01-01`, tagline: null, trailer: null,
      status: 'Data pengembangan', cast: cast(), duration: m.duration, director: 'Sutradara Contoh',
    };
  },

  async getSeries(id) {
    const s = SERIES.find((x) => x.id === id);
    if (!s) return null;
    return {
      ...summary(s), description: s.description, releaseDate: `${s.year}-01-01`, tagline: null, trailer: null,
      status: 'Data pengembangan', cast: cast(), creator: 'Kreator Contoh',
      seasons: s.seasons.map((x) => ({ number: x.number, title: x.title, episodeCount: x.episodes.length })),
    };
  },

  async getSeasons(id) { return (await this.getSeries(id))?.seasons ?? []; },

  async getEpisodes(seriesId, season) {
    const s = SERIES.find((x) => x.id === seriesId);
    const se = s?.seasons.find((x) => x.number === Number(season));
    return (se?.episodes ?? []).map((e) => ({
      id: e.id, seriesId, seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber, title: e.title,
      description: e.description, thumbnail: art('thumb', s.id), duration: e.duration,
    }));
  },

  async getEpisode(id) {
    const s = SERIES.find((x) => id.startsWith(`${x.id}-`));
    const e = s?.seasons.flatMap((x) => x.episodes).find((x) => x.id === id);
    return e ? {
      id: e.id, seriesId: s.id, seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber, title: e.title,
      description: e.description, thumbnail: art('thumb', s.id), duration: e.duration,
    } : null;
  },

  async getMoviePlayback(id) { return MOVIES.some((x) => x.id === id) ? { ...SAMPLE, quality: '360p', expiresAt: null } : null; },
  async getEpisodePlayback(id) { return (await this.getEpisode(id)) ? { ...SAMPLE, quality: '360p', expiresAt: null } : null; },

  async recommendations({ basedOn } = {}) {
    const base = ALL.find((x) => x.id === basedOn);
    const pool = ALL.filter((x) => x.id !== basedOn);
    const scored = pool
      .map((x) => ({ x, score: base ? x.genres.filter((g) => base.genres.includes(g)).length : 0 }))
      .sort((a, b) => b.score - a.score || byRating(a.x, b.x));
    return scored.slice(0, 12).map(({ x }) => summary(x));
  },
};
