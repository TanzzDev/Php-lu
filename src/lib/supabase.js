import { createClient } from '@supabase/supabase-js';

const clients = new Map();

/**
 * Klien browser: HANYA publishable key. Secret key tidak pernah ada di frontend.
 * Satu klien per (url, key): dengan detectSessionInUrl, dua klien yang dibuat saat render ulang /
 * React.StrictMode akan sama-sama menukar `?code=` OAuth — yang kedua gagal dan bisa menimbulkan
 * error login palsu di callback Google.
 */
export function createBrowserClient({ supabaseUrl, publishableKey }) {
  if (!supabaseUrl || !publishableKey) return null;
  const key = `${supabaseUrl}|${publishableKey}`;
  if (!clients.has(key)) {
    clients.set(key, createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    }));
  }
  return clients.get(key);
}
