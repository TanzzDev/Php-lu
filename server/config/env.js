// Pembacaan environment variable — satu-satunya tempat process.env dibaca.
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET SENGAJA tidak dibaca di sini: keduanya
// dikonfigurasi di dashboard Supabase (Auth → Providers → Google), bukan di aplikasi.

const clean = (v) => {
  const t = String(v ?? '').trim();
  return t === '' ? undefined : t;
};
const stripSlash = (v) => (v ? v.replace(/\/+$/, '') : v);

export function loadEnv(source = process.env) {
  const vercelEnv = clean(source.VERCEL_ENV);
  const isProd = vercelEnv ? vercelEnv === 'production' : source.NODE_ENV === 'production';
  const vercelUrl = clean(source.VERCEL_URL);

  return Object.freeze({
    isProd,
    siteUrl: stripSlash(clean(source.SITE_URL) ?? (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000')),
    // Info non-rahasia bawaan Vercel (bukan yang kita set) — dipakai /api/health untuk
    // memverifikasi commit apa yang sungguh-sungguh live, tanpa buka dashboard.
    deploy: Object.freeze({
      commit: clean(source.VERCEL_GIT_COMMIT_SHA)?.slice(0, 7) ?? null,
      env: vercelEnv ?? 'local',
    }),
    supabase: Object.freeze({
      url: stripSlash(clean(source.SUPABASE_URL)),
      publishableKey: clean(source.SUPABASE_PUBLISHABLE_KEY),
      secretKey: clean(source.SUPABASE_SECRET_KEY),
    }),
    content: Object.freeze({
      baseUrl: stripSlash(clean(source.CONTENT_API_BASE_URL)),
      // 'legacy' = tata letak endpoint API yang sudah dipakai proyek sebelumnya (default);
      // 'native' = kontrak internal MDFlix (untuk Content API baru).
      dialect: (clean(source.CONTENT_API_DIALECT) ?? 'legacy').toLowerCase(),
    }),
  });
}

/** Nilai rahasia yang tidak boleh muncul di log/respons. */
export function secretValues(env) {
  return [env.supabase?.secretKey].filter(
    (v) => typeof v === 'string' && v.length >= 8,
  );
}

export function redact(text, env) {
  let out = String(text ?? '');
  for (const secret of secretValues(env)) out = out.split(secret).join('[REDACTED]');
  return out
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]')
    .replace(/(apikey["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]');
}
