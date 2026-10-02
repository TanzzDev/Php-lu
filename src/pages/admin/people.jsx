import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api.js';
import { useToast } from '../../hooks/toast.jsx';
import { usePageTitle } from '../../hooks/misc.js';
import { clock, dateLong, dateTime, relative } from '../../lib/format.js';
import { Icon } from '../../components/Icon.jsx';
import { AdminHead, AdminStat, AuditLogTable, DataTable, FilterInput, FilterSelect, Filters, Pager, UserTable } from '../../components/admin.jsx';
import { ErrorState, Field, Modal, Skeleton, Spinner, WatchProgress } from '../../components/ui.jsx';

export function Overview() {
  usePageTitle('Admin · Overview', { noindex: true });
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api('/admin/overview') });
  const s = q.data?.stats;
  return (
    <>
      <AdminHead title="Overview" sub="MDFlix 100% gratis — ringkasan akun dan aktivitas tontonan, tanpa data transaksi." />
      {q.isError ? <ErrorState text={errorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <>
          <div className="stats" style={{ marginBottom: 24 }}>
            <AdminStat label="Total pengguna" value={s ? s.totalUsers : '—'} />
            <AdminStat label="Pengguna aktif" value={s ? s.activeUsers : '—'} />
            <AdminStat label="Admin" value={s ? s.admins : '—'} />
            <AdminStat label="Baru hari ini" value={s ? s.newUsersToday : '—'} />
            <AdminStat label="Sedang menonton" value={s ? s.currentlyWatching : '—'} accent />
            <AdminStat label="Judul pernah ditonton" value={s ? s.totalWatchedTitles : '—'} />
          </div>
          <section className="panel" aria-labelledby="act-h">
            <h2 id="act-h" className="panel__title">Aktivitas terbaru</h2>
            <AuditLogTable rows={q.data?.recentAudit ?? []} loading={q.isPending} error={null} onRetry={() => q.refetch()} />
          </section>
        </>
      )}
    </>
  );
}

export function Users() {
  usePageTitle('Admin · Pengguna', { noindex: true });
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', role: '', status: '', page: 1 });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v, page: k === 'page' ? v : 1 }));
  const q = useQuery({
    queryKey: ['admin', 'users', f],
    queryFn: () => api('/admin/users', { query: { ...f, pageSize: 20 } }),
  });
  return (
    <>
      <AdminHead title="Pengguna" sub="Cari dan kelola akun terdaftar." />
      <Filters>
        <FilterInput grow label="Cari" placeholder="Nama atau email" value={f.q} onChange={set('q')} />
        <FilterSelect label="Role" value={f.role} onChange={set('role')} options={[['', 'Semua role'], ['USER', 'User'], ['ADMIN', 'Admin']]} />
        <FilterSelect label="Status" value={f.status} onChange={set('status')} options={[['', 'Semua status'], ['active', 'Aktif'], ['inactive', 'Nonaktif']]} />
      </Filters>
      <UserTable rows={q.data?.items ?? []} loading={q.isPending} error={q.error} onRetry={() => q.refetch()} onRow={(u) => nav(`/admin/users/${u.id}`)} />
      {q.data && <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={set('page')} />}
    </>
  );
}

