import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';

/**
 * Pemutar untuk sumber bertipe `embed` (halaman pemutar pihak ketiga di dalam iframe), dibawa dari
 * aplikasi original. Memakai kerangka `.player` yang sama dengan VideoPlayer agar tampilan Gen 2 tetap.
 *
 * Embed lintas-origin tidak membuka status putar/posisi ke halaman kita, jadi `onState` hanya melaporkan
 * KEHADIRAN: "playing" selama server sudah termuat dan tab terlihat, "paused" selain itu. Posisi dan
 * durasi tidak diketahui — karena itu tidak ada "lanjutkan dari menit ke-N" untuk sumber embed.
 */

// Izin sandbox seminimal mungkin — hanya yang dibutuhkan pemutar:
//   allow-scripts + allow-same-origin : hampir semua pemutar butuh JS dan akses resource origin-nya sendiri
//   allow-presentation, allow-orientation-lock : casting & kunci landscape saat layar penuh di HP
// SENGAJA tidak diberikan (ini yang memblokir iklan popup/pengalihan): allow-popups, allow-top-navigation,
// allow-forms, allow-modals.
export const STRICT_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-orientation-lock';

// Beberapa provider menolak diputar bila iframe masih punya atribut sandbox sama sekali ("This content
// can't be embedded in a sandboxed frame"). Atribut itu hanya dilepas untuk server yang dikenal butuh itu,
// dicocokkan lewat NAMA server (domain CDN mereka sering berganti), atau bila pengguna mengaktifkan manual.
export const COMPAT_SERVER_NAMES = ['2embed', 'superembed', 'vidsrc', 'vidlink'];
export const needsCompatSandbox = (name) => {
  const n = String(name ?? '').toLowerCase();
  return COMPAT_SERVER_NAMES.some((c) => n.includes(c));
};

export const LOAD_TIMEOUT_MS = 15_000;

export default function EmbedPlayer({ playback, title, onState, overlay }) {
  const servers = useMemo(
    () => (playback.servers?.length ? playback.servers : [{ name: 'Server 1', url: playback.source }]),
    [playback],
  );
  const [idx, setIdx] = useState(() => Math.max(0, servers.findIndex((s) => s.url === playback.source)));
  const [manualCompat, setManualCompat] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [loadedKey, setLoadedKey] = useState(null);
  const [failedKey, setFailedKey] = useState(null);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

  const server = servers[idx] ?? servers[0];
  const auto = needsCompatSandbox(server.name);
  const relaxed = manualCompat || auto;
  // Setiap perubahan server / mode / muat ulang memasang iframe BARU (atribut sandbox tidak berlaku
  // pada dokumen yang sudah termuat).
  const frameKey = `${server.url}|${relaxed ? 'compat' : 'strict'}|${reloads}`;
  const phase = loadedKey === frameKey ? 'ready' : failedKey === frameKey ? 'failed' : 'loading';

  // Status dihitung dari frameKey, bukan di-reset lewat effect: event "load" yang datang lebih cepat
  // dari effect tidak bisa tertimpa menjadi "loading" lalu "gagal".
  useEffect(() => {
    const t = setTimeout(() => setFailedKey(frameKey), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [frameKey]);

  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const report = useRef(onState);
  useEffect(() => { report.current = onState; });
  useEffect(() => { report.current?.(phase === 'ready' && visible ? 'playing' : 'paused'); }, [phase, visible]);

  const reload = () => setReloads((n) => n + 1);

  return (
    <>
      <div className="player player--embed" role="region" aria-label={`Pemutar video: ${title}`}>
        <iframe
          key={frameKey}
          className="player__frame"
          title={`Pemutar ${title} — ${server.name}`}
          src={server.url}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          sandbox={relaxed ? undefined : STRICT_SANDBOX}
          referrerPolicy={relaxed ? undefined : 'no-referrer'}
          onLoad={() => setLoadedKey(frameKey)}
        />
        {phase === 'loading' && !overlay && (
          <div className="player__center"><span className="spinner player__spinner" role="status" aria-label="Memuat server" /></div>
        )}
        {phase === 'failed' && !overlay && (
          <div className="player__overlay" role="alert">
            <div>
              <Icon name="alert" style={{ width: 36, height: 36, color: 'var(--danger)' }} />
              <h2>Server tidak merespons</h2>
              <p>Pilih server lain di bawah pemutar, atau muat ulang server ini.</p>
              <button type="button" className="btn btn--primary" onClick={reload}><Icon name="refresh" /> Muat ulang</button>
            </div>
          </div>
        )}
        {overlay}
      </div>

      <div className="embed-bar">
        {servers.length > 1 && (
          <div className="embed-bar__servers" role="group" aria-label="Pilih server">
            <span className="embed-bar__label">Server</span>
            {servers.map((s, i) => (
              <button key={s.url} type="button" className="chip" aria-pressed={i === idx} onClick={() => setIdx(i)}>{s.name}</button>
            ))}
          </div>
        )}
        {!auto && (
          <button type="button" className="btn btn--subtle btn--sm" aria-pressed={manualCompat} onClick={() => setManualCompat((v) => !v)}>
            {manualCompat ? 'Matikan mode kompatibel' : 'Video tidak mau diputar? Coba mode kompatibel'}
          </button>
        )}
        {relaxed && (
          <p className="embed-bar__note">
            {auto
              ? 'Server ini hanya bisa diputar dalam mode kompatibel, jadi iklan popup atau pengalihan halaman mungkin muncul.'
              : 'Mode kompatibel melonggarkan pembatasan pemutar, jadi iklan popup atau pengalihan halaman mungkin muncul.'}
          </p>
        )}
      </div>
    </>
  );
}
