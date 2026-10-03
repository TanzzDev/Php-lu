// Test integrasi konten MDFlix Original → Gen 2. Tidak butuh database/Postgres.
// Jalankan: npm run test:content
//
// CATATAN: memakai mock upstream lokal (./mock-upstream.mjs) yang meniru bentuk payload original.
// Ini membuktikan adapter benar terhadap kontrak yang terdokumentasi di kode original — bukan
// bahwa API produksi berperilaku sama. Untuk API sungguhan: npm run smoke:content.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { startMockUpstream } from './mock-upstream.mjs';
import { createOriginalProvider, ORIGINAL_API_BASE_URL } from '../../server/content/providers/original.js';
import { createContentService, selectProvider } from '../../server/content/service.js';
import { loadEnv } from '../../server/config/env.js';
import { createHandler } from '../../server/router.js';
import { createProviderProbe } from '../../server/auth/providers.js';
import { rememberNext, peekNext, clearNext } from '../../src/lib/authNext.js';

let up;
before(async () => { up = await startMockUpstream(); });
after(async () => { await up.close(); });
const fresh = () => { up.calls.length = 0; up.setMode('ok'); };
const svcFor = (opts = {}) => createContentService({ provider: createOriginalProvider({ baseUrl: up.base, ...opts }) });

describe('konfigurasi & pemilihan provider', () => {
  it('default tanpa env apa pun → provider original dengan base URL tertanam di source', async () => {
    assert.equal(ORIGINAL_API_BASE_URL, 'https://thanz-stream.web.id/api/movies');
    const env = loadEnv({});
    assert.equal(env.content.dialect, 'original');
    assert.equal(env.content.baseUrl, undefined);
    const provider = selectProvider(env);
    assert.equal(provider.id, 'original');
    assert.equal(provider.available, true);
    assert.equal(provider.isDevelopmentData, false);

    // Tanpa jaringan: stub fetch untuk melihat URL & header yang BENAR-BENAR dikirim ke host default.
    const real = globalThis.fetch;
    let seen;
    globalThis.fetch = async (url, init) => { seen = { url: String(url), headers: init.headers }; return new Response('{"results":[]}', { status: 200 }); };
    try { await provider.list({ list: 'popular', type: 'all', page: 1 }); } finally { globalThis.fetch = real; }
    assert.equal(seen.url, 'https://thanz-stream.web.id/api/movies/popular?page=1&type=all');
    assert.match(seen.headers['User-Agent'], /Android 10; K\) AppleWebKit\/537\.36/);
    assert.equal(seen.headers.Referer, 'https://thanz-stream.web.id/');
    assert.equal(seen.headers.Accept, '*/*');
  });

  it('produksi tetap memakai original (tidak lagi 503 karena env kosong); fixture tidak pernah aktif di produksi', () => {
    assert.equal(selectProvider(loadEnv({ VERCEL_ENV: 'production' })).id, 'original');
    const prodFixture = selectProvider(loadEnv({ VERCEL_ENV: 'production', CONTENT_API_DIALECT: 'fixture' }));
    assert.equal(prodFixture.id, 'unavailable');
    assert.equal(prodFixture.available, false);
    assert.equal(selectProvider(loadEnv({ NODE_ENV: 'development', CONTENT_API_DIALECT: 'fixture' })).id, 'fixture');
  });

  it('alias legacy, override base URL, native butuh base URL, dialek tak dikenal ditolak', () => {
    assert.equal(selectProvider(loadEnv({ CONTENT_API_DIALECT: 'legacy' })).id, 'original');
    assert.equal(selectProvider(loadEnv({ CONTENT_API_DIALECT: 'native', CONTENT_API_BASE_URL: 'https://api.example' })).id, 'native');
    assert.equal(selectProvider(loadEnv({ CONTENT_API_DIALECT: 'native' })).id, 'unavailable');
    assert.throws(() => selectProvider(loadEnv({ CONTENT_API_DIALECT: 'ngawur' })), /tidak dikenal/);
  });
});

