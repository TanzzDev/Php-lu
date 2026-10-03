const TZ = 'Asia/Jakarta';

/** 6720 → "1j 52m" */
export function duration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}j${m ? ` ${m}m` : ''}` : `${Math.max(m, 1)}m`;
}

/** 3725 → "1:02:05" */
export function clock(sec) {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 2400 → "40 menit" */
export function spanLabel(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h} jam ${m} menit` : `${h} jam`;
  if (m) return `${m} menit`;
  return `${s} detik`;
}

const fmt = (opts) => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, ...opts });
const dLong = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
const dShort = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const dTime = fmt({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const tOnly = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });

const valid = (iso) => iso && !Number.isNaN(new Date(iso).getTime());
export const dateLong = (iso) => (valid(iso) ? dLong.format(new Date(iso)) : '—');
export const dateShort = (iso) => (valid(iso) ? dShort.format(new Date(iso)) : '—');
export const dateTime = (iso) => (valid(iso) ? dTime.format(new Date(iso)).replace(/\./g, ':').replace(',', '') : '—');
export const timeOnly = (iso) => (valid(iso) ? tOnly.format(new Date(iso)).replace('.', ':') : '—');

export function relative(iso, now = Date.now()) {
  if (!valid(iso)) return '—';
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return 'baru saja';
  if (diff < 3600) return `${Math.round(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.round(diff / 3600)} jam lalu`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} hari lalu`;
  return dateShort(iso);
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'M';

/** Kurangi ke URL gambar aman untuk <img>. */
export function safeImg(u) {
  if (typeof u !== 'string') return null;
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  try { return new URL(u).protocol === 'https:' ? u : null; } catch { return null; }
}

/** srcset untuk gambar TMDB (jika ada); selain itu tanpa srcset. */
export function tmdbSrcSet(u) {
  const m = /^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/.+)$/.exec(u ?? '');
  return m ? [185, 342, 500, 780].map((w) => `${m[1]}w${w}${m[2]} ${w}w`).join(', ') : undefined;
}

/** "S2 E5" untuk episode nyata; null untuk pemutar level-judul (musim 0 / episode 0) yang tidak punya nomor. */
export const episodeLabel = (e) => (e && e.seasonNumber === 0 && e.episodeNumber === 0 ? null : `S${e?.seasonNumber} E${e?.episodeNumber}`);

export const contentPath = (item) =>
  item.type === 'series' ? `/series/${encodeURIComponent(item.id)}` : `/movie/${encodeURIComponent(item.id)}`;

export const watchPath = (kind, id) => `/watch/${kind}/${encodeURIComponent(id)}`;
