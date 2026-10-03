// Normalizer tolerant: pemetaan dari bentuk data provider ke model internal.
// Logika pencocokan banyak nama field diambil dari normalizeItem/normalizeDetail/
// normalizeCastMember pada aplikasi lama (sumber data punya nama field yang bervariasi),
// kini dijalankan di server dan hasilnya divalidasi skema — bukan di browser.
import { safeUrl } from './models.js';

const pick = (raw, ...keys) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const text = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

export function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function toRating(v) {
  const n = toNumber(v);
  if (n === null || n < 0) return null;
  const r = n > 10 && n <= 100 ? n / 10 : n;
  return r > 10 ? null : Math.round(r * 10) / 10;
}

export function toYear(...vals) {
  for (const v of vals) {
    const m = String(v ?? '').match(/(18|19|20|21)\d{2}/);
    if (m) return Number(m[0]);
  }
  return null;
}

/** Durasi → detik. Angka murni ditafsirkan sesuai unit dialek; teks "1h 52m" / "112 min" / "1j 52m" dikenali. */
export function toSeconds(v, unit = 'seconds') {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v >= 0 ? Math.round(unit === 'minutes' ? v * 60 : v) : null;
  const s = String(v).toLowerCase();
  if (/^\d+(\.\d+)?$/.test(s.trim())) return toSeconds(Number(s), unit);
  let total = 0, found = false;
  const h = s.match(/(\d+)\s*(h|j|jam|hr|hour)/);
  const m = s.match(/(\d+)\s*(m|min|mnt|menit|minute)/);
  const sec = s.match(/(\d+)\s*(s|sec|detik|second)/);
  if (h) { total += Number(h[1]) * 3600; found = true; }
  if (m) { total += Number(m[1]) * 60; found = true; }
  if (sec) { total += Number(sec[1]); found = true; }
  return found ? total : null;
}

export function toGenres(v) {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,/|]/) : [];
  return list
    .map((g) => (typeof g === 'string' ? g : g?.name ?? g?.nama ?? g?.title ?? ''))
    .map((g) => text(g, 60))
    .filter(Boolean)
    .slice(0, 12);
}

export function inferType(raw) {
  const t = String(pick(raw, 'type', 'tipe', 'category', 'media_type') ?? '').toLowerCase();
  if (/series|serial|tv|show|drama/.test(t)) return 'series';
  if (/movie|film/.test(t)) return 'movie';   // tipe eksplisit menang atas tebakan dari field musim
  if ((Array.isArray(raw?.seasons) && raw.seasons.length > 0) || Number(raw?.numberOfSeasons) > 0) return 'series';
  return 'movie';
}

/** Id dari field id/slug, atau segmen terakhir URL/link/href sebagai cadangan (perilaku aplikasi lama). */
export function extractId(raw) {
  const direct = pick(raw, 'id', 'slug', '_id');
  if (direct !== undefined) return String(direct);
  const link = pick(raw, 'url', 'link', 'href');
  if (typeof link === 'string') {
    const seg = link.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
    if (seg) return seg;
  }
  return null;
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

/** Path relatif ala TMDB ("/abc.jpg") dilengkapi menjadi URL penuh — seperti aplikasi lama. */
function imageUrl(v, o, size = 'w500') {
  if (typeof v !== 'string') return null;
  if (o.tmdbPaths && /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(v)) return `${TMDB_IMG_BASE}/${size}${v}`;
  return safeUrl(v, o.url);
}

export function mapCast(list, o = {}) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30).map((c) => {
    if (typeof c === 'string') return { name: text(c, 120), character: null, photo: null };
    const name = text(pick(c, 'name', 'nama'), 120);
    const photo = imageUrl(pick(c, 'photo', 'image', 'foto', 'avatar', 'picture', 'photoUrl', 'photo_url', 'profile', 'profileImage', 'profile_path', 'profilePath'), o, 'w185');
    return { name, character: text(pick(c, 'character', 'role', 'peran'), 120), photo };
  }).filter((c) => c.name);
}