describe('permintaan ke API original (path, query, header)', () => {
  it('memetakan setiap endpoint original dengan parameter yang sama', async () => {
    fresh();
    const p = createOriginalProvider({ baseUrl: up.base });
    await p.list({ list: 'popular', type: 'all', page: 2 });
    await p.list({ list: 'latest', type: 'movie' });
    await p.list({ list: 'upcoming', page: 3 });
    await p.list({ list: 'top_rated', type: 'all', page: 1 });
    await p.search('film uji', { page: 1 });
    await p.getMovie('movie-1');
    const [popular, latest, upcoming, top, search, detail] = up.calls;
    assert.deepEqual([popular.path, popular.query], ['/api/movies/popular', { page: '2', type: 'all' }]);
    assert.deepEqual([latest.path, latest.query], ['/api/movies/latest', { type: 'movie' }]);          // latest tanpa page
    assert.deepEqual([upcoming.path, upcoming.query], ['/api/movies/upcoming', { page: '3' }]);        // upcoming tanpa type
    assert.deepEqual([top.path, top.query], ['/api/movies/top-rated', { page: '1', type: 'movie' }]);  // top-rated original = movie
    assert.deepEqual([search.path, search.query], ['/api/movies/search', { q: 'film uji', page: '1' }]);
    assert.equal(detail.path, '/api/movies/detail/movie-1');
  });

  it('header sama dengan function original: User-Agent mobile + Referer ke host sumber + Accept */*', async () => {
    fresh();
    await createOriginalProvider({ baseUrl: up.base }).list({ list: 'popular' });
    const h = up.calls[0].headers;
    assert.match(h['user-agent'], /^Mozilla\/5\.0 \(Linux; Android 10; K\)/);
    assert.equal(h.referer, `${up.root}/`);
    assert.equal(h.accept, '*/*');
  });

  it('base URL boleh berakhiran /api/movies atau host saja (hasil sama)', async () => {
    fresh();
    await createOriginalProvider({ baseUrl: up.root }).getMovie('movie-1');
    await createOriginalProvider({ baseUrl: `${up.root}/api/movies/` }).getMovie('movie-1');
    assert.deepEqual(up.calls.map((c) => c.path), ['/api/movies/detail/movie-1', '/api/movies/detail/movie-1']);
  });

  it('nilai type yang dikirim hanya "all"/"movie" (tidak menebak "series"/"tv" ke sumber)', async () => {
    fresh();
    const svc = svcFor();
    await svc.list({ list: 'latest', type: 'series' });
    await svc.list({ list: 'popular', type: 'series' });
    await svc.list({ list: 'top_rated', type: 'series' });
    for (const c of up.calls) assert.ok(c.query.type === undefined || ['all', 'movie'].includes(c.query.type), JSON.stringify(c.query));
  });
});

describe('normalisasi ke format Gen 2', () => {
  it('list: poster path TMDB dilengkapi, rating & tipe & tahun dinormalisasi, backdrop jatuh ke poster', async () => {
    fresh();
    const { items } = await svcFor().list({ list: 'popular' });
    const [film, serial] = items;
    assert.equal(film.id, 'movie-1');
    assert.equal(film.type, 'movie');
    assert.equal(film.rating, 7.1);
    assert.equal(film.backdrop, film.poster);
    assert.equal(serial.type, 'series');
    assert.equal(serial.poster, 'https://image.tmdb.org/t/p/w500/abc123.jpg');
    assert.equal(serial.rating, 8.2);       // vote_average 82 → 8.2
    assert.equal(serial.year, 2022);
  });

  it('list type=movie / type=series menyaring hasil sesuai tipe', async () => {
    fresh();
    const svc = svcFor();
    assert.deepEqual((await svc.list({ list: 'popular', type: 'movie' })).items.map((i) => i.type), ['movie']);
    assert.deepEqual((await svc.list({ list: 'popular', type: 'series' })).items.map((i) => i.id), ['tv-9']);
  });

  it('pencarian memakai q & mengembalikan hasil bernormalisasi', async () => {
    fresh();
    const r = await svcFor().search('serial uji');
    assert.deepEqual(r.items.map((i) => i.id), ['tv-9']);
    assert.equal((await svcFor().search('x')).items.length, 0); // < 2 huruf tidak memanggil sumber
  });

  it('home: baris dibangun dari endpoint original dan tidak memakai tipe yang tak terbukti', async () => {
    fresh();
    const home = await svcFor().home();
    const ids = home.rows.map((r) => r.id);
    for (const id of ['popular', 'latest-movies', 'latest-series', 'top-rated', 'upcoming']) assert.ok(ids.includes(id), id);
    assert.ok(home.hero.length > 0 && home.hero.every((h) => h.backdrop), 'hero ada');
    assert.deepEqual(home.rows.find((r) => r.id === 'latest-series').items.map((i) => i.type), ['series']);
    assert.ok(up.calls.every((c) => !['series', 'tv'].includes(c.query.type)));
  });
});

