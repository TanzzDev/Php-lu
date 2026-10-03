import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, createUser, asRole } from '../stack/db.mjs';

let db, c, alice, bob, admin;
const DENIED = /permission denied|violates row-level security|protected column/i;

const asUser = (id, fn) => asRole(c, 'authenticated', { sub: id }, fn);
const asAnon = (fn) => asRole(c, 'anon', {}, fn);
const rows = async (sql, p) => (await c.query(sql, p)).rows;

before(async () => {
  db = await createTestDb('security'); c = db.client;
  alice = await createUser(c, 'alice@example.com');
  bob = await createUser(c, 'bob@example.com');
  admin = await createUser(c, 'admin@example.com');
  await c.query(`update profiles set role='ADMIN' where id=$1`, [admin]);
  for (const u of [alice, bob]) {
    await c.query(`insert into watch_history (user_id, content_type, content_id, title) values ($1,'movie','m1','T')`, [u]);
    await c.query(`insert into my_list (user_id, content_type, content_id, title) values ($1,'movie','m1','T')`, [u]);
  }
});
after(async () => { await db.drop(); });

describe('anon (tanpa login)', () => {
  for (const t of ['profiles', 'watch_sessions', 'watch_history', 'my_list', 'audit_logs', 'app_settings']) {
    it(`tidak bisa membaca ${t}`, async () => {
      await assert.rejects(asAnon((cl) => cl.query(`select * from public.${t}`)), DENIED);
    });
  }
  it('tidak bisa menulis apa pun', async () => {
    await assert.rejects(asAnon((cl) => cl.query(`insert into my_list (user_id, content_type, content_id, title) values ($1,'movie','x','x')`, [alice])), DENIED);
  });
  it('tidak bisa memanggil fungsi MDFlix', async () => {
    await assert.rejects(asAnon((cl) => cl.query(`select public.mdflix_watch_start($1,'movie','x')`, [alice])), DENIED);
  });
});

describe('authenticated: isolasi data antar user (RLS)', () => {
  it('hanya melihat profil sendiri', async () => {
    const r = await asUser(alice, (cl) => cl.query(`select id from profiles`));
    assert.deepEqual(r.rows.map((x) => x.id), [alice]);
  });

  it('tidak bisa membaca riwayat / list milik user lain (IDOR)', async () => {
    for (const t of ['watch_history', 'my_list']) {
      const own = await asUser(alice, (cl) => cl.query(`select user_id from public.${t}`));
      assert.ok(own.rows.every((x) => x.user_id === alice), `${t} bocor`);
    }
    const h = await asUser(alice, (cl) => cl.query(`select * from watch_history where user_id = $1`, [bob]));
    assert.equal(h.rowCount, 0);
  });

  it('tidak bisa menghapus riwayat / list milik orang lain (0 baris terpengaruh)', async () => {
    const h = await asUser(alice, (cl) => cl.query(`delete from watch_history where user_id = $1`, [bob]));
    const l = await asUser(alice, (cl) => cl.query(`delete from my_list where user_id = $1`, [bob]));
    assert.equal(h.rowCount, 0);
    assert.equal(l.rowCount, 0);
    assert.equal((await rows(`select 1 from watch_history where user_id=$1`, [bob])).length, 1);
  });

  it('My List: boleh insert untuk diri sendiri, ditolak untuk user lain', async () => {
    await asUser(alice, (cl) => cl.query(`insert into my_list (user_id, content_type, content_id, title) values ($1,'series','s1','S')`, [alice]));
    await assert.rejects(
      asUser(alice, (cl) => cl.query(`insert into my_list (user_id, content_type, content_id, title) values ($1,'series','s2','S')`, [bob])),
      DENIED);
  });

  it('tidak bisa menyisipkan riwayat, sesi, audit, settings secara langsung', async () => {
    const attempts = [
      `insert into watch_history (user_id, content_type, content_id) values ('${alice}','movie','h')`,
      `insert into watch_sessions (user_id, content_type, content_id) values ('${alice}','movie','h')`,
      `insert into audit_logs (action) values ('FAKE_ACTION')`,
      `insert into app_settings (key, value) values ('branding','{}')`,
    ];
    for (const sql of attempts) await assert.rejects(asUser(alice, (cl) => cl.query(sql)), DENIED, sql);
  });

  it('tidak bisa menjadikan diri sendiri ADMIN, menaikkan role, atau mengubah email/is_active', async () => {
    for (const sql of [
      `update profiles set role='ADMIN' where id='${alice}'`,
      `update profiles set is_active=true where id='${alice}'`,
      `update profiles set email='admin@example.com' where id='${alice}'`,
      `update profiles set id='${admin}' where id='${alice}'`,
    ]) await assert.rejects(asUser(alice, (cl) => cl.query(sql)), DENIED, sql);
    assert.equal((await rows(`select role from profiles where id=$1`, [alice]))[0].role, 'USER');
  });

  it('boleh mengubah nama tampilan & avatar sendiri, tapi tidak milik orang lain', async () => {
    const own = await asUser(alice, (cl) => cl.query(`update profiles set display_name='Alice Baru' where id=$1 returning display_name`, [alice]));
    assert.equal(own.rows[0].display_name, 'Alice Baru');
    const other = await asUser(alice, (cl) => cl.query(`update profiles set display_name='Diretas' where id=$1`, [bob]));
    assert.equal(other.rowCount, 0);
    await assert.rejects(asUser(alice, (cl) => cl.query(`update profiles set avatar_url='javascript:alert(1)' where id=$1`, [alice])), /check|violates/i);
  });

  it('audit_logs, app_settings tertutup total; view admin tertutup', async () => {
    for (const t of ['audit_logs', 'app_settings', 'admin_users_v', 'admin_watching_v']) {
      await assert.rejects(asUser(admin, (cl) => cl.query(`select * from public.${t}`)), DENIED, `${t} (bahkan untuk ADMIN via klien)`);
    }
  });
});

