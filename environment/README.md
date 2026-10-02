# environment/

Folder ini hanya berisi **template & dokumentasi** environment variable untuk
MDFlix. Tidak ada file `.env` asli di sini, dan tidak ada kode aplikasi yang
membaca dari folder ini saat runtime.

## Isi folder

| File | Keterangan |
|---|---|
| `.env.example` | Template lengkap semua variabel — semua nilai kosong/placeholder aman |
| `README.md` | Dokumen ini |

## Bagaimana aplikasi sebenarnya membaca environment variable

Ini **tidak berubah** oleh keberadaan folder ini. Source code tetap membaca
langsung dari `process.env.*` seperti biasa — satu-satunya tempat semua
variabel dibaca adalah [`server/config/env.js`](../server/config/env.js).

- **Lokal**: `.env` di **root** project (bukan `environment/.env`). Dimuat
  otomatis oleh `scripts/dev.js` dan `scripts/serve.js` lewat
  `process.loadEnvFile('.env')`.
- **Vercel** (Production/Preview): dibaca dari **Vercel Dashboard → Project →
  Settings → Environment Variables** — bukan dari file apa pun di repository.

`environment/.env.example` murni referensi untuk manusia. Tidak pernah dibaca
oleh `npm run dev`, `npm run build`, `npm start`, atau oleh Vercel.

## Daftar variabel

| Variabel | Wajib | Visibilitas | Keterangan |
|---|---|---|---|
| `SUPABASE_URL` | Ya | 🟢 Public | URL project Supabase. Dikirim ke browser lewat `/api/config/public`. |
| `SUPABASE_PUBLISHABLE_KEY` | Ya | 🟢 Public | Publishable (anon) key Supabase — memang didesain aman untuk browser. |
| `SUPABASE_SECRET_KEY` | Ya | 🔴 Server-only | **Rahasia.** Jangan pernah diberi prefix `VITE_` atau dikirim ke frontend. Tandai **Sensitive** di Vercel. |
| `GOOGLE_CLIENT_ID` | Tidak | ⚪ Tidak dibaca app | Diisi langsung di Supabase Dashboard (Authentication → Providers → Google). Relevan hanya bila Anda memakai Supabase CLI lokal (`supabase/config.toml`). Lihat `docs/GOOGLE_OAUTH.md`. |
| `GOOGLE_CLIENT_SECRET` | Tidak | 🔴 Server-only | Sama seperti di atas — tetap perlakukan sebagai rahasia meski tidak dibaca aplikasi Node. |
| `CONTENT_API_BASE_URL` | Tidak | 🔴 Server-only | Kosong = pakai data fixture pengembangan (otomatis nonaktif di produksi). Nilai mentah tidak pernah dikirim ke browser. |
| `CONTENT_API_DIALECT` | Tidak | 🔴 Server-only | `legacy` (default) atau `native` — lihat `docs/CONTENT_API.md`. |
| `SITE_URL` | Disarankan (produksi) | 🟢 Public | URL publik produksi. Disisipkan ke `og:image`/`twitter:image` saat build (`vite.config.js`) dan dikembalikan lewat `/api/config/public`. |

- 🟢 **Public / client-safe** — boleh terlihat di browser / response API.
- 🔴 **Server-only** — tidak boleh pernah sampai ke bundle frontend maupun response API mentah.
- ⚪ **Tidak dibaca kode aplikasi** — hanya dokumentasi/konfigurasi eksternal (Supabase Dashboard).

Komentar & catatan lengkap per variabel ada di [`.env.example`](./.env.example)
itu sendiri.

## Development lokal

```bash
cp environment/.env.example .env
# isi minimal: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
npm install
npm run dev
```

`.env` di root **otomatis di-ignore git** (lihat `.gitignore` di root project).
Aman diisi nilai asli secara lokal — tidak akan pernah ter-commit selama Anda
tidak memaksa (`git add -f`).

## Menambahkan variabel ke Vercel

1. Buka **Vercel Dashboard → [project Anda] → Settings → Environment Variables**.
2. Tambahkan tiap variabel pada tabel di atas untuk environment **Production**
   (dan **Preview** bila ingin preview deployment berfungsi penuh).
3. Untuk variabel bertanda **Rahasia** (`SUPABASE_SECRET_KEY`, `GOOGLE_CLIENT_SECRET`),
   centang opsi **Sensitive**.
4. Redeploy setelah menambah/mengubah variabel — Vercel tidak menerapkan
   perubahan ke deployment yang sudah berjalan secara otomatis.

Vercel **tidak pernah** membaca `environment/.env.example` — file itu murni
referensi manusia. Langkah deploy lengkap ada di
[`../docs/DEPLOY.md`](../docs/DEPLOY.md).

## Yang tidak boleh dilakukan

- ❌ Commit `.env`, `.env.local`, `.env.development`, `.env.production`,
  `.env.test`, `.env.staging`, atau `.env.*.local` — semua sudah di-ignore
  lewat `.gitignore` root (`.env`, `.env.*`, `!.env.example`).
- ❌ Membuat `environment/.env` — folder ini hanya untuk template, bukan
  sumber yang dibaca runtime.
- ❌ Menulis nilai asli/production di `environment/.env.example` atau di
  dokumen ini.
- ❌ Memberi prefix `VITE_` pada variabel apa pun di atas. Hanya `SITE_URL`
  (nilai publik) yang disisipkan ke `index.html` saat build — lihat
  `vite.config.js`.

## Kalau di masa depan butuh template per environment

Saat ini MDFlix memakai **satu set nama variabel** untuk semua environment —
yang membedakan dev vs produksi adalah *isi nilainya* (kosong vs terisi) atau
`VERCEL_ENV`/`NODE_ENV`, bukan file terpisah. Karena itu satu `.env.example`
sudah cukup.

Bila nanti memang perlu template terpisah (mis. `environment/.env.production.example`),
tambahkan filenya di folder ini lalu tambahkan baris berikut ke `.gitignore` root:

```
!.env.*.example
```
