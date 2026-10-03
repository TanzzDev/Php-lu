// Model internal MDFlix (kontrak antara adapter provider dan seluruh aplikasi).
// Frontend hanya mengenal bentuk ini — tidak pernah struktur URL/field milik provider.
import { z } from 'zod';

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,127}$/;
export const isValidId = (v) => typeof v === 'string' && ID_RE.test(v);

/**
 * URL aman untuk gambar/sumber media. Hanya https (atau http://localhost untuk
 * pengembangan). Path relatif hanya jika diizinkan (fixture lokal).
 */
export function safeUrl(value, { allowRelative = false, allowLocalHttp = false } = {}) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > 2000) return null;
  if (allowRelative && /^\/(?!\/)[A-Za-z0-9._~\-/%]+$/.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:') return u.toString();
    if (allowLocalHttp && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return u.toString();
  } catch { /* bukan URL valid */ }
  return null;
}

const nullable = (s) => s.nullish().transform((v) => v ?? null);
const url = z.string().max(2000).nullable();
const str = (n) => z.string().max(n);

export const SummarySchema = z.object({
  id: z.string().regex(ID_RE),
  type: z.enum(['movie', 'series']),
  title: z.string().min(1).max(300),
  poster: url,
  backdrop: url,
  year: nullable(z.number().int().min(1878).max(2200)),
  rating: nullable(z.number().min(0).max(10)),
  genres: z.array(str(60)).max(12).default([]),
  description: nullable(str(600)),
});

export const CastSchema = z.object({
  name: z.string().min(1).max(120),
  character: nullable(str(120)),
  photo: url.nullish().transform((v) => v ?? null),
});

const detailBase = {
  description: nullable(str(4000)),
  releaseDate: nullable(str(40)),
  tagline: nullable(str(300)),
  trailer: nullable(str(500)),
  status: nullable(str(60)),
  cast: z.array(CastSchema).max(30).default([]),
};

export const MovieSchema = SummarySchema.extend({
  type: z.literal('movie'),
  ...detailBase,
  duration: nullable(z.number().int().min(0).max(86400 * 2)),
  director: nullable(str(200)),
});

export const SeasonSchema = z.object({
  number: z.number().int().min(0).max(200),
  title: nullable(str(200)),
  episodeCount: nullable(z.number().int().min(0).max(5000)),
});

export const SeriesSchema = SummarySchema.extend({
  type: z.literal('series'),
  ...detailBase,
  creator: nullable(str(200)),
  seasons: z.array(SeasonSchema).max(200).default([]),
  // Id "episode" khusus untuk memutar series lewat pemutar level-judul bila sumber tidak
  // menyediakan daftar episode (perilaku aplikasi original). null = tidak ada.
  titleStream: nullable(z.string().regex(ID_RE)),
});

export const EpisodeSchema = z.object({
  id: z.string().regex(ID_RE),
  seriesId: z.string().regex(ID_RE),
  seasonNumber: z.number().int().min(0).max(200),
  episodeNumber: z.number().int().min(0).max(5000),
  title: z.string().min(1).max(300),
  description: nullable(str(2000)),
  thumbnail: url.nullish().transform((v) => v ?? null),
  duration: nullable(z.number().int().min(0).max(86400 * 2)),
});

export const PlaybackSchema = z.object({
  source: z.string().min(1).max(2000),
  // 'embed' = halaman pemutar pihak ketiga (iframe) dengan beberapa server; selain itu sumber video langsung.
  type: z.enum(['hls', 'mp4', 'webm', 'embed']),
  quality: nullable(str(40)),
  subtitles: z.array(z.object({
    lang: str(16), label: str(60), src: z.string().max(2000), default: z.boolean().default(false),
  })).max(20).default([]),
  audio: z.array(z.object({ lang: str(16), label: str(60) })).max(20).default([]),
  servers: z.array(z.object({ name: str(40), url: z.string().min(1).max(2000) })).max(12).default([]),
  duration: nullable(z.number().min(0).max(86400 * 2)),
  expiresAt: nullable(str(40)),
});
