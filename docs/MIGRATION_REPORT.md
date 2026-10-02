# Laporan Akhir — Migrasi ke MDFlix

Project diperiksa lebih dulu secara menyeluruh (lihat [`INSPECTION.md`](INSPECTION.md)) sebelum
satu baris pun diubah. Laporan ini menjawab 19 poin pada brief §45.

---

## 1. Apa yang diubah

Project asli **"ZaamMovie"** (vanilla JS, statis, target Netlify, katalog film *read-only* tanpa
akun) diubah total menjadi **MDFlix**: platform streaming full-stack (Vite + React, Vercel
Functions, Supabase Auth + PostgreSQL) dengan akun, membership berbayar, watch-session
server-authoritative, arsitektur pembayaran, dan konsol admin. Branding, desain visual (markup +
CSS ditulis ulang total, bukan reskin), sistem ikon, tipografi, dan seluruh routing frontend
diganti. Backend lama (`netlify/api/zaam-movies.js`, format Netlify Functions) tidak kompatibel
dengan Vercel dan tidak menyentuh scraping upstream-nya sama sekali (sesuai larangan brief §9) —
digantikan arsitektur Content Provider Adapter baru (lihat poin 2 & `docs/CONTENT_API.md`).

## 2. Functionality existing yang dipertahankan

Diverifikasi dulu lewat inspeksi (`docs/INSPECTION.md`), baru dipakai ulang — bukan diklaim tanpa
diperiksa:

- **Pola normalisasi data toleran** (`normalizeItem`/`normalizeDetail`/`normalizeCastMember`
  di `app.js` asli) → diadaptasi ke `server/content/normalizers.js`, memakai helper `pick()` yang
  sama untuk mencoba banyak nama field, termasuk penanganan path relatif TMDB untuk foto pemeran.
- **Struktur endpoint upstream** (`BASE_URL + /popular|/latest|/upcoming|/top-rated|/search|
  /detail/{slug}`) → jadi `server/content/providers/legacy.js` (`CONTENT_API_DIALECT=legacy`,
  default), sehingga bila `CONTENT_API_BASE_URL` produksi Anda berbentuk sama, cukup isi env var
  tanpa ubah kode.
- **Cache 1 jam untuk data katalog yang sama bagi semua pengunjung** → `server/content/cache.js`.
- **Konsep navigasi sidebar↔bottom-nav otomatis per breakpoint** → dibangun ulang total sebagai
  `Header`/`MobileBottomNav` (markup, class, breakpoint baru: 899px).
- **Fallback tipografis saat poster gagal dimuat** → komponen `Poster`/`.card__ph`.

Yang **sengaja tidak dipertahankan** dan alasannya: history di `localStorage` → diganti tabel
`watch_history` (brief §16-18 eksplisit meminta database, bukan localStorage, agar tersinkron
lintas perangkat); proteksi klik-kanan pada gambar → dihapus (kosmetik, tidak diminta, mudah
di-bypass); struktur route (`/film/{slug}` dll.) → diganti sesuai branding baru (bukan kontrak
publik yang perlu dipertahankan identik).

## 3. Halaman baru

Home, Search, Movie Detail, Series Detail, Watch Player (film & episode), Login/Daftar,
Auth Callback (OAuth), Profile, My List, History (+ Continue Watching), Subscription, Payment
Checkout, Payment Status, Account Settings, Help/Support, 404 — dan admin: Overview, Users, User
Detail, Memberships, Transactions, Transaction Detail, Watching Now, Watch History, Audit Logs,
Settings. Total **26 route** frontend (`src/App.jsx`).

## 4. Component baru

`Header`, `MobileBottomNav`, `Footer`, `HeroBanner`, `MovieCard`/`SeriesCard`,
`ContinueWatchingCard`, `MovieRow`, `SearchBar`, `ProfileMenu`, `MembershipBadge`,
`WatchProgress`, `VideoPlayer` (kontrol kustom penuh, bukan `<video controls>` bawaan),
`EpisodeList`, `TrailerModal`, `SubscriptionCard`, `PaymentCheckout`/`PaymentStatus`/`QRCode`,
`Modal`, `Toast`, `Skeleton`, `EmptyState`/`ErrorState`, `AdminSidebar`/`AdminLayout`,
`AdminStat`, `DataTable` (tabel↔kartu responsif otomatis), `UserTable`, `TransactionTable`,
`MembershipManager`, `WatchingNow`, `AuditLogTable` — semua sesuai daftar §33 brief.

## 5. Database tables

