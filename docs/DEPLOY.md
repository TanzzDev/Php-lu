# Deploy ke Vercel

## 1. Buat project Supabase

1. [supabase.com](https://supabase.com) → New Project. Catat **Project URL**, **publishable
   key**, dan **secret key** (Project Settings → API).
2. Terapkan migration secara berurutan — Dashboard → **SQL Editor**, jalankan isi tiap file di
   `supabase/migrations/` sesuai urutan angkanya (`0001_...` → `0007_...`), atau lewat CLI:
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. Verifikasi: tabel `profiles`, `watch_sessions`, `watch_history`, `my_list`, `likes`,
   `audit_logs`, dst. muncul di **Table Editor**, dan `select * from app_settings` menampilkan
   2 baris default (`support`, `branding`) — MDFlix 100% gratis, tidak ada tabel/kunci
   membership, transaksi, atau kuota.

## 2. Google OAuth

Ikuti [`docs/GOOGLE_OAUTH.md`](GOOGLE_OAUTH.md) sepenuhnya sebelum lanjut — Site URL & Redirect
URLs di Supabase perlu tahu domain produksi Anda (langkah 3 di bawah menentukannya).

## 3. Deploy ke Vercel

1. Push project ini ke GitHub/GitLab, import di [vercel.com/new](https://vercel.com/new).
   Vercel akan mendeteksi `vercel.json` (framework: vite) secara otomatis.
2. **Project → Settings → Environment Variables** — isi untuk **Production** (dan **Preview**
   bila ingin preview deployment berfungsi penuh):

   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<publishable key>
   SUPABASE_SECRET_KEY=<secret key>          ← tandai "Sensitive"
   SITE_URL=https://<domain-produksi-anda>
   ```

   `CONTENT_API_BASE_URL` / `CONTENT_API_DIALECT` **tidak perlu diisi**: API konten original sudah
   tertanam di source (lihat `docs/CONTENT_API.md`). Node.js diset ke `22.x` lewat `package.json`.
3. Deploy. Setelah domain produksi aktif, kembali ke Supabase → **Authentication → URL
   Configuration** dan pastikan **Site URL** + **Redirect URLs** memakai domain final (lihat
   `docs/GOOGLE_OAUTH.md` langkah 2.4).

## 4. Verifikasi pasca-deploy

- `https://<domain>/api/health` → `{"ok":true}`
- `https://<domain>/api/config/public` → `auth.configured: true`, `content.provider: "original"`,
  `content.available: true`, dan `auth.providers.google: true` bila provider Google sudah aktif di Supabase
  (`false` = belum diaktifkan, `null` = tidak diketahui).
- Uji API konten dari terminal: `npm run smoke:content` (butuh internet).
- Daftar akun baru di `/login`, konfirmasi email, pastikan muncul di **Table Editor → profiles**.
- Login sebagai akun itu, lalu di **Table Editor → profiles**, ubah `role` baris tsb menjadi
  `ADMIN` manual (satu kali, untuk admin pertama — selanjutnya kelola lewat Konsol Admin) →
  `/admin` harus bisa diakses.
- MDFlix 100% gratis: tidak ada halaman langganan/checkout untuk dicoba — setiap akun yang
  login langsung dapat menonton tanpa batas.

## Preview deployment & Supabase

Preview deployment Vercel memakai domain acak (`*.vercel.app`) yang tidak terdaftar di Redirect
URLs Supabase secara default → login Google akan gagal di preview meski email/password tetap
berfungsi. Untuk mengaktifkan Google OAuth di preview juga, tambahkan pola wildcard preview Anda
ke **Redirect URLs** di Supabase, atau gunakan Supabase project terpisah untuk staging.

## Local development vs Vercel

`npm run dev` (Vite middleware mode + API di proses yang sama) dan `npm start` (serve `dist/` +
API, header identik `vercel.json`) keduanya memakai `server/router.js` yang **sama persis** dengan
yang dipanggil `api/[...path].js` di Vercel — tidak ada logika ganda yang bisa berbeda perilaku
antara lokal dan produksi.
