import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '../lib/api.js';
import { usePageTitle } from '../hooks/misc.js';
import { useWatchSession } from '../hooks/watchSession.js';
import { watchPath } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';
import { Header } from '../components/Layout.jsx';
import { EpisodeList } from '../components/Media.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';
import EmbedPlayer from '../components/EmbedPlayer.jsx';
import { EmptyState, Spinner } from '../components/ui.jsx';
import NotFound from './NotFound.jsx';

/** Layout khusus menonton: header saja, tanpa bottom-nav/footer supaya ruang layar maksimal. */
export function WatchLayout() {
  useEffect(() => { document.body.classList.add('no-nav'); return () => document.body.classList.remove('no-nav'); }, []);
  return (<div className="shell"><Header solid /><main id="main" className="main"><Outlet /></main></div>);
}

const Overlay = ({ icon, title, children, actions }) => (
  <div className="player__overlay" role="alert"><div>
    <Icon name={icon} style={{ width: 40, height: 40, color: 'var(--accent)' }} />
    <h2>{title}</h2>{children}
    <div className="cluster" style={{ justifyContent: 'center' }}>{actions}</div>
  </div></div>
);

export default function Watch() {
  const { kind, id } = useParams();
  if (!['movie', 'episode'].includes(kind)) return <NotFound />;
  return <WatchInner key={`${kind}:${id}`} kind={kind} id={id} />;
}

