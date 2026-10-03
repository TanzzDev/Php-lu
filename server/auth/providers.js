// Status provider login (mis. Google) dari endpoint publik Supabase Auth: GET {SUPABASE_URL}/auth/v1/settings.
//
// Kenapa ada: kalau provider Google belum diaktifkan di Supabase, tombol "Lanjutkan dengan Google"
// akan membawa pengguna ke halaman JSON mentah milik Supabase. Dengan status ini, UI bisa
// menjelaskan kondisinya alih-alih membuang pengguna ke halaman error.
//
// Hasil true/false hanya dipakai bila Supabase benar-benar menjawab; kegagalan jaringan, timeout,
// atau bentuk respons tak dikenal = null ("tidak diketahui") dan UI berperilaku seperti biasa.
export function createProviderProbe({ env, fetchImpl = fetch, ttlMs = 5 * 60_000, unknownTtlMs = 30_000, timeoutMs = 3000 }) {
  let cached = null;
  let exp = 0;
  return async function probe() {
    const { url, publishableKey } = env.supabase;
    if (!url || !publishableKey) return { google: null };
    if (cached && exp > Date.now()) return cached;

    let result = { google: null };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey }, signal: ctrl.signal });
      if (res.ok) {
        const flag = (await res.json())?.external?.google;
        if (typeof flag === 'boolean') result = { google: flag };
      }
    } catch { /* tidak diketahui */ } finally { clearTimeout(timer); }

    cached = result;
    exp = Date.now() + (result.google === null ? unknownTtlMs : ttlMs);
    return result;
  };
}
