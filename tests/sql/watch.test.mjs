import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, createUser } from '../stack/db.mjs';

let db, c;
const T0 = Date.parse('2026-09-20T03:00:00Z'); // 10:00 WIB
const at = (sec, base = T0) => new Date(base + sec * 1000).toISOString();
const one = async (sql, p) => (await c.query(sql, p)).rows[0];
const val = async (sql, p) => Object.values((await c.query(sql, p)).rows[0] ?? {})[0];

const start = async (user, contentId, now, extra = {}) => {
  const { rows } = await c.query(
    `select public.mdflix_watch_start(p_user => $1, p_content_type => $2, p_content_id => $3, p_series_id => $4,
       p_season => $5, p_episode => $6, p_title => $7, p_now => $8) as r`,
    [user, extra.type ?? 'movie', contentId, extra.seriesId ?? null, extra.season ?? null, extra.episode ?? null,
     extra.title ?? `Judul ${contentId}`, now]);
  return rows[0].r;
};
const beat = async (user, session, seq, state, now, o = {}) => {
  const { rows } = await c.query(
    `select public.mdflix_watch_beat(p_user => $1, p_session => $2, p_seq => $3, p_state => $4,
       p_position => $5, p_duration => $6, p_final => $7, p_now => $8) as r`,
    [user, session, seq, state, o.position ?? null, o.duration ?? null, o.final ?? false, now]);
  return rows[0].r;
};
/** accumulated_seconds tersimpan PER SESI (bukan per hari/per user) — tidak ada lagi kuota. */
const acc = async (sessionId) => Number(await val(`select accumulated_seconds from watch_sessions where id=$1`, [sessionId]));

/** Memutar: beat 'playing' tiap step detik dari from..to (inklusif). Mengembalikan seq berikutnya & hasil terakhir. */
async function play(user, session, seq, from, to, step = 15, o = {}) {
  let last;
  for (let t = from; t <= to; t += step) last = await beat(user, session, seq++, 'playing', at(t, o.base ?? T0), o);
  return { seq, last };
}

before(async () => { db = await createTestDb('watch'); c = db.client; });
after(async () => { await db.drop(); });

describe('MDFlix gratis: tidak ada kuota atau timer', () => {
  it('menonton lama tetap diizinkan tanpa henti; accumulated_seconds hanya untuk analytics', async () => {
    const u = await createUser(c, 'longwatch@example.com');
    const s = await start(u, 'm1', at(0));
    assert.equal(s.ok, true);
    assert.equal(s.quota, undefined);                                       // tidak ada field kuota sama sekali
    let { seq, last } = await play(u, s.sessionId, 1, 1, 3601);              // 1 jam lebih, jauh melewati bekas batas FREE lama
    assert.equal(last.stop, undefined);
    assert.equal(await acc(s.sessionId), 3600);
  });

  it('browsing / membuka player tanpa Play tidak menambah accumulated_seconds', async () => {
    const u = await createUser(c, 'idle@example.com');
    const s = await start(u, 'm1', at(0));
    let seq = 1;
    for (let t = 15; t <= 300; t += 15) await beat(u, s.sessionId, seq++, 'paused', at(t));
    assert.equal(await acc(s.sessionId), 0);
  });
});