describe('detail film & playback embed', () => {
  it('detail film dipetakan penuh; URL embed TIDAK ikut ke metadata publik', async () => {
    fresh();
    const m = await svcFor().movie('movie-1');
    assert.equal(m.type, 'movie');
    assert.equal(m.duration, 6720);                       // "1h 52m"
    assert.deepEqual(m.genres, ['Aksi', 'Drama']);
    assert.equal(m.director, 'Sutradara Uji');
    assert.equal(m.cast[0].photo, 'https://image.tmdb.org/t/p/w185/p.jpg');
    assert.equal(m.cast[1].name, 'Nama Saja');
    assert.equal(m.trailer, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(JSON.stringify(m).includes('embed.example'), false);
  });

  it('playback: server embed dibersihkan (javascript:/http: dibuang, duplikat digabung, // → https)', async () => {
    fresh();
    const pb = await svcFor().playback('movie', 'movie-1');
    assert.equal(pb.type, 'embed');
    assert.equal(pb.source, 'https://embed.example/movie/1');
    assert.deepEqual(pb.servers, [
      { name: '2Embed', url: 'https://embed.example/movie/1' },
      { name: 'VidSrc', url: 'https://vidsrc.example/embed/1' },
    ]);
    assert.deepEqual(pb.subtitles, []);
  });

  it('film tanpa embed aman → null (route menjawab 404 PLAYBACK_UNAVAILABLE); tipe tak cocok → null', async () => {
    fresh();
    const svc = svcFor();
    assert.equal(await svc.playback('movie', 'movie-nostream'), null);
    assert.equal(await svc.playback('movie', 'tv-9'), null);
    assert.equal(await svc.movie('tidak-ada'), null);
    assert.equal(await svc.movie('tv-9'), null);
  });

  it('tipe eksplisit "Movie" menang atas array seasons kosong', async () => {
    fresh();
    assert.equal((await svcFor().movie('movie-seasons-kosong')).type, 'movie');
  });
});

describe('series: level-judul (perilaku original) dan episode dari payload', () => {
  it('series tanpa data episode → musim dari payload + pemutar level-judul (titleStream)', async () => {
    fresh();
    const svc = svcFor();
    const s = await svc.series('tv-9');
    assert.equal(s.type, 'series');
    assert.deepEqual(s.seasons.map((x) => [x.number, x.episodeCount]), [[1, 8], [2, 10]]);
    assert.equal(s.titleStream, 'tv-9:play');
    assert.deepEqual(await svc.episodes('tv-9', 1), []);          // tidak ada episode karangan
    const ep = await svc.episode('tv-9:play');
    assert.deepEqual([ep.seriesId, ep.seasonNumber, ep.episodeNumber], ['tv-9', 0, 0]);
    const pb = await svc.playback('episode', 'tv-9:play');
    assert.equal(pb.type, 'embed');
    assert.equal(pb.source, 'https://embed.example/tv/9');
    const snap = await svc.snapshot('episode', 'tv-9:play');
    assert.equal(snap.title, 'Serial Uji Sembilan');
    assert.equal(snap.seriesId, 'tv-9');
  });

  it('series dengan episode bersteram sendiri → daftar episode nyata & playback per-episode', async () => {
    fresh();
    const svc = svcFor();
    const s = await svc.series('tv-77');
    assert.equal(s.titleStream, null);
    assert.deepEqual(s.seasons.map((x) => x.number), [1, 2]);
    const eps = await svc.episodes('tv-77', 1);
    assert.deepEqual(eps.map((e) => [e.id, e.episodeNumber, e.title]), [['tv-77:s1e1', 1, 'Pilot'], ['tv-77:s1e2', 2, 'Dua']]);
    assert.equal((await svc.episodes('tv-77', 2)).length, 1);
    assert.equal((await svc.episode('tv-77:s2e1')).title, 'Kembali');
    assert.equal((await svc.playback('episode', 'tv-77:s1e2')).source, 'https://embed.example/tv/77/1/2');
    assert.equal(await svc.episode('tv-77:s9e9'), null);
  });

  it('metadata episode tanpa stream per-episode tidak ditampilkan; series jatuh ke level-judul', async () => {
    fresh();
    const svc = svcFor();
    assert.deepEqual(await svc.episodes('tv-78', 1), []);
    assert.equal((await svc.series('tv-78')).titleStream, 'tv-78:play');
  });

  it('id episode tak valid / series tak ada → null, bukan error', async () => {
    fresh();
    const svc = svcFor();
    assert.equal(await svc.episode('movie-1'), null);
    assert.equal(await svc.episode('nope:s1e1'), null);
    assert.equal(await svc.playback('episode', 'movie-1:s1e1'), null);
    assert.equal(await svc.series('movie-1'), null);
  });
});

describe('penanganan error upstream', () => {
  it('HTTP 500 → 502 CONTENT_UPSTREAM_ERROR tanpa membocorkan host', async () => {
    fresh(); up.setMode('down');
    const err = await svcFor().list({ list: 'popular' }).catch((e) => e);
    assert.equal(err.status, 502);
    assert.equal(err.code, 'CONTENT_UPSTREAM_ERROR');
    assert.doesNotMatch(err.message, /127\.0\.0\.1|http/);
  });

  it('JSON rusak → 502; tidak menjawab → 504 (timeout)', async () => {
    fresh(); up.setMode('badjson');
    assert.equal((await svcFor().list({ list: 'popular' }).catch((e) => e)).status, 502);
    up.setMode('slow');
    assert.equal((await svcFor({ timeoutMs: 150 }).list({ list: 'popular' }).catch((e) => e)).status, 504);
    up.setMode('ok');
  });

  it('data lama tetap disajikan bila sumber gagal sesudahnya (stale-if-error)', async () => {
    fresh();
    const svc = svcFor();
    const first = await svc.list({ list: 'popular' });
    up.setMode('down');
    // TTL belum habis → dari cache; memastikan tidak error walau sumber mati
    assert.deepEqual((await svc.list({ list: 'popular' })).items.map((i) => i.id), first.items.map((i) => i.id));
    up.setMode('ok');
  });
});

// ───────────────────────── HTTP end-to-end: router asli + provider original + mock upstream ─────────────────────────
function fakeAdmin({ userId, token, sessions }) {
  const profile = { id: userId, email: 'uji@example.com', display_name: 'Uji', avatar_url: null, role: 'USER', is_active: true, created_at: '2026-01-01T00:00:00Z', last_login_at: null };
  const table = (name) => {
    const f = {};
    const q = {
      select: () => q, update: () => q, upsert: () => q, eq: (k, v) => { f[k] = v; return q; },
      maybeSingle: async () => ({
        data: name === 'profiles' ? profile : sessions.find((s) => s.id === f.id && s.user_id === f.user_id) ?? null,
        error: null,
      }),
      then: (ok, bad) => Promise.resolve({ data: null, error: null }).then(ok, bad),
    };
    return q;
  };
  return {
    auth: { getUser: async (t) => (t === token ? { data: { user: { id: userId, email: profile.email, user_metadata: {} } }, error: null } : { data: null, error: { message: 'invalid' } }) },
    from: table,
    rpc: async () => ({ data: null, error: null }),
  };
}

describe('API MDFlix end-to-end (router asli, tanpa database)', () => {
  const TOKEN = 'token_uji_0123456789abcdef';
  const USER = randomUUID();
  const sessions = [];
  let server, base;

  before(async () => {
    fresh();
    const env = loadEnv({
      NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_0123456789',
      SUPABASE_SECRET_KEY: 'sb_secret_test_0123456789abcdef', SITE_URL: 'http://localhost:3000',
    });
    const content = createContentService({ provider: createOriginalProvider({ baseUrl: up.base, timeoutMs: 1500 }) });
    const handler = createHandler({ env, content, admin: fakeAdmin({ userId: USER, token: TOKEN, sessions }), authProviders: async () => ({ google: true }) });
    server = http.createServer(handler);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(() => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }));

  const get = async (path, token) => {
    const res = await fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  };
  const addSession = (contentType, contentId) => { const id = randomUUID(); sessions.push({ id, user_id: USER, status: 'ACTIVE', content_type: contentType, content_id: contentId }); return id; };

  it('config/public: provider original aktif, bukan data pengembangan, status Google tersedia, tanpa secret', async () => {
    const r = await get('/config/public');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.content, { provider: 'original', developmentData: false, available: true });
    assert.equal(r.body.auth.providers.google, true);
    assert.equal(r.body.auth.configured, true);
    assert.doesNotMatch(r.text, /sb_secret|service_role/i);
  });

  it('beranda → baris & hero dari API original (bukan fixture)', async () => {
    fresh();
    const r = await get('/catalog/home');
    assert.equal(r.status, 200);
    assert.equal(r.body.meta.provider, 'original');
    assert.equal(r.body.meta.developmentData, false);
    assert.ok(r.body.rows.length >= 4 && r.body.hero.length > 0);
    assert.ok(up.calls.some((c) => c.path === '/api/movies/popular'), 'benar-benar memanggil upstream');
    assert.doesNotMatch(r.text, /dev-m0|Data pengembangan/);
  });

  it('pencarian → detail film → detail series; metadata publik tidak memuat URL stream', async () => {
    fresh();
    const s = await get('/movies/search?q=film');
    assert.deepEqual(s.body.items.map((i) => i.id), ['movie-1']);
    const m = await get('/movies/movie-1');
    assert.equal(m.status, 200);
    assert.equal(m.body.movie.title, 'Film Uji Satu');
    assert.doesNotMatch(m.text, /embed\.example/);
    const tv = await get('/series/tv-9');
    assert.equal(tv.body.series.titleStream, 'tv-9:play');
    assert.doesNotMatch(tv.text, /embed\.example/);
    assert.equal((await get('/series/tv-77/seasons/1/episodes')).body.episodes.length, 2);
    assert.equal((await get('/movies/tidak-ada')).status, 404);
    assert.equal((await get('/movies/..%2Fadmin')).status, 404);
  });

  it('stream wajib login + sesi aktif untuk konten yang sama; hasilnya playback embed', async () => {
    fresh();
    assert.equal((await get('/movies/movie-1/stream')).status, 401);
    assert.equal((await get(`/movies/movie-1/stream?session=${randomUUID()}`, TOKEN)).body.error.code, 'NO_ACTIVE_SESSION');

    const sid = addSession('movie', 'movie-1');
    const ok = await get(`/movies/movie-1/stream?session=${sid}`, TOKEN);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.playback.type, 'embed');
    assert.equal(ok.body.playback.source, 'https://embed.example/movie/1');
    assert.equal(ok.body.playback.servers.length, 2);

    // sesi milik konten lain tidak boleh dipakai untuk film ini
    const other = addSession('movie', 'movie-seasons-kosong');
    assert.equal((await get(`/movies/movie-1/stream?session=${other}`, TOKEN)).body.error.code, 'NO_ACTIVE_SESSION');

    const none = addSession('movie', 'movie-nostream');
    const gone = await get(`/movies/movie-nostream/stream?session=${none}`, TOKEN);
    assert.equal(gone.status, 404);
    assert.equal(gone.body.error.code, 'PLAYBACK_UNAVAILABLE');
  });

  it('stream episode (level-judul & per-episode) lewat id episode ber-":"', async () => {
    fresh();
    const a = addSession('episode', 'tv-9:play');
    const r1 = await get(`/episodes/${encodeURIComponent('tv-9:play')}/stream?session=${a}`, TOKEN);
    assert.equal(r1.status, 200);
    assert.equal(r1.body.playback.source, 'https://embed.example/tv/9');
    const b = addSession('episode', 'tv-77:s1e2');
    const r2 = await get(`/episodes/${encodeURIComponent('tv-77:s1e2')}/stream?session=${b}`, TOKEN);
    assert.equal(r2.body.playback.source, 'https://embed.example/tv/77/1/2');
    assert.equal((await get(`/episodes/${encodeURIComponent('tv-9:play')}`)).body.episode.seasonNumber, 0);
  });

  it('upstream mati → 502 seragam tanpa detail internal', async () => {
    fresh(); up.setMode('down');
    const r = await get('/movies/search?q=zzzz-baru');
    assert.equal(r.status, 502);
    assert.equal(r.body.error.code, 'CONTENT_UPSTREAM_ERROR');
    assert.doesNotMatch(r.text, /127\.0\.0\.1|ECONNREFUSED|thanz/);
    up.setMode('ok');
  });
});

