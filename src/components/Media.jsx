import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMyList } from '../hooks/misc.js';
import { contentPath, duration, episodeLabel, safeImg, spanLabel, tmdbSrcSet, watchPath } from '../lib/format.js';
import { Icon } from './Icon.jsx';
import { Modal, WatchProgress } from './ui.jsx';

/** Gambar dengan lazy-loading, srcset (bila TMDB), dan fallback tipografis jika gagal/kosong. */
export function Poster({ src, title, sizes = '(max-width: 640px) 45vw, 20vw', priority, alt = '' }) {
  const [failed, setFailed] = useState(false);
  const url = safeImg(src);
  if (!url || failed) return <div className="card__ph" aria-hidden="true">{title}</div>;
  return (
    <img src={url} srcSet={tmdbSrcSet(url)} sizes={sizes} alt={alt} decoding="async"
      loading={priority ? 'eager' : 'lazy'} fetchpriority={priority ? 'high' : undefined}
      referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

export function MovieCard({ item, showType }) {
  const list = useMyList();
  const inList = list.has(item);
  return (
    <div className="card" role="listitem">
      <Link to={contentPath(item)} className="card__link">
        <div className="card__img">
          <Poster src={item.poster} title={item.title} />
          {showType && item.type === 'series' && <span className="badge card__type">Series</span>}
        </div>
        <div className="card__body">
          <h3 className="card__title clamp-2">{item.title}</h3>
          <div className="card__meta">
            {item.year && <span>{item.year}</span>}
            {item.rating > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="star" />{item.rating.toFixed(1)}</span>}
          </div>
        </div>
      </Link>
      <button type="button" className="card__add" aria-pressed={inList}
        aria-label={inList ? `Hapus ${item.title} dari Daftar Saya` : `Tambahkan ${item.title} ke Daftar Saya`}
        onClick={() => list.toggle(item)}>
        <Icon name={inList ? 'check' : 'plus'} />
      </button>
    </div>
  );
}
export const SeriesCard = MovieCard; // kartu yang sama; badge "Series" ditentukan oleh item.type

export function ContinueWatchingCard({ entry, onRemove }) {
  const isEp = entry.contentType === 'episode';
  const to = watchPath(isEp ? 'episode' : 'movie', entry.contentId);
  const left = entry.durationSeconds ? entry.durationSeconds - entry.positionSeconds : null;
  const sub = isEp
    ? [episodeLabel(entry), entry.episodeTitle].filter(Boolean).join(' · ') || 'Series'
    : left ? `Sisa ${spanLabel(left)}` : 'Lanjutkan';
  return (
    <div className="card card--wide" role="listitem">
      <Link to={to} className="card__link" aria-label={`Lanjutkan ${entry.title}, ${sub}`}>
        <div className="card__img">
          <Poster src={entry.image ?? entry.poster} title={entry.title} sizes="(max-width: 640px) 75vw, 24vw" />
          <span className="card__play" aria-hidden="true"><Icon name="play" /></span>
          <div className="card__progress"><WatchProgress value={entry.percentage} /></div>
        </div>
        <div className="card__body">
          <h3 className="card__title clamp-2">{entry.title}</h3>
          <div className="card__meta"><span className="clamp-2">{sub}</span></div>
        </div>
      </Link>
      {onRemove && (
        <button type="button" className="card__remove" aria-label={`Hapus ${entry.title} dari Lanjutkan Menonton`} onClick={() => onRemove(entry)}>
          <Icon name="x" style={{ width: 16, height: 16 }} />
        </button>
      )}
    </div>
  );
}

/** Baris horizontal (swipe di mobile, tombol panah di desktop). */
export function MovieRow({ title, children, wide, id }) {
  const track = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);
  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);
  const scroll = (dir) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: 'smooth' });
  const headId = `row-${id ?? title}`.replace(/\s+/g, '-');
  return (
    <section className={`row${wide ? ' row--wide' : ''}`} aria-labelledby={headId}>
      <div className="row__head"><h2 id={headId} className="row__title">{title}</h2></div>
      <div className="row__viewport">
        <button type="button" className="row__arrow row__arrow--prev" aria-label={`Geser ${title} ke kiri`} disabled={edge.start} onClick={() => scroll(-1)}><Icon name="chevL" /></button>
        <div className="row__track" role="list" ref={track} onScroll={update}>{children}</div>
        <button type="button" className="row__arrow row__arrow--next" aria-label={`Geser ${title} ke kanan`} disabled={edge.end} onClick={() => scroll(1)}><Icon name="chevR" /></button>
      </div>
    </section>
  );
}

