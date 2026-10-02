import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useMyList, usePageTitle } from '../hooks/misc.js';
import { clock, dateLong, duration, initials, watchPath } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';
import { EpisodeList, MovieCard, MovieRow, Poster, TrailerModal, youtubeId } from '../components/Media.jsx';
import { EmptyState, ErrorState, Skeleton, WatchProgress } from '../components/ui.jsx';

function DetailSkeleton() {
  return (
    <div className="detail" aria-busy="true">
      <div className="detail__hero"><Skeleton style={{ position: 'absolute', inset: 0, borderRadius: 0 }} /></div>
    </div>
  );
}

function Missing({ what }) {
  return (
    <div className="page container">
      <EmptyState icon="film" title={`${what} tidak ditemukan`} text="Judul ini mungkin sudah tidak tersedia.">
        <Link to="/" className="btn btn--primary">Kembali ke beranda</Link>
      </EmptyState>
    </div>
  );
}

function Meta({ item, extra }) {
  return (
    <div className="hero__meta">
      {item.rating > 0 && <span className="rating-box"><Icon name="star" />{item.rating.toFixed(1)}</span>}
      {item.year && <span>{item.year}</span>}
      {extra}
      {item.genres.length > 0 && <span>{item.genres.slice(0, 4).join(', ')}</span>}
    </div>
  );
}

