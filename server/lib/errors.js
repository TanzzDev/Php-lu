export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Data') => new ApiError(404, 'NOT_FOUND', `${what} tidak ditemukan.`);
export const unauthenticated = (msg = 'Silakan masuk terlebih dahulu.') => new ApiError(401, 'UNAUTHENTICATED', msg);
export const forbidden = (msg = 'Anda tidak memiliki akses.') => new ApiError(403, 'FORBIDDEN', msg);

/** Terjemahkan error Supabase/PostgREST menjadi ApiError tanpa membocorkan detail internal. */
export function fromDbError(error, ctxLabel = 'db') {
  const code = error?.code;
  if (code === '22023' || code === '22P02' || code === '23514') {
    return new ApiError(422, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid.');
  }
  if (code === '23505') return new ApiError(409, 'CONFLICT', 'Data sudah ada.');
  if (code === '42501') return new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses.');
  const err = new ApiError(503, 'DATABASE_ERROR', 'Layanan sedang bermasalah. Coba lagi beberapa saat.');
  err.internal = `${ctxLabel}: ${error?.code ?? ''} ${error?.message ?? ''}`.trim();
  return err;
}
