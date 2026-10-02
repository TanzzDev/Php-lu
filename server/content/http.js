import { ApiError } from '../lib/errors.js';

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Klien HTTP untuk Content API. Identitas permintaan JUJUR (User-Agent MDFlix,
 * tanpa Referer palsu). Jika Content API memerlukan kredensial, itu dikonfigurasi
 * di adapter — bukan dengan menyamar sebagai browser.
 */
export function createContentHttp({ baseUrl, timeoutMs = 8000, headers = {} }) {
  const upstream = (status) =>
    new ApiError(status, 'CONTENT_UPSTREAM_ERROR', 'Katalog sedang tidak dapat diakses. Coba lagi beberapa saat.');

  return {
    /** Mengembalikan JSON, atau null jika 404. */
    async getJson(path, query = {}) {
      const url = new URL(baseUrl + path);
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'MDFlix/1.0 (+content-adapter)', ...headers },
          signal: ctrl.signal,
        });
      } catch (err) {
        throw upstream(err?.name === 'AbortError' ? 504 : 502);
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 404) return null;
      if (!res.ok) throw upstream(502);
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_BYTES) throw upstream(502);
      const body = await res.text();
      if (body.length > MAX_BYTES) throw upstream(502);
      try { return JSON.parse(body); } catch { throw upstream(502); }
    },
  };
}
