# Arsitektur

## Ringkasan stack

- **Frontend**: Vite + React 18, React Router, TanStack Query. Tanpa Next.js — SPA statis
  (`dist/`) di-serve sebagai static asset Vercel, seluruh data dinamis lewat `/api/*`.
- **API**: Satu Vercel Function (`api/[...path].js`) membungkus router internal
  (`server/router.js`) yang mem-dispatch ke handler per domain (`server/{auth,watch,
  history,my-list,admin,content}`). Satu function dipilih dengan sengaja — lihat
  "Kenapa satu Function" di bawah.
- **Database & Auth**: Supabase (PostgreSQL terkelola + Supabase Auth). Logika watch-session
  ada di **fungsi SQL atomik** (`supabase/migrations/0002-0003*.sql`, disederhanakan di
  `0007_free_access.sql`), dipanggil lewat `service_role`, bukan ditulis sebagai query terpisah
  di Node — menghindari race condition dan membuat aturan bisnis terlihat di satu tempat.

MDFlix 100% gratis: tidak ada paket berbayar, transaksi, payment gateway, kuota, atau timer
menonton. Setiap akun yang login menonton tanpa batas.

## Kenapa satu Vercel Function

Paket Hobby Vercel membatasi jumlah Serverless Function. Dengan puluhan endpoint (auth, watch,
history, my-list, admin × banyak sub-rute), memisah tiap endpoint jadi function sendiri akan
melebihi batas itu dan memperlambat cold start (tiap function boot Node + inisialisasi klien
Supabase sendiri). Router internal (`server/router.js`) memakai pencocokan path sederhana (bukan
framework tambahan) dan membagi satu instance konteks (`server/context.js`: klien Supabase, cache
konten, rate limiter) antar-request pada instance yang sama — mengurangi cold start dan jumlah
koneksi database yang dibuka.

## Alur request

```
Vercel → api/[...path].js → createHandler() → dispatch()
  1. Cocokkan method+path ke ROUTES (server/router.js)
  2. Rate-limit per IP (kasar) — server/lib/rate-limit.js
  3. auth !== 'none' → authenticate(): verifikasi Bearer token ke Supabase Auth,
     baca profil (role, is_active) dari DATABASE — tidak pernah dari klaim token/klien
  4. auth === 'admin' → requireAdmin(): tolak jika role bukan ADMIN (dari DB), catat percobaan
  5. Handler dipanggil, memakai ctx.db() (service_role, lewati RLS) atau
     ctx.userDb(token) (publishable key + JWT user, RLS berlaku)
  6. sendError()/send(): respons seragam, tidak pernah membocorkan stack/secret
```

## Watch-session (server-authoritative)

**Prinsip**: klien tidak pernah mengirim jumlah detik/waktu. Klien hanya melaporkan *keadaan*
(`playing`/`paused`/`buffering`/`ended`) lewat heartbeat; server menghitung kredit dari **selisih
jam server** antar-heartbeat, hanya saat keadaan sebelumnya `playing`. Kredit ini murni untuk
analytics/monitoring admin ("Sedang menonton") — tidak pernah dipakai untuk membatasi menonton.

```
mdflix_watch_start   → tutup sesi lama user (1 sesi aktif/user), buat sesi baru (status "paused")
mdflix_watch_beat    → heartbeat periodik (juga dipakai untuk "end" via p_final)
  - seq harus naik (replay/duplikat diabaikan, tanpa efek samping)
  - kredit = min(now - last_heartbeat, MAX_CREDIT_SECONDS=30) HANYA jika last_state == 'playing'
  - heartbeat < MIN_GAP_SECONDS diabaikan (throttle)
  - diam > STALE_SECONDS=75 → sesi ditutup paksa (EXPIRED)
  - video selesai (state 'ended') atau klien menutup player (p_final) → sesi ENDED
```

Multi-tab/multi-device: unique index `watch_sessions (user_id) WHERE status='ACTIVE'` menjamin di
level database bahwa hanya ada satu sesi aktif; sesi lama otomatis `SUPERSEDED` (dengan kredit
ekor interval sebelum ditutup).

Lihat test perilaku lengkap (pause/buffering/replay/multi-session) di `tests/sql/watch.test.mjs`
dan `tests/api/security.test.mjs` ("perlindungan heartbeat (API)").

## Admin

Setiap tindakan admin (ubah role, aktifkan/nonaktifkan akun, ubah setting) lewat **fungsi SQL**
(`mdflix_admin_set_user`, `mdflix_admin_set_setting`) yang memverifikasi ulang bahwa pemanggil
adalah admin aktif **di dalam fungsi itu sendiri** (bukan hanya di middleware Node) dan menulis
audit log di transaksi yang sama — dua lapis pertahanan. Route API (`server/router.js`)
menambahkan lapis ketiga: `auth: 'admin'` memverifikasi role dari database sebelum handler
dipanggil sama sekali.

## Konfigurasi runtime (`app_settings`)

Info dukungan dan branding disimpan di tabel `app_settings` (bukan hardcode), divalidasi oleh
trigger `mdflix_validate_setting` (skema per key: hanya `support` dan `branding`), dan dapat
diubah admin lewat Konsol Admin → Pengaturan tanpa deploy ulang.
