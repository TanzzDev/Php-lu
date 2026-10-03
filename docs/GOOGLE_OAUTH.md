# Google OAuth — setup

Sesuai instruksi brief ("Jangan mengarang callback URL. Gunakan konfigurasi aktual Supabase
project"), callback URL dan Client Secret **tidak dituliskan di kode maupun didugaikan** di sini
— keduanya spesifik untuk project Supabase Anda dan harus diambil dari dashboard Anda sendiri.
Google OAuth di MDFlix sepenuhnya didelegasikan ke **Supabase Auth**: frontend hanya memanggil
`supabase.auth.signInWithOAuth({ provider: 'google' })` (lihat `src/auth/AuthContext.jsx`) —
aplikasi MDFlix sendiri tidak pernah menyentuh Google Client ID/Secret.

## Konfigurasi minimum yang tidak bisa dihindari

Kode login Google sudah lengkap dan tidak perlu diubah. Tetapi Google **mewajibkan** setiap aplikasi memiliki
OAuth client terdaftar, dan tidak ada kredensial Google di kedua project yang diaudit (project original tidak punya
autentikasi sama sekali), jadi ini satu-satunya hal yang tidak bisa saya isikan untuk Anda. Sekali saja, tanpa
mengubah kode:

1. **Google Cloud Console** — buat OAuth client (Web application); tambahkan *Authorized redirect URI*
   `https://<project-ref>.supabase.co/auth/v1/callback` → dapatkan **Client ID** dan **Client Secret**.
2. **Supabase → Authentication → Providers → Google** — aktifkan, tempel Client ID & Secret.
3. **Supabase → Authentication → URL Configuration** — *Site URL* = domain produksi; *Redirect URLs* tambahkan
   `https://<domain-anda>/auth/callback` (dan `http://localhost:3000/auth/callback` untuk lokal).

Client Secret **hanya** dimasukkan di dashboard Supabase — bukan di environment variable aplikasi dan bukan di source.

**Diagnosis bawaan.** `GET /api/config/public` → `auth.providers.google` menunjukkan apakah Supabase menyatakan provider
Google aktif (`true`/`false`; `null` = tidak diketahui). Bila `false`, halaman login menonaktifkan tombol Google dan
menjelaskan alasannya, alih-alih membawa pengguna ke halaman error JSON milik Supabase.

## Langkah setup

### 1. Google Cloud Console

1. Buat (atau pakai) **OAuth 2.0 Client ID** bertipe **Web application** di
   [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Di **Authorized redirect URIs**, tambahkan URL callback yang ditampilkan Supabase pada langkah
   2 di bawah (bentuknya `https://<project-ref>.supabase.co/auth/v1/callback`) — **salin persis
   dari dashboard Supabase Anda**, jangan menuliskannya dari ingatan/dugaan.
3. Simpan **Client ID** dan **Client Secret** yang dihasilkan.

### 2. Supabase Dashboard

1. **Authentication → Providers → Google** → aktifkan.
2. Tempel **Client ID** dan **Client Secret** dari langkah 1. Supabase menyimpannya sebagai
   secret di sisi Supabase — **bukan** di environment variable Vercel/aplikasi MDFlix, dan tidak
   pernah terkirim ke browser.
3. Salin **Callback URL (for OAuth)** yang ditampilkan di halaman ini, tempel ke Google Cloud
   Console (langkah 1.2).
4. **Authentication → URL Configuration**:
   - **Site URL**: URL produksi MDFlix Anda, mis. `https://mdflix.vercel.app`.
   - **Redirect URLs**: tambahkan `https://mdflix.vercel.app/auth/callback` (dan
     `http://localhost:3000/auth/callback` untuk pengembangan lokal). Frontend memakai path ini
     di `signInWithGoogle()` (`src/auth/AuthContext.jsx`) sebagai `redirectTo`.

### 3. Environment variable MDFlix

Hanya dua yang perlu diisi di Vercel (Project → Settings → Environment Variables), **bukan**
kredensial Google:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key dari Supabase → Project Settings → API>
```

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` tetap ada di `environment/.env.example` sesuai daftar variabel
pada brief, tetapi diberi keterangan bahwa keduanya dikonfigurasi di dashboard Supabase (langkah
2 di atas) — aplikasi MDFlix tidak membacanya dari environment variable mana pun, sehingga tidak
ada risiko Client Secret tersimpan di kode atau ter-bundle ke frontend.

## Alur di aplikasi

1. Pengguna menekan "Lanjutkan dengan Google" di `/login`.
2. Tujuan setelah login disimpan sementara di `sessionStorage` (`src/lib/authNext.js`), lalu
   `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '<origin>/auth/callback' } })`
   — `redirectTo` **tanpa query**, jadi satu entri `…/auth/callback` di Redirect URLs sudah cocok (tanpa wildcard)
   mengarahkan ke halaman consent Google, lalu ke callback Supabase, lalu kembali ke
   `/auth/callback` di MDFlix dengan sesi yang sudah aktif (`detectSessionInUrl: true`, flow
   PKCE — lihat `src/lib/supabase.js`).
2. `AuthCallback` (`src/pages/Auth.jsx`) menunggu sesi tersedia lalu redirect ke `next`.
3. Begitu terautentikasi, klien memanggil `POST /api/auth/sync` (`server/auth/handlers.js`), yang
   **membuat/menyinkronkan profil di server** — nama & avatar dari metadata Google hanya dipakai
   untuk mengisi profil yang masih kosong, role selalu `USER` secara default dan hanya admin yang
   bisa mengubahnya (lihat `docs/SECURITY.md`).

## Blocker

Alur Google OAuth **tidak dapat diuji end-to-end secara otomatis** di lingkungan pengembangan ini
karena membutuhkan project Google Cloud & Supabase yang sungguhan (lihat catatan di
`tests/stack/stack.mjs`). Yang sudah diuji dan lulus (163 test, lihat `docs/MIGRATION_REPORT.md`):
alur login email/password penuh lewat Supabase Auth sungguhan (lokal), pembuatan/sinkronisasi
profil (`ensureProfile`, trigger `mdflix_handle_new_user`), dan seluruh logika setelah
autentikasi (role, RLS). Kode sisi Google OAuth murni memanggil API standar
`supabase-js` yang sama untuk kedua metode login — bagian yang belum diuji end-to-end hanyalah
pertukaran OAuth dengan Google itu sendiri, yang berada di luar kendali kode aplikasi ini.