export function mapSummary(raw, o = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const id = extractId(raw);
  const title = text(pick(raw, 'title', 'judul', 'name', 'nama'), 300);
  if (!id || !title) return null;
  const poster = imageUrl(pick(raw, 'poster', 'posterUrl', 'image', 'thumbnail', 'img', 'cover'), o);
  const backdrop = imageUrl(pick(raw, 'backdrop', 'backdropUrl', 'banner', 'background'), o, 'w780');
  const releaseDate = pick(raw, 'releaseDate', 'release_date', 'date');
  return {
    id, type: inferType(raw), title, poster, backdrop,
    year: toYear(pick(raw, 'year', 'tahun'), releaseDate),
    rating: toRating(pick(raw, 'rating', 'score', 'vote_average', 'nilai')),
    genres: toGenres(pick(raw, 'genres', 'genre', 'kategori')),
    description: text(pick(raw, 'description', 'synopsis', 'sinopsis', 'deskripsi', 'overview'), 600),
  };
}

function detailFields(raw, o) {
  const sum = mapSummary(raw, o);
  if (!sum) return null;
  return {
    ...sum,
    description: text(pick(raw, 'description', 'synopsis', 'sinopsis', 'deskripsi', 'overview'), 4000),
    releaseDate: text(pick(raw, 'releaseDate', 'release_date', 'date'), 40),
    tagline: text(raw.tagline, 300),
    trailer: safeUrl(raw.trailer, o.url) ?? null,
    status: text(raw.status, 60),
    cast: mapCast(raw.cast, o),
  };
}

export function mapMovie(raw, o = {}) {
  const d = detailFields(raw, o);
  if (!d) return null;
  return {
    ...d, type: 'movie',
    duration: toSeconds(pick(raw, 'duration', 'durasi', 'runtime'), o.durationUnit),
    director: text(pick(raw, 'director', 'sutradara'), 200),
  };
}

export function mapSeasons(raw) {
  const list = Array.isArray(raw?.seasons) ? raw.seasons : [];
  const out = list.map((s, i) => {
    if (typeof s === 'number') return { number: s, title: null, episodeCount: null };
    const number = toNumber(pick(s, 'number', 'seasonNumber', 'season', 'season_number')) ?? i + 1;
    return {
      number, title: text(pick(s, 'title', 'name'), 200),
      episodeCount: toNumber(pick(s, 'episodeCount', 'episodes', 'episode_count', 'numberOfEpisodes')),
    };
  });
  if (!out.length) {
    const n = toNumber(raw?.numberOfSeasons);
    if (n > 0) return Array.from({ length: Math.min(n, 200) }, (_, i) => ({ number: i + 1, title: null, episodeCount: null }));
  }
  return out;
}

export function mapSeries(raw, o = {}) {
  const d = detailFields(raw, o);
  if (!d) return null;
  return { ...d, type: 'series', creator: text(pick(raw, 'creator', 'director', 'sutradara'), 200), seasons: mapSeasons(raw) };
}

export function mapEpisode(raw, o = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const id = extractId(raw);
  const seriesId = pick(raw, 'seriesId', 'series_id', 'showId');
  const title = text(pick(raw, 'title', 'name', 'judul'), 300);
  const seasonNumber = toNumber(pick(raw, 'seasonNumber', 'season_number', 'season'));
  const episodeNumber = toNumber(pick(raw, 'episodeNumber', 'episode_number', 'episode', 'number'));
  if (!id || seriesId === undefined || seasonNumber === null || episodeNumber === null) return null;
  return {
    id, seriesId: String(seriesId), seasonNumber, episodeNumber,
    title: title ?? `Episode ${episodeNumber}`,
    description: text(pick(raw, 'description', 'synopsis', 'overview'), 2000),
    thumbnail: imageUrl(pick(raw, 'thumbnail', 'still', 'image', 'poster'), o, 'w300'),
    duration: toSeconds(pick(raw, 'duration', 'runtime'), o.durationUnit),
  };
}

