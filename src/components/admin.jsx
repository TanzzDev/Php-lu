import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { clock, dateShort, dateTime, initials, relative } from '../lib/format.js';
import { Icon } from './Icon.jsx';
import { EmptyState, ErrorState, Field, Logo, Modal, Skeleton, StatusBadge } from './ui.jsx';

const NAV = [
  ['Ringkasan', [['/admin', 'Overview', 'chart', true], ['/admin/users', 'Pengguna', 'users']]],
  ['Aktivitas', [['/admin/watching', 'Sedang menonton', 'eye'], ['/admin/history', 'Riwayat tontonan', 'clock'], ['/admin/audit', 'Audit log', 'log']]],
  ['Sistem', [['/admin/settings', 'Pengaturan', 'gear']]],
];

export function AdminSidebar({ onNavigate }) {
  const { profile } = useAuth();
  return (
    <>
      <div className="admin__brand"><Link to="/" aria-label="MDFlix"><Logo /></Link><span className="badge badge--accent">Admin</span></div>
      <nav className="admin__nav" aria-label="Navigasi admin">
        {NAV.map(([group, items]) => (
          <div key={group}>
            <h2>{group}</h2>
            {items.map(([to, label, icon, end]) => <NavLink key={to} to={to} end={end} onClick={onNavigate}><Icon name={icon} />{label}</NavLink>)}
          </div>
        ))}
      </nav>
      <div className="admin__foot">
        <span style={{ overflowWrap: 'anywhere' }}>{profile?.email}</span>
        <Link to="/" className="link">← Kembali ke MDFlix</Link>
      </div>
    </>
  );
}

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { document.body.classList.add('is-admin'); return () => document.body.classList.remove('is-admin'); }, []);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="admin">
      <aside className="admin__side"><AdminSidebar /></aside>
      <div style={{ minWidth: 0 }}>
        <div className="admin__top">
          <button type="button" className="icon-btn" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <Logo /><span className="badge badge--accent">Admin</span>
        </div>
        {open && <div className="admin__drawer" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}><aside><AdminSidebar onNavigate={() => setOpen(false)} /></aside></div>}
        <main id="main" className="admin__main" tabIndex={-1}><Outlet /></main>
      </div>
    </div>
  );
}

export const AdminStat = ({ label, value, hint, accent }) => (
  <div className={`stat${accent ? ' stat--accent' : ''}`}>
    <span className="stat__label">{label}</span>
    <span className="stat__value">{value}</span>
    {hint && <span className="stat__hint">{hint}</span>}
  </div>
);

/** Tabel di desktop, otomatis berubah menjadi kartu di mobile (lihat .table di ui.css). */
export function DataTable({ columns, rows, loading, error, onRetry, empty, onRow, rowKey = (r) => r.id, caption }) {
  if (error) return <ErrorState text={errorMessage(error)} onRetry={onRetry} />;
  if (loading) return <div className="stack">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} style={{ height: 52 }} />)}</div>;
  if (!rows.length) return <div className="table-wrap"><EmptyState icon="log" title={empty?.title ?? 'Tidak ada data'} text={empty?.text} /></div>;
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={onRow ? 'is-link' : undefined} onClick={onRow ? () => onRow(r) : undefined}
              onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined} tabIndex={onRow ? 0 : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={[c.main ? 'cell-main' : '', c.num ? 'num' : ''].join(' ').trim() || undefined}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className="pager"><span>{total} data</span></p> : null;
  return (
    <div className="pager">
      <span>Halaman {page} dari {pages} · {total} data</span>
      <div className="pager__btns">
        <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevL" /> Sebelumnya</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya <Icon name="chevR" /></button>
      </div>
    </div>
  );
}

