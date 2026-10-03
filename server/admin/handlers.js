import { z } from 'zod';
import { ok, parse } from '../lib/http.js';
import { ApiError, fromDbError, notFound } from '../lib/errors.js';

// Semua handler di file ini hanya dapat dicapai lewat router dengan auth: 'admin'
// (identitas diverifikasi ke Supabase Auth, role dibaca dari database — bukan dari klien).

export const paging = (query, defSize = 20) => {
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), 10_000);
  const size = Math.min(Math.max(parseInt(query.pageSize, 10) || defSize, 1), 50);
  return { page, size, from: (page - 1) * size, to: page * size - 1 };
};

/** Hanya karakter aman untuk filter PostgREST (mencegah injeksi ke operator or()/ilike). */
export const safeSearch = (q) =>
  String(q ?? '').normalize('NFKC').replace(/[^\p{L}\p{N}@._+\- ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);

export const isoDate = (v, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))) return null;
  const d = new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const UUID = z.string().uuid();

const mapUser = (r) => ({
  id: r.id, email: r.email, displayName: r.display_name, avatarUrl: r.avatar_url, role: r.role, isActive: r.is_active,
  createdAt: r.created_at, lastLoginAt: r.last_login_at, lastActivityAt: r.last_activity_at,
});

export const mapAudit = (a) => ({
  id: a.id, createdAt: a.created_at, actorId: a.actor_id, actorEmail: a.actor_email, actorRole: a.actor_role,
  action: a.action, targetType: a.target_type, targetId: a.target_id, targetUserId: a.target_user_id,
  targetLabel: a.target_label, metadata: a.metadata ?? {},
});

const mapHistory = (h) => ({
  id: h.id, userId: h.user_id, email: h.profiles?.email ?? null, displayName: h.profiles?.display_name ?? null,
  contentType: h.content_type, contentId: h.content_id, seriesId: h.series_id, seasonNumber: h.season_number,
  episodeNumber: h.episode_number, title: h.title, episodeTitle: h.episode_title,
  positionSeconds: Number(h.position_seconds), durationSeconds: h.duration_seconds === null ? null : Number(h.duration_seconds),
  percentage: Number(h.percentage), completed: h.completed, lastWatchedAt: h.last_watched_at,
});

export async function overview(ctx) {
  const admin = ctx.db();
  const [stats, audit] = await Promise.all([
    admin.rpc('mdflix_admin_overview'),
    admin.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10),
  ]);
  for (const r of [stats, audit]) if (r.error) throw fromDbError(r.error, 'admin.overview');
  return ok({ stats: stats.data, recentAudit: audit.data.map(mapAudit) });
}

export async function users(ctx, req) {
  const { page, size, from, to } = paging(req.query);
  let q = ctx.db().from('admin_users_v').select('*', { count: 'exact' });
  const s = safeSearch(req.query.q);
  if (s) q = q.or(`email.ilike.*${s}*,display_name.ilike.*${s}*`);
  if (['USER', 'ADMIN'].includes(req.query.role)) q = q.eq('role', req.query.role);
  if (req.query.status === 'active') q = q.eq('is_active', true);
  if (req.query.status === 'inactive') q = q.eq('is_active', false);
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
  if (error) throw fromDbError(error, 'admin.users');
  return ok({ items: data.map(mapUser), total: count ?? 0, page, pageSize: size });
}