`profiles`, `memberships`, `transactions`, `watch_sessions`, `watch_usage_daily`,
`watch_history`, `my_list`, `audit_logs`, `app_settings` — 9 tabel (`watch_usage_daily`
ditambahkan di luar daftar minimal §18 brief sebagai penyimpanan pemakaian kuota per-hari yang
efisien untuk di-query, terpisah dari log sesi mentah `watch_sessions`). Seluruhnya punya primary
key, foreign key ke `profiles`/`auth.users`, index untuk pola query yang dipakai (lihat komentar
di tiap `create index` di migration), `unique` constraint (mis. satu sesi `ACTIVE` per user, satu
order `PENDING` per (user, plan), satu `gateway_transaction_id` per gateway), kolom timestamp, dan
kolom status dengan `check` constraint.

## 6. RLS/security model

Lihat `docs/SECURITY.md` untuk detail lengkap dan hasil audit. Ringkas: RLS aktif di semua 9
tabel; `audit_logs`/`app_settings` tertutup total dari klien (tanpa kebijakan); tabel lain hanya
mengizinkan akses ke baris milik sendiri. **Seluruh 22 fungsi SQL `mdflix_*`/`_mdflix_*` dicabut
dari `anon`/`authenticated`** dan hanya bisa dieksekusi `service_role` — mencegah user memanggil
`rpc/mdflix_settle_paid` dsb. langsung lewat Supabase Data API (celah yang mudah terlewat karena
Supabase memberi privilege default penuh ke fungsi baru). `audit_logs` immutable di level trigger
(`UPDATE`/`DELETE`/`TRUNCATE` ditolak untuk siapa pun). Kolom `profiles.role`/`is_active` dilindungi
trigger (`mdflix_protect_profile`) sebagai lapis kedua di luar RLS.

## 7. Authentication

Supabase Auth, email/password + Google OAuth. Profil disinkronkan otomatis lewat trigger
database (`mdflix_handle_new_user`/`mdflix_handle_user_update` pada `auth.users`) **dan** ditutup
celahnya di server (`POST /api/auth/sync`, idempotent) bila trigger belum terpasang di project
Supabase Anda. Role (`USER`/`ADMIN`) dan status akun (`is_active`) **selalu dibaca dari database**
di setiap request (`server/auth/index.js:authenticate`) — tidak pernah dari klaim token, header,
atau body. Akun nonaktif ditolak di seluruh endpoint (`403 ACCOUNT_DISABLED`) dan login-nya
diblokir di sisi Supabase Auth (`admin.auth.admin.updateUserById(..., {ban_duration})`) saat admin
menonaktifkan lewat konsol.

## 8. Google OAuth

Diimplementasikan lewat `supabase.auth.signInWithOAuth({provider:'google'})` — lihat
`docs/GOOGLE_OAUTH.md` untuk langkah setup lengkap (Google Cloud Console → Supabase Dashboard →
env var Vercel). Sesuai instruksi brief, **callback URL tidak dikarang** — harus disalin dari
dashboard Supabase project Anda sendiri. Client Secret **tidak pernah** dibaca oleh kode aplikasi
maupun disimpan sebagai environment variable MDFlix; dikonfigurasi langsung di dashboard Supabase
(standar Supabase, mencegah risiko secret ter-bundle ke frontend). **Blocker pengujian**: alur
OAuth sungguhan dengan Google tidak dapat diuji otomatis di lingkungan pengembangan ini (butuh
project Google Cloud + Supabase nyata) — bagian yang sudah teruji penuh (163 test) adalah semua
logika *setelah* autentikasi (sync profil, role, RLS), yang identik jalurnya untuk kedua metode
login.

## 9. Payment architecture

Order → snapshot harga dari `app_settings` (server-side, bukan dari klien) → `createCharge()` ke
gateway → status `PENDING` → polling `/api/payment/status` (server-ke-server via `getStatus()`,
throttle 3 detik) dan webhook (`/api/payment/webhook`) → **hanya setelah verifikasi ulang ke
gateway** (bukan mempercayai isi webhook) → `mdflix_settle_paid()` (SQL, idempotent, row locking,
validasi nominal persis) → membership diaktifkan + audit log. Detail lengkap: `docs/ARCHITECTURE.md#payment`.

## 10. Webhook/status mechanism

Adapter gateway (`server/payment/gateway.js`) mendefinisikan 3 fungsi: `createCharge`,
`getStatus` (server-ke-server), `verifyWebhook` (tanda tangan atas *bytes mentah*, bukan JSON
yang di-reserialisasi). Webhook memverifikasi tanda tangan **lalu tetap memanggil `getStatus()`
ulang** sebelum mengubah apa pun — isi webhook hanya dipakai menemukan order mana yang dimaksud,
tidak pernah dipercaya untuk status/nominal. Diuji lewat *test double* gateway
(`tests/stack/test-gateway.mjs`) yang meniru sifat-sifat ini (HMAC signature, charge/status API).

## 11. Membership logic

