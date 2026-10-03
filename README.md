# MDFlix

Platform streaming film & series full-stack — Vite + React (frontend), Vercel Functions (API), Supabase (Auth + PostgreSQL).

UI/UX **MDFlix Free Gen 2** dipertahankan sebagai basis. Konten film/series kini berasal dari **API
MDFlix Original** (`https://thanz-stream.web.id/api/movies`, ditanam di
[`server/content/providers/original.js`](server/content/providers/original.js)) dan diputar lewat server
embed dari sumber yang sama. Lihat [`docs/INTEGRATION_REPORT.md`](docs/INTEGRATION_REPORT.md) untuk hasil audit,
keputusan, hasil test, dan hal yang masih harus Anda isi. Dokumen sebelumnya:
[`docs/INSPECTION.md`](docs/INSPECTION.md) dan [`docs/MIGRATION_REPORT.md`](docs/MIGRATION_REPORT.md).

## Struktur

```
api/[...path].js       Satu Vercel Function menangani seluruh /api/*
server/                 Kode server: auth, watch-session, history/my-list, admin, content adapter
src/                    Frontend React (Vite)
supabase/migrations/    Migration SQL (skema, fungsi, RLS) — sumber kebenaran skema database
tests/sql/              Test terhadap fungsi & RLS database (Postgres asli via node:test)
tests/api/              Test terhadap seluruh API (Postgres + PostgREST sungguhan)
tests/e2e/              Screenshot & pemeriksaan tata letak lintas breakpoint (Puppeteer)
environment/            Template & dokumentasi environment variable (.env.example, README.md)
docs/                   Dokumentasi arsitektur, deployment, dan integrasi
scripts/gen-fixtures.mjs   Generator poster/backdrop/video sampel untuk data pengembangan
```

## Menjalankan secara lokal

Butuh Node.js 22 dan sebuah project Supabase (gratis) untuk pengalaman penuh. Tanpa Supabase,
katalog (beranda, pencarian, detail) tetap tampil dari API original, tetapi login dan menonton
membutuhkan `SUPABASE_URL` dan kunci yang valid karena semuanya lewat Supabase Auth + database.
Periksa API konten langsung dari terminal dengan `npm run smoke:content`.

```bash
npm install
cp environment/.env.example .env   # isi SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
npm run dev                    # http://localhost:3000  (Vite + API di satu proses, dengan HMR)
```

Terapkan migration ke project Supabase Anda (Dashboard → SQL Editor, jalankan berurutan
`supabase/migrations/0001...` s.d. `0005...`, atau `supabase db push` bila memakai Supabase CLI).

Build produksi lokal (menyajikan `dist/` + API, header sama seperti `vercel.json`):
```bash
npm run build && npm start     # http://localhost:3000
```

## Testing

```bash
npm run test:sql     # fungsi database & RLS (Postgres asli, tanpa mock)
npm run test:api     # seluruh API (Postgres + PostgREST + gateway pembayaran tiruan)
npm test             # keduanya
npm run test:e2e     # screenshot + pemeriksaan tata letak (butuh Chromium; lihat tests/e2e)
```

Test API/SQL tidak memakai mock untuk Postgres atau Supabase Data API — keduanya dijalankan
sungguhan secara lokal (lihat `tests/stack/`).

## Environment variables

Lihat [`environment/.env.example`](environment/.env.example) untuk daftar lengkap dan
[`environment/README.md`](environment/README.md) untuk penjelasan tiap variabel (wajib/tidak,
public/server-only) serta cara mengisinya di Vercel. Ringkasan:

| Variabel | Wajib | Catatan |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Ya | Dipakai server **dan** browser (publishable key aman untuk browser) |
| `SUPABASE_SECRET_KEY` | Ya | **Hanya server.** Jangan pernah diberi prefix yang dibundel ke frontend |
| `CONTENT_API_BASE_URL` | Tidak | Kosong = pakai API original yang tertanam di source. Isi hanya bila host API itu pindah |
| `CONTENT_API_DIALECT` | Tidak | `original` (default; `legacy` = alias), `native`, atau `fixture` (khusus pengembangan; di produksi ditolak) — lihat `docs/CONTENT_API.md` |
| `SITE_URL` | Disarankan di produksi | Untuk `og:image` dan redirect OAuth |

Google OAuth **tidak** dikonfigurasi lewat environment variable aplikasi — Client ID/Secret
diisi di Supabase Dashboard (Authentication → Providers → Google). Lihat
[`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md).

## Deploy ke Vercel

Lihat [`docs/DEPLOY.md`](docs/DEPLOY.md) untuk langkah lengkap (Supabase project → migration →
Google OAuth → environment variables di Vercel → deploy).

## Dokumen lain

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arsitektur API, watch-session, admin
- [`docs/SECURITY.md`](docs/SECURITY.md) — model keamanan (RLS, grants, audit) dan hasil security audit
- [`docs/CONTENT_API.md`](docs/CONTENT_API.md) — kontrak internal & cara memetakan Content API produksi
- [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md) — setup Google OAuth di Supabase
- [`docs/INSPECTION.md`](docs/INSPECTION.md) — hasil inspeksi project asli (Guest-fixed.zip)
- [`docs/MIGRATION_REPORT.md`](docs/MIGRATION_REPORT.md) — laporan akhir lengkap (45 poin brief)
