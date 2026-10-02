import { ok } from './lib/http.js';

export const health = async (ctx) => ok({ ok: true, deploy: ctx.env.deploy }, { cache: 'none' });

/** Konfigurasi yang aman dilihat publik. Hanya PUBLISHABLE key — secret key tidak pernah lewat sini. */
export async function publicConfig(ctx) {
  const s = await ctx.settings.get();
  const { url, publishableKey } = ctx.env.supabase;
  return ok({
    brand: s.branding,
    support: s.support,
    auth: { supabaseUrl: url ?? null, publishableKey: publishableKey ?? null, configured: Boolean(url && publishableKey) },
    content: {
      provider: ctx.content.provider.id,
      developmentData: ctx.content.provider.isDevelopmentData,
      available: ctx.content.provider.available,
    },
    siteUrl: ctx.env.siteUrl,
  }, { cache: 'publicShort' });
}
