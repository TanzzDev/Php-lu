import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

const AUTH_OPTS = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Klien service-role — melewati RLS. HANYA dipakai di server; tidak pernah dikirim ke browser. */
export function createAdminClient(env) {
  const { url, secretKey } = env.supabase;
  if (!url || !secretKey) return null;
  return createClient(url, secretKey, { auth: AUTH_OPTS, global: { headers: { 'X-Client-Info': 'mdflix-server' } } });
}

/** Klien atas nama user (publishable key + JWT user) — RLS berlaku. Dipakai untuk membaca data milik sendiri. */
export function createUserClient(env, token) {
  const { url, publishableKey } = env.supabase;
  if (!url || !publishableKey) throw new ApiError(503, 'NOT_CONFIGURED', 'Layanan belum dikonfigurasi.');
  return createClient(url, publishableKey, {
    auth: AUTH_OPTS,
    global: { headers: { Authorization: `Bearer ${token}`, 'X-Client-Info': 'mdflix-server-user' } },
  });
}
