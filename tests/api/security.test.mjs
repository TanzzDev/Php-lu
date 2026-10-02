import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack } from '../stack/stack.mjs';
import { startApi } from '../stack/api.mjs';

let stack, api, alice, bob, root;
const seen = []; // semua respons — dipindai untuk kebocoran secret
const pg = () => stack.db.client;
const one = async (sql, p) => (await pg().query(sql, p)).rows[0];

before(async () => {
  stack = await startStack('sec');
  api = await startApi(stack);
  const orig = api.call;
  api.call = async (...a) => { const r = await orig(...a); seen.push(r.text); return r; };
  for (const m of ['get', 'post', 'patch', 'put', 'del']) {
    const f = api[m];
    api[m] = async (...a) => { const r = await f(...a); seen.push(r.text); return r; };
  }
  alice = await stack.createUser('alice@example.com');
  bob = await stack.createUser('bob@example.com');
  root = await stack.createUser('root@example.com', { role: 'ADMIN' });
});
after(async () => { await api.close(); await stack.stop(); });

const ADMIN_ROUTES = (id) => [
  ['GET', '/admin/overview'], ['GET', '/admin/users'], ['GET', `/admin/users/${id}`], ['PATCH', `/admin/users/${id}`, { role: 'ADMIN' }],
  ['DELETE', `/admin/users/${id}`, { confirmEmail: 'x@y.z' }],
  ['GET', '/admin/watching'], ['GET', '/admin/history'],
  ['GET', '/admin/audit-logs'], ['GET', '/admin/settings'],
  ['PUT', '/admin/settings', { key: 'branding', value: { name: 'MDFlix', tagline: 'x' } }],
];

describe('akses admin tanpa izin', () => {
  it('tanpa token → 401 di semua rute admin', async () => {
    for (const [m, p, body] of ADMIN_ROUTES(alice.id)) {
      const r = await api.call(m, p, { body });
      assert.equal(r.status, 401, `${m} ${p}`);
    }
  });

  it('user biasa → 403 di semua rute admin, dan percobaan tercatat di audit', async () => {
    for (const [m, p, body] of ADMIN_ROUTES(alice.id)) {
      const r = await api.call(m, p, { token: alice.token, body });
      assert.equal(r.status, 403, `${m} ${p}`);
      assert.equal(r.body.error.code, 'FORBIDDEN');
    }
    const n = await one(`select count(*)::int n from audit_logs where action='ADMIN_ACCESS_DENIED' and actor_id=$1`, [alice.id]);
    assert.ok(n.n >= 1);
  });

  it('memalsukan role lewat header / query / body tidak berpengaruh', async () => {
    const forged = { 'x-role': 'ADMIN', 'x-user-role': 'ADMIN', 'x-admin': 'true' };
    let r = await api.get('/admin/overview', { token: alice.token, headers: forged, query: { role: 'ADMIN', admin: '1' } });
    assert.equal(r.status, 403);
    r = await api.patch(`/admin/users/${alice.id}`, { role: 'ADMIN' }, { token: alice.token, headers: forged });
    assert.equal(r.status, 403);
    assert.equal((await one(`select role from profiles where id=$1`, [alice.id])).role, 'USER');
  });

  it('token palsu / dimodifikasi / kedaluwarsa → 401', async () => {
    const { signJwt } = await import('../stack/stack.mjs');
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      'garbage', 'a.b.c', alice.token.slice(0, -3) + 'abc',
      signJwt({ sub: root.id, role: 'authenticated', aud: 'authenticated', exp: now + 3600 }, 'wrong-secret-wrong-secret-wrong-1234'),
      signJwt({ sub: root.id, role: 'authenticated', aud: 'authenticated', exp: now - 10 }),
    ];
    for (const t of bad) assert.equal((await api.get('/admin/overview', { token: t })).status, 401);
  });

  it('publishable/secret key BUKAN token pengguna: ditolak sebagai sesi', async () => {
    for (const t of [stack.publishableKey, stack.secretKey]) {
      const r = await api.get('/admin/overview', { token: t });
      assert.ok([401, 403].includes(r.status), `status ${r.status}`);
    }
  });

  it('admin sah dapat mengakses; admin yang dinonaktifkan ditolak', async () => {
    assert.equal((await api.get('/admin/overview', { token: root.token })).status, 200);
    await pg().query(`update profiles set is_active=false where id=$1`, [root.id]);
    const r = await api.get('/admin/overview', { token: root.token });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'ACCOUNT_DISABLED');
    await pg().query(`update profiles set is_active=true where id=$1`, [root.id]);
  });
});

