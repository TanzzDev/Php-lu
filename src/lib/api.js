// Klien API tunggal. Semua request ke server MDFlix lewat sini (tidak ada pemanggilan URL provider di frontend).
let tokenGetter = async () => null;
let currentToken = null;

export const setTokenGetter = (fn) => { tokenGetter = fn; };
export const setCurrentToken = (t) => { currentToken = t; };
/** Token sinkron — untuk request keepalive saat halaman ditutup. */
export const getCurrentToken = () => currentToken;

export class ApiError extends Error {
  constructor(status, code, message, details, requestId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export async function api(path, { method = 'GET', body, query, auth = true, signal, keepalive, token } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = token ?? (await tokenGetter());
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal, keepalive });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respons kosong */ }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Terjadi kesalahan. Coba lagi.', data?.error?.details, data?.requestId);
  }
  return data;
}

/** Pesan aman untuk ditampilkan ke pengguna. */
export const errorMessage = (err) =>
  err instanceof ApiError ? err.message : 'Terjadi kesalahan. Coba lagi.';
