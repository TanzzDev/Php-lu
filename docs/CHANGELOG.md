# Changelog

`docs/INSPECTION.md` dan `docs/MIGRATION_REPORT.md` adalah catatan historis dari pengerjaan
sebelumnya (migrasi dari "ZaamMovie" ke MDFlix) — isinya dibiarkan apa adanya sebagai arsip,
termasuk penyebutan membership/payment yang saat itu memang ada. Entri di bawah mencatat
perubahan setelahnya, terbaru di atas.

## 100% gratis (migrasi `0007_free_access.sql`)

**Dihapus:**
- Seluruh sistem membership berbayar (paket Free/Premium/Pro, tabel `memberships`).
- Seluruh sistem pembayaran (`server/payment/*`, tabel `transactions`, payment gateway adapter,
  webhook, halaman checkout/status pembayaran, `docs/PAYMENT_GATEWAY.md` — disisakan sebagai stub).
- Kuota/timer menonton harian (tabel `watch_usage_daily`, fungsi `mdflix_quota_state`,
  `mdflix_effective_plan`, `mdflix_apply_membership`, `mdflix_settle_paid`,
  `mdflix_mark_transaction`, `mdflix_expire_if_needed`).
- Halaman & komponen UI terkait: `src/pages/Billing.jsx`, `src/components/Billing.jsx`, panel
  Membership di Profil/Account, halaman admin Memberships & Transactions, kolom plan pada tabel
  admin (Users, Watching Now).
- Kunci `app_settings`: `pricing`, `free`, `payment` (tersisa hanya `support` dan `branding`).
- Dependency `qrcode` (hanya dipakai UI checkout QRIS yang sudah dihapus).

**Dipertahankan/diubah bentuk (bukan dihapus):**
- `watch_sessions`/`mdflix_watch_start`/`mdflix_watch_beat` — sesi tetap dilacak untuk Continue
  Watching, riwayat, dan monitoring admin ("Sedang menonton"); hanya pemeriksaan kuotanya yang
  dibuang. `accumulated_seconds` per sesi kini murni untuk analytics, tidak lagi dibatasi kuota
  harian.
- Admin overview (`mdflix_admin_overview`) — angka revenue/plan diganti `totalUsers`,
  `activeUsers`, `admins`, `newUsersToday`, `currentlyWatching`, `totalWatchedTitles`.
- Adapter Content API (`server/content/providers/*`, env var `CONTENT_API_BASE_URL`/
  `CONTENT_API_DIALECT`) — **tidak diubah**. Tetap generik/dikonfigurasi lewat environment
  variable, kosong secara default (data fixture saat development, `503` jujur di production).
  Lihat `docs/CONTENT_API.md`.

**Tidak berubah:** autentikasi (Supabase Auth + Google OAuth), profil, watch history, Continue
Watching, My List, Likes, admin (users, watching now, history, audit log), RLS, branding MDFlix.
