import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, ApiError } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePageTitle } from '../hooks/misc.js';
import { useToast } from '../hooks/toast.jsx';
import { ContinueWatchingCard, HeroBanner, MovieCard, MovieRow } from '../components/Media.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui.jsx';

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat beranda">
      <Skeleton style={{ height: 'min(84dvh, 640px)', borderRadius: 0 }} />
      <div className="container" style={{ marginTop: 28, display: 'grid', gap: 28 }}>
        {[0, 1].map((r) => (
          <div key={r}>
            <Skeleton className="skeleton--text" style={{ width: 180, marginBottom: 14 }} />
            <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'calc((100% - (var(--cards) - 1) * var(--gap)) / var(--cards))', gap: 'var(--gap)', overflow: 'hidden' }}>
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="skeleton--poster" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  usePageTitle(null);
  const { status } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const home = useQuery({ queryKey: ['home'], queryFn: () => api('/catalog/home', { auth: false }), staleTime: 5 * 60_000 });
  const cont = useQuery({ queryKey: ['continue'], queryFn: () => api('/history/continue'), enabled: status === 'authed', staleTime: 15_000 });
  const remove = useMutation({
    mutationFn: (entry) => api(`/history/${entry.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['continue'] }); qc.invalidateQueries({ queryKey: ['history'] }); },
    onError: (e) => toast(errorMessage(e), { type: 'error' }),
  });

  if (home.isPending) return <HomeSkeleton />;
  if (home.isError) {
    const unavailable = home.error instanceof ApiError && home.error.code === 'CONTENT_UNAVAILABLE';
    return (
      <div className="page container">
        {unavailable
          ? <EmptyState icon="film" title="Katalog belum tersedia" text="Sumber katalog belum dikonfigurasi. Silakan kembali beberapa saat lagi." />
          : <ErrorState title="Katalog tidak dapat dimuat" text={errorMessage(home.error)} onRetry={() => home.refetch()} />}
      </div>
    );
  }

  const { hero, rows } = home.data;
  return (
    <>
      {hero.length ? <HeroBanner items={hero} /> : <div className="page container"><h1 className="page__title display">Selamat datang di MDFlix</h1></div>}
      <div className="rows">
        {cont.data?.items?.length > 0 && (
          <MovieRow title="Lanjutkan menonton" wide id="continue">
            {cont.data.items.map((e) => <ContinueWatchingCard key={e.id} entry={e} onRemove={(x) => remove.mutate(x)} />)}
          </MovieRow>
        )}
        {rows.map((r) => (
          <MovieRow key={r.id} title={r.title} id={r.id}>
            {r.items.map((it) => <MovieCard key={it.id} item={it} showType={r.id !== 'latest-movies' && r.id !== 'latest-series'} />)}
          </MovieRow>
        ))}
      </div>
      {status === 'anon' && (
        <div className="container" style={{ marginTop: 48 }}>
          <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between' }}>
            <div><h2 style={{ fontSize: '1.25rem' }}>Mulai menonton hari ini</h2><p className="muted" style={{ marginTop: 6 }}>Masuk untuk menyimpan Daftar Saya, melanjutkan tontonan, dan menikmati kuota gratis harian.</p></div>
            <Link to="/login" className="btn btn--accent btn--lg">Masuk atau daftar</Link>
          </div>
        </div>
      )}
    </>
  );
}
