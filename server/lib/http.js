import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiError } from './errors.js';
import { redact } from '../config/env.js';

const JSON_LIMIT = 32 * 1024;

/** Bungkus request Node menjadi objek sederhana yang dipakai handler. */
export function wrapRequest(req, requestId = randomUUID()) {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  let rawCache;
  return {
    id: requestId,
    method: (req.method ?? 'GET').toUpperCase(),
    path,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers,
    params: {},
    ip: fwd || req.socket?.remoteAddress || 'unknown',
    /** Bytes mentah request body. Dibaca sekali. */
    async raw(limit = JSON_LIMIT) {
      if (rawCache) return rawCache;
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Data yang dikirim terlalu besar.');
        chunks.push(chunk);
      }
      rawCache = Buffer.concat(chunks);
      return rawCache;
    },
    async json(limit = JSON_LIMIT) {
      const buf = await this.raw(limit);
      if (buf.length === 0) return {};
      try {
        return JSON.parse(buf.toString('utf8'));
      } catch {
        throw new ApiError(400, 'INVALID_JSON', 'Format data tidak valid.');
      }
    },
  };
}

/** Validasi dengan zod; kesalahan diterjemahkan menjadi respons 422 yang konsisten. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw zodToApiError(result.error);
}

export function zodToApiError(error) {
  const fields = error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
  return new ApiError(422, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid.', { fields });
}

// Browser: selalu revalidasi (konfigurasi tidak boleh basi di klien).
// CDN Vercel: di-cache lewat Vercel-CDN-Cache-Control (data katalog sama untuk semua orang).
// Data spesifik user selalu no-store dan tidak pernah disimpan di cache publik.
const CACHE = {
  none: { cc: 'no-store' },
  private: { cc: 'private, no-store' },
  public: { cc: 'public, max-age=0, s-maxage=300', cdn: 'max-age=300, stale-while-revalidate=600' },
  publicShort: { cc: 'public, max-age=0, s-maxage=60', cdn: 'max-age=60, stale-while-revalidate=120' },
};

export function send(res, result, requestId) {
  const status = result.status ?? 200;
  const body = JSON.stringify(result.body ?? {});
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Request-Id', requestId);
  const cache = CACHE[result.cache ?? 'none'];
  res.setHeader('Cache-Control', cache.cc);
  if (cache.cdn) res.setHeader('Vercel-CDN-Cache-Control', cache.cdn);
  for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
  // Body yang ditolak (413) belum dibaca habis: jangan pakai ulang koneksi keep-alive.
  if (status === 413) res.setHeader('Connection', 'close');
  res.end(body);
}

/** Respons error yang seragam — tidak pernah membocorkan stack, secret, atau path internal. */
export function sendError(res, err, requestId, env) {
  let apiErr = err;
  if (err instanceof ZodError) apiErr = zodToApiError(err);
  if (!(apiErr instanceof ApiError)) {
    apiErr = new ApiError(500, 'INTERNAL', 'Terjadi kesalahan pada server. Coba lagi beberapa saat.');
    apiErr.internal = redact(err?.stack ?? err?.message ?? String(err), env ?? {});
  }
  if (apiErr.status >= 500 || apiErr.internal) {
    console.error(JSON.stringify({
      level: 'error', requestId, code: apiErr.code, message: redact(apiErr.internal ?? apiErr.message, env ?? { supabase: {} }),
    }));
  }
  const headers = apiErr.retryAfter ? { 'Retry-After': String(apiErr.retryAfter) } : {};
  send(res, {
    status: apiErr.status,
    headers,
    body: { error: { code: apiErr.code, message: apiErr.message, ...(apiErr.details ? { details: apiErr.details } : {}) }, requestId },
  }, requestId);
}

export const ok = (body, opts = {}) => ({ status: 200, body, ...opts });
export const created = (body) => ({ status: 201, body });