describe('manipulasi dari sisi klien (browser dengan publishable key)', () => {
  const rest = (path, { method = 'GET', token, body, headers } = {}) =>
    fetch(`${stack.url}/rest/v1/${path}`, {
      method,
      headers: { apikey: stack.publishableKey, Authorization: `Bearer ${token ?? stack.publishableKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });

  it('user tidak dapat menjadikan dirinya ADMIN lewat Data API', async () => {
    const r = await rest(`profiles?id=eq.${alice.id}`, { method: 'PATCH', token: alice.token, body: { role: 'ADMIN' } });
    assert.ok([401, 403].includes(r.status), `status ${r.status}`);
    assert.equal((await one(`select role from profiles where id=$1`, [alice.id])).role, 'USER');
  });

  it('user tidak dapat membaca audit_logs / app_settings lewat Data API', async () => {
    let r = await rest('audit_logs', { token: alice.token });
    assert.ok([401, 403].includes(r.status));
    r = await rest('app_settings', { token: alice.token });
    assert.ok([401, 403].includes(r.status));
  });

  it('user tidak dapat memanggil fungsi sensitif (watch/admin) lewat Data API', async () => {
    for (const [fn, args] of [
      ['mdflix_watch_start', { p_user: alice.id, p_content_type: 'movie', p_content_id: 'x' }],
      ['mdflix_admin_set_user', { p_actor: alice.id, p_user: alice.id, p_role: 'ADMIN' }],
    ]) {
      const r = await rest(`rpc/${fn}`, { method: 'POST', token: alice.token, body: args });
      assert.ok([401, 403, 404].includes(r.status), `${fn} → ${r.status}`);
    }
    assert.equal((await one(`select role from profiles where id=$1`, [alice.id])).role, 'USER');
  });

  it('field/header dipalsukan (role, plan) tidak berpengaruh — server selalu memvalidasi ulang', async () => {
    let r = await api.post('/watch/start', { contentType: 'movie', contentId: 'dev-m01', plan: 'PRO', membership: 'PRO' }, { token: alice.token });
    assert.equal(r.status, 422);                                        // field tak dikenal ditolak (.strict())
    r = await api.patch('/auth/profile', { displayName: 'A', role: 'ADMIN' }, { token: alice.token });
    assert.equal(r.status, 422);
    r = await api.post('/watch/start', { contentType: 'movie', contentId: 'dev-m06' }, { token: alice.token, headers: { 'x-membership': 'PRO', 'x-plan': 'PRO' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.quota, undefined);                              // tidak ada konsep plan/kuota sama sekali
  });
});

describe('perlindungan heartbeat (API)', () => {
  let session;
  before(async () => {
    const r = await api.post('/watch/start', { contentType: 'movie', contentId: 'dev-m02' }, { token: bob.token });
    assert.equal(r.status, 200);
    session = r.body.sessionId;
  });
  const beat = (body, token = bob.token) => api.post('/watch/heartbeat', body, { token });
  const acc = async (id = session) => Number((await one(`select accumulated_seconds s from watch_sessions where id=$1`, [id])).s);

  it('server tidak menerima jumlah detik dari klien (watchedSeconds=999999 ditolak)', async () => {
    for (const extra of [{ watchedSeconds: 999999 }, { seconds: 99999 }, { credited: 1e9 }, { userId: alice.id }, { timestamp: Date.now() }, { plan: 'PRO' }]) {
      const r = await beat({ sessionId: session, seq: 1, state: 'playing', ...extra });
      assert.equal(r.status, 422, JSON.stringify(extra));
    }
    assert.equal(await acc(), 0);
  });

  it('nilai tidak masuk akal ditolak (posisi/durasi negatif, NaN, raksasa, seq 0, state asing)', async () => {
    for (const b of [
      { sessionId: session, seq: 1, state: 'playing', position: -5 },
      { sessionId: session, seq: 1, state: 'playing', position: 1e12 },
      { sessionId: session, seq: 1, state: 'playing', duration: 1e12 },
      { sessionId: session, seq: 1, state: 'playing', position: 'abc' },
      { sessionId: session, seq: 0, state: 'playing' },
      { sessionId: session, seq: 1.5, state: 'playing' },
      { sessionId: session, seq: 1e12, state: 'playing' },
      { sessionId: session, seq: 1, state: 'god-mode' },
      { sessionId: 'not-a-uuid', seq: 1, state: 'playing' },
    ]) assert.equal((await beat(b)).status, 422, JSON.stringify(b));
  });

  it('heartbeat ganda/replay tidak menambah kredit', async () => {
    assert.equal((await beat({ sessionId: session, seq: 1, state: 'playing', position: 1, duration: 60 })).status, 200);
    const dup = await beat({ sessionId: session, seq: 1, state: 'playing', position: 1, duration: 60 });
    assert.equal(dup.status, 200);
    assert.equal(dup.body.duplicate, true);
    assert.equal(dup.body.credited, 0);
  });

  it('banjir heartbeat: kredit hanya waktu nyata, dan dibatasi laju (429)', async () => {
    const before = await acc();
    let throttled = 0, limited = 0, ok = 0;
    for (let seq = 2; seq < 130; seq++) {
      const r = await beat({ sessionId: session, seq, state: 'playing', position: 2, duration: 60 });
      if (r.status === 429) { limited++; assert.ok(r.headers.get('retry-after')); }
      else if (r.body?.throttled) throttled++;
      else ok++;
    }
    assert.ok(limited > 0, 'harus ada 429');
    assert.ok(throttled > 100 - limited - 10, `throttled=${throttled}`);
    assert.ok((await acc()) - before < 8, 'kredit tidak boleh melebihi waktu nyata yang berlalu');
  });

  it('sesi milik user lain tidak bisa dipakai (IDOR) — heartbeat, stream, end', async () => {
    const r = await api.post('/watch/heartbeat', { sessionId: session, seq: 500, state: 'playing' }, { token: alice.token });
    assert.equal(r.status, 404);
    const s = await api.get('/movies/dev-m02/stream', { token: alice.token, query: { session } });
    assert.equal(s.status, 403);
    const e = await api.post('/watch/end', { sessionId: session, seq: 501, state: 'paused' }, { token: alice.token });
    assert.equal(e.status, 404);
  });

  it('URL stream tidak diberikan tanpa sesi aktif yang cocok', async () => {
    assert.equal((await api.get('/movies/dev-m02/stream', { token: bob.token })).status, 422);
    assert.equal((await api.get('/movies/dev-m02/stream', { token: bob.token, query: { session: '00000000-0000-4000-8000-000000000000' } })).status, 403);
    assert.equal((await api.get('/movies/dev-m03/stream', { token: bob.token, query: { session } })).status, 403);   // konten berbeda
    assert.equal((await api.get('/episodes/dev-m02/stream', { token: bob.token, query: { session } })).status, 403);  // jenis berbeda
    const ok = await api.get('/movies/dev-m02/stream', { token: bob.token, query: { session } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.match(ok.body.playback.source, /^\/dev\/sample\.webm$/);
  });

  it('menonton lama tetap diizinkan tanpa henti (tidak ada kuota/timer)', async () => {
    const u = await stack.createUser('longwatch2@example.com');
    const s = await api.post('/watch/start', { contentType: 'movie', contentId: 'dev-m04' }, { token: u.token });
    let seq = 1, sawStop = false;
    for (let i = 0; i < 40; i++) {
      const r = await beat({ sessionId: s.body.sessionId, seq: seq++, state: 'playing' }, u.token);
      if (r.body?.stop) sawStop = true;
    }
    assert.equal(sawStop, false);
  });
});

describe('IDOR: riwayat & My List', () => {
  let histId;
  before(async () => {
    const s = await api.post('/watch/start', { contentType: 'movie', contentId: 'dev-m05' }, { token: alice.token });
    await api.post('/watch/heartbeat', { sessionId: s.body.sessionId, seq: 1, state: 'playing', position: 1, duration: 100 }, { token: alice.token });
    await api.post('/watch/heartbeat', { sessionId: s.body.sessionId, seq: 2, state: 'paused', position: 30, duration: 100 }, { token: alice.token });
    histId = (await one(`select id from watch_history where user_id=$1 and content_id='dev-m05'`, [alice.id])).id;
    await api.post('/my-list', { contentType: 'movie', contentId: 'dev-m05' }, { token: alice.token });
  });

  it('user lain tidak melihat / menghapus riwayat & list milik Alice', async () => {
    assert.ok(!JSON.stringify((await api.get('/history', { token: bob.token })).body).includes('dev-m05'));
    assert.ok(!JSON.stringify((await api.get('/my-list', { token: bob.token })).body).includes('dev-m05'));
    assert.equal((await api.del(`/history/${histId}`, { token: bob.token })).status, 404);
    await api.del('/my-list/movie/dev-m05', { token: bob.token });
    assert.ok(JSON.stringify((await api.get('/my-list', { token: alice.token })).body).includes('dev-m05'));
    assert.ok(JSON.stringify((await api.get('/history', { token: alice.token })).body).includes('dev-m05'));
  });

  it('tanpa login → 401', async () => {
    for (const p of ['/history', '/history/continue', '/my-list', '/my-list/ids']) {
      assert.equal((await api.get(p)).status, 401, p);
    }
    assert.equal((await api.post('/my-list', { contentType: 'movie', contentId: 'dev-m01' })).status, 401);
    assert.equal((await api.post('/watch/start', { contentType: 'movie', contentId: 'dev-m01' })).status, 401);
  });
});

describe('validasi input, kebocoran, dan header', () => {
  it('parameter tidak valid ditolak dengan format error seragam', async () => {
    const cases = [
      ['GET', '/admin/users/not-a-uuid', root.token], ['DELETE', '/history/xyz', alice.token],
      ['GET', '/movies/dev-m01/stream?session=not-a-uuid', alice.token], ['DELETE', '/my-list/hack/dev-m01', alice.token],
    ];
    for (const [m, p, t] of cases) {
      const r = await api.call(m, p.split('?')[0], { token: t, query: p.includes('?') ? Object.fromEntries(new URLSearchParams(p.split('?')[1])) : undefined, body: m === 'DELETE' && p.includes('users') ? { confirmEmail: 'a@b.c' } : undefined });
      assert.equal(r.status, 422, `${m} ${p} → ${r.status}`);
      assert.ok(r.body.error.code && r.body.error.message && r.body.requestId);
    }
  });

  it('ID konten tidak valid / tidak ada → 404 (tanpa meneruskan ke provider)', async () => {
    for (const id of ['..%2F..%2Fetc%2Fpasswd', 'a b', 'x'.repeat(200), 'nope-123']) {
      assert.equal((await api.get(`/movies/${id}`)).status, 404, id);
    }
    assert.equal((await api.get('/series/dev-m01')).status, 404);          // film bukan series
    assert.equal((await api.get('/movies/dev-s01')).status, 404);          // series bukan film
  });

  it('pencarian: query pendek/panjang aman; karakter filter tidak dapat menyuntik operator', async () => {
    assert.deepEqual((await api.get('/movies/search', { query: { q: 'a' } })).body.items, []);
    assert.equal((await api.get('/movies/search', { query: { q: 'x'.repeat(5000) } })).status, 200);
    const r = await api.get('/admin/users', { token: root.token, query: { q: 'x,is_active.eq.false,role.eq.ADMIN)(' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 0);   // diperlakukan sebagai teks biasa, bukan filter
  });

  it('JSON rusak → 400; body terlalu besar → 413; error tidak memuat stack/path/secret', async () => {
    const bad = await api.call('POST', '/watch/start', { token: alice.token, raw: '{oops', headers: { 'content-type': 'application/json' } });
    assert.equal(bad.status, 400);
    const big = await api.call('POST', '/watch/start', { token: alice.token, raw: JSON.stringify({ contentType: 'movie', contentId: 'x'.repeat(200_000) }), headers: { 'content-type': 'application/json' } });
    assert.equal(big.status, 413);
    for (const r of [bad, big]) assert.doesNotMatch(r.text, /\bat .*\(|node_modules|\/home\/|stack|SUPABASE|password/i);
  });

  it('rute/metode tak dikenal: 404/405 dengan format seragam', async () => {
    assert.equal((await api.get('/nope')).status, 404);
    assert.equal((await api.call('DELETE', '/config/public')).status, 405);
  });

  it('tidak ada CORS terbuka; header cache sesuai: data user no-store, katalog publik boleh di-cache', async () => {
    const me = await api.get('/auth/me', { token: alice.token });
    assert.equal(me.headers.get('access-control-allow-origin'), null);
    assert.equal(me.headers.get('cache-control'), 'no-store');
    assert.equal(me.headers.get('x-content-type-options'), 'nosniff');
    for (const p of ['/history', '/my-list', '/my-list/ids', '/history/continue']) {
      assert.equal((await api.get(p, { token: alice.token })).headers.get('cache-control'), 'no-store', p);
    }
    const home = await api.get('/catalog/home');
    assert.match(home.headers.get('cache-control'), /public/);
    assert.equal((await api.get('/config/public')).headers.get('cache-control').includes('public'), true);
    assert.ok(me.headers.get('x-request-id'));
  });

  it('respons tidak pernah memuat secret key atau JWT secret', async () => {
    const blob = seen.join('\n');
    assert.ok(blob.length > 5000);
    for (const secret of [stack.secretKey, stack.jwtSecret]) {
      assert.ok(!blob.includes(secret), `secret bocor: ${secret.slice(0, 12)}…`);
    }
    const cfg = (await api.get('/config/public')).body;
    assert.equal(cfg.auth.publishableKey, stack.publishableKey);
    assert.ok(!JSON.stringify(cfg).includes(stack.secretKey));
  });

  it('tidak ada lagi rute membership/transaksi/pembayaran/kuota', async () => {
    for (const [m, p] of [
      ['GET', '/membership/me'], ['GET', '/payment/list'], ['GET', '/watch/quota'],
      ['GET', '/admin/memberships'], ['GET', '/admin/transactions'], ['POST', '/payment/create'], ['POST', '/payment/webhook'],
    ]) {
      assert.equal((await api.call(m, p, { token: alice.token, body: {} })).status, 404, `${m} ${p}`);
    }
  });
});
