// Server "mirip produksi" untuk hasil build: menyajikan dist/ + API, memakai header dari vercel.json
// (termasuk CSP). Dipakai `npm start` dan uji end-to-end. Di Vercel, tidak dipakai.
import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile?.('.env'); } catch { /* .env opsional */ }
const root = join(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const { handleRequest } = await import('../server/router.js');

const cfg = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const globalHeaders = Object.fromEntries((cfg.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]));
const assetHeaders = Object.fromEntries((cfg.headers.find((h) => h.source === '/assets/(.*)')?.headers ?? []).map((h) => [h.key, h.value]));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webm': 'video/webm', '.vtt': 'text/vtt', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' };

/**
 * @param api                  handler API (default: dari environment)
 * @param relaxForLocalHttp    hanya untuk uji lokal: origin Supabase http:// ditambahkan ke connect-src dan
 *                             upgrade-insecure-requests dilepas. CSP lainnya tetap ketat.
 */
export function createServeHandler({ api = handleRequest, relaxForLocalHttp } = {}) {
  const headers = { ...globalHeaders };
  if (relaxForLocalHttp) {
    headers['Content-Security-Policy'] = headers['Content-Security-Policy']
      .replace('connect-src \'self\' https:', `connect-src 'self' https: ${relaxForLocalHttp}`)
      .replace('; upgrade-insecure-requests', '');
  }
  return (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return api(req, res);

    let file = normalize(join(dist, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dist)) { res.statusCode = 403; return res.end(); }
    const isFile = existsSync(file) && statSync(file).isFile();
    if (!isFile) file = join(dist, 'index.html');

    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (url.pathname.startsWith('/assets/')) for (const [k, v] of Object.entries(assetHeaders)) res.setHeader(k, v);
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');

    // Dukungan Range agar video dapat di-seek seperti di CDN Vercel.
    const size = statSync(file).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && isFile) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', end - start + 1);
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', size);
    createReadStream(file).pipe(res);
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  http.createServer(createServeHandler()).listen(port, () => console.log(`MDFlix → http://localhost:${port}`));
}
