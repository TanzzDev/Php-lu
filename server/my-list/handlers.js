import { z } from 'zod';
import { ok, parse } from '../lib/http.js';
import { ApiError, fromDbError, notFound } from '../lib/errors.js';
import { ID_RE } from '../content/models.js';

const MAX_ITEMS = 500;
const COLS = 'id,content_type,content_id,title,poster_url,backdrop_url,year,rating,created_at';
const Kind = z.enum(['movie', 'series']);
const AddBody = z.object({ contentType: Kind, contentId: z.string().regex(ID_RE) }).strict();

const map = (r) => ({
  id: r.id, type: r.content_type, contentId: r.content_id, title: r.title,
  poster: r.poster_url, backdrop: r.backdrop_url, year: r.year, rating: r.rating === null ? null : Number(r.rating),
  addedAt: r.created_at,
});

export async function list(ctx, req, auth) {
  const { data, error } = await ctx.userDb(auth.token).from('my_list').select(COLS).order('created_at', { ascending: false }).limit(MAX_ITEMS);
  if (error) throw fromDbError(error, 'mylist.list');
  return ok({ items: data.map(map) });
}

/** Daftar id ringan agar kartu di seluruh aplikasi bisa menampilkan status "ada di daftar". */
export async function ids(ctx, req, auth) {
  const { data, error } = await ctx.userDb(auth.token).from('my_list').select('content_type,content_id').limit(MAX_ITEMS);
  if (error) throw fromDbError(error, 'mylist.ids');
  return ok({ ids: data.map((r) => `${r.content_type}:${r.content_id}`) });
}

export async function add(ctx, req, auth) {
  const body = parse(AddBody, await req.json());
  const meta = body.contentType === 'series' ? await ctx.content.series(body.contentId) : await ctx.content.movie(body.contentId);
  if (!meta) throw notFound('Konten');
  const db = ctx.userDb(auth.token);

  const { count, error: cerr } = await db.from('my_list').select('id', { count: 'exact', head: true });
  if (cerr) throw fromDbError(cerr, 'mylist.count');
  if ((count ?? 0) >= MAX_ITEMS) throw new ApiError(422, 'LIST_FULL', `Daftar Saya penuh (maksimal ${MAX_ITEMS} judul).`);

  const { error } = await db.from('my_list').insert({
    user_id: auth.profile.id, content_type: body.contentType, content_id: meta.id,
    title: meta.title, poster_url: meta.poster, backdrop_url: meta.backdrop, year: meta.year, rating: meta.rating,
  });
  if (error && error.code !== '23505') throw fromDbError(error, 'mylist.add'); // sudah ada = idempotent
  return ok({ inList: true });
}

export async function remove(ctx, req, auth) {
  const type = parse(Kind, req.params.type);
  const id = parse(z.string().regex(ID_RE), req.params.id);
  const { error } = await ctx.userDb(auth.token).from('my_list').delete().eq('content_type', type).eq('content_id', id);
  if (error) throw fromDbError(error, 'mylist.remove');
  return ok({ inList: false });
}
