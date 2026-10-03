import { ok } from '../lib/http.js';
import { notFound } from '../lib/errors.js';
import { isValidId } from './models.js';

const meta = (ctx) => ({ provider: ctx.content.provider.id, developmentData: ctx.content.provider.isDevelopmentData });

export const home = async (ctx) => ok({ ...(await ctx.content.home()), meta: meta(ctx) }, { cache: 'public' });

export const list = async (ctx, req) => {
  const { list: l, type, genre, page } = req.query;
  const out = await ctx.content.list({ list: l, type, genre, page });
  return ok({ ...out, meta: meta(ctx) }, { cache: 'public' });
};

export const search = async (ctx, req) =>
  ok({ ...(await ctx.content.search(req.query.q, { page: req.query.page, type: req.query.type })), meta: meta(ctx) }, { cache: 'publicShort' });

export const movie = async (ctx, req) => {
  const m = await ctx.content.movie(req.params.id);
  if (!m) throw notFound('Film');
  return ok({ movie: m, meta: meta(ctx) }, { cache: 'public' });
};

export const series = async (ctx, req) => {
  const s = await ctx.content.series(req.params.id);
  if (!s) throw notFound('Series');
  return ok({ series: s, meta: meta(ctx) }, { cache: 'public' });
};

export const seasons = async (ctx, req) => ok({ seasons: await ctx.content.seasons(req.params.id) }, { cache: 'public' });

export const episodes = async (ctx, req) =>
  ok({ episodes: await ctx.content.episodes(req.params.id, req.params.season) }, { cache: 'public' });

export const episode = async (ctx, req) => {
  const e = await ctx.content.episode(req.params.id);
  if (!e) throw notFound('Episode');
  return ok({ episode: e }, { cache: 'public' });
};

export const recommendations = async (ctx, req) => {
  const basedOn = req.query.basedOn;
  if (basedOn !== undefined && !isValidId(basedOn)) return ok({ items: [] }, { cache: 'public' });
  return ok({ items: await ctx.content.recommendations({ basedOn }) }, { cache: 'public' });
};
