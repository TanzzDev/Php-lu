import { ApiError } from '../../lib/errors.js';

const down = () => {
  throw new ApiError(503, 'CONTENT_UNAVAILABLE', 'Katalog belum tersedia. Content API belum dikonfigurasi.');
};

/** Dipakai di produksi saat CONTENT_API_BASE_URL kosong: tidak pernah menyajikan data contoh kepada pengguna sungguhan. */
export const unavailableProvider = {
  id: 'unavailable', isDevelopmentData: false, available: false,
  capabilities: async () => ({ lists: [], types: [], genres: [], episodes: false, playback: false, recommendations: false }),
  list: down, search: down, getMovie: down, getSeries: down, getSeasons: down, getEpisodes: down,
  getEpisode: down, getMoviePlayback: down, getEpisodePlayback: down, recommendations: down,
};