export const UserCell = ({ u }) => (
  <div className="user-cell">
    <span className="avatar">{u.avatarUrl ? <img src={u.avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials(u.displayName || u.email)}</span>
    <div><strong>{u.displayName || '—'}</strong><small>{u.email}</small></div>
  </div>
);

export function UserTable({ rows, loading, error, onRetry, onRow }) {
  return (
    <DataTable rows={rows} loading={loading} error={error} onRetry={onRetry} caption="Daftar pengguna" onRow={onRow}
      empty={{ title: 'Tidak ada pengguna', text: 'Ubah filter pencarian.' }}
      columns={[
        { key: 'u', header: 'Pengguna', main: true, cell: (u) => <UserCell u={u} /> },
        { key: 'r', header: 'Role', cell: (u) => (u.role === 'ADMIN' ? <span className="badge badge--info">Admin</span> : 'User') },
        { key: 's', header: 'Status', cell: (u) => (u.isActive ? <span className="badge badge--ok">Aktif</span> : <span className="badge badge--danger">Nonaktif</span>) },
        { key: 'j', header: 'Bergabung', cell: (u) => dateShort(u.createdAt) },
        { key: 'l', header: 'Login terakhir', cell: (u) => relative(u.lastLoginAt) },
      ]} />
  );
}

export function AuditLogTable({ rows, loading, error, onRetry }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <DataTable rows={rows} loading={loading} error={error} onRetry={onRetry} onRow={(a) => setOpen(a)} caption="Audit log"
        empty={{ title: 'Belum ada catatan audit' }}
        columns={[
          { key: 't', header: 'Waktu', cell: (a) => dateTime(a.createdAt) },
          { key: 'a', header: 'Aksi', main: true, cell: (a) => <span className="badge">{a.action}</span> },
          { key: 'w', header: 'Pelaku', cell: (a) => (a.actorEmail ? <>{a.actorEmail}<span className="cell-sub">{a.actorRole}</span></> : <span className="faint">{a.actorRole ?? 'SYSTEM'}</span>) },
          { key: 'g', header: 'Target', cell: (a) => a.targetLabel ?? (a.targetId ? <span className="mono">{String(a.targetId).slice(0, 18)}</span> : '—') },
        ]} />
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.action}>
        {open && (
          <div className="stack">
            <dl className="kv"><dt>Waktu</dt><dd>{dateTime(open.createdAt)}</dd><dt>Pelaku</dt><dd>{open.actorEmail ?? open.actorRole ?? 'SYSTEM'}</dd><dt>Target</dt><dd>{open.targetLabel ?? open.targetId ?? '—'}</dd></dl>
            <pre className="json">{JSON.stringify(open.metadata, null, 2)}</pre>
          </div>
        )}
      </Modal>
    </>
  );
}

export function WatchingNow() {
  const q = useQuery({ queryKey: ['admin', 'watching'], queryFn: () => api('/admin/watching'), refetchInterval: 10_000, staleTime: 0 });
  const rows = q.data?.items ?? [];
  const STATE = { playing: ['Memutar', 'ok'], paused: ['Jeda', 'warn'], buffering: ['Buffering', 'info'] };
  return (
    <>
      <p className="muted" style={{ marginBottom: 14 }} aria-live="polite"><span className="live-dot" />{q.isPending ? 'Memuat…' : `${rows.length} sesi aktif`} · diperbarui otomatis tiap 10 detik</p>
      <DataTable rows={rows} loading={q.isPending} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.sessionId} caption="Sesi sedang menonton"
        empty={{ title: 'Tidak ada yang sedang menonton', text: 'Sesi aktif dengan heartbeat dalam 45 detik terakhir akan tampil di sini.' }}
        columns={[
          { key: 'u', header: 'Pengguna', main: true, cell: (r) => <Link className="link" to={`/admin/users/${r.userId}`}>{r.displayName || r.email}<span className="cell-sub">{r.email}</span></Link> },
          { key: 'c', header: 'Konten', cell: (r) => <>{r.title ?? r.contentId}{r.contentType === 'episode' && <span className="cell-sub">S{r.seasonNumber} E{r.episodeNumber}{r.episodeTitle ? ` · ${r.episodeTitle}` : ''}</span>}</> },
          { key: 'st', header: 'Status', cell: (r) => <StatusBadge status={STATE[r.state]?.[0] ?? r.state} tone={STATE[r.state]?.[1]} /> },
          { key: 'd', header: 'Durasi tonton', num: true, cell: (r) => clock(r.watchedSeconds) },
          { key: 'sa', header: 'Mulai', cell: (r) => dateTime(r.startedAt) },
          { key: 'h', header: 'Heartbeat', cell: (r) => relative(r.lastHeartbeatAt) },
        ]} />
    </>
  );
}

export const Filters = ({ children }) => <div className="filters" role="search">{children}</div>;
export function FilterInput({ label, value, onChange, type = 'search', grow, ...rest }) {
  return (
    <Field label={label}>{(p) => <input {...p} {...rest} className={`input${grow ? ' input--grow' : ''}`} type={type} value={value} onChange={(e) => onChange(e.target.value)} />}</Field>
  );
}
export function FilterSelect({ label, value, onChange, options, ...rest }) {
  return (
    <Field label={label}>{(p) => <select {...p} {...rest} className="select" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}</Field>
  );
}
export const AdminHead = ({ title, sub, children }) => (
  <div className="admin__head"><div><h1 className="admin__title display" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>{title}</h1>{sub && <p className="admin__sub">{sub}</p>}</div>{children}</div>
);
