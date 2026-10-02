// Helper database uji: membuat database baru per berkas test, menerapkan shim
// Supabase + semua migration, lalu menghapusnya setelah selesai.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

export const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL || 'postgres://mdflix:mdflix@127.0.0.1:5432/postgres';

export function dbUrl(name) {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

export function migrationFiles() {
  const dir = join(root, 'supabase', 'migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => join(dir, f));
}

export async function createTestDb(label) {
  const name = `mdflix_t_${label}_${process.pid}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const client = new pg.Client({ connectionString: dbUrl(name) });
  await client.connect();
  await client.query(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));
  for (const f of migrationFiles()) await client.query(readFileSync(f, 'utf8'));

  return {
    name,
    url: dbUrl(name),
    client,
    async applyMigrationsAgain() {
      for (const f of migrationFiles()) await client.query(readFileSync(f, 'utf8'));
    },
    async drop() {
      await client.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Jalankan fn dalam transaksi sebagai role tertentu (mis. authenticated) dengan JWT claims. */
export async function asRole(client, role, claims, fn) {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role, ...claims }),
    ]);
    return await fn(client);
  } finally {
    await client.query('rollback');
  }
}

export async function createUser(client, email, meta = {}) {
  const { rows } = await client.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify(meta)],
  );
  return rows[0].id;
}
