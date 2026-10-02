/**
 * Cache TTL in-memory dengan de-duplikasi request yang sedang berjalan dan
 * "stale-if-error" (data lama tetap disajikan jika provider sedang gagal).
 * Dipakai HANYA untuk data katalog yang sama untuk semua orang — tidak pernah
 * untuk data spesifik user. (Pola cache 1 jam dari aplikasi lama, diperluas.)
 */
export function createTtlCache({ max = 600 } = {}) {
  const store = new Map();
  const inflight = new Map();

  function put(key, value, ttlMs, staleMs) {
    const now = Date.now();
    store.delete(key);
    store.set(key, { value, exp: now + ttlMs, staleExp: now + ttlMs + staleMs });
    while (store.size > max) store.delete(store.keys().next().value);
  }

  return {
    async wrap(key, ttlMs, loader, { staleMs = 10 * 60_000 } = {}) {
      const hit = store.get(key);
      if (hit && hit.exp > Date.now()) return hit.value;
      if (inflight.has(key)) return inflight.get(key);
      const p = (async () => {
        try {
          const value = await loader();
          if (value !== undefined) put(key, value, ttlMs, staleMs);
          return value;
        } catch (err) {
          if (hit && hit.staleExp > Date.now()) return hit.value;
          throw err;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    },
    clear() { store.clear(); inflight.clear(); },
    get size() { return store.size; },
  };
}