function WatchInner({ kind, id }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const isEp = kind === 'episode';

  const movie = useQuery({ queryKey: ['movie', id], queryFn: () => api(`/movies/${encodeURIComponent(id)}`, { auth: false }), enabled: !isEp, staleTime: 10 * 60_000 });
  const ep = useQuery({ queryKey: ['episode', id], queryFn: () => api(`/episodes/${encodeURIComponent(id)}`, { auth: false }), enabled: isEp, staleTime: 10 * 60_000 });
  const episode = ep.data?.episode;
  const seriesId = episode?.seriesId;
  const series = useQuery({ queryKey: ['series', seriesId], queryFn: () => api(`/series/${encodeURIComponent(seriesId)}`, { auth: false }), enabled: Boolean(seriesId), staleTime: 10 * 60_000 });
  const season = episode?.seasonNumber;
  const eps = useQuery({ queryKey: ['episodes', seriesId, season], queryFn: () => api(`/series/${encodeURIComponent(seriesId)}/seasons/${season}/episodes`, { auth: false }), enabled: Boolean(seriesId), staleTime: 10 * 60_000 });
  const list = eps.data?.episodes ?? [];
  const idx = list.findIndex((e) => e.id === id);
  const lastOfSeason = idx >= 0 && idx === list.length - 1;
  const nextSeason = (series.data?.series.seasons ?? []).find((s) => s.number > (season ?? 0));
  const nextSeasonEps = useQuery({ queryKey: ['episodes', seriesId, nextSeason?.number], queryFn: () => api(`/series/${encodeURIComponent(seriesId)}/seasons/${nextSeason.number}/episodes`, { auth: false }), enabled: lastOfSeason && Boolean(nextSeason), staleTime: 10 * 60_000 });
  const nextEp = idx >= 0 ? (list[idx + 1] ?? nextSeasonEps.data?.episodes?.[0] ?? null) : null;

  const S = useWatchSession({ kind, contentId: id });
  const [ended, setEnded] = useState(false);

  const title = isEp ? series.data?.series.title ?? 'Memuat…' : movie.data?.movie.title ?? 'Memuat…';
  // musim 0 / episode 0 = series diputar lewat pemutar level-judul (tanpa nomor episode)
  const titleLevel = isEp && episode?.seasonNumber === 0 && episode?.episodeNumber === 0;
  const sub = isEp && episode && !titleLevel ? `S${episode.seasonNumber} E${episode.episodeNumber} · ${episode.title}` : null;
  usePageTitle(isEp ? `${title}${sub ? ` — ${sub}` : ''}` : title, { noindex: true });

  const back = () => nav(isEp ? (seriesId ? `/series/${encodeURIComponent(seriesId)}` : '/') : `/movie/${encodeURIComponent(id)}`);
  const goNext = () => nextEp && nav(watchPath('episode', nextEp.id), { replace: true });

  useEffect(() => () => { // segarkan Lanjutkan Menonton & progres setelah keluar
    for (const k of ['continue', 'history', 'progress', 'history-series']) qc.invalidateQueries({ queryKey: [k] });
  }, [qc]);
  useEffect(() => { // autoplay episode berikutnya 8 dtk setelah selesai (bisa dibatalkan)
    if (!ended || !nextEp) return undefined;
    const t = setTimeout(goNext, 8000);
    return () => clearTimeout(t);
  }, [ended, nextEp]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = (isEp ? ep.error : movie.error) instanceof ApiError && (isEp ? ep.error : movie.error).status === 404;
  if (missing) return <div className="page container"><EmptyState icon="film" title="Konten tidak ditemukan" text="Judul ini mungkin sudah tidak tersedia."><Link className="btn btn--primary" to="/">Kembali ke beranda</Link></EmptyState></div>;

  const startAt = S.resume && !S.resume.completed ? S.resume.positionSeconds : 0;

  let overlay = null;
  if (S.phase === 'moved') {
    overlay = <Overlay icon="info" title="Pemutaran dipindahkan" actions={<><button type="button" className="btn btn--primary" onClick={S.restart}>Putar di sini</button><button type="button" className="btn btn--ghost" onClick={back}>Kembali</button></>}><p>Kamu memutar video lain di tab atau perangkat lain. Hanya satu pemutaran aktif per akun.</p></Overlay>;
  } else if (S.phase === 'stale') {
    overlay = <Overlay icon="clock" title="Sesi berakhir" actions={<button type="button" className="btn btn--primary" onClick={S.restart}>Lanjutkan menonton</button>}><p>Pemutaran berhenti karena tidak aktif. Tekan lanjutkan untuk meneruskan.</p></Overlay>;
  } else if (S.phase === 'error') {
    const gone = S.error instanceof ApiError && S.error.code === 'PLAYBACK_UNAVAILABLE';
    overlay = (
      <Overlay icon="alert" title={gone ? 'Video belum tersedia' : 'Tidak dapat memutar'}
        actions={<>{!gone && <button type="button" className="btn btn--primary" onClick={S.restart}><Icon name="refresh" /> Coba lagi</button>}<button type="button" className="btn btn--ghost" onClick={back}>Kembali</button></>}>
        <p>{gone ? 'Sumber video untuk judul ini belum disediakan oleh katalog.' : errorMessage(S.error)}</p>
      </Overlay>
    );
  } else if (ended) {
    overlay = (
      <Overlay icon="check" title={nextEp ? 'Episode selesai' : 'Selesai menonton'}
        actions={<>{nextEp && <button type="button" className="btn btn--primary" onClick={goNext}><Icon name="next" /> Putar berikutnya</button>}<button type="button" className="btn btn--ghost" onClick={back}>Kembali ke detail</button>{!nextEp && <button type="button" className="btn btn--ghost" onClick={() => { setEnded(false); S.restart(); }}>Tonton lagi</button>}</>}>
        {nextEp && <p>Berikutnya: E{nextEp.episodeNumber} · {nextEp.title}. Otomatis diputar dalam beberapa detik.</p>}
      </Overlay>
    );
  }

  return (
    <div className={`watch${isEp && !titleLevel ? ' watch--series' : ''}`} style={{ paddingTop: 'calc(var(--header-h) + var(--safe-t) + 16px)' }}>
      <div style={{ minWidth: 0 }}>
        <div className="watch__bar">
          <button type="button" className="btn btn--ghost btn--sm" onClick={back}><Icon name="arrowL" /> Detail</button>
          <div style={{ minWidth: 0 }}>
            <h1 className="watch__title clamp-2">{title}</h1>
            {sub && <p className="watch__sub">{sub}</p>}
          </div>
        </div>

        {S.playback && S.phase !== 'starting' ? (
          S.playback.type === 'embed' ? (
            <EmbedPlayer key={S.playback.source} playback={S.playback} title={title} onState={S.report} overlay={overlay} />
          ) : (
            <VideoPlayer key={S.playback.source} playback={S.playback} title={title} subtitle={sub} startAt={startAt}
              onState={(s) => { S.report(s); if (s === 'playing') setEnded(false); }}
              onProgress={S.progress} onEnded={() => setEnded(true)}
              onNext={nextEp ? goNext : undefined} overlay={overlay} />
          )
        ) : (
          <div className="player" style={{ display: 'grid', placeItems: 'center' }}>
            {overlay ?? <Spinner />}
          </div>
        )}

        {nextEp && (
          <div className="cluster" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--subtle btn--sm" onClick={goNext}><Icon name="next" /> Episode berikutnya</button>
          </div>
        )}
        {isEp && episode?.description && <p className="muted" style={{ marginTop: 18, maxWidth: '70ch' }}>{episode.description}</p>}
      </div>

      {isEp && !titleLevel && (
        <aside className="watch__side" aria-label="Daftar episode">
          <h2 style={{ fontSize: '1.05rem' }}>{series.data?.series.seasons.find((s) => s.number === season)?.title ?? `Musim ${season ?? ''}`}</h2>
          <EpisodeList episodes={list} currentId={id} nextId={nextEp?.id} compact />
        </aside>
      )}
    </div>
  );
}
