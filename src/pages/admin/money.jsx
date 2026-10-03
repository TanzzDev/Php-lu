import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounced, usePageTitle } from '../../hooks/misc.js';
import { api, errorMessage } from '../../lib/api.js';
import { useToast } from '../../hooks/toast.jsx';
import { clock, relative } from '../../lib/format.js';
import { ErrorState, Field, Skeleton, Spinner, WatchProgress } from '../../components/ui.jsx';
import { AdminHead, AuditLogTable, DataTable, FilterInput, FilterSelect, Filters, Pager, WatchingNow } from '../../components/admin.jsx';

const useList = (key, path, init) => {
  const [f, setF] = useState({ page: 1, ...init });
  const dq = useDebounced(f.q ?? '', 350);
  const params = { ...f, q: dq, pageSize: 20 };
  const q = useQuery({ queryKey: ['admin', key, params], queryFn: () => api(path, { query: params }), placeholderData: keepPreviousData, staleTime: 5_000 });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v, page: k === 'page' ? v : 1 }));
  return { f, set, q };
};

export function Watching() {
  usePageTitle('Admin · Sedang menonton', { noindex: true });
  return (<><AdminHead title="Sedang menonton" sub="Sesi pemutaran aktif dari watch-session server. Tidak ada kuota — ini murni pemantauan." /><WatchingNow /></>);
}

export function AdminHistory() {
  usePageTitle('Admin · Riwayat tontonan', { noindex: true });
  const { f, set, q } = useList('history', '/admin/history', { q: '' });
  return (
    <>
      <AdminHead title="Riwayat tontonan" sub="Progres tersimpan seluruh pengguna." />
      <Filters><FilterInput grow label="Cari judul" placeholder="Judul film atau series" value={f.q} onChange={set('q')} /></Filters>
      <DataTable rows={q.data?.items ?? []} loading={q.isPending} error={q.error} onRetry={() => q.refetch()} caption="Riwayat tontonan" empty={{ title: 'Belum ada riwayat' }}
        columns={[
          { key: 'u', header: 'Pengguna', main: true, cell: (h) => <><span>{h.displayName || h.email}</span><span className="cell-sub">{h.email}</span></> },
          { key: 't', header: 'Judul', cell: (h) => <>{h.title ?? h.contentId}{h.contentType === 'episode' && <span className="cell-sub">S{h.seasonNumber} E{h.episodeNumber}</span>}</> },
          { key: 'p', header: 'Progres', cell: (h) => <div style={{ minWidth: 110 }}><WatchProgress value={h.percentage} /></div> },
          { key: 'pos', header: 'Posisi', num: true, cell: (h) => `${clock(h.positionSeconds)} / ${clock(h.durationSeconds ?? 0)}` },
          { key: 's', header: 'Selesai', cell: (h) => (h.completed ? 'Ya' : 'Belum') },
          { key: 'w', header: 'Terakhir', cell: (h) => relative(h.lastWatchedAt) },
        ]} />
      {q.data && <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={set('page')} />}
    </>
  );
}

const ACTIONS = ['ADMIN_LOGIN', 'ADMIN_ACCESS_DENIED', 'USER_DELETED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'ROLE_CHANGED', 'SETTINGS_UPDATED'];

export function Audit() {
  usePageTitle('Admin · Audit log', { noindex: true });
  const { f, set, q } = useList('audit', '/admin/audit-logs', { q: '', action: '', from: '', to: '' });
  return (
    <>
      <AdminHead title="Audit log" sub="Catatan tambah-saja: tidak dapat diubah atau dihapus. Klik baris untuk melihat metadata." />
      <Filters>
        <FilterInput grow label="Cari pelaku / target" placeholder="Email" value={f.q} onChange={set('q')} />
        <FilterSelect label="Aksi" value={f.action} onChange={set('action')} options={[['', 'Semua aksi'], ...ACTIONS.map((a) => [a, a])]} />
        <FilterInput label="Dari tanggal" type="date" value={f.from} onChange={set('from')} />
        <FilterInput label="Sampai tanggal" type="date" value={f.to} onChange={set('to')} />
      </Filters>
      <AuditLogTable rows={q.data?.items ?? []} loading={q.isPending} error={q.error} onRetry={() => q.refetch()} />
      {q.data && <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={set('page')} />}
    </>
  );
}

// ───────────────────────── Pengaturan ─────────────────────────
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => {
  const [k, ...rest] = p.split('.');
  return { ...o, [k]: rest.length ? setPath(o?.[k] ?? {}, rest.join('.'), v) : v };
};

function SettingsCard({ id, title, desc, value, fields, onSave, saving }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const submit = (e) => { e.preventDefault(); onSave(id, draft); };
  return (
    <form className="panel" onSubmit={submit} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="panel__title">{title}</h2>
      {desc && <p className="muted" style={{ marginBottom: 16, fontSize: '0.92rem' }}>{desc}</p>}
      <div className="form">
        {fields.map((f) => (
          <Field key={f.path} label={f.label} hint={f.hint}>
            {(p) => <input {...p} className="input" type={f.type ?? 'text'} value={getPath(draft, f.path) ?? ''} onChange={(e) => setDraft((d) => setPath(d, f.path, e.target.value))} required />}
          </Field>
        ))}
        <div><button type="submit" className="btn btn--primary" disabled={!dirty || saving}>{saving && <Spinner small />} Simpan</button></div>
      </div>
    </form>
  );
}

export function Settings() {
  usePageTitle('Admin · Pengaturan', { noindex: true });
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api('/admin/settings'), staleTime: 0 });
  const save = useMutation({
    mutationFn: ({ key, value }) => api('/admin/settings', { method: 'PUT', body: { key, value } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['config'] }); toast('Pengaturan disimpan', { type: 'ok' }); },
    onError: (e) => toast(errorMessage(e), { type: 'error' }),
  });
  if (q.isPending) return <Skeleton style={{ height: 260 }} />;
  if (q.isError) return <ErrorState text={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { settings: s } = q.data;
  const onSave = (key, value) => save.mutate({ key, value });
  const saving = save.isPending;
  return (
    <>
      <AdminHead title="Pengaturan" sub="MDFlix 100% gratis — tidak ada lagi pengaturan harga atau pembayaran. Rahasia (service key, secret OAuth) hanya di environment variable server." />
      <div className="cards-2" style={{ alignItems: 'start' }}>
        <SettingsCard id="support" title="Informasi dukungan" saving={saving} value={s.support} onSave={onSave}
          fields={[{ path: 'email', label: 'Email dukungan', type: 'email' }, { path: 'phone', label: 'Nomor telepon' }]} />
        <SettingsCard id="branding" title="Branding situs" saving={saving} value={s.branding} onSave={onSave}
          fields={[{ path: 'name', label: 'Nama situs' }, { path: 'tagline', label: 'Tagline' }]} />
      </div>
    </>
  );
}
