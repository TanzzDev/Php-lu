import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api.js';
import { usePageTitle } from '../hooks/misc.js';
import { useToast } from '../hooks/toast.jsx';
import { ContinueWatchingCard, MovieCard, MovieRow } from '../components/Media.jsx';
import { EmptyState, ErrorState, Modal, Skeleton } from '../components/ui.jsx';
import { relative } from '../lib/format.js';

const Sk = ({ n = 10, wide }) => (
  <div className={`grid${wide ? ' grid--wide' : ''}`} aria-busy="true">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className={wide ? 'skeleton--wide' : 'skeleton--poster'} />)}</div>
);

export function MyList() {
  usePageTitle('Daftar Saya', { noindex: true });
  const q = useQuery({ queryKey: ['my-list'], queryFn: () => api('/my-list'), staleTime: 15_000 });
  return (
    <div className="page container">
      <div className="page__head"><div><h1 className="page__title display">Daftar Saya</h1><p className="page__sub">Judul yang kamu simpan, tersedia di semua perangkat.</p></div></div>
      {q.isPending ? <Sk />
        : q.isError ? <ErrorState text={errorMessage(q.error)} onRetry={() => q.refetch()} />
        : q.data.items.length === 0 ? (
          <EmptyState icon="bookmark" title="Daftar Saya masih kosong" text="Tekan tanda + pada film atau series untuk menyimpannya di sini.">
            <Link to="/" className="btn btn--primary">Jelajahi katalog</Link>
          </EmptyState>
        ) : (
          <div className="grid" role="list">
            {q.data.items.map((i) => <MovieCard key={i.id} showType item={{ id: i.contentId, type: i.type, title: i.title, poster: i.poster, year: i.year, rating: i.rating }} />)}
          </div>
        )}
    </div>
  );
}

export function History() {
  usePageTitle('Riwayat tontonan', { noindex: true });
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const hist = useQuery({ queryKey: ['history'], queryFn: () => api('/history', { query: { limit: 60 } }), staleTime: 15_000 });
  const cont = useQuery({ queryKey: ['continue'], queryFn: () => api('/history/continue'), staleTime: 15_000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['history'] }); qc.invalidateQueries({ queryKey: ['continue'] }); };
  const remove = useMutation({ mutationFn: (e) => api(`/history/${e.id}`, { method: 'DELETE' }), onSuccess: refresh, onError: (e) => toast(errorMessage(e), { type: 'error' }) });
  const clear = useMutation({
    mutationFn: () => api('/history', { method: 'DELETE' }),
    onSuccess: () => { setConfirm(false); refresh(); toast('Riwayat dihapus', { type: 'ok' }); },
    onError: (e) => toast(errorMessage(e), { type: 'error' }),
  });

  return (
    <div className="page">
      <div className="container">
        <div className="page__head">
          <div><h1 className="page__title display">Riwayat</h1><p className="page__sub">Tontonanmu tersimpan otomatis dan bisa dilanjutkan dari mana saja.</p></div>
          {hist.data?.items?.length > 0 && <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirm(true)}>Hapus semua riwayat</button>}
        </div>
      </div>

      {cont.data?.items?.length > 0 && (
        <MovieRow title="Lanjutkan menonton" wide id="cw">
          {cont.data.items.map((e) => <ContinueWatchingCard key={e.id} entry={e} onRemove={(x) => remove.mutate(x)} />)}
        </MovieRow>
      )}

      <div className="container" style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 18 }}>Semua riwayat</h2>
        {hist.isPending ? <Sk wide />
          : hist.isError ? <ErrorState text={errorMessage(hist.error)} onRetry={() => hist.refetch()} />
          : hist.data.items.length === 0 ? (
            <EmptyState icon="clock" title="Belum ada riwayat" text="Film dan series yang kamu tonton akan muncul di sini.">
              <Link to="/" className="btn btn--primary">Mulai menonton</Link>
            </EmptyState>
          ) : (
            <div className="grid grid--wide" role="list">
              {hist.data.items.map((e) => (
                <div key={e.id}>
                  <ContinueWatchingCard entry={e} onRemove={(x) => remove.mutate(x)} />
                  <p className="faint" style={{ fontSize: '0.78rem', marginTop: 4 }}>{e.completed ? 'Selesai' : `${Math.round(e.percentage)}%`} · {relative(e.lastWatchedAt)}</p>
                </div>
              ))}
            </div>
          )}
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Hapus semua riwayat?"
        actions={<>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>Batal</button>
          <button type="button" className="btn btn--danger" disabled={clear.isPending} onClick={() => clear.mutate()}>Hapus semua</button>
        </>}>
        <p className="muted">Seluruh riwayat dan daftar “Lanjutkan menonton” akan dihapus. Tindakan ini tidak bisa dibatalkan.</p>
      </Modal>
    </div>
  );
}