describe('authenticated tidak bisa memanggil fungsi sensitif (RPC lewat Data API)', () => {
  const calls = [
    (u) => [`select public.mdflix_watch_start($1,'movie','x')`, [u]],
    (u) => [`select public.mdflix_watch_beat($1, gen_random_uuid(), 1, 'playing')`, [u]],
    (u) => [`select public.mdflix_admin_set_user($1, $1, 'ADMIN')`, [u]],
    (u) => [`select public.mdflix_admin_set_setting($1, 'branding', '{}'::jsonb)`, [u]],
    (u) => [`select public.mdflix_admin_overview()`, []],
    (u) => [`select public.mdflix_setting('branding')`, []],
    (u) => [`select public._mdflix_audit($1,'FAKE_ACTION',null,null,null,null,null)`, [u]],
    (u) => [`select public._mdflix_credit_seconds($1, 99999, now())`, [u]],
  ];
  calls.forEach((mk, i) => {
    it(`fungsi #${i + 1} ditolak untuk role authenticated`, async () => {
      const [sql, params] = mk(alice);
      await assert.rejects(asUser(alice, (cl) => cl.query(sql, params)), /permission denied for function/i);
    });
  });

  it('ADMIN di database pun tidak mendapat hak istimewa lewat klien (hanya server/service_role)', async () => {
    await assert.rejects(
      asUser(admin, (cl) => cl.query(`select public.mdflix_admin_set_user($1, $1, 'ADMIN')`, [admin])),
      /permission denied for function/i);
  });
});

describe('service_role (server) berfungsi penuh', () => {
  it('bisa memanggil fungsi dan membaca semua tabel', async () => {
    const r = await asRole(c, 'service_role', {}, async (cl) => {
      const overview = (await cl.query(`select public.mdflix_admin_overview() as o`)).rows[0].o;
      const n = (await cl.query(`select count(*)::int n from profiles`)).rows[0].n;
      const v = (await cl.query(`select count(*)::int n from admin_users_v`)).rows[0].n;
      const s = (await cl.query(`select count(*)::int n from app_settings`)).rows[0].n;
      return { overview, n, v, s };
    });
    assert.ok(r.overview.totalUsers >= 3);
    assert.ok(r.n >= 3 && r.v >= 3 && r.s === 2);                              // hanya 'support' & 'branding' — 100% gratis
  });
});

describe('tidak ada rahasia di database', () => {
  it('kolom/tabel MDFlix tidak menyimpan secret; app_settings hanya berisi konfigurasi non-rahasia', async () => {
    const cols = await rows(
      `select table_name, column_name from information_schema.columns
        where table_schema='public' and column_name ~* '(secret|token|password|api_?key|private)'`);
    assert.deepEqual(cols, []);
    const settings = JSON.stringify(await rows(`select * from app_settings`));
    assert.doesNotMatch(settings, /secret|token|apikey|password/i);
  });

  it('tabel membership/transaksi/kuota sudah tidak ada — MDFlix 100% gratis', async () => {
    const t = await rows(
      `select table_name from information_schema.tables
        where table_schema='public' and table_name in ('memberships','transactions','watch_usage_daily')`);
    assert.deepEqual(t, []);
  });
});
