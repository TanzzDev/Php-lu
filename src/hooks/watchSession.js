import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, getCurrentToken } from '../lib/api.js';

/**
 * Sesi menonton yang diautoritasi SERVER.
 * Klien hanya melaporkan KEADAAN (playing/paused/buffering/ended) dan posisi.
 * Tidak ada detik atau timestamp yang dikirim — waktu dihitung server dari jamnya sendiri.
 *
 * Sesi dipakai untuk progres/Continue Watching, riwayat, dan monitoring admin, serta
 * menjaga satu pemutaran aktif per akun. TIDAK ADA kuota atau timer yang membatasi menonton.
 */
export function useWatchSession({ kind, contentId }) {
  const [phase, setPhase] = useState('starting'); // starting | ready | moved | stale | error
  const [playback, setPlayback] = useState(null);
  const [resume, setResume] = useState(null);
  const [error, setError] = useState(null);
  const S = useRef({ id: null, seq: 0, state: 'paused', pos: 0, dur: 0, timer: null, hb: 15, gen: 0 });

  const stopTimer = () => { clearInterval(S.current.timer); S.current.timer = null; };

  const beat = useCallback(async ({ final = false } = {}) => {
    const c = S.current;
    const sid = c.id;
    if (!sid) return null;
    const body = { sessionId: sid, seq: ++c.seq, state: c.state };
    if (Number.isFinite(c.pos)) body.position = Math.max(0, Math.min(c.pos, 172_800));
    if (Number.isFinite(c.dur) && c.dur > 0) body.duration = Math.min(c.dur, 172_800);
    if (final) { c.id = null; stopTimer(); }
    try {
      return await api(final ? '/watch/end' : '/watch/heartbeat', {
        method: 'POST', body, ...(final ? { keepalive: true, token: getCurrentToken() } : {}),
      });
    } catch (e) {
      if (final || !(e instanceof ApiError) || S.current.id !== sid) return null; // gangguan jaringan/429: abaikan, coba lagi di heartbeat berikut
      if (e.status === 409 || e.status === 404) {
        S.current.id = null; stopTimer();
        setPhase(e.details?.reason === 'SUPERSEDED' ? 'moved' : 'stale');
      }
      return null;
    }
  }, []);

  const start = useCallback(async () => {
    const gen = ++S.current.gen;
    stopTimer();
    S.current.id = null;
    setPhase('starting'); setError(null); setPlayback(null);
    let sid = null;
    try {
      const r = await api('/watch/start', { method: 'POST', body: { contentType: kind, contentId } });
      sid = r.sessionId;
      if (gen !== S.current.gen) { api('/watch/end', { method: 'POST', body: { sessionId: sid, seq: 1, state: 'paused' } }).catch(() => {}); return; }
      Object.assign(S.current, { id: sid, seq: 0, hb: r.heartbeatSeconds || 15, state: 'paused', pos: 0, dur: 0 });
      setResume(r.resume);
      const pb = await api(`/${kind === 'movie' ? 'movies' : 'episodes'}/${encodeURIComponent(contentId)}/stream`, { query: { session: sid } });
      if (gen !== S.current.gen) return;
      setPlayback(pb.playback);
      S.current.timer = setInterval(() => beat(), S.current.hb * 1000);
      setPhase('ready');
    } catch (e) {
      if (gen !== S.current.gen) return;
      if (S.current.id) { const id = S.current.id; S.current.id = null; api('/watch/end', { method: 'POST', body: { sessionId: id, seq: 1, state: 'paused' } }).catch(() => {}); }
      setError(e); setPhase('error');
    }
  }, [kind, contentId, beat]);

  useEffect(() => {
    start();
    const onHide = () => { if (S.current.id) beat({ final: true }); };
    const onVis = () => { if (document.visibilityState === 'hidden' && S.current.id) beat(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
      S.current.gen += 1;               // batalkan start yang sedang berjalan
      if (S.current.id) beat({ final: true }); // menutup player mengakhiri sesi
      stopTimer();
    };
  }, [start, beat]);

  /** Dipanggil player saat keadaan berubah: kirim heartbeat segera. */
  const report = useCallback((state) => {
    const c = S.current;
    if (c.state === state) return;
    c.state = state;
    if (c.id) beat();
  }, [beat]);
  const progress = useCallback((pos, dur) => { S.current.pos = pos; S.current.dur = dur; }, []);

  return { phase, playback, resume, error, restart: start, report, progress };
}