describe('status provider Google (probe Supabase /auth/v1/settings)', () => {
  const env = (url) => ({ supabase: { url, publishableKey: 'sb_publishable_test_0123456789' } });
  async function settingsServer(handler) {
    const calls = [];
    const s = http.createServer((req, res) => { calls.push({ url: req.url, apikey: req.headers.apikey }); handler(req, res); });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${s.address().port}`, calls, close: () => new Promise((r) => { s.close(r); s.closeAllConnections?.(); }) };
  }

  it('google aktif → true; nonaktif → false; apikey publishable dikirim; hasil di-cache', async () => {
    const on = await settingsServer((_, res) => res.end(JSON.stringify({ external: { google: true, email: true } })));
    const off = await settingsServer((_, res) => res.end(JSON.stringify({ external: { google: false } })));
    try {
      const probeOn = createProviderProbe({ env: env(on.url) });
      assert.deepEqual(await probeOn(), { google: true });
      await probeOn();
      assert.equal(on.calls.length, 1, 'cache');
      assert.deepEqual(on.calls[0], { url: '/auth/v1/settings', apikey: 'sb_publishable_test_0123456789' });
      assert.deepEqual(await createProviderProbe({ env: env(off.url) })(), { google: false });
    } finally { await on.close(); await off.close(); }
  });

  it('gagal/timeout/bentuk tak dikenal/tanpa konfigurasi → null (tidak memblokir login)', async () => {
    const bad = await settingsServer((_, res) => { res.statusCode = 500; res.end('x'); });
    const odd = await settingsServer((_, res) => res.end(JSON.stringify({ hello: 'world' })));
    const hang = await settingsServer(() => {});
    try {
      assert.deepEqual(await createProviderProbe({ env: env(bad.url) })(), { google: null });
      assert.deepEqual(await createProviderProbe({ env: env(odd.url) })(), { google: null });
      assert.deepEqual(await createProviderProbe({ env: env(hang.url), timeoutMs: 120 })(), { google: null });
      assert.deepEqual(await createProviderProbe({ env: env('http://127.0.0.1:1') })(), { google: null });
      assert.deepEqual(await createProviderProbe({ env: { supabase: {} } })(), { google: null });
    } finally { await bad.close(); await odd.close(); await hang.close(); }
  });
});

describe('tujuan setelah login Google (authNext)', () => {
  const memory = () => { const m = new Map(); return { setItem: (k, v) => m.set(k, v), getItem: (k) => (m.has(k) ? m.get(k) : null), removeItem: (k) => m.delete(k) }; };

  it('menyimpan, membaca tanpa menghapus (aman untuk StrictMode), lalu menghapus', () => {
    const store = memory();
    assert.equal(peekNext(store), null);
    rememberNext('/watch/movie/movie-1', store);
    assert.equal(peekNext(store), '/watch/movie/movie-1');
    assert.equal(peekNext(store), '/watch/movie/movie-1');
    clearNext(store);
    assert.equal(peekNext(store), null);
  });

  it('penyimpanan yang diblokir/rusak tidak melempar error', () => {
    const broken = { setItem() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => { rememberNext('/x', broken); clearNext(broken); });
    assert.equal(peekNext(broken), null);
    assert.equal(peekNext(null), null);
  });
});
