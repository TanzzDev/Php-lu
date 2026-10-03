import http from 'node:http';
import { loadEnv } from '../../server/config/env.js';
import { createHandler } from '../../server/router.js';

/** Jalankan API sungguhan (handler yang sama dengan Vercel) di port acak untuk diuji lewat fetch. */
export async function startApi(stack, { content, extraEnv = {}, overrides = {} } = {}) {
  const env = loadEnv({
    NODE_ENV: 'test',
    SUPABASE_URL: stack.url,
    SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
    SUPABASE_SECRET_KEY: stack.secretKey,
    SITE_URL: 'http://localhost:3000',
    // Default produk = API original (jaringan). Test ini deterministik, jadi memakai data fixture secara eksplisit.
    CONTENT_API_DIALECT: 'fixture',
    ...extraEnv,
  });
  const handler = createHandler({ env, content, ...overrides });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { token, body, raw, headers = {}, query } = {}) {
    const url = base + '/api' + path + (query ? '?' + new URLSearchParams(query) : '');
    const res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, body: json, text, headers: res.headers };
  }

  return {
    base, call, env,
    get: (p, o) => call('GET', p, o),
    post: (p, body, o) => call('POST', p, { ...o, body: body ?? {} }),
    patch: (p, body, o) => call('PATCH', p, { ...o, body }),
    put: (p, body, o) => call('PUT', p, { ...o, body }),
    del: (p, o) => call('DELETE', p, o),
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }),
  };
}
