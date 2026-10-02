import { useCallback, useEffect, useRef, useState } from 'react';
import { clock } from '../lib/format.js';
import { Icon } from './Icon.jsx';

function Seekbar({ cur, dur, buf, onSeek }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const shown = drag ?? (dur ? cur / dur : 0);
  return (
    <div ref={ref} className={`pbar${drag !== null ? ' is-drag' : ''}`} role="slider" tabIndex={0} aria-label="Posisi video"
      aria-valuemin={0} aria-valuemax={Math.round(dur) || 0} aria-valuenow={Math.round(cur)} aria-valuetext={`${clock(cur)} dari ${clock(dur)}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(pos(e)); }}
      onPointerMove={(e) => { const p = pos(e); setHover(p); if (drag !== null) setDrag(p); }}
      onPointerLeave={() => setHover(null)}
      onPointerUp={(e) => { const p = pos(e); setDrag(null); if (dur) onSeek(p * dur); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); onSeek(cur - 5); }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); onSeek(cur + 5); }
      }}>
      <div className="pbar__track">
        <div className="pbar__buf" style={{ width: `${dur ? (buf / dur) * 100 : 0}%` }} />
        <div className="pbar__fill" style={{ width: `${shown * 100}%` }} />
        <div className="pbar__thumb" style={{ left: `${shown * 100}%` }} />
        {hover !== null && dur > 0 && <div className="pbar__tip" style={{ left: `${hover * 100}%` }}>{clock(hover * dur)}</div>}
      </div>
    </div>
  );
}

/**
 * Player HTML5 dengan kontrol sendiri. Hanya melaporkan keadaan (onState) dan posisi (onProgress);
 * penghitungan kuota dilakukan server melalui watch-session — bukan di sini.
 */
export default function VideoPlayer({ playback, title, subtitle, startAt = 0, onState, onProgress, onEnded, onBack, onNext, overlay }) {
  const wrap = useRef(null);
  const video = useRef(null);
  const hls = useRef(null);
  const last = useRef({ state: null, tap: 0, side: null });
  const idle = useRef(null);
  const [t, setT] = useState({ cur: 0, dur: 0, buf: 0 });
  const [st, setSt] = useState('loading');
  const [hidden, setHidden] = useState(false);
  const [vol, setVol] = useState({ v: 1, muted: false });
  const [menu, setMenu] = useState(null);
  const [subIdx, setSubIdx] = useState(-1);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [fs, setFs] = useState(false);
  const [flash, setFlash] = useState(null);
  const [err, setErr] = useState(null);
  const [needsTap, setNeedsTap] = useState(false);

  // ── sumber video (progresif langsung atau HLS) ──
  useEffect(() => {
    const v = video.current;
    if (!v || !playback) return undefined;
    let cancelled = false;
    setErr(null); setSt('loading'); setLevels([]); setLevel(-1);
    (async () => {
      if (playback.type === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (!Hls.isSupported()) { setErr('Browser ini tidak mendukung pemutaran video HLS.'); return; }
        const h = new Hls({ startPosition: startAt > 5 ? startAt : -1, capLevelToPlayerSize: true });
        hls.current = h;
        h.loadSource(playback.source);
        h.attachMedia(v);
        h.on(Hls.Events.MANIFEST_PARSED, (_, d) => setLevels(d.levels.map((l, i) => ({ i, h: l.height })).filter((l) => l.h)));
        h.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setErr('Video tidak dapat dimuat. Periksa koneksi lalu coba lagi.'); });
      } else {
        v.src = playback.source;
      }
    })();
    return () => { cancelled = true; hls.current?.destroy(); hls.current = null; v.removeAttribute('src'); v.load(); };
  }, [playback?.source, playback?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── subtitle default ──
  useEffect(() => {
    const i = (playback?.subtitles ?? []).findIndex((s) => s.default);
    setSubIdx(i);
  }, [playback]);
  useEffect(() => {
    const tracks = video.current?.textTracks;
    if (!tracks) return;
    [...tracks].forEach((tt, i) => { tt.mode = i === subIdx ? 'showing' : 'disabled'; });
  }, [subIdx, playback]);

  // ── sinkronisasi keadaan ──
  const sync = useCallback(() => {
    const v = video.current;
    if (!v) return;
    const s = v.ended ? 'ended' : v.paused ? 'paused' : v.readyState < 3 ? 'buffering' : 'playing';
    setSt(s);
    if (last.current.state !== s) { last.current.state = s; onState?.(s); }
  }, [onState]);

  const tick = useCallback(() => {
    const v = video.current;
    if (!v) return;
    let buf = 0;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) buf = v.buffered.end(i);
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    setT({ cur: v.currentTime, dur, buf });
    onProgress?.(v.currentTime, dur);
  }, [onProgress]);

  const bump = useCallback(() => {
    setHidden(false);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => { if (video.current && !video.current.paused) { setHidden(true); setMenu(null); } }, 3200);
  }, []);
  useEffect(() => () => clearTimeout(idle.current), []);
  useEffect(() => { if (st === 'paused' || st === 'ended') { setHidden(false); clearTimeout(idle.current); } else if (st === 'playing') bump(); }, [st, bump]);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => setNeedsTap(true)); else v.pause();
  }, []);
  const seek = useCallback((to) => {
    const v = video.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(0, to), v.duration);
    tick();
  }, [tick]);
  const skip = (d, side) => {
    seek((video.current?.currentTime ?? 0) + d);
    setFlash({ side, d, k: Date.now() });
  };
  const toggleFs = useCallback(() => {
    const el = wrap.current;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else video.current?.webkitEnterFullscreen?.();
  }, []);
  useEffect(() => {
    const on = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const onKey = (e) => {
    if (['INPUT', 'SELECT'].includes(e.target.tagName)) return;
    const v = video.current;
    const k = e.key.toLowerCase();
    const acts = {
      ' ': toggle, k: toggle, arrowleft: () => skip(-5, 'l'), arrowright: () => skip(5, 'r'), j: () => skip(-10, 'l'), l: () => skip(10, 'r'),
      arrowup: () => { v.volume = Math.min(1, v.volume + 0.1); }, arrowdown: () => { v.volume = Math.max(0, v.volume - 0.1); },
      m: () => { v.muted = !v.muted; }, f: toggleFs, c: () => setSubIdx((i) => (playback?.subtitles?.length ? (i >= 0 ? -1 : 0) : -1)),
      n: () => onNext?.(),
    };
    if (acts[k]) { e.preventDefault(); acts[k](); bump(); }
  };

  // klik/tap: sentuh ganda di sisi kiri/kanan = mundur/maju 10 dtk; klik tunggal = putar/jeda
  const onSurface = (e) => {
    if (e.target.closest('.player__ctrl, .player__top, .pmenu2, .player__big, .player__overlay')) return;
    if (menu) { setMenu(null); return; }
    const now = Date.now();
    if (e.pointerType === 'touch') {
      const r = wrap.current.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const side = x < 0.35 ? 'l' : x > 0.65 ? 'r' : null;
      if (side && last.current.side === side && now - last.current.tap < 320) { skip(side === 'l' ? -10 : 10, side); last.current.tap = 0; return; }
      last.current = { ...last.current, tap: now, side };
      if (hidden) { bump(); return; }
      setTimeout(() => { if (last.current.tap === now) { toggle(); bump(); } }, 330);
      return;
    }
    toggle(); bump();
  };

  const playing = st === 'playing';
  const busy = st === 'loading' || st === 'buffering';
  const subs = playback?.subtitles ?? [];

  return (
    <div ref={wrap} className={`player${hidden ? ' is-hidden is-idle' : ''}`} tabIndex={0} onKeyDown={onKey}
      onPointerMove={(e) => e.pointerType === 'mouse' && bump()} onPointerUp={onSurface} role="region" aria-label={`Pemutar video: ${title}`}>
      <video ref={video} playsInline preload="auto" crossOrigin="anonymous"
        onLoadedMetadata={() => {
          const v = video.current;
          if (startAt > 5 && !hls.current && v.duration > startAt + 5) v.currentTime = startAt;
          tick();
          v.play().catch(() => setNeedsTap(true));
        }}
        onDurationChange={tick} onTimeUpdate={tick} onProgress={tick} onSeeked={tick}
        onPlay={sync} onPlaying={() => { setNeedsTap(false); sync(); }} onPause={sync} onWaiting={sync} onCanPlay={sync} onStalled={sync}
        onEnded={() => { sync(); onEnded?.(); }}
        onVolumeChange={() => setVol({ v: video.current.volume, muted: video.current.muted })}
        onError={() => !hls.current && setErr('Video tidak dapat diputar.')}>
        {subs.map((s) => <track key={s.src} kind="subtitles" src={s.src} srcLang={s.lang} label={s.label} />)}
      </video>

      <div className="player__shade-t" /><div className="player__shade-b" />
      <div className="player__top">
        {onBack && <button type="button" className="pbtn" aria-label="Kembali" onClick={onBack}><Icon name="arrowL" /></button>}
        <strong>{title}</strong>{subtitle && <span>{subtitle}</span>}
      </div>

      <div className="player__center">
        {(busy && !err) && <span className="spinner player__spinner" role="status" aria-label="Memuat video" />}
        {needsTap && !busy && st !== 'playing' && !err && <button type="button" className="player__big" aria-label="Putar" onClick={toggle}><Icon name="play" /></button>}
      </div>
      {flash && <div key={flash.k} className={`player__flash player__flash--${flash.side}`} aria-hidden="true"><Icon name={flash.d < 0 ? 'back10' : 'fwd10'} />{Math.abs(flash.d)} dtk</div>}

      {err && (
        <div className="player__overlay" role="alert"><div>
          <Icon name="alert" style={{ width: 36, height: 36, color: 'var(--danger)' }} />
          <h2>Video tidak dapat diputar</h2><p>{err}</p>
          <button type="button" className="btn btn--primary" onClick={() => { setErr(null); const v = video.current; v.load(); v.play().catch(() => setNeedsTap(true)); }}><Icon name="refresh" /> Coba lagi</button>
        </div></div>
      )}
      {overlay}

      <div className="player__ctrl" onPointerMove={bump}>
        <Seekbar cur={t.cur} dur={t.dur} buf={t.buf} onSeek={(s) => { seek(s); bump(); }} />
        <div className="player__row">
          <button type="button" className="pbtn" aria-label={playing ? 'Jeda' : 'Putar'} onClick={toggle}><Icon name={playing ? 'pause' : 'play'} /></button>
          <button type="button" className="pbtn" aria-label="Mundur 10 detik" onClick={() => skip(-10, 'l')}><Icon name="back10" /><span className="pbtn__txt">10</span></button>
          <button type="button" className="pbtn" aria-label="Maju 10 detik" onClick={() => skip(10, 'r')}><Icon name="fwd10" /><span className="pbtn__txt">10</span></button>
          <div className="pvol">
            <button type="button" className="pbtn" aria-label={vol.muted || vol.v === 0 ? 'Suarakan' : 'Bisukan'} onClick={() => { video.current.muted = !video.current.muted; }}><Icon name={vol.muted || vol.v === 0 ? 'mute' : 'volume'} /></button>
            <input className="pvol__range" type="range" min="0" max="1" step="0.05" value={vol.muted ? 0 : vol.v} aria-label="Volume"
              onChange={(e) => { video.current.muted = false; video.current.volume = Number(e.target.value); }} />
          </div>
          <span className="ptime">{clock(t.cur)} / {clock(t.dur)}</span>
          <span className="sp" />
          {onNext && <button type="button" className="pbtn" aria-label="Episode berikutnya" onClick={onNext}><Icon name="next" /></button>}
          {subs.length > 0 && <button type="button" className="pbtn" aria-label="Subtitle" aria-haspopup="menu" aria-expanded={menu === 'cc'} aria-pressed={subIdx >= 0} onClick={() => setMenu(menu === 'cc' ? null : 'cc')}><Icon name="cc" /></button>}
          {levels.length > 1 && <button type="button" className="pbtn" aria-label="Kualitas" aria-haspopup="menu" aria-expanded={menu === 'q'} onClick={() => setMenu(menu === 'q' ? null : 'q')}><Icon name="sliders" /></button>}
          <button type="button" className="pbtn" aria-label={fs ? 'Keluar layar penuh' : 'Layar penuh'} onClick={toggleFs}><Icon name={fs ? 'exitfs' : 'fullscreen'} /></button>
        </div>
      </div>

      {menu === 'cc' && (
        <div className="pmenu2" role="menu"><h3>Subtitle</h3>
          <button type="button" role="menuitemradio" aria-checked={subIdx < 0} onClick={() => { setSubIdx(-1); setMenu(null); }}>Mati</button>
          {subs.map((s, i) => <button key={s.src} type="button" role="menuitemradio" aria-checked={subIdx === i} onClick={() => { setSubIdx(i); setMenu(null); }}>{s.label}</button>)}
        </div>
      )}
      {menu === 'q' && (
        <div className="pmenu2" role="menu"><h3>Kualitas</h3>
          <button type="button" role="menuitemradio" aria-checked={level === -1} onClick={() => { hls.current.currentLevel = -1; setLevel(-1); setMenu(null); }}>Otomatis</button>
          {[...levels].sort((a, b) => b.h - a.h).map((l) => <button key={l.i} type="button" role="menuitemradio" aria-checked={level === l.i} onClick={() => { hls.current.currentLevel = l.i; setLevel(l.i); setMenu(null); }}>{l.h}p</button>)}
        </div>
      )}
    </div>
  );
}