FREE (Rp0, kuota harian) / PREMIUM (Rp10.000/30 hari) / PRO (Rp50.000/365 hari), harga & durasi
dari `app_settings` (dapat diubah admin, berlaku untuk order berikutnya). Plan efektif dihitung
on-the-fly (`mdflix_effective_plan`) — plan berbayar yang kedaluwarsa otomatis terbaca FREE tanpa
menghapus data apa pun (akun/profil/riwayat/My List tetap utuh, hanya membership yang berubah,
sesuai §14 brief). Pembelian ulang saat masih aktif **menambah** dari `expires_at` yang sedang
berjalan (§24 brief: "Jangan memperpendek membership aktif"), tidak pernah menurunkan tier yang
lebih tinggi. Semua perubahan (beli, extend, admin grant/change/revoke) tercatat di `audit_logs`
dalam transaksi SQL yang sama (tidak bisa "lolos" tercatat separuh). Detail & aturan presisi:
`docs/ARCHITECTURE.md#membership`.

## 12. Free watch timer architecture

**Server-authoritative penuh** — klien tidak pernah mengirim jumlah detik. `watch_sessions` +
`watch_usage_daily`, dihitung dari **selisih jam server** antar-heartbeat (bukan dari klien),
kredit hanya berjalan saat state terakhir `playing` (bukan `paused`/`buffering`), dibatasi per
heartbeat (`MAX_CREDIT_SECONDS=30`) dan sisa kuota harian, dengan perlindungan replay (`seq` harus
naik), throttle heartbeat rapat, deteksi sesi diam (`STALE_SECONDS=75`), dan penegakan satu sesi
aktif per user di level *unique index* database (bukan hanya di kode Node). Reset harian dihitung
dari zona waktu `app_settings.free.timezone` (default `Asia/Jakarta`) tanpa cron. Detail lengkap
+ contoh perhitungan: `docs/ARCHITECTURE.md#watch-session--kuota-free-server-authoritative`.

## 13. Admin functionality

Overview (statistik nyata dari database — total user, breakdown plan, transaksi, revenue dari
transaksi `PAID`, sedang menonton), Users (cari/filter/detail/ubah role/nonaktifkan/hapus dengan
konfirmasi email), Membership (grant/extend/change/revoke via satu fungsi SQL beraudit),
Transactions (filter status/plan/tanggal/cari, detail + jejak audit, cek ulang status ke gateway —
**tanpa** endpoint untuk menandai lunas manual), Watching Now (sesi aktif real-time, refresh
10 detik), Watch History (semua user), Audit Logs (immutable, filter aksi/tanggal/pencarian),
Settings (harga, durasi, kuota Free, info dukungan, branding — tervalidasi skema per key).
Setiap endpoint admin diverifikasi server-side di **tiga lapis**: route (`auth:'admin'`), fungsi
SQL (cek ulang role pemanggil), dan GRANT database (fungsi sensitif tak terjangkau role
`authenticated` sama sekali).

## 14. Environment variables

`.env.example` dibuat lengkap (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — dengan catatan keduanya dikonfigurasi di dashboard
Supabase, bukan dibaca aplikasi, `CONTENT_API_BASE_URL`, `CONTENT_API_DIALECT`,
`PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_TOKEN`, `PAYMENT_WEBHOOK_SECRET`, `SITE_URL`) — tanpa
satu pun nilai asli terisi. Dibaca terpusat di satu tempat (`server/config/env.js`), dengan daftar
nilai yang harus di-*redact* dari log/error (`redact()`) agar secret tidak pernah bocor bahkan
lewat error 500 yang tidak terduga.

## 15. File yang dibuat/diubah

Project asli (6 file) diperiksa lalu **dihapus seluruhnya** dari struktur baru (tidak kompatibel
Vercel/tidak relevan — logikanya yang berguna sudah dipindah, lihat poin 2), digantikan struktur
baru: **34 file server**, **34 file frontend** (`.jsx`/`.js`/`.css`), **5 file migration SQL**
(1.044 baris total), **6 file dokumentasi** (`docs/`), **6 file test** (1.912 baris,
163 test) — total 98 file di luar `node_modules`/`dist`. Rincian per area ada di struktur
`README.md`.

## 16. Database migration

5 file SQL berurutan di `supabase/migrations/`, **idempotent** (aman dijalankan ulang — diuji
eksplisit: `"migration aman dijalankan ulang tanpa merusak data"`), mencakup seluruh tabel, index,
constraint, RLS policy, fungsi, dan trigger — tidak ada satu pun yang perlu dibuat manual lewat
Supabase Dashboard. Diuji terhadap **PostgreSQL 16 sungguhan** (bukan mock) di setiap test run.

## 17. Vercel deployment

