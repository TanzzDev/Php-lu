import { createClient } from '@supabase/supabase-js';

/** Klien browser: HANYA publishable key. Secret key tidak pernah ada di frontend. */
export function createBrowserClient({ supabaseUrl, publishableKey }) {
  if (!supabaseUrl || !publishableKey) return null;
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
}
