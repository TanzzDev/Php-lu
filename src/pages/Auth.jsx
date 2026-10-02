import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePageTitle } from '../hooks/misc.js';
import { Icon } from '../components/Icon.jsx';
import { Field, Logo, PageLoading, Spinner } from '../components/ui.jsx';

/** Hanya path lokal yang boleh menjadi tujuan setelah login (mencegah open-redirect). */
export const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(n) ? n : '/');

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
);

export function Login() {
  const { status, signInWithPassword, signUp, signInWithGoogle, configured, disabled } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const nav = useNavigate();
  const [mode, setMode] = useState(params.get('mode') === 'daftar' ? 'daftar' : 'masuk');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(disabled ? 'Akun ini dinonaktifkan. Hubungi dukungan MDFlix.' : params.get('error') ? 'Login gagal. Silakan coba lagi.' : null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  usePageTitle(mode === 'masuk' ? 'Masuk' : 'Daftar');

  if (status === 'loading') return <PageLoading />;
  if (status === 'authed') return <Navigate to={next} replace />;

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const fieldErr = {};
  if (mode === 'daftar' && f.password && f.password.length < 8) fieldErr.password = 'Minimal 8 karakter.';

  async function submit(e) {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (fieldErr.password) return;
    setBusy(true);
    if (mode === 'masuk') {
      const { error } = await signInWithPassword(f.email.trim(), f.password);
      if (error) setErr(error); else nav(next, { replace: true });
    } else {
      const { error, needsConfirmation } = await signUp(f.email.trim(), f.password, f.name.trim());
      if (error) setErr(error);
      else if (needsConfirmation) setInfo('Kami telah mengirim email konfirmasi. Buka email tersebut untuk mengaktifkan akun, lalu masuk.');
      else nav(next, { replace: true });
    }
    setBusy(false);
  }

  async function google() {
    setErr(null); setBusy(true);
    const { error } = await signInWithGoogle(next);
    if (error) { setErr(error); setBusy(false); }
  }

  return (
    <div className="auth">
      <aside className="auth__aside">
        <Link to="/" aria-label="MDFlix"><Logo className="logo--lg" /></Link>
        <div>
          <h1 className="auth__pitch display">Tonton apa saja, kapan saja.</h1>
          <ul className="auth__points plain">
            <li className="auth__point"><b>Gratis</b><span>Semua film dan series, tanpa biaya sama sekali</span></li>
            <li className="auth__point"><b>Tanpa batas</b><span>Tidak ada kuota harian atau timer menonton</span></li>
            <li className="auth__point"><b>Tersimpan</b><span>Riwayat dan Daftar Saya ikut ke perangkat mana pun</span></li>
          </ul>
        </div>
        <span className="faint" style={{ fontSize: '0.85rem' }}>Akun terhubung ke Daftar Saya dan riwayat tontonanmu.</span>
      </aside>

      <main className="auth__main" id="main">
        <div className="auth__card">
          <Link to="/" className="auth__logo auth__logo--m" aria-label="MDFlix"><Logo className="logo--lg" /></Link>
          <div>
            <h1 style={{ fontSize: '1.8rem' }}>{mode === 'masuk' ? 'Masuk ke MDFlix' : 'Buat akun MDFlix'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{mode === 'masuk' ? 'Lanjutkan menonton dari mana kamu berhenti.' : 'Gratis dan tanpa batas. Tidak perlu kartu kredit.'}</p>
          </div>

          <div className="tabs" role="tablist" aria-label="Masuk atau daftar">
            <button type="button" role="tab" className="tab" aria-selected={mode === 'masuk'} onClick={() => { setMode('masuk'); setErr(null); setInfo(null); }}>Masuk</button>
            <button type="button" role="tab" className="tab" aria-selected={mode === 'daftar'} onClick={() => { setMode('daftar'); setErr(null); setInfo(null); }}>Daftar</button>
          </div>

          {!configured && <div className="form-error" role="alert">Login belum dikonfigurasi pada server ini. Hubungi dukungan MDFlix.</div>}

          <button type="button" className="btn btn--block google-btn" onClick={google} disabled={busy || !configured}><GoogleMark /> Lanjutkan dengan Google</button>
          <div className="divider">atau dengan email</div>

          <form className="form" onSubmit={submit} noValidate={false}>
            {mode === 'daftar' && (
              <Field label="Nama">{(p) => <input {...p} className="input" value={f.name} onChange={set('name')} autoComplete="name" required maxLength={80} />}</Field>
            )}
            <Field label="Email">{(p) => <input {...p} className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" required inputMode="email" />}</Field>
            <Field label="Password" error={fieldErr.password} hint={mode === 'daftar' ? 'Minimal 8 karakter.' : undefined}>
              {(p) => <input {...p} className="input" type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} required minLength={mode === 'daftar' ? 8 : undefined} />}
            </Field>
            {err && <div className="form-error" role="alert">{err}</div>}
            {info && <div className="form-ok" role="status">{info}</div>}
            <button type="submit" className="btn btn--accent btn--lg btn--block" disabled={busy || !configured}>
              {busy && <Spinner small />} {mode === 'masuk' ? 'Masuk' : 'Buat akun'}
            </button>
          </form>
          <p className="faint" style={{ fontSize: '0.85rem' }}>Lupa password atau kendala login? <Link className="link" to="/help">Hubungi dukungan</Link>.</p>
          <nav className="auth__legal" aria-label="Tautan legal">
            <Link to="/privacy">Kebijakan Privasi</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms">Syarat &amp; Ketentuan</Link>
            <span aria-hidden="true">·</span>
            <Link to="/license">Lisensi</Link>
            <span aria-hidden="true">·</span>
            <Link to="/cookies">Kebijakan Cookie</Link>
          </nav>
        </div>
      </main>
    </div>
  );
}

/** Tujuan redirect OAuth (Google). supabase-js menukar `code` → sesi secara otomatis (PKCE). */
export function AuthCallback() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const next = safeNext(params.get('next'));
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const failed = params.get('error') || hash.get('error');
  const [timedOut, setTimedOut] = useState(false);
  usePageTitle('Masuk');

  useEffect(() => { if (status === 'authed') nav(next, { replace: true }); }, [status, next, nav]);
  useEffect(() => { const t = setTimeout(() => setTimedOut(true), 12_000); return () => clearTimeout(t); }, []);

  if (failed || (timedOut && status !== 'authed')) {
    return (
      <div className="page container">
        <div className="state state--error" role="alert">
          <span className="state__icon"><Icon name="alert" /></span>
          <h1 className="state__title">Login tidak berhasil</h1>
          <p className="state__text">Kami tidak dapat menyelesaikan login. Silakan coba lagi.</p>
          <div className="state__actions"><Link to="/login" className="btn btn--primary">Kembali ke halaman masuk</Link></div>
        </div>
      </div>
    );
  }
  return <PageLoading label="Menyelesaikan login" />;
}
