#!/usr/bin/env node
// Smoke test API konten SUNGGUHAN — memanggil API original lewat provider & service MDFlix yang sama
// dengan yang dipakai server (tanpa Supabase/database). Butuh internet.
//
//   npm run smoke:content                   # alur lengkap dengan judul pertama yang ditemukan
//   npm run smoke:content -- --q=avatar     # kata kunci pencarian
//   npm run smoke:content -- movie-49013 tv-1399   # periksa slug tertentu
//   CONTENT_API_BASE_URL=https://host/api/movies npm run smoke:content   # uji host lain
//
// Keluar dengan kode 1 bila ada langkah yang gagal. Tidak ada data yang dipalsukan: yang tampil
// adalah apa yang benar-benar dijawab API.
import { createContentService } from '../server/content/service.js';
import { createOriginalProvider, ORIGINAL_API_BASE_URL } from '../server/content/providers/original.js';

const args = process.argv.slice(2);
const q = (args.find((a) => a.startsWith('--q=')) ?? '--q=man').slice(4);
const slugs = args.filter((a) => !a.startsWith('--'));
const baseUrl = process.env.CONTENT_API_BASE_URL?.trim() || ORIGINAL_API_BASE_URL;
const svc = createContentService({ provider: createOriginalProvider({ baseUrl, isProd: true }) });

let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failed += 1; console.log(`  ✗ ${m}`); };
async function step(name, fn) {
  console.log(`\n${name}`);
  try { return await fn(); } catch (e) { bad(`${e.code ?? e.name}: ${e.message}`); return null; }
}

console.log(`API: ${baseUrl}`);

const home = await step('1. Beranda (popular / latest / top-rated / upcoming)', async () => {
  const h = await svc.home();
  h.rows.length ? ok(`${h.rows.length} baris: ${h.rows.map((r) => `${r.id}(${r.items.length})`).join(', ')}`) : bad('tidak ada baris konten');
  h.hero.length ? ok(`${h.hero.length} item hero`) : bad('hero kosong');
  return h;
});

await step(`2. Pencarian "${q}"`, async () => {
  const r = await svc.search(q);
  r.items.length ? ok(`${r.items.length} hasil, contoh: ${r.items.slice(0, 3).map((i) => `${i.title} [${i.type}]`).join('; ')}`) : bad('pencarian kosong');
});

const all = home?.rows.flatMap((r) => r.items) ?? [];
const targets = slugs.length ? slugs : [all.find((i) => i.type === 'movie')?.id, all.find((i) => i.type === 'series')?.id].filter(Boolean);
if (!targets.length) bad('tidak ada judul untuk diperiksa');

for (const id of targets) {
  await step(`3. Detail & playback: ${id}`, async () => {
    const movie = await svc.movie(id);
    const series = movie ? null : await svc.series(id);
    const item = movie ?? series;
    if (!item) return bad('detail tidak ditemukan');
    ok(`${item.type}: "${item.title}" (${item.year ?? '-'}), rating ${item.rating ?? '-'}, ${item.genres.length} genre`);

    let pbId = id, kind = 'movie';
    if (series) {
      kind = 'episode';
      ok(`${series.seasons.length} musim: ${series.seasons.map((s) => `S${s.number}${s.episodeCount ? `(${s.episodeCount})` : ''}`).join(' ') || '-'}`);
      const first = series.seasons[0]?.number ?? 1;
      const eps = await svc.episodes(id, first);
      if (eps.length) { ok(`musim ${first}: ${eps.length} episode dari payload`); pbId = eps[0].id; }
      else if (series.titleStream) { ok('tanpa daftar episode — diputar lewat pemutar level-judul (seperti original)'); pbId = series.titleStream; }
      else return bad('series tanpa episode dan tanpa stream');
    }
    const pb = await svc.playback(kind, pbId);
    if (!pb) return bad('tidak ada sumber video (playback null)');
    ok(`playback ${pb.type}: ${pb.servers.length} server → ${pb.servers.map((s) => s.name).join(', ')}`);
    ok(`sumber utama: ${new URL(pb.source).host}`);
  });
}

console.log(failed ? `\n${failed} langkah GAGAL.` : '\nSemua langkah berhasil.');
process.exit(failed ? 1 : 0);
