import { loadEnv } from './config/env.js';
import { createAdminClient, createUserClient } from './lib/supabase.js';
import { createRateLimiter } from './lib/rate-limit.js';
import { ApiError, fromDbError } from './lib/errors.js';
import { createSettingsStore } from './config/settings.js';
import { createContentService, selectProvider } from './content/service.js';

/**
 * Semua dependensi dirangkai di satu tempat (dan bisa diganti saat pengujian):
 * env, klien Supabase, provider konten, jam, pembatas laju.
 */
export function buildContext(overrides = {}) {
  const env = overrides.env ?? loadEnv();
  const admin = overrides.admin !== undefined ? overrides.admin : createAdminClient(env);
  const limiter = overrides.limiter ?? createRateLimiter();

  const ctx = {
    env,
    now: overrides.now ?? (() => new Date()),
    content: overrides.content ?? createContentService({ provider: selectProvider(env) }),

    /** Klien service-role (melewati RLS) — hanya server. */
    db() {
      if (!admin) throw new ApiError(503, 'NOT_CONFIGURED', 'Layanan belum dikonfigurasi. Hubungi dukungan MDFlix.');
      return admin;
    },
    /** Klien atas nama user (RLS berlaku). */
    userDb: (token) => (overrides.userDb ? overrides.userDb(token) : createUserClient(env, token)),

    limit: (key, opts) => limiter.check(key, opts),

    async audit(evt, { strict = false } = {}) {
      try {
        const { error } = await ctx.db().rpc('_mdflix_audit', {
          p_actor: evt.actor ?? null,
          p_action: evt.action,
          p_target_type: evt.targetType ?? null,
          p_target_id: evt.targetId === undefined || evt.targetId === null ? null : String(evt.targetId),
          p_target_user: evt.targetUser ?? null,
          p_transaction: evt.transaction ?? null,
          p_metadata: evt.metadata ?? {},
        });
        if (error) throw fromDbError(error, 'audit');
      } catch (err) {
        if (strict) throw err;
        console.error(JSON.stringify({ level: 'warn', event: 'audit.failed', action: evt.action }));
      }
    },
  };
  ctx.settings = overrides.settings ?? createSettingsStore(() => admin);
  return ctx;
}
