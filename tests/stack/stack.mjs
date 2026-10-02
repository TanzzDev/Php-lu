// Emulasi lokal Supabase untuk pengujian: Postgres sungguhan + PostgREST sungguhan
// + gateway tipis yang meniru pemetaan API-key → role dan endpoint /auth/v1 yang dipakai
// supabase-js (signup, password login, refresh, user, admin delete/update).
// Google OAuth TIDAK dapat diuji secara lokal (butuh Google + proyek Supabase nyata).
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createTestDb } from './db.mjs';

const PGRST_BIN = process.env.POSTGREST_BIN || '/opt/postgrest/postgrest';
export const JWT_SECRET = 'test-jwt-secret-test-jwt-secret-1234567890';
export const PUBLISHABLE_KEY = 'sb_publishable_test_0123456789abcdef';
export const SECRET_KEY = 'sb_secret_test_0123456789abcdef0123456789';

const b64u = (b) => Buffer.from(b).toString('base64url');
export function signJwt(claims, secret = JWT_SECRET) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(claims));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verifyJwt(token, secret = JWT_SECRET) {
  const [h, b, s] = String(token).split('.');
  if (!h || !b || !s) return null;
  const expect = createHmac('sha256', secret).update(`${h}.${b}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}

const freePort = () => new Promise((resolve, reject) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

const hashPw = (pw) => { const salt = randomBytes(8).toString('hex'); return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`; };
const checkPw = (pw, stored) => {
  const [salt, hash] = String(stored ?? '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function startStack(label = 'stack') {
  const db = await createTestDb(label);
  const pgrstPort = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'pgrst-'));
  const conf = join(dir, 'postgrest.conf');
  const u = new URL(db.url);
  writeFileSync(conf, [
    `db-uri = "postgres://authenticator:authenticator@${u.hostname}:${u.port || 5432}${u.pathname}"`,
    'db-schemas = "public"', 'db-anon-role = "anon"', `jwt-secret = "${JWT_SECRET}"`,
    'server-host = "127.0.0.1"', `server-port = ${pgrstPort}`, 'db-pool = 8', 'log-level = "error"',
  ].join('\n'));
  const child = spawn(PGRST_BIN, [conf], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 60; i++) {
    try { await fetch(`http://127.0.0.1:${pgrstPort}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); }
    if (i === 59) throw new Error('PostgREST tidak mau start');
  }

  const refreshTokens = new Map();
  const pg = db.client;

  const userJson = (row) => ({
    id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email,
    email_confirmed_at: row.email_confirmed_at, phone: '', confirmed_at: row.email_confirmed_at,
    app_metadata: { provider: 'email', providers: ['email'], ...(row.raw_app_meta_data ?? {}) },
    user_metadata: row.raw_user_meta_data ?? {}, identities: [], created_at: row.created_at, updated_at: row.created_at,
    is_anonymous: false,
  });
  const accessFor = (row) => signJwt({
    iss: 'http://mdflix-test/auth/v1', aud: 'authenticated', role: 'authenticated', sub: row.id, email: row.email,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, session_id: randomUUID(),
    app_metadata: row.raw_app_meta_data ?? {}, user_metadata: row.raw_user_meta_data ?? {},
  });
  const session = (row) => {
    const refresh = randomBytes(12).toString('hex');
    refreshTokens.set(refresh, row.id);
    return { access_token: accessFor(row), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user: userJson(row) };
  };
  const getUser = async (id) => (await pg.query('select * from auth.users where id = $1', [id])).rows[0];
  const readBody = async (req) => { const c = []; for await (const x of req) c.push(x); const t = Buffer.concat(c).toString('utf8'); return t ? JSON.parse(t) : {}; };
  const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  const cors = (res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', '*'); };

  const server = http.createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const url = new URL(req.url, 'http://x');
    try {
      const apikey = req.headers.apikey;
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];

      if (url.pathname.startsWith('/rest/v1')) {
        if (![PUBLISHABLE_KEY, SECRET_KEY].includes(apikey)) return json(res, 401, { message: 'Invalid API key' });
        let jwt;
        if (!bearer || bearer === PUBLISHABLE_KEY) jwt = signJwt({ role: 'anon' });
        else if (bearer === SECRET_KEY) jwt = signJwt({ role: 'service_role' });
        else if (verifyJwt(bearer)) jwt = bearer;
        else return json(res, 401, { message: 'Invalid JWT' });
        const headers = { ...req.headers, authorization: `Bearer ${jwt}`, host: `127.0.0.1:${pgrstPort}` };
        delete headers.apikey;
        const up = http.request({ host: '127.0.0.1', port: pgrstPort, method: req.method, path: url.pathname.replace('/rest/v1', '') + url.search, headers }, (r) => {
          res.writeHead(r.statusCode, r.headers); r.pipe(res);
        });
        up.on('error', () => json(res, 502, { message: 'postgrest down' }));
        return req.pipe(up);
      }

      if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
        const claims = bearer && verifyJwt(bearer);
        if (!claims?.sub) return json(res, 401, { code: 401, msg: 'invalid JWT' });
        const row = await getUser(claims.sub);
        if (!row) return json(res, 403, { code: 403, msg: 'User from sub claim in JWT does not exist' });
        return json(res, 200, userJson(row));
      }

      if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.email || String(b.password ?? '').length < 8) return json(res, 422, { code: 422, msg: 'Signup requires a valid password (min 8)' });
        const exists = await pg.query('select 1 from auth.users where email = $1', [String(b.email).toLowerCase()]);
        if (exists.rowCount) return json(res, 422, { code: 422, msg: 'User already registered' });
        const { rows } = await pg.query(
          'insert into auth.users (email, encrypted_password, raw_user_meta_data, last_sign_in_at) values ($1,$2,$3, now()) returning *',
          [String(b.email).toLowerCase(), hashPw(b.password), JSON.stringify(b.data ?? {})]);
        return json(res, 200, session(rows[0]));
      }

      if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
        const b = await readBody(req);
        const grant = url.searchParams.get('grant_type');
        if (grant === 'password') {
          const row = (await pg.query('select * from auth.users where email = $1', [String(b.email ?? '').toLowerCase()])).rows[0];
          if (!row || !checkPw(b.password ?? '', row.encrypted_password)) return json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          if (row.banned_until && new Date(row.banned_until) > new Date()) return json(res, 400, { code: 400, error_code: 'user_banned', msg: 'User is banned' });
          await pg.query('update auth.users set last_sign_in_at = now() where id = $1', [row.id]);
          return json(res, 200, session(row));
        }
        if (grant === 'refresh_token') {
          const id = refreshTokens.get(b.refresh_token);
          const row = id && (await getUser(id));
          if (!row) return json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
          refreshTokens.delete(b.refresh_token);
          return json(res, 200, session(row));
        }
        return json(res, 400, { code: 400, msg: 'unsupported grant' });
      }

      if (url.pathname === '/auth/v1/logout') { res.statusCode = 204; return res.end(); }

      if (url.pathname === '/auth/v1/authorize') { // Google OAuth: hanya diarahkan (tidak ada Google di lokal)
        res.statusCode = 302; res.setHeader('Location', `${url.searchParams.get('redirect_to') ?? '/'}#error=oauth_not_available_locally`);
        return res.end();
      }

      const adm = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (adm) {
        if (apikey !== SECRET_KEY || bearer !== SECRET_KEY) return json(res, 403, { code: 403, msg: 'not admin' });
        if (req.method === 'DELETE') { await pg.query('delete from auth.users where id = $1', [adm[1]]); return json(res, 200, {}); }
        if (req.method === 'PUT') {
          const b = await readBody(req);
          if (b.ban_duration) await pg.query(`update auth.users set banned_until = $2 where id = $1`, [adm[1], b.ban_duration === 'none' ? null : new Date(Date.now() + 10 * 365 * 86400_000)]);
          return json(res, 200, userJson(await getUser(adm[1])));
        }
      }
      json(res, 404, { msg: 'not found' });
    } catch (err) {
      json(res, 500, { msg: String(err?.message ?? err) });
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    db, url, publishableKey: PUBLISHABLE_KEY, secretKey: SECRET_KEY, jwtSecret: JWT_SECRET,
    /** Buat user + kembalikan access token (seperti hasil login). */
    async createUser(email, { password = 'password-12345', meta = {}, role } = {}) {
      const { rows } = await pg.query(
        'insert into auth.users (email, encrypted_password, raw_user_meta_data, last_sign_in_at) values ($1,$2,$3, now()) returning *',
        [email.toLowerCase(), hashPw(password), JSON.stringify(meta)]);
      const row = rows[0];
      if (role) await pg.query('update profiles set role = $2 where id = $1', [row.id, role]);
      return { id: row.id, email, password, token: accessFor(row) };
    },
    tokenFor: async (id) => accessFor(await getUser(id)),
    async stop() {
      server.close(); server.closeAllConnections?.();
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 150));
      await db.drop();
    },
  };
}
