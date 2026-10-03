import { z } from 'zod';
import { ok, parse } from '../lib/http.js';
import { ApiError, fromDbError } from '../lib/errors.js';

// MDFlix 100% gratis: satu-satunya pengaturan yang tersisa adalah info dukungan & branding.
// Tidak ada lagi kunci 'pricing'/'free'/'payment' — lihat mdflix_validate_setting (0007).
const SETTINGS = {
  support: z.object({ email: z.string().email().max(120), phone: z.string().trim().min(6).max(32) }).strict(),
  branding: z.object({ name: z.string().trim().min(1).max(40), tagline: z.string().trim().max(140) }).strict(),
};

export async function getSettings(ctx) {
  ctx.settings.invalidate();
  return ok({ settings: await ctx.settings.get() });
}

export async function putSettings(ctx, req, auth) {
  const body = parse(z.object({ key: z.enum(['support', 'branding']), value: z.unknown() }).strict(), await req.json());
  const value = parse(SETTINGS[body.key], body.value);
  const { data, error } = await ctx.db().rpc('mdflix_admin_set_setting', { p_actor: auth.profile.id, p_key: body.key, p_value: value });
  if (error) throw fromDbError(error, 'admin.settings');
  if (!data.ok) throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses.');
  ctx.settings.invalidate();
  return ok({ settings: await ctx.settings.get() });
}
