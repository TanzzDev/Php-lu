import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useConfig } from '../hooks/config.jsx';
import { useScrollTop } from '../hooks/misc.js';
import { initials } from '../lib/format.js';
import { Icon } from './Icon.jsx';
import { Logo } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Beranda', icon: 'home', end: true },
  { to: '/search', label: 'Cari', icon: 'search', mobileOnly: true },
  { to: '/my-list', label: 'Daftar Saya', icon: 'bookmark' },
  { to: '/history', label: 'Riwayat', icon: 'clock' },
  { to: '/profile', label: 'Akun', icon: 'user', mobileOnly: true },
];

function Avatar({ profile, large }) {
  return (
    <span className={`avatar${large ? ' avatar--lg' : ''}`} aria-hidden="true">
      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials(profile?.displayName || profile?.email)}
    </span>
  );
}
export { Avatar };

/** Pencarian di header (desktop): ikon yang membuka kolom input. */
export function SearchBar() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length >= 2) { nav(`/search?q=${encodeURIComponent(q.trim())}`); setOpen(false); }
  };
  return (
    <form className={`hsearch header__hide-m${open ? ' is-open' : ''}`} onSubmit={submit} role="search">
      <label className="sr-only" htmlFor="hsearch">Cari film atau series</label>
      <input id="hsearch" ref={ref} className="hsearch__input" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cari judul…" autoComplete="off" tabIndex={open ? 0 : -1}
        onBlur={() => !q && setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <button type={open && q.trim().length >= 2 ? 'submit' : 'button'} className="icon-btn" aria-label="Cari" onClick={() => !open && setOpen(true)}>
        <Icon name="search" />
      </button>
    </form>
  );
}

export function ProfileMenu() {
  const { profile, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    ref.current?.querySelector('a, button.pmenu__item')?.focus();
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const go = (to) => { setOpen(false); nav(to); };
  return (
    <div className="pmenu" ref={ref}>
      <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Menu akun" onClick={() => setOpen((o) => !o)}>
        <Avatar profile={profile} />
      </button>
      {open && (
        <div className="pmenu__panel" role="menu">
          <div className="pmenu__who">
            <span className="pmenu__name">{profile?.displayName || 'Pengguna MDFlix'}</span>
            <span className="pmenu__mail">{profile?.email}</span>
          </div>
          <button type="button" role="menuitem" className="pmenu__item" onClick={() => go('/profile')}><Icon name="user" /> Profil</button>
          <button type="button" role="menuitem" className="pmenu__item" onClick={() => go('/account')}><Icon name="gear" /> Pengaturan akun</button>
          <button type="button" role="menuitem" className="pmenu__item" onClick={() => go('/help')}><Icon name="info" /> Bantuan</button>
          {isAdmin && <button type="button" role="menuitem" className="pmenu__item" onClick={() => go('/admin')}><Icon name="shield" /> Konsol admin</button>}
          <button type="button" role="menuitem" className="pmenu__item" onClick={async () => { setOpen(false); await signOut(); nav('/'); }}><Icon name="logout" /> Keluar</button>
        </div>
      )}
    </div>
  );
}

export function Header({ solid }) {
  const { status } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`header${solid || scrolled ? ' is-solid' : ''}`}>
      <div className="header__inner">
        <Link to="/" aria-label="MDFlix — beranda"><Logo /></Link>
        <nav className="nav" aria-label="Navigasi utama">
          {NAV.filter((n) => !n.mobileOnly).map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
        </nav>
        <span className="header__spacer" />
        <div className="header__actions">
          <SearchBar />
          <Link to="/search" className="icon-btn header-search-m" aria-label="Cari film atau series"><Icon name="search" /></Link>
          {status === 'authed' ? <ProfileMenu /> : status === 'anon' && (
            <Link to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} className="btn btn--primary btn--sm">Masuk</Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  return (
    <nav className="bnav" aria-label="Navigasi bawah">
      {NAV.filter((n) => !n.desktopOnly).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} /><span>{n.label}</span></NavLink>
      ))}
    </nav>
  );
}

export function Footer() {
  const { support, brand, content } = useConfig();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="stack">
            <Logo className="logo--lg" />
            <p style={{ maxWidth: '36ch' }}>{brand.tagline}</p>
          </div>
          <div>
            <h2>Jelajahi</h2>
            <ul className="plain">
              <li><Link to="/search">Cari film &amp; series</Link></li>
              <li><Link to="/my-list">Daftar Saya</Link></li>
              <li><Link to="/history">Riwayat tontonan</Link></li>
              <li><Link to="/help">Bantuan &amp; dukungan</Link></li>
              <li><Link to="/account">Pengaturan akun</Link></li>
            </ul>
          </div>
          <div>
            <h2>Butuh bantuan?</h2>
            <ul className="plain">
              <li><a href={`mailto:${support.email}`}><Icon name="mail" style={{ verticalAlign: '-4px', marginRight: 8 }} />{support.email}</a></li>
              <li><a href={`tel:${support.phone.replace(/[^+\d]/g, '')}`}><Icon name="phone" style={{ verticalAlign: '-4px', marginRight: 8 }} />{support.phone}</a></li>
              <li className="faint">MDFlix gratis untuk semua pengguna yang sudah masuk.</li>
            </ul>
          </div>
        </div>
        <div className="footer__legal">
          <span>© {new Date().getFullYear()} {brand.name}. Seluruh hak dilindungi.</span>
          <nav className="footer__legalnav" aria-label="Tautan legal">
            <Link to="/privacy">Kebijakan Privasi</Link>
            <Link to="/terms">Syarat &amp; Ketentuan</Link>
            <Link to="/license">Lisensi</Link>
            <Link to="/cookies">Kebijakan Cookie</Link>
          </nav>
          {content.developmentData && <span>Katalog yang tampil adalah data pengembangan (fiktif), bukan konten berlisensi.</span>}
        </div>
      </div>
    </footer>
  );
}

export function AppLayout() {
  const { content } = useConfig();
  const loc = useLocation();
  useScrollTop();
  const heroPage = loc.pathname === '/' || /^\/(movie|series)\//.test(loc.pathname);
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Lewati ke konten</a>
      <Header solid={!heroPage} />
      <main id="main" className="main" tabIndex={-1}><Outlet /></main>
      <Footer />
      <MobileBottomNav />
      {content.developmentData && <span className="devbadge" role="note">Data pengembangan</span>}
    </div>
  );
}
