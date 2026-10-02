import { randomUUID } from 'node:crypto';
import { wrapRequest, send, sendError } from './lib/http.js';
import { ApiError } from './lib/errors.js';
import { buildContext } from './context.js';
import { authenticate, requireAdmin } from './auth/index.js';
import * as pub from './public.js';
import * as content from './content/handlers.js';
import * as authH from './auth/handlers.js';
import * as watch from './watch/handlers.js';
import * as history from './history/handlers.js';
import * as myList from './my-list/handlers.js';
import * as admin from './admin/handlers.js';
import * as settings from './admin/settings.js';

// auth: 'none' | 'user' | 'admin'.  Rute yang lebih spesifik harus ditulis lebih dulu.
const ROUTES = [
  ['GET',    '/health',                                   'none',  pub.health],
  ['GET',    '/config/public',                            'none',  pub.publicConfig],

  ['GET',    '/catalog/home',                             'none',  content.home],
  ['GET',    '/movies',                                   'none',  content.list],
  ['GET',    '/movies/search',                            'none',  content.search],
  ['GET',    '/movies/:id',                               'none',  content.movie],
  ['GET',    '/movies/:id/stream',                        'user',  (c, r, a) => watch.stream(c, r, a, 'movie')],
  ['GET',    '/series/:id',                               'none',  content.series],
  ['GET',    '/series/:id/seasons',                       'none',  content.seasons],
  ['GET',    '/series/:id/seasons/:season/episodes',      'none',  content.episodes],
  ['GET',    '/episodes/:id',                             'none',  content.episode],
  ['GET',    '/episodes/:id/stream',                      'user',  (c, r, a) => watch.stream(c, r, a, 'episode')],
  ['GET',    '/recommendations',                          'none',  content.recommendations],

  ['GET',    '/auth/me',                                  'user',  authH.me],
  ['POST',   '/auth/sync',                                'user',  authH.sync],
  ['PATCH',  '/auth/profile',                             'user',  authH.updateProfile],

  ['POST',   '/watch/start',                              'user',  watch.start],
  ['POST',   '/watch/heartbeat',                          'user',  watch.heartbeat],
  ['POST',   '/watch/end',                                'user',  watch.end],

  ['GET',    '/history',                                  'user',  history.list],
  ['GET',    '/history/continue',                         'user',  history.continueWatching],
  ['GET',    '/history/progress',                         'user',  history.progress],
  ['DELETE', '/history/:id',                              'user',  history.remove],
  ['DELETE', '/history',                                  'user',  history.clear],

  ['GET',    '/my-list',                                  'user',  myList.list],
  ['GET',    '/my-list/ids',                              'user',  myList.ids],
  ['POST',   '/my-list',                                  'user',  myList.add],
  ['DELETE', '/my-list/:type/:id',                        'user',  myList.remove],

  ['GET',    '/admin/overview',                           'admin', admin.overview],
  ['GET',    '/admin/users',                              'admin', admin.users],
  ['GET',    '/admin/users/:id',                          'admin', admin.userDetail],
  ['PATCH',  '/admin/users/:id',                          'admin', admin.patchUser],
  ['DELETE', '/admin/users/:id',                          'admin', admin.deleteUser],
  ['GET',    '/admin/watching',                           'admin', admin.watching],
  ['GET',    '/admin/history',                            'admin', admin.history],
  ['GET',    '/admin/audit-logs',                         'admin', admin.auditLogs],
  ['GET',    '/admin/settings',                           'admin', settings.getSettings],
  ['PUT',    '/admin/settings',                           'admin', settings.putSettings],
].map(([method, pattern, auth, handler]) => {
  const names = [];
  const rx = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
  return { method, pattern, auth, handler, rx, names };
});

function match(method, path) {
  let pathMatched = false;
  for (const r of ROUTES) {
    const m = r.rx.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = {};
    r.names.forEach((n, i) => { try { params[n] = decodeURIComponent(m[i + 1]); } catch { params[n] = ''; } });
    return { route: r, params };
  }
  return { route: null, pathMatched };
}

export async function dispatch(ctx, req) {
  ctx.limit(`ip:${req.ip}`, { limit: 600 }); // batas kasar per IP (best-effort)
  const { route, params, pathMatched } = match(req.method, req.path);
  if (!route) {
    if (pathMatched) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Metode tidak diizinkan.');
    throw new ApiError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
  }
  req.params = params;

  let auth = null;
  if (route.auth !== 'none') {
    auth = await authenticate(ctx, req);
    ctx.limit(`user:${auth.profile.id}`, { limit: 600 });
    if (route.auth === 'admin') await requireAdmin(ctx, auth, req);
  }
  return route.handler(ctx, req, auth);
}

/** Handler siap-Vercel: (req, res) bergaya Node. Konteks dibuat sekali per instance. */
export function createHandler(overrides = {}) {
  let ctx;
  return async function handler(req, res) {
    const requestId = randomUUID();
    try {
      ctx ??= buildContext(overrides);
      const result = await dispatch(ctx, wrapRequest(req, requestId));
      send(res, result, requestId);
    } catch (err) {
      sendError(res, err, requestId, ctx?.env);
    }
  };
}

export const handleRequest = createHandler();