export function UserDetail() {
  usePageTitle('Admin · Detail pengguna', { noindex: true });
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');

  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api(`/admin/users/${id}`) });

  const patch = useMutation({
    mutationFn: (body) => api(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { toast('Perubahan disimpan', { type: 'ok' }); q.refetch(); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); },
    onError: (e) => toast(errorMessage(e), { type: 'error' }),
  });
  const del = useMutation({
    mutationFn: () => api(`/admin/users/${id}`, { method: 'DELETE', body: { confirmEmail } }),
    onSuccess: () => { toast('Akun dihapus', { type: 'ok' }); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); nav('/admin/users'); },
    onError: (e) => toast(errorMessage(e), { type: 'error' }),
  });

  if (q.isPending) return <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 120 }} />)}</div>;
  if (q.isError) return <ErrorState title="Pengguna tidak ditemukan" text={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { user: u, history, audit } = q.data;
  const closeModal = () => { setConfirmDelete(false); setConfirmEmail(''); };

  return (
    <>
      <p style={{ marginBottom: 12 }}><button type="button" className="link" onClick={() => nav('/admin/users')}>← Semua pengguna</button></p>
      <AdminHead title={u.displayName || u.email} sub={u.email}>
        <span className="badge">{u.role === 'ADMIN' ? 'Admin' : 'User'}</span>
        <span className={`badge badge--${u.isActive ? 'ok' : 'danger'}`}>{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
      </AdminHead>

      <div className="admin-grid admin-grid--2">
        <section className="panel" aria-labelledby="info-h">
          <h2 id="info-h" className="panel__title">Info akun</h2>
          <dl className="kv">
            <dt>Bergabung</dt><dd>{dateLong(u.createdAt)}</dd>
            <dt>Login terakhir</dt><dd>{u.lastLoginAt ? dateTime(u.lastLoginAt) : '—'}</dd>
            <dt>Aktivitas terakhir</dt><dd>{u.lastActivityAt ? relative(u.lastActivityAt) : '—'}</dd>
          </dl>
        </section>

        <section className="panel" aria-labelledby="acc-h">
          <h2 id="acc-h" className="panel__title">Kelola akun</h2>
          <div className="stack">
            <FilterSelect label="Role" value={u.role} onChange={(v) => patch.mutate({ role: v })} options={[['USER', 'User'], ['ADMIN', 'Admin']]} disabled={patch.isPending} />
            <div className="cluster">
              <button type="button" className="btn btn--subtle btn--sm" disabled={patch.isPending} onClick={() => patch.mutate({ isActive: !u.isActive })}>
                <Icon name={u.isActive ? 'lock' : 'check'} /> {u.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'}
              </button>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirmDelete(true)}><Icon name="trash" /> Hapus akun</button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 18 }} aria-labelledby="hist-h">
        <h2 id="hist-h" className="panel__title">Riwayat tontonan terakhir</h2>
        <DataTable rows={history} caption="Riwayat tontonan pengguna" empty={{ title: 'Belum ada riwayat tontonan' }}
          columns={[
            { key: 't', header: 'Judul', main: true, cell: (h) => <>{h.title ?? h.contentId}{h.episodeTitle && <span className="cell-sub">{h.episodeTitle}</span>}</> },
            { key: 'p', header: 'Progres', cell: (h) => <div style={{ minWidth: 110 }}><WatchProgress value={h.percentage} /></div> },
            { key: 'pos', header: 'Posisi', num: true, cell: (h) => `${clock(h.positionSeconds)} / ${clock(h.durationSeconds ?? 0)}` },
            { key: 'w', header: 'Terakhir', cell: (h) => relative(h.lastWatchedAt) },
          ]} />
      </section>

      <section className="panel" style={{ marginTop: 18 }} aria-labelledby="aud-h">
        <h2 id="aud-h" className="panel__title">Audit terkait pengguna</h2>
        <AuditLogTable rows={audit} />
      </section>

      <Modal open={confirmDelete} onClose={closeModal} title="Hapus akun pengguna?"
        actions={<>
          <button type="button" className="btn btn--ghost" onClick={closeModal}>Batal</button>
          <button type="button" className="btn btn--danger" disabled={del.isPending || confirmEmail.trim().length === 0} onClick={() => del.mutate()}>{del.isPending && <Spinner small />} Hapus permanen</button>
        </>}>
        <p className="muted">Tindakan ini permanen. Profil, riwayat tontonan, dan Daftar Saya milik <b>{u.email}</b> akan dihapus. Catatan audit log tetap disimpan untuk keperluan keamanan.</p>
        <Field label="Ketik email pengguna untuk konfirmasi">{(p) => <input {...p} className="input" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />}</Field>
      </Modal>
    </>
  );
}
