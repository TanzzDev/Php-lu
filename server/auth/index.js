import { ApiError, unauthenticated, forbidden, fromDbError } from '../lib/errors.js';

const PROFILE_COLS = 'id,email,display_name,avatar_url,role,is_active,created_at,last_login_at';

export function bearerToken(headers) {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(headers.authorization ?? '');
  return m ? m[1] : null;
}

export const cleanName = (v) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return s || null;
};
export const cleanAvatar = (v) => {
  const s = String(v ?? '').trim();
  return /^https:\/\//i.test(s) && s.length <= 500 ? s : null;
};

const lastTouch = new Map();
function touchActivity(admin, userId) {
  const now = Date.now();
  if ((lastTouch.get(userId) ?? 0) > now - 5 * 60_000) return;
  if (lastTouch.size > 5000) lastTouch.clear();
  lastTouch.set(userId, now);
  admin.from('profiles').update({ last_activity_at: new Date(now).toISOString() }).eq('id', userId).then(() => {}, () => {});
}

/** Buat baris profil bila trigger database belum/tidak jalan (idempotent). */
export async function ensureProfile(admin, user) {
  const meta = user.user_metadata ?? {};
  const row = {
    id: user.id,
    email: user.email ?? null,
    display_name: cleanName(meta.full_name ?? meta.name ?? String(user.email ?? '').split('@')[0]),
    avatar_url: cleanAvatar(meta.avatar_url ?? meta.picture),
  };
  const { error } = await admin.from('profiles').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw fromDbError(error, 'ensureProfile');
  const { data, error: e2 } = await admin.from('profiles').select(PROFILE_COLS).eq('id', user.id).maybeSingle();
  if (e2 || !data) throw fromDbError(e2 ?? { message: 'profile missing' }, 'ensureProfile.read');
  return data;
}

/**
 * Verifikasi identitas SERVER-SIDE: token divalidasi ke Supabase Auth, lalu role &
 * status akun dibaca dari database. Tidak ada yang dipercaya dari klien.
 */
export async function authenticate(ctx, req) {
  const admin = ctx.db();
  const token = bearerToken(req.headers);
  if (!token) throw unauthenticated();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError(401, 'INVALID_SESSION', 'Sesi tidak valid atau sudah berakhir. Silakan masuk lagi.');
  }
  const { data: found, error: perr } = await admin.from('profiles').select(PROFILE_COLS).eq('id', data.user.id).maybeSingle();
  if (perr) throw fromDbError(perr, 'authenticate.profile');
  const profile = found ?? (await ensureProfile(admin, data.user));
  if (!profile.is_active) throw new ApiError(403, 'ACCOUNT_DISABLED', 'Akun ini dinonaktifkan. Hubungi dukungan MDFlix.');
  touchActivity(admin, profile.id);
  return { user: data.user, profile, token };
}

const deniedLog = new Map();
export async function requireAdmin(ctx, auth, req) {
  if (auth.profile.role === 'ADMIN') return;
  const now = Date.now();
  if ((deniedLog.get(auth.profile.id) ?? 0) < now - 60_000) {
    deniedLog.set(auth.profile.id, now);
    await ctx.audit({ actor: auth.profile.id, action: 'ADMIN_ACCESS_DENIED', targetType: 'route', targetId: req.path, metadata: { method: req.method } });
  }
  throw forbidden('Hanya admin yang dapat mengakses halaman ini.');
}