const PLAYBACK_TYPES = { hls: 'hls', m3u8: 'hls', mp4: 'mp4', webm: 'webm' };

export function mapPlayback(raw, o = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const source = safeUrl(pick(raw, 'source', 'src', 'url'), o.url);
  if (!source) return null;
  let type = PLAYBACK_TYPES[String(raw.type ?? '').toLowerCase()];
  if (!type) {
    const ext = source.replace(/[?#].*$/, '').split('.').pop().toLowerCase();
    type = PLAYBACK_TYPES[ext];
  }
  if (!type) return null; // hanya sumber langsung yang dapat diukur; embed/iframe tidak didukung
  const subs = Array.isArray(raw.subtitles) ? raw.subtitles : [];
  return {
    source, type,
    quality: text(raw.quality, 40),
    subtitles: subs.map((s) => ({
      lang: text(pick(s, 'lang', 'language', 'srclang'), 16) ?? 'und',
      label: text(pick(s, 'label', 'name'), 60) ?? 'Subtitle',
      src: safeUrl(pick(s, 'src', 'url', 'file'), o.url),
      default: Boolean(s?.default),
    })).filter((s) => s.src),
    audio: (Array.isArray(raw.audio) ? raw.audio : []).map((a) => ({
      lang: text(pick(a, 'lang', 'language'), 16) ?? 'und', label: text(pick(a, 'label', 'name'), 60) ?? 'Audio',
    })),
    duration: toNumber(raw.duration),
    expiresAt: text(raw.expiresAt, 40),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Playback EMBED (iframe pihak ketiga) — dipakai provider "original".
// Sumber data original mengirim: stream: { primaryIframe, servers: [{ server, url }] }.
// ─────────────────────────────────────────────────────────────────────────────

/** URL embed: hanya https. URL tanpa skema ("//host/x") dianggap https; http:, javascript:, data: ditolak. */
export function embedUrl(value, o = {}) {
  if (typeof value !== 'string') return null;
  return safeUrl(value.trim().replace(/^\/\//, 'https://'), o.url);
}

/**
 * Petakan blok `stream` (dari detail judul atau dari satu episode) menjadi playback bertipe embed.
 * Mengembalikan null bila tidak ada satu pun URL embed yang aman.
 */
export function mapEmbedPlayback(raw, o = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const stream = raw.stream && typeof raw.stream === 'object' ? raw.stream : {};
  const list = Array.isArray(stream.servers) ? stream.servers : Array.isArray(raw.servers) ? raw.servers : [];

  const servers = [];
  const seen = new Set();
  for (const s of list) {
    const url = embedUrl(typeof s === 'string' ? s : pick(s, 'url', 'link', 'embed'), o);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const name = typeof s === 'string' ? null : text(pick(s, 'server', 'name', 'label'), 40);
    servers.push({ name: name ?? `Server ${servers.length + 1}`, url });
  }

  const direct = pick(stream, 'primaryIframe', 'primary_iframe', 'iframe') ?? (typeof raw.iframe === 'string' ? raw.iframe : undefined);
  const primary = embedUrl(direct, o) ?? servers[0]?.url ?? null;
  if (!primary) return null;
  if (!seen.has(primary)) servers.unshift({ name: 'Utama', url: primary });

  return {
    source: primary, type: 'embed', quality: null, subtitles: [], audio: [],
    servers: servers.slice(0, 12), duration: null, expiresAt: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ID episode buatan MDFlix. Sumber original tidak punya endpoint episode, jadi ID ini
// membawa seriesId (+ musim/episode) supaya episode bisa ditemukan kembali dari payload detail.
//   "<seriesId>:s<musim>e<episode>"  episode nyata yang ada di payload detail
//   "<seriesId>:play"                pemutar level-judul (musim 0 / episode 0)
// ─────────────────────────────────────────────────────────────────────────────
export const titleStreamId = (seriesId) => `${seriesId}:play`;
export const episodeId = (seriesId, season, episode) => `${seriesId}:s${season}e${episode}`;

export function parseEpisodeId(id) {
  if (typeof id !== 'string') return null;
  const t = /^(.+):play$/.exec(id);
  if (t) return { seriesId: t[1], titleLevel: true };
  const m = /^(.+):s(\d{1,3})e(\d{1,5})$/.exec(id);
  return m ? { seriesId: m[1], season: Number(m[2]), episode: Number(m[3]), titleLevel: false } : null;
}

/**
 * Episode yang BENAR-BENAR ada di payload detail series (bila sumber menyertakannya):
 *   seasons[i].episodes[]   atau   episodes[] (datar, dengan nomor musim)
 * Tidak ada data yang dikarang: tanpa episode di payload → daftar kosong.
 * Hasil: [{ episode, embed }] — embed null bila episode tidak punya stream sendiri.
 */
export function mapDetailEpisodes(raw, seriesId, o = {}) {
  const found = [];
  if (Array.isArray(raw?.seasons)) {
    raw.seasons.forEach((s, i) => {
      if (!s || typeof s !== 'object' || !Array.isArray(s.episodes)) return;
      const sn = toNumber(pick(s, 'number', 'seasonNumber', 'season', 'season_number')) ?? i + 1;
      s.episodes.forEach((e) => found.push({ season: sn, raw: e }));
    });
  }
  if (!found.length && Array.isArray(raw?.episodes)) {
    raw.episodes.forEach((e) => found.push({ season: toNumber(pick(e, 'seasonNumber', 'season_number', 'season')) ?? 1, raw: e }));
  }

  const perSeason = new Map();
  const out = [];
  for (const { season, raw: e } of found) {
    if (!e || typeof e !== 'object' || !Number.isInteger(season) || season < 0 || season > 200) continue;
    const next = (perSeason.get(season) ?? 0) + 1;
    perSeason.set(season, next);
    const n = toNumber(pick(e, 'episodeNumber', 'episode_number', 'episode', 'number')) ?? next;
    if (!Number.isInteger(n) || n < 0 || n > 5000) continue;
    out.push({
      episode: {
        id: episodeId(seriesId, season, n), seriesId: String(seriesId), seasonNumber: season, episodeNumber: n,
        title: text(pick(e, 'title', 'name', 'judul'), 300) ?? `Episode ${n}`,
        description: text(pick(e, 'description', 'synopsis', 'overview'), 2000),
        thumbnail: imageUrl(pick(e, 'thumbnail', 'still', 'image', 'poster', 'still_path'), o, 'w300'),
        duration: toSeconds(pick(e, 'duration', 'runtime'), o.durationUnit),
      },
      embed: mapEmbedPlayback(e, o),
    });
  }
  return out.sort((a, b) => a.episode.seasonNumber - b.episode.seasonNumber || a.episode.episodeNumber - b.episode.episodeNumber);
}

/** Ambil array dari amplop respons yang beragam ({results}, {data}, {items}, array polos). */
export function unwrapList(json) {
  const r = json?.results !== undefined ? json.results : json?.data !== undefined ? json.data : json;
  if (Array.isArray(r)) return r;
  for (const k of ['items', 'movies', 'data', 'results', 'episodes', 'seasons']) if (Array.isArray(r?.[k])) return r[k];
  return [];
}

export function unwrapObject(json) {
  const r = json?.results !== undefined ? json.results : json?.data !== undefined && !Array.isArray(json.data) ? json.data : json;
  return r && typeof r === 'object' && !Array.isArray(r) ? r : null;
}