`vercel.json` (rewrite SPA fallback, header keamanan termasuk **Content-Security-Policy** penuh,
`Strict-Transport-Security`, dsb.), `api/[...path].js` (satu Vercel Function — alasan lengkap:
`docs/ARCHITECTURE.md#kenapa-satu-vercel-function`), tanpa filesystem lokal persisten (Supabase
untuk data, in-memory cache untuk katalog publik). Panduan deploy langkah-demi-langkah:
`docs/DEPLOY.md`.

## 18. Testing

**163 test, seluruhnya lulus** (`npm test`), terhadap **PostgreSQL sungguhan**, **PostgREST
sungguhan** (meniru Supabase Data API persis, termasuk privilege default yang jadi celah bila
tidak di-`REVOKE`), dan **payment gateway tiruan** yang meniru sifat gateway asli (bukan mock
naif) — bukan unit test terisolasi dengan database dipalsukan:

- `tests/sql/membership-payment.test.mjs` (34) — plan efektif, kedaluwarsa otomatis, aturan
  stacking, settlement pembayaran (idempotent, konkurensi 8 paralel, replay, mismatch nominal),
  constraint database, admin, audit.
- `tests/sql/watch.test.mjs` (24) — kuota FREE per skenario persis brief §13 (browsing tak
  mengurangi, pause berhenti, buffering tak dihitung, tutup player berhenti), replay/throttle
  heartbeat, multi-sesi, reset harian per timezone, Premium/Pro unlimited, riwayat & resume.
- `tests/sql/security.test.mjs` (37) — RLS per tabel, isolasi antar-user, fungsi sensitif tertutup
  dari `authenticated` (14 fungsi diuji satu-satu, termasuk saat pemanggilnya ADMIN di database),
  tidak ada secret tersimpan.
- `tests/api/functional.test.mjs` (27) — seluruh alur katalog/auth/membership/riwayat/My
  List/admin end-to-end lewat HTTP asli, termasuk provider `native`/`legacy` (pemetaan field,
  pembuangan data tak valid, playback iframe tidak ikut terbawa).
- `tests/api/security.test.mjs` (41) — eskalasi privilege, IDOR, manipulasi timer/nominal
  pembayaran, webhook tak sah, kebocoran secret, CORS/cache, validasi input.
- `tests/e2e/` — screenshot & pemeriksaan tata letak (tanpa scroll horizontal, error konsol, atau
  pelanggaran CSP) di 7 breakpoint (360/390/768/1024/1440/1920/ultrawide) untuk halaman publik,
  user, dan admin — menemukan & memperbaiki 2 bug CSS nyata selama prosesnya (tombol volume
  tersembunyi total oleh aturan `@media (hover:none)` yang salah sasaran; ikon cari dobel di
  mobile akibat urutan cascade CSS mengalahkan aturan `display:none`).

Testing manual via puluhan tangkapan layar lintas breakpoint memverifikasi §42 brief secara visual
(responsive UI mobile/tablet/laptop/desktop/ultrawide, tabel admin → kartu di mobile, player
dengan video sungguhan dan kuota berkurang sesuai actual playback).

## 19. Blocker yang masih ada

1. **Payment gateway belum terhubung** (`server/payment/gateways/primary.js`, *fail-closed*
   dengan sengaja) — brief tidak menyebut gateway spesifik dan tidak ada dokumentasi API untuk
   diperiksa; saya **tidak mengarang** response API gateway manapun. Selama ini berlangsung,
   `/api/payment/create` mengembalikan `503 PAYMENT_UNAVAILABLE` (pesan jujur ke user, bukan
   checkout palsu), dan admin dapat mengaktifkan membership secara manual (tercatat audit) sebagai
   jalan sementara. Cara mengisi: `docs/PAYMENT_GATEWAY.md`.
2. **Google OAuth belum diuji end-to-end** dengan project Google/Supabase sungguhan (butuh
   kredensial nyata yang di luar lingkungan pengembangan ini) — lihat poin 8 & `docs/GOOGLE_OAUTH.md`.
3. **Content API produksi Anda** (`CONTENT_API_BASE_URL`) belum disambungkan (kosong secara
   default) — katalog memakai data pengembangan yang berlabel jelas di UI ("Data pengembangan")
   saat development, dan **otomatis nonaktif dengan pesan jujur** (`503 CONTENT_UNAVAILABLE`,
   bukan diam-diam menampilkan data contoh) saat `VERCEL_ENV=production`. Cara menyambungkan:
   `docs/CONTENT_API.md`.

Tidak ada blocker lain — autentikasi (email/password), membership, watch-session/kuota Free,
riwayat, My List, dan seluruh admin **berfungsi penuh dan teruji** tanpa dependency eksternal yang
belum tersedia.