describe('perlindungan heartbeat', () => {
  it('duplicate / replay (seq tidak naik) tidak menambah kredit', async () => {
    const u = await createUser(c, 'replay@example.com');
    const s = await start(u, 'm1', at(0));
    await beat(u, s.sessionId, 1, 'playing', at(1));
    await beat(u, s.sessionId, 2, 'playing', at(16));
    assert.equal(await acc(s.sessionId), 15);
    const dup = await beat(u, s.sessionId, 2, 'playing', at(31));            // seq lama dikirim ulang
    assert.equal(dup.duplicate, true);
    const old = await beat(u, s.sessionId, 1, 'playing', at(46));
    assert.equal(old.duplicate, true);
    assert.equal(await acc(s.sessionId), 15);
    assert.equal((await beat(u, s.sessionId, 3, 'playing', at(31))).credited, 15);  // seq baru tetap jalan
  });

  it('heartbeat terlalu rapat diabaikan (throttle), kredit tidak bisa digandakan', async () => {
    const u = await createUser(c, 'flood@example.com');
    const s = await start(u, 'm1', at(0));
    await beat(u, s.sessionId, 1, 'playing', at(1));
    let seq = 2, throttled = 0;
    for (let i = 0; i < 50; i++) {
      const r = await beat(u, s.sessionId, seq++, 'playing', at(1 + i * 0.01 + 0.01));
      if (r.throttled) throttled++;
    }
    assert.equal(throttled, 50);
    assert.equal(await acc(s.sessionId), 0);
    const r = await beat(u, s.sessionId, seq++, 'playing', at(11));
    assert.equal(r.credited, 10);                                            // hanya waktu nyata yang dihitung
  });

  it('kredit per heartbeat dibatasi (30 dtk) walau jeda 60 dtk; jeda >75 dtk = sesi mati', async () => {
    const u = await createUser(c, 'cap@example.com');
    const s = await start(u, 'm1', at(0));
    await beat(u, s.sessionId, 1, 'playing', at(1));
    const r = await beat(u, s.sessionId, 2, 'playing', at(61));              // jeda 60 dtk
    assert.equal(r.credited, 30);

    const stale = await beat(u, s.sessionId, 3, 'playing', at(61 + 100));    // jeda 100 dtk
    assert.equal(stale.ok, false);
    assert.equal(stale.code, 'SESSION_STALE');
    assert.equal((await one(`select status from watch_sessions where id=$1`, [s.sessionId])).status, 'EXPIRED');
    assert.ok(await acc(s.sessionId) <= 60);                                 // kredit ekor dibatasi (30)
  });

  it('manipulasi jam klien tidak berpengaruh: hanya jam server (p_now) yang dipakai', async () => {
    // Fungsi tidak menerima timestamp/detik dari klien sama sekali; posisi/durasi hanya metadata.
    const u = await createUser(c, 'clock@example.com');
    const s = await start(u, 'm1', at(0));
    await beat(u, s.sessionId, 1, 'playing', at(1), { position: 999999, duration: 10 });
    const r = await beat(u, s.sessionId, 2, 'playing', at(16), { position: 999999, duration: 10 });
    assert.equal(r.credited, 15);
    assert.equal(Number((await one(`select position_seconds from watch_history where user_id=$1`, [u])).position_seconds), 10); // dijepit ke durasi
  });

  it('hanya satu sesi ACTIVE per user; sesi lama di-SUPERSEDE dan ekor "playing" dikreditkan', async () => {
    const u = await createUser(c, 'multi@example.com');
    const a = await start(u, 'mA', at(0));
    await beat(u, a.sessionId, 1, 'playing', at(1));
    const b = await start(u, 'mB', at(11));                                   // tab kedua saat A masih "playing"
    assert.equal(b.ok, true);
    assert.equal(await val(`select count(*)::int from watch_sessions where user_id=$1 and status='ACTIVE'`, [u]), 1);
    assert.equal((await one(`select status from watch_sessions where id=$1`, [a.sessionId])).status, 'SUPERSEDED');
    assert.equal(await acc(a.sessionId), 10);                                 // 10 dtk terakhir A dikreditkan saat ditutup
    assert.equal((await beat(u, a.sessionId, 2, 'playing', at(20))).code, 'SESSION_ENDED');
    // jaring pengaman database: dua ACTIVE mustahil
    await assert.rejects(c.query(
      `insert into watch_sessions (user_id, content_type, content_id) values ($1,'movie','x')`, [u]),
      /unique|duplicate|null value/i);
  });

  it('dua sesi berjalan terpisah: sesi lama tidak lagi dikreditkan setelah di-supersede', async () => {
    const u = await createUser(c, 'double@example.com');
    const a = await start(u, 'mA', at(0));
    await beat(u, a.sessionId, 1, 'playing', at(1));
    const b = await start(u, 'mB', at(1));
    await beat(u, b.sessionId, 1, 'playing', at(2));
    for (let t = 17, seq = 2; t <= 62; t += 15) {
      await beat(u, a.sessionId, 100 + t, 'playing', at(t));                  // A sudah mati → ditolak
      await beat(u, b.sessionId, seq++, 'playing', at(t));
    }
    assert.equal(await acc(b.sessionId), 60);                                 // hanya B: 62 − 2
  });

  it("sesi/heartbeat milik user lain ditolak (IDOR)", async () => {
    const alice = await createUser(c, 'alice@example.com');
    const mallory = await createUser(c, 'mallory@example.com');
    const s = await start(alice, 'm1', at(0));
    const r = await beat(mallory, s.sessionId, 1, 'playing', at(5));
    assert.equal(r.code, 'SESSION_NOT_FOUND');
    assert.equal(await acc(s.sessionId), 0);
  });

  it('state tidak valid ditolak', async () => {
    const u = await createUser(c, 'badstate@example.com');
    const s = await start(u, 'm1', at(0));
    await assert.rejects(beat(u, s.sessionId, 1, 'hacking', at(5)), /invalid state/);
  });
});

