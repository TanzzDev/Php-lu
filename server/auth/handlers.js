import { z } from 'zod';
import { ok, parse } from '../lib/http.js';
import { fromDbError } from '../lib/errors.js';
import { cleanName, cleanAvatar } from './index.js';

const meBody = async (_ctx, auth) => ({
  user: {
    id: auth.profile.id,
    email: auth.profile.email,
    displayName: auth.profile.display_name,
    avatarUrl: auth.profile.avatar_url,
    role: auth.profile.role,
    createdAt: auth.profile.created_at,
    lastLoginAt: auth.profile.last_login_at,
  },
});

export async function me(ctx, req, auth) {
  return ok(await meBody(ctx, auth));
}

/**
 * Dipanggil setelah login (email/password maupun Google) untuk menyinkronkan profil.
 * Profil dibuat oleh trigger database; endpoint ini menutup celah bila trigger belum
 * terpasang, mengisi nama/avatar yang masih kosong dari metadata provider, dan
 * mencatat ADMIN_LOGIN (maks. sekali per 30 menit).
 */
export async function sync(ctx, req, auth) {
  const admin = ctx.db();
  const meta = auth.user.user_metadata ?? {};
  const patch = { last_login_at: ctx.now().toISOString() };
  if (!auth.profile.display_name) patch.display_name = cleanName(meta.full_name ?? meta.name ?? String(auth.user.email ?? '').split('@')[0]);
  if (!auth.profile.avatar_url) patch.avatar_url = cleanAvatar(meta.avatar_url ?? meta.picture);
  const { data, error } = await admin.from('profiles').update(patch).eq('id', auth.profile.id).select('id,email,display_name,avatar_url,role,is_active,created_at,last_login_at').single();
  if (error) throw fromDbError(error, 'auth.sync');
  auth.profile = data;

  if (data.role === 'ADMIN') {
    const since = new Date(ctx.now().getTime() - 30 * 60_000).toISOString();
    const { count } = await admin.from('audit_logs').select('id', { count: 'exact', head: true })
      .eq('actor_id', data.id).eq('action', 'ADMIN_LOGIN').gte('created_at', since);
    if (!count) await ctx.audit({ actor: data.id, action: 'ADMIN_LOGIN', targetType: 'user', targetId: data.id, targetUser: data.id, metadata: { ip: req.ip } });
  }
  return ok(await meBody(ctx, auth));
}

const ProfileBody = z.object({ displayName: z.string().trim().min(1, 'Nama tidak boleh kosong').max(80) }).strict();

/** Ubah nama tampilan lewat klien atas nama user, sehingga RLS + GRANT kolom ikut menjaga. */
export async function updateProfile(ctx, req, auth) {
  const body = parse(ProfileBody, await req.json());
  const name = cleanName(body.displayName);
  const { error } = await ctx.userDb(auth.token).from('profiles').update({ display_name: name }).eq('id', auth.profile.id);
  if (error) throw fromDbError(error, 'auth.profile.update');
  auth.profile = { ...auth.profile, display_name: name };
  return ok(await meBody(ctx, auth));
}