const HERO_MS = 7000;

export function HeroBanner({ items }) {
  const list = useMyList();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (paused || reduced || items.length < 2) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % items.length), HERO_MS);
    return () => clearTimeout(t);
  }, [i, paused, reduced, items.length]);
  if (!items.length) return null;
  const cur = items[i];
  const inList = list.has(cur);
  const label = cur.type === 'series' ? 'Series' : 'Film';
  return (
    <section className="hero" aria-roledescription="carousel" aria-label="Sorotan" style={{ '--hero-ms': `${HERO_MS}ms` }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {items.map((it, idx) => (
        <div key={it.id} className={`hero__slide${idx === i ? ' is-active' : ''}`} aria-hidden={idx !== i}>
          <Poster src={it.backdrop} title="" priority={idx === 0} sizes="100vw" />
        </div>
      ))}
      <div className="hero__body">
        <div className="hero__copy" aria-live="off">
          <span className="eyebrow">{label}{cur.year ? `  /  ${cur.year}` : ''}</span>
          <h1 className="hero__title display">{cur.title}</h1>
          <div className="hero__meta">
            {cur.rating > 0 && <span className="rating-box"><Icon name="star" />{cur.rating.toFixed(1)}</span>}
            {cur.genres.slice(0, 3).map((g) => <span key={g}>{g}</span>)}
          </div>
          {cur.description && <p className="hero__desc clamp-3">{cur.description}</p>}
          <div className="hero__actions">
            <Link to={cur.type === 'series' ? contentPath(cur) : watchPath('movie', cur.id)} className="btn btn--primary btn--lg"><Icon name="play" /> Tonton</Link>
            <button type="button" className="btn btn--ghost btn--lg" aria-pressed={inList} onClick={() => list.toggle(cur)}>
              <Icon name={inList ? 'check' : 'plus'} /> Daftar Saya
            </button>
            <Link to={contentPath(cur)} className="btn btn--ghost btn--lg btn--icon" aria-label={`Detail ${cur.title}`}><Icon name="info" /></Link>
          </div>
        </div>
        {items.length > 1 && (
          <div className={`hero__pager${paused ? ' is-paused' : ''}`}>
            {items.map((it, idx) => (
              <button key={it.id} type="button" className={idx === i ? 'is-active' : ''} aria-label={`Tampilkan ${it.title}`} aria-current={idx === i} onClick={() => setI(idx)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function EpisodeList({ episodes, progress = {}, currentId, nextId, compact }) {
  if (!episodes.length) return null;
  return (
    <ol className="eps plain" role="list">
      {episodes.map((e) => {
        const p = progress[e.id];
        return (
          <li key={e.id}>
            <Link to={watchPath('episode', e.id)} className={`ep${e.id === currentId ? ' is-current' : ''}`} aria-current={e.id === currentId ? 'true' : undefined}>
              <span className="ep__no" aria-hidden="true">{e.episodeNumber}</span>
              <div className="ep__thumb">
                <Poster src={e.thumbnail} title={`E${e.episodeNumber}`} sizes="190px" />
                <span className="card__play" aria-hidden="true"><Icon name="play" /></span>
                {p && !p.completed && p.percentage > 0 && <div className="card__progress"><WatchProgress value={p.percentage} /></div>}
              </div>
              <div className="ep__text">
                <span className="ep__title">
                  <span>{e.episodeNumber}. {e.title}</span>
                  {duration(e.duration) && <span className="ep__dur">{duration(e.duration)}</span>}
                  {p?.completed && <span className="badge badge--ok">Selesai</span>}
                  {e.id === nextId && !p?.completed && <span className="badge badge--accent">Berikutnya</span>}
                </span>
                {!compact && e.description && <span className="ep__desc clamp-2">{e.description}</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** Trailer resmi via YouTube (youtube-nocookie) — dipertahankan dari aplikasi lama. */
export function youtubeId(url = '') {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/.exec(url);
  return m ? m[1] : null;
}

export function TrailerModal({ url, title, open, onClose }) {
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <Modal open={open} onClose={onClose} wide title={null} labelledBy="trailer-title">
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
        <iframe title={`Trailer ${title}`} id="trailer-title" style={{ width: '100%', height: '100%', border: 0 }}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup trailer" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)' }}><Icon name="x" /></button>
      </div>
    </Modal>
  );
}
