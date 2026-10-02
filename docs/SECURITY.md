# Keamanan

## Model akses data

Tiga peran Postgres dipakai (standar Supabase):

| Role | Dipakai oleh | Akses |
|---|---|---|
| `anon` | Browser, belum login | **Tanpa akses** ke tabel MDFlix maupun fungsi (lihat di bawah) |
| `authenticated` | Browser, sudah login (JWT user) | Baca/tulis **miliknya sendiri saja**, dibatasi RLS + GRANT kolom |
| `service_role` | Server (`SUPABASE_SECRET_KEY`) | Penuh, melewati RLS — **tidak pernah** dikirim ke browser |

### Kenapa REVOKE eksplisit diperlukan

Supabase secara default memberi `anon`/`authenticated`/`service_role` akses penuh ke **tabel dan
fungsi baru** di schema `public` (lewat `ALTER DEFAULT PRIVILEGES`). Tanpa `REVOKE` eksplisit,
user yang login biasa bisa memanggil `rpc/mdflix_admin_set_user` langsung lewat Data API dan
menjadikan dirinya admin — RLS pada tabel tidak melindungi dari ini karena fungsi
`SECURITY DEFINER` berjalan dengan hak pembuatnya, bukan hak pemanggil.

`supabase/migrations/0005_security.sql` mencabut semua privilege bawaan lalu memberi kembali
seminimal mungkin: **semua fungsi `mdflix_*`/`_mdflix_*` hanya bisa dieksekusi `service_role`**.
Ini diuji langsung: `tests/sql/security.test.mjs` mencoba memanggil fungsi sensitif lewat REST
API dengan token user biasa (dan bahkan token admin) dan mengharapkan `403`/permission denied —
lihat `"authenticated tidak bisa memanggil fungsi sensitif (RPC lewat Data API)"`.

### RLS per tabel

| Tabel | `authenticated` boleh | Ditolak |
|---|---|---|
| `profiles` | SELECT/UPDATE baris sendiri; kolom `role`/`is_active`/`email`/`created_at`/`last_login_at` diblokir trigger (`mdflix_protect_profile`) walau RLS suatu saat longgar | Melihat/mengubah profil user lain, menaikkan role sendiri |
| `watch_sessions` | SELECT baris sendiri | Semua tulis (hanya lewat fungsi watch-start/beat) |
| `watch_history` | SELECT/DELETE baris sendiri | INSERT/UPDATE langsung (hanya lewat fungsi watch-beat) |
| `my_list` | SELECT/INSERT/DELETE baris sendiri | Baris milik user lain |
| `audit_logs`, `app_settings` | **Tidak ada kebijakan** → tertutup total, termasuk untuk admin lewat klien | — |

`audit_logs` juga immutable di level trigger (`mdflix_audit_immutable`): `UPDATE`/`DELETE`/
`TRUNCATE` ditolak untuk siapa pun termasuk `service_role`, memastikan jejak audit tidak bisa
dihapus bahkan oleh bug di kode server.

## Perlindungan spesifik yang diuji (`tests/api/security.test.mjs`, `tests/sql/security.test.mjs`)

- **Eskalasi privilege**: user tidak bisa menjadikan diri admin lewat API, Data API langsung,
  header palsu (`x-role: ADMIN`), atau body request.
- **IDOR**: sesi menonton, riwayat, My List, dan detail admin-user tidak bisa diakses lintas-user
  (percobaan mengirim `userId` orang lain diuji eksplisit).
- **Manipulasi heartbeat**: `watchedSeconds`/`seconds`/`credited` di body ditolak validasi (Zod
  `.strict()` menolak field asing — server menghitung sendiri dari jam server), nilai
  posisi/durasi negatif/`NaN`/raksasa ditolak, heartbeat duplikat/replay tidak menambah kredit,
  banjir heartbeat dibatasi rate-limit **dan** hanya mengkredit waktu nyata yang berlalu. Tidak ada
  kuota atau timer yang bisa "habis" — MDFlix 100% gratis dan tanpa batas.
- **Kebocoran informasi**: respons API tidak pernah memuat secret key (dipindai otomatis di test);
  error 500 tidak membocorkan stack trace/path internal (`server/lib/errors.js` + `redact()` di
  `server/config/env.js`).
- **CORS/cache**: tidak ada `Access-Control-Allow-Origin` terbuka; data milik-user selalu
  `Cache-Control: no-store`; katalog publik boleh `public` (dengan `Vercel-CDN-Cache-Control`
  terpisah dari cache browser).

## Rate limiting

`server/lib/rate-limit.js` — in-memory, per-instance (best-effort pada serverless; setiap cold
start/instance punya penghitung sendiri). Diterapkan pada: mulai/heartbeat watch-session dan batas
kasar per-IP/per-user global. Untuk batas yang benar-benar global lintas-instance, tambahkan Vercel
Firewall / WAF rate limiting di level edge — di luar cakupan kode aplikasi.

## Yang tidak pernah dipercaya dari klien

Role, status akun, dan jumlah detik menonton — semuanya divalidasi ulang atau dihitung ulang di
server/database, bukan dari nilai yang dikirim klien. Field yang tidak dikenal pada body request
**ditolak** (bukan diabaikan) lewat `zod().strict()`, sehingga mencoba menyelundupkan field seperti
`plan`, `membership`, atau `role` ke endpoint manapun akan menghasilkan `422`, bukan diam-diam
diabaikan.