function Facts({ item, rows }) {
  const list = rows.filter(([, v]) => v);
  if (!list.length) return null;
  return (
    <dl className="facts">
      {list.map(([k, v]) => <div className="fact" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

function Cast({ cast }) {
  if (!cast?.length) return null;
  return (
    <section aria-labelledby="cast-h">
      <h2 id="cast-h" style={{ fontSize: '1.2rem', marginBottom: 14 }}>Pemeran</h2>
      <ul className="cast plain" role="list">
        {cast.map((c, i) => (
          <li key={`${c.name}-${i}`} className="cast__item">
            <span className="avatar" aria-hidden="true">{c.photo ? <img src={c.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : initials(c.name)}</span>
            <span>{c.name}{c.character && <span className="cast__role">{c.character}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Related({ id }) {
  const q = useQuery({ queryKey: ['reco', id], queryFn: () => api('/recommendations', { auth: false, query: { basedOn: id } }), staleTime: 10 * 60_000 });
  if (!q.data?.items?.length) return null;
  return (
    <MovieRow title="Mirip dengan ini" id="related">
      {q.data.items.map((it) => <MovieCard key={it.id} item={it} showType />)}
    </MovieRow>
  );
}

function Hero({ item, children, poster }) {
  return (
    <div className="detail__hero">
      <div className="detail__bg"><Poster src={item.backdrop ?? item.poster} title="" priority sizes="100vw" /></div>
      <div className="detail__inner">
        <div className="detail__poster"><Poster src={poster ?? item.poster} title={item.title} priority sizes="250px" /></div>
        <div className="detail__info">{children}</div>
      </div>
    </div>
  );
}

function ListButton({ item }) {
  const list = useMyList();
  const inList = list.has(item);
  return (
    <button type="button" className="btn btn--ghost btn--lg" aria-pressed={inList} onClick={() => list.toggle(item)}>
      <Icon name={inList ? 'check' : 'plus'} /> {inList ? 'Ada di Daftar Saya' : 'Daftar Saya'}
    </button>
  );
}

export function MovieDetail() {
  const { id } = useParams();
  const { status } = useAuth();
  const [trailer, setTrailer] = useState(false);
  const q = useQuery({ queryKey: ['movie', id], queryFn: () => api(`/movies/${encodeURIComponent(id)}`, { auth: false }), staleTime: 10 * 60_000, retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  const prog = useQuery({ queryKey: ['progress', id], queryFn: () => api('/history/progress', { query: { ids: id } }), enabled: status === 'authed', staleTime: 10_000 });
  const m = q.data?.movie;
  usePageTitle(m?.title ?? 'Film');

  if (q.isPending) return <DetailSkeleton />;
  if (q.error instanceof ApiError && q.error.status === 404) return <Missing what="Film" />;
  if (q.isError) return <div className="page container"><ErrorState title="Film tidak dapat dimuat" text={errorMessage(q.error)} onRetry={() => q.refetch()} /></div>;

  const p = prog.data?.progress?.[id];
  const resuming = p && !p.completed && p.positionSeconds >= 5;
  return (
    <article className="detail">
      <Hero item={m}>
        <span className="eyebrow">Film</span>
        <h1 className="detail__title display">{m.title}</h1>
        {m.tagline && <p className="detail__tagline">{m.tagline}</p>}
        <Meta item={m} extra={duration(m.duration) && <span>{duration(m.duration)}</span>} />
        {m.description && <p className="detail__desc">{m.description}</p>}
        <div className="detail__actions">
          <Link to={watchPath('movie', m.id)} className="btn btn--primary btn--lg"><Icon name="play" /> {resuming ? 'Lanjutkan' : 'Tonton'}</Link>
          <ListButton item={m} />
          {youtubeId(m.trailer) && <button type="button" className="btn btn--ghost btn--lg" onClick={() => setTrailer(true)}><Icon name="film" /> Trailer</button>}
        </div>
        {resuming && (
          <div className="detail__resume">
            <WatchProgress value={p.percentage} large />
            <span>Terakhir di menit {clock(p.positionSeconds)} · {Math.round(p.percentage)}% selesai</span>
          </div>
        )}
      </Hero>
      <div className="container detail__body">
        <Facts item={m} rows={[
          ['Genre', m.genres.join(', ')], ['Sutradara', m.director], ['Rilis', m.releaseDate ? dateLong(m.releaseDate) : m.year],
          ['Durasi', duration(m.duration)], ['Status', m.status],
        ]} />
        <Cast cast={m.cast} />
      </div>
      <Related id={m.id} />
      <TrailerModal open={trailer} onClose={() => setTrailer(false)} url={m.trailer} title={m.title} />
    </article>
  );
}

export function SeriesDetail() {
  const { id } = useParams();
  const { status } = useAuth();
  const [trailer, setTrailer] = useState(false);
  const [season, setSeason] = useState(null);
  const q = useQuery({ queryKey: ['series', id], queryFn: () => api(`/series/${encodeURIComponent(id)}`, { auth: false }), staleTime: 10 * 60_000, retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });
  const s = q.data?.series;
  usePageTitle(s?.title ?? 'Series');

  // riwayat series ini → menentukan "Lanjutkan" & musim awal
  const hist = useQuery({ queryKey: ['history-series', id], queryFn: () => api('/history', { query: { limit: 100 } }), enabled: status === 'authed', staleTime: 10_000 });
  const last = useMemo(() => hist.data?.items.find((e) => e.seriesId === id) ?? null, [hist.data, id]);

  const seasons = s?.seasons ?? [];
  const active = season ?? last?.seasonNumber ?? seasons[0]?.number ?? 1;
  useEffect(() => { setSeason(null); }, [id]);

  const eps = useQuery({ queryKey: ['episodes', id, active], queryFn: () => api(`/series/${encodeURIComponent(id)}/seasons/${active}/episodes`, { auth: false }), enabled: Boolean(s), staleTime: 10 * 60_000 });
  const episodes = eps.data?.episodes ?? [];
  const ids = episodes.map((e) => e.id).join(',');
  const prog = useQuery({ queryKey: ['progress', ids], queryFn: () => api('/history/progress', { query: { ids } }), enabled: status === 'authed' && ids.length > 0, staleTime: 10_000 });
  const progress = prog.data?.progress ?? {};

  // Episode berikutnya: yang terakhir ditonton bila belum selesai, jika selesai maka episode sesudahnya.
  const next = useMemo(() => {
    if (!episodes.length) return null;
    if (last && last.seasonNumber === active) {
      const idx = episodes.findIndex((e) => e.id === last.contentId);
      if (idx >= 0) return last.completed ? episodes[idx + 1] ?? null : episodes[idx];
    }
    return last ? null : episodes[0];
  }, [episodes, last, active]);

  if (q.isPending) return <DetailSkeleton />;
  if (q.error instanceof ApiError && q.error.status === 404) return <Missing what="Series" />;
  if (q.isError) return <div className="page container"><ErrorState title="Series tidak dapat dimuat" text={errorMessage(q.error)} onRetry={() => q.refetch()} /></div>;

  const cta = last && !last.completed && last.seasonNumber !== active
    ? { id: last.contentId, label: `Lanjutkan S${last.seasonNumber} E${last.episodeNumber}` }
    : next ? { id: next.id, label: last ? `${last.completed ? 'Berikutnya' : 'Lanjutkan'} S${next.seasonNumber} E${next.episodeNumber}` : `Tonton S${next.seasonNumber} E${next.episodeNumber}` }
    : null;

  return (
    <article className="detail">
      <Hero item={s}>
        <span className="eyebrow">Series</span>
        <h1 className="detail__title display">{s.title}</h1>
        {s.tagline && <p className="detail__tagline">{s.tagline}</p>}
        <Meta item={s} extra={seasons.length > 0 && <span>{seasons.length} musim</span>} />
        {s.description && <p className="detail__desc">{s.description}</p>}
        <div className="detail__actions">
          {cta
            ? <Link to={watchPath('episode', cta.id)} className="btn btn--primary btn--lg"><Icon name="play" /> {cta.label}</Link>
            : <button type="button" className="btn btn--primary btn--lg" disabled><Icon name="play" /> {eps.isPending ? 'Memuat…' : 'Belum ada episode'}</button>}
          <ListButton item={s} />
          {youtubeId(s.trailer) && <button type="button" className="btn btn--ghost btn--lg" onClick={() => setTrailer(true)}><Icon name="film" /> Trailer</button>}
        </div>
      </Hero>
      <div className="container detail__body">
        <section aria-labelledby="eps-h">
          <div className="eps__head">
            <h2 id="eps-h" style={{ fontSize: '1.3rem' }}>Episode</h2>
            {seasons.length > 1 && (
              <div className="field" style={{ minWidth: 190 }}>
                <label className="sr-only" htmlFor="season">Pilih musim</label>
                <select id="season" className="select" value={active} onChange={(e) => setSeason(Number(e.target.value))}>
                  {seasons.map((x) => <option key={x.number} value={x.number}>{x.title ?? `Musim ${x.number}`}{x.episodeCount ? ` (${x.episodeCount} episode)` : ''}</option>)}
                </select>
              </div>
            )}
          </div>
          {eps.isPending ? <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} className="skeleton--wide" style={{ maxWidth: 420 }} />)}</div>
            : eps.isError ? <ErrorState title="Episode tidak dapat dimuat" text={errorMessage(eps.error)} onRetry={() => eps.refetch()} />
            : episodes.length === 0 ? <EmptyState icon="film" title="Daftar episode belum tersedia" text="Sumber katalog belum menyediakan daftar episode untuk series ini." />
            : <EpisodeList episodes={episodes} progress={progress} nextId={next?.id} />}
        </section>
        <Facts item={s} rows={[
          ['Genre', s.genres.join(', ')], ['Kreator', s.creator], ['Rilis', s.releaseDate ? dateLong(s.releaseDate) : s.year], ['Status', s.status],
        ]} />
        <Cast cast={s.cast} />
      </div>
      <Related id={s.id} />
      <TrailerModal open={trailer} onClose={() => setTrailer(false)} url={s.trailer} title={s.title} />
    </article>
  );
}
