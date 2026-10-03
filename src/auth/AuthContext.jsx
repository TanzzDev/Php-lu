import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setCurrentToken, setTokenGetter, ApiError } from '../lib/api.js';
import { createBrowserClient } from '../lib/supabase.js';
import { useConfig } from '../hooks/config.jsx';
import { rememberNext } from '../lib/authNext.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const GENERIC_LOGIN_ERROR = 'Email atau password salah.';

/** Terjemahkan error Supabase Auth menjadi pesan yang ramah dan tidak membocorkan detail. */
function authMessage(error) {
  const code = error?.code ?? '';
  const msg = String(error?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return GENERIC_LOGIN_ERROR;
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Email belum dikonfirmasi. Periksa kotak masuk Anda.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (code === 'weak_password' || msg.includes('password')) return 'Password terlalu lemah. Gunakan minimal 8 karakter.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error?.status === 429) return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
  if (code === 'user_banned') return 'Akun ini dinonaktifkan. Hubungi dukungan MDFlix.';
  if (error?.status === 0 || msg.includes('fetch')) return 'Tidak dapat terhubung. Periksa koneksi internet Anda.';
  return 'Tidak dapat masuk saat ini. Coba lagi.';
}

export function AuthProvider({ children }) {
  const { auth: authCfg } = useConfig();
  const qc = useQueryClient();
  const supabase = useMemo(
    () => createBrowserClient({ supabaseUrl: authCfg.supabaseUrl, publishableKey: authCfg.publishableKey }),
    [authCfg.supabaseUrl, authCfg.publishableKey],
  );
  const [session, setSession] = useState(undefined); // undefined = sedang memuat
  const [disabled, setDisabled] = useState(false);
  const synced = useRef(null);

  useEffect(() => {
    if (!supabase) { setSession(null); return undefined; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null);
      if (event === 'SIGNED_OUT') { synced.current = null; qc.clear(); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [supabase, qc]);

  useEffect(() => {
    setTokenGetter(async () => (supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null));
    setCurrentToken(session?.access_token ?? null);
  }, [supabase, session]);

  const userId = session?.user?.id ?? null;
  const me = useQuery({
    queryKey: ['me', userId],
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      // Sinkronisasi profil sekali per sesi; setelahnya cukup membaca.
      if (synced.current !== userId) {
        const r = await api('/auth/sync', { method: 'POST', body: {}, token: session.access_token });
        synced.current = userId;
        return r;
      }
      return api('/auth/me');
    },
  });

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.code === 'ACCOUNT_DISABLED') {
      setDisabled(true);
      supabase?.auth.signOut();
    }
  }, [me.error, supabase]);

  const signInWithPassword = useCallback(async (email, password) => {
    if (!supabase) return { error: 'Login belum dikonfigurasi. Hubungi dukungan MDFlix.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? authMessage(error) : null };
  }, [supabase]);

  const signUp = useCallback(async (email, password, name) => {
    if (!supabase) return { error: 'Pendaftaran belum dikonfigurasi. Hubungi dukungan MDFlix.' };
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback` } });
    if (error) return { error: authMessage(error) };
    return { error: null, needsConfirmation: !data.session };
  }, [supabase]);

  const signInWithGoogle = useCallback(async (next = '/') => {
    if (!supabase) return { error: 'Login Google belum dikonfigurasi. Hubungi dukungan MDFlix.' };
    // redirectTo polos: satu entri "…/auth/callback" di Redirect URLs Supabase sudah cukup.
    rememberNext(next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error ? authMessage(error) : null };
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setSession(null);
    qc.clear();
  }, [supabase, qc]);

  const value = useMemo(() => ({
    supabase,
    configured: Boolean(supabase),
    status: session === undefined ? 'loading' : session ? 'authed' : 'anon',
    session,
    profile: me.data?.user ?? null,
    isAdmin: me.data?.user?.role === 'ADMIN',
    profileLoading: Boolean(userId) && me.isPending,
    disabled,
    refreshMe: () => qc.invalidateQueries({ queryKey: ['me'] }),
    signInWithPassword, signUp, signInWithGoogle, signOut,
  }), [supabase, session, me.data, me.isPending, userId, disabled, qc, signInWithPassword, signUp, signInWithGoogle, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
