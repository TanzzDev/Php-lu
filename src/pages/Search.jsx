import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api.js';
import { useDebounced, usePageTitle } from '../hooks/misc.js';
import { Icon } from '../components/Icon.jsx';
import { MovieCard } from '../components/Media.jsx';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../components/ui.jsx';

const SkeletonGrid = () => (
  <div className="grid" aria-busy="true">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="skeleton--poster" />)}</div>
);

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text.trim(), 380);
  const input = useRef(null);
  usePageTitle(q ? `Cari “${q}”` : 'Cari');

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { // sinkronkan ke URL agar bisa dibagikan / tombol kembali berfungsi
    const cur = params.get('q') ?? '';
    if (q !== cur) setParams(q ? { q } : {}, { replace: true });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useInfiniteQuery({
    queryKey: ['search', q],
    enabled: q.length >= 2,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api('/movies/search', { auth: false, query: { q, page: pageParam }, signal }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 60_000,
  });
  const popular = useQuery({ queryKey: ['popular-suggest'], queryFn: () => api('/movies', { auth: false, query: { list: 'popular' } }), enabled: q.length < 2, staleTime: 5 * 60_000 });

  const items = results.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="page container">
      <div className="page__head">
        <h1 className="page__title display">Cari</h1>
      </div>
      <div className="searchbar" role="search">
        <Icon name="search" />
        <label className="sr-only" htmlFor="q">Cari film atau series</label>
        <input id="q" ref={input} className="input" type="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Judul, genre…" autoComplete="off" enterKeyHint="search" />
        {text && <button type="button" className="searchbar__clear" aria-label="Hapus pencarian" onClick={() => { setText(''); input.current?.focus(); }}><Icon name="x" /></button>}
      </div>

      <div style={{ marginTop: 32 }} aria-live="polite">
        {q.length >= 2 ? (
          results.isPending ? <SkeletonGrid />
          : results.isError ? <ErrorState title="Pencarian gagal" text={errorMessage(results.error)} onRetry={() => results.refetch()} />
          : items.length === 0 ? <EmptyState icon="search" title={`Tidak ada hasil untuk “${q}”`} text="Periksa ejaan atau coba kata kunci lain." />
          : (
            <>
              <p className="muted" style={{ marginBottom: 18 }}>{items.length}{results.hasNextPage ? '+' : ''} hasil untuk “{q}”</p>
              <div className="grid" role="list">{items.map((it) => <MovieCard key={`${it.type}:${it.id}`} item={it} showType />)}</div>
              {results.hasNextPage && (
                <div style={{ textAlign: 'center', marginTop: 32 }}>
                  <button type="button" className="btn btn--ghost" disabled={results.isFetchingNextPage} onClick={() => results.fetchNextPage()}>
                    {results.isFetchingNextPage ? <Spinner small /> : null} Muat lebih banyak
                  </button>
                </div>
              )}
            </>
          )
        ) : (
          <>
            {text.trim().length === 1 && <p className="muted">Ketik minimal 2 huruf.</p>}
            {popular.data?.items?.length > 0 && (
              <section aria-label="Populer saat ini">
                <h2 style={{ fontSize: '1.2rem', marginBottom: 16 }}>Populer saat ini</h2>
                <div className="grid" role="list">{popular.data.items.slice(0, 12).map((it) => <MovieCard key={`${it.type}:${it.id}`} item={it} showType />)}</div>
              </section>
            )}
            {!popular.isPending && !popular.data?.items?.length && <EmptyState icon="search" title="Cari film atau series" text="Ketik judul atau genre untuk mulai mencari." />}
          </>
        )}
      </div>
    </div>
  );
}