export async function userDetail(ctx, req) {
  const id = parse(UUID, req.params.id);
  const admin = ctx.db();
  const [u, hist, aud] = await Promise.all([
    admin.from('admin_users_v').select('*').eq('id', id).maybeSingle(),
    admin.from('watch_history').select('*, profiles(email,display_name)').eq('user_id', id).order('last_watched_at', { ascending: false }).limit(15),
    admin.from('audit_logs').select('*').eq('target_user_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  for (const r of [u, hist, aud]) if (r.error) throw fromDbError(r.error, 'admin.userDetail');
  if (!u.data) throw notFound('Pengguna');
  return ok({ user: mapUser(u.data), history: hist.data.map(mapHistory), audit: aud.data.map(mapAudit) });
}

const PatchUser = z.object({ role: z.enum(['USER', 'ADMIN']).optional(), isActive: z.boolean().optional() })
  .strict().refine((v) => v.role !== undefined || v.isActive !== undefined, 'Tidak ada perubahan.');

export async function patchUser(ctx, req, auth) {
  const id = parse(UUID, req.params.id);
  const b = parse(PatchUser, await req.json());
  const admin = ctx.db();
  const { data, error } = await admin.rpc('mdflix_admin_set_user', {
    p_actor: auth.profile.id, p_user: id, p_role: b.role ?? null, p_is_active: b.isActive ?? null,
  });
  if (error) throw fromDbError(error, 'admin.patchUser');
  if (!data.ok) {
    if (data.code === 'SELF_MODIFICATION') throw new ApiError(422, 'SELF_MODIFICATION', 'Anda tidak dapat mengubah role atau status akun Anda sendiri.');
    if (data.code === 'USER_NOT_FOUND') throw notFound('Pengguna');
    throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses.');
  }
  if (b.isActive !== undefined) {
    // Cabut kemampuan login/refresh di Supabase Auth; API juga sudah menolak akun nonaktif di setiap request.
    admin.auth.admin.updateUserById(id, { ban_duration: b.isActive ? 'none' : '876000h' }).then(() => {}, (e) =>
      console.error(JSON.stringify({ level: 'warn', event: 'auth.ban.failed', message: String(e?.message ?? e).slice(0, 200) })));
  }
  return ok({ updated: true });
}

const DeleteUser = z.object({ confirmEmail: z.string().trim().min(3).max(254) }).strict();

export async function deleteUser(ctx, req, auth) {
  const id = parse(UUID, req.params.id);
  const { confirmEmail } = parse(DeleteUser, await req.json());
  const admin = ctx.db();
  if (id === auth.profile.id) throw new ApiError(422, 'SELF_MODIFICATION', 'Anda tidak dapat menghapus akun Anda sendiri.');
  const { data: target, error } = await admin.from('profiles').select('id,email,role').eq('id', id).maybeSingle();
  if (error) throw fromDbError(error, 'admin.deleteUser.find');
  if (!target) throw notFound('Pengguna');
  if (target.role === 'ADMIN') throw new ApiError(422, 'ADMIN_TARGET', 'Turunkan role admin menjadi USER sebelum menghapus akun.');
  if ((target.email ?? '').toLowerCase() !== confirmEmail.toLowerCase()) {
    throw new ApiError(422, 'CONFIRMATION_MISMATCH', 'Email konfirmasi tidak cocok.');
  }
  await ctx.audit({ actor: auth.profile.id, action: 'USER_DELETED', targetType: 'user', targetId: id, targetUser: id, metadata: { email: target.email } }, { strict: true });
  const { error: derr } = await admin.auth.admin.deleteUser(id);
  if (derr) {
    await ctx.audit({ actor: auth.profile.id, action: 'USER_DELETE_FAILED', targetType: 'user', targetId: id, targetUser: id, metadata: { email: target.email } });
    throw new ApiError(502, 'AUTH_PROVIDER_ERROR', 'Gagal menghapus akun. Coba lagi.');
  }
  return ok({ deleted: true });
}

export async function watching(ctx) {
  const { data, error } = await ctx.db().from('admin_watching_v').select('*').order('started_at', { ascending: false }).limit(200);
  if (error) throw fromDbError(error, 'admin.watching');
  return ok({
    items: data.map((r) => ({
      sessionId: r.id, userId: r.user_id, email: r.email, displayName: r.display_name,
      contentType: r.content_type, contentId: r.content_id, seriesId: r.series_id, seasonNumber: r.season_number,
      episodeNumber: r.episode_number, title: r.title, episodeTitle: r.episode_title,
      state: r.last_state, startedAt: r.started_at, lastHeartbeatAt: r.last_heartbeat_at,
      watchedSeconds: Number(r.accumulated_seconds), elapsedSeconds: Math.round(Number(r.elapsed_seconds)),
      positionSeconds: Number(r.last_position), durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
    })),
    generatedAt: ctx.now().toISOString(),
  }, { cache: 'none' });
}

export async function history(ctx, req) {
  const { page, size, from, to } = paging(req.query);
  let q = ctx.db().from('watch_history').select('*, profiles(email,display_name)', { count: 'exact' });
  const s = safeSearch(req.query.q);
  if (s) q = q.ilike('title', `%${s}%`);
  if (UUID.safeParse(req.query.userId).success) q = q.eq('user_id', req.query.userId);
  const { data, error, count } = await q.order('last_watched_at', { ascending: false }).range(from, to);
  if (error) throw fromDbError(error, 'admin.history');
  return ok({ items: data.map(mapHistory), total: count ?? 0, page, pageSize: size });
}

export async function auditLogs(ctx, req) {
  const { page, size, from, to } = paging(req.query, 25);
  let q = ctx.db().from('audit_logs').select('*', { count: 'exact' });
  if (/^[A-Z][A-Z0-9_]{2,63}$/.test(req.query.action ?? '')) q = q.eq('action', req.query.action);
  const s = safeSearch(req.query.q);
  if (s) q = q.or(`actor_email.ilike.*${s}*,target_label.ilike.*${s}*`);
  const gte = isoDate(req.query.from);
  const lte = isoDate(req.query.to, true);
  if (gte) q = q.gte('created_at', gte);
  if (lte) q = q.lte('created_at', lte);
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
  if (error) throw fromDbError(error, 'admin.audit');
  return ok({ items: data.map(mapAudit), total: count ?? 0, page, pageSize: size });
}