describe('penutupan sesi', () => {
  it('menutup player (final) menghentikan sesi', async () => {
    const u = await createUser(c, 'close@example.com');
    const s = await start(u, 'm1', at(0));
    await beat(u, s.sessionId, 1, 'playing', at(1));
    const end = await beat(u, s.sessionId, 2, 'paused', at(11), { final: true, position: 10, duration: 100 });
    assert.equal(end.sessionStatus, 'ENDED');
    assert.equal(await acc(s.sessionId), 10);
    const after = await beat(u, s.sessionId, 3, 'playing', at(30));
    assert.equal(after.ok, false);
    assert.equal(after.code, 'SESSION_ENDED');
  });

  it('video selesai (state ended) menutup sesi: tidak lagi tampil sebagai "sedang menonton"', async () => {
    const u = await createUser(c, 'ended@example.com');
    const s = await start(u, 'm1', at(0));
    await beat(u, s.sessionId, 1, 'playing', at(1), { position: 1, duration: 60 });
    const r = await beat(u, s.sessionId, 2, 'ended', at(61), { position: 60, duration: 60 });
    assert.equal(r.sessionStatus, 'ENDED');
    const row = await one(`select status, end_reason from watch_sessions where id=$1`, [s.sessionId]);
    assert.equal(row.status, 'ENDED');
    assert.equal(row.end_reason, 'video_ended');
    assert.equal((await one(`select completed from watch_history where user_id=$1`, [u])).completed, true);
    assert.equal((await beat(u, s.sessionId, 3, 'playing', at(70))).code, 'SESSION_ENDED');
  });

  it('akun nonaktif tidak bisa memulai sesi', async () => {
    const u = await createUser(c, 'disabled@example.com');
    await c.query(`update profiles set is_active=false where id=$1`, [u]);
    const s = await start(u, 'm1', at(0));
    assert.equal(s.ok, false);
    assert.equal(s.code, 'ACCOUNT_DISABLED');
  });

  it('admin_watching_v hanya menampilkan sesi dengan heartbeat segar', async () => {
    const u = await createUser(c, 'watching@example.com');
    const now = new Date().toISOString();
    const s = await start(u, 'live-1', now);
    assert.equal(await val(`select count(*)::int from admin_watching_v where user_id=$1`, [u]), 1);
    await c.query(`update watch_sessions set last_heartbeat_at = now() - interval '5 minutes' where id=$1`, [s.sessionId]);
    assert.equal(await val(`select count(*)::int from admin_watching_v where user_id=$1`, [u]), 0);
  });
});

describe('riwayat tontonan & lanjutkan menonton', () => {
  it('menyimpan posisi, durasi, persentase; completed saat ≥95% atau ended', async () => {
    const u = await createUser(c, 'hist@example.com');
    const s = await start(u, 'movie-9', at(0), { title: 'Film Sembilan' });
    await beat(u, s.sessionId, 1, 'playing', at(1), { position: 10, duration: 200 });
    let h = await one(`select * from watch_history where user_id=$1 and content_id='movie-9'`, [u]);
    assert.equal(Number(h.position_seconds), 10);
    assert.equal(Number(h.percentage), 5);
    assert.equal(h.completed, false);
    assert.equal(h.title, 'Film Sembilan');

    await beat(u, s.sessionId, 2, 'playing', at(16), { position: 191, duration: 200 });     // 95.5%
    h = await one(`select * from watch_history where user_id=$1 and content_id='movie-9'`, [u]);
    assert.equal(h.completed, true);
    assert.equal(await val(`select count(*)::int from watch_history where user_id=$1`, [u]), 1);   // upsert, bukan duplikat
  });

  it('start mengembalikan posisi terakhir untuk resume; episode menyimpan konteks series', async () => {
    const u = await createUser(c, 'resume@example.com');
    const a = await start(u, 'ep-11', at(0), { type: 'episode', seriesId: 'ser-1', season: 1, episode: 1, title: 'Serial Satu' });
    await beat(u, a.sessionId, 1, 'playing', at(1), { position: 300, duration: 1500 });
    await beat(u, a.sessionId, 2, 'paused', at(6), { position: 305, duration: 1500, final: true });
    const b = await start(u, 'ep-11', at(60), { type: 'episode', seriesId: 'ser-1', season: 1, episode: 1 });
    assert.equal(Number(b.resume.positionSeconds), 305);
    assert.equal(b.resume.completed, false);
    const h = await one(`select * from watch_history where user_id=$1`, [u]);
    assert.equal(h.series_id, 'ser-1');
    assert.equal(h.season_number, 1);
  });
});
