# Laporan Integrasi — MDFlix Free Gen 2 + MDFlix Original

UI/UX Gen 2 dipertahankan. Konten film/series sekarang diambil dari API MDFlix Original dan diputar lewat server
embed dari sumber yang sama. Dokumen ini jujur tentang apa yang **sudah dibuktikan**, apa yang **tidak bisa
dibuktikan dari lingkungan pengembangan saya**, dan apa yang **harus Anda isi sendiri**.

## 1. Temuan audit yang mengubah rencana

| Temuan | Dampak |
|---|---|
| **Original tidak punya autentikasi sama sekali** — tidak ada Google OAuth, Supabase, login, atau sesi (kata "google" hanya Google Fonts; riwayat hanya `localStorage`). | Tidak ada konfigurasi Google yang bisa "dipindahkan". Login Google tetap memakai Supabase Auth milik Gen 2 (sudah ada dan matang). |
| **Original tidak punya fungsi episode.** Hanya menampilkan `numberOfSeasons`/`numberOfEpisodes` sebagai teks; series diputar lewat stream level-judul. | Saya tidak mengarang endpoint episode. Series memakai pemutar level-judul; episode nyata hanya muncul bila payload sumber menyertakannya (lihat §7). |
| Playback original = **iframe embed** (`stream.primaryIframe` + `stream.servers[]`), bukan MP4/HLS. Provider `legacy` Gen 2 sengaja memetakan playback ke `null`. | Tombol Tonton selalu "Video belum tersedia". Diperbaiki dengan tipe playback `embed` + komponen `EmbedPlayer`. |
| Di produksi, tanpa `CONTENT_API_BASE_URL`, Gen 2 menjawab **503** untuk seluruh katalog. | Default sekarang API original (tertanam), tanpa env. |
| **CSP `frame-src` hanya mengizinkan YouTube** dan `Permissions-Policy` hanya mendelegasikan fullscreen ke YouTube. | Browser memblokir semua pemutar embed. Dibuktikan di Chromium (§5) dan diperbaiki di `vercel.json`. |
| Host API berbeda di tiga tempat: `sulthan-stream.web.id` (INSPECTION.md), `tv.zaam.my.id` (README lama), `thanz-stream.web.id` (`ori_mdflix.zip` yang Anda kirim). | Memakai yang terbaru (`thanz-stream.web.id`). Host bisa diganti lewat `CONTENT_API_BASE_URL` bila pindah lagi. |
| `ori_mdflix.zip` ternyata arsip **7-Zip** berekstensi `.zip` (tidak bisa dibuka unzip biasa). | Saya ekstrak lewat libarchive. Perlu diketahui bila Anda membukanya sendiri. |

## 2. A. File yang diubah (25 diubah, 8 baru, 1 dihapus; dihitung dengan `diff` terhadap zip Gen 2 asli)

**Server — konten & auth**
- `server/content/providers/original.js` **(baru; menggantikan `legacy.js`)** — provider API original
- `server/content/models.js` — `Playback.type 'embed'` + `servers[]`; `Series.titleStream`
- `server/content/normalizers.js` — `mapEmbedPlayback`, id episode, `mapDetailEpisodes`; `inferType` lebih tepat
- `server/content/service.js` — `selectProvider` (default `original`, `legacy` = alias, `fixture` ditolak di produksi)
- `server/config/env.js` — default dialect `original`; env konten sepenuhnya opsional
- `server/auth/providers.js` **(baru)**, `server/context.js`, `server/public.js` — status provider Google di `/api/config/public`

**Frontend (UI Gen 2 tidak dirombak)**
- `src/components/EmbedPlayer.jsx` **(baru)** — iframe sandbox, tab server, mode kompatibel, timeout 15 dtk, overlay gagal
- `src/pages/Watch.jsx` — memilih `EmbedPlayer` bila `playback.type === 'embed'` (VideoPlayer tidak disentuh)
- `src/pages/Detail.jsx`, `src/components/Media.jsx`, `src/lib/format.js` — tombol "Tonton" series level-judul, label S/E
- `src/styles/player.css` — 6 aturan untuk `.player__frame` dan `.embed-bar` (memakai token desain yang ada)
- `src/lib/supabase.js` (klien singleton), `src/auth/AuthContext.jsx`, `src/pages/Auth.jsx`, `src/lib/authNext.js` **(baru)** — login Google

**Konfigurasi, skrip, test, docs**
- `vercel.json` (CSP `frame-src https:`, `fullscreen=*`), `package.json` (Node `22.x`, skrip `test:content`, `smoke:content`)
- `scripts/smoke-content.mjs` **(baru)**
- `tests/content/*` **(baru)**, `tests/e2e/embed-player.mjs` + `embed-harness.jsx` **(baru)**, `tests/api/functional.test.mjs`, `tests/stack/api.mjs` (sesuaikan perilaku default baru)
- `README.md`, `docs/{CHANGELOG,CONTENT_API,DEPLOY,GOOGLE_OAUTH}.md`, `environment/{.env.example,README.md}`, dokumen ini

**Tidak disentuh:** layout/navigasi/kartu/tipografi Gen 2, `VideoPlayer`, skema DB & migrasi, RLS, My List, Riwayat, Akun, Admin.

## 3. B. API yang digunakan

Seluruhnya dari `netlify/api/zaam-movies.js` pada project original, ditanam di `server/content/providers/original.js`:

```
ORIGINAL_API_BASE_URL = https://thanz-stream.web.id/api/movies      (endpoint publik, bukan secret)

GET {base}/popular?page=&type=      GET {base}/upcoming?page=
GET {base}/latest?type=             GET {base}/top-rated?page=&type=movie
GET {base}/search?q=&page=          GET {base}/detail/{slug}   ← detail, series, episode, dan sumber video
```

Header sama dengan original: `User-Agent` Chrome mobile, `Referer` ke host sumber, `Accept: */*`. Alur:
`API original → normalizer → model internal (zod) → cache → API MDFlix → UI Gen 2`. URL embed **tidak** ada di
metadata publik; hanya keluar dari `/movies/:id/stream` dan `/episodes/:id/stream` yang mewajibkan login + sesi tonton aktif.
Fixture hanya aktif lewat `CONTENT_API_DIALECT=fixture` di luar produksi; di produksi permintaan itu menghasilkan 503, bukan data contoh.

## 4. C. Authentication

Google Login = **Supabase Auth (OAuth Google, PKCE)** — sistem Gen 2 yang sudah ada, tidak diganti. Perbaikan:
`redirectTo` kini polos (`/auth/callback`, tujuan disimpan di `sessionStorage`) sehingga satu entri Redirect URL cukup;
klien Supabase browser jadi singleton (menghindari penukaran `?code=` ganda saat render ganda); tombol Google dinonaktifkan
dengan penjelasan bila Supabase menyatakan provider belum aktif. Session persist/refresh, `RequireAuth` untuk
`/account /my-list /history /watch /profile`, sinkronisasi profil server-side, dan logout tidak diubah.

**Google tidak bisa dibuat tanpa konfigurasi sama sekali** — Google mewajibkan OAuth client terdaftar, dan tidak ada
kredensial Google di kedua project. Minimum satu kali, tanpa mengubah kode (rinci di `docs/GOOGLE_OAUTH.md`):
(1) buat OAuth client di Google Cloud dengan redirect URI `https://<ref>.supabase.co/auth/v1/callback`;
(2) tempel Client ID & Secret di Supabase → Authentication → Providers → Google;
(3) set Site URL dan Redirect URL `https://<domain>/auth/callback`. Client Secret hanya di dashboard Supabase.

## 5. D. ENV

```
# WAJIB
SUPABASE_URL=                 # URL project Supabase (publik; dikirim ke browser lewat /api/config/public)
SUPABASE_PUBLISHABLE_KEY=     # publishable/anon key (aman untuk browser)
SUPABASE_SECRET_KEY=          # RAHASIA, server-only, tandai Sensitive di Vercel

# DISARANKAN
SITE_URL=                     # URL produksi, mis. https://mdflix.vercel.app (og:image & redirect)

# OPSIONAL — tidak perlu diisi agar konten jalan
CONTENT_API_BASE_URL=         # hanya bila host API original pindah (https://host atau https://host/api/movies)
CONTENT_API_DIALECT=          # original (default; legacy = alias) | native | fixture (dev saja)
```

Semua variabel di atas benar-benar dibaca kode (`server/config/env.js`). `GOOGLE_CLIENT_ID/SECRET` **bukan** env aplikasi.

## 6. E. Hasil build & test — apa yang dijalankan, apa yang tidak

| Pemeriksaan | Hasil |
|---|---|
| **`npm install` / `npm run build` (Vite)** | **TIDAK dijalankan.** Registri npm diblokir di sandbox saya (`x-deny-reason: host_not_allowed`). Jalankan sendiri / biarkan Vercel membangun. |
| Pengganti build: bundel seluruh `src/` dengan esbuild (paket npm eksternal) | Lolos, exit 0 — sintaks JSX dan seluruh graf impor/ekspor antar-modul valid |
| Cek nama tak terdefinisi (TypeScript API) di 66 file `src/ server/ api/ scripts/ tests/content/` | 0 temuan (pemeriksa divalidasi dengan sengaja menyisipkan 2 nama salah → terdeteksi) |
| `npm run test:content` — 32 test, **zod 3.23.8 asli**, router asli, mock upstream lokal | **32/32 lulus**. Uji mutasi: merusak provider 3 cara → test gagal; dipulihkan → hijau lagi |
| Test browser Chromium, HTTPS, header CSP/Permissions-Policy **persis dari `vercel.json`** (`tests/e2e/embed-player.mjs`) | **8/8 lulus**: CSP lama memblokir embed; CSP baru memuatnya; fullscreen terdelegasi; sandbox ketat memblokir navigasi top-level; ganti server; mode kompatibel; timeout → overlay gagal → muat ulang |
| `tests/sql`, `tests/api` (butuh Postgres + PostgREST) | **TIDAK dijalankan** (tidak ada di sandbox). Saya hanya menyesuaikan `functional.test.mjs` dan `stack/api.mjs`; blok "original" yang saya ubah diekstrak dan lulus terpisah. Jalankan `npm test` di mesin Anda |
| **API upstream sungguhan** | **TIDAK diuji** — sandbox tidak punya akses internet dan domain itu tidak muncul lewat pencarian. Test memakai mock yang meniru bentuk payload yang terdokumentasi di kode original. **Jalankan `npm run smoke:content`.** |
| Login Google end-to-end | **TIDAK diuji** — butuh kredensial Google & project Supabase sungguhan |

Catatan: test browser memakai React 19 global di sandbox, sedangkan proyek memakai React 18.3.1; komponen hanya memakai hook dasar.

## 7. Checklist fitur Gen 2

| Fitur | Status | Dasar |
|---|---|---|
| Homepage (hero + baris) | Diintegrasikan | API → router asli → JSON (test); UI tidak berubah |
| Search | Diintegrasikan | Test router; `q`/`page` sesuai original |
| Movie / Detail | Diintegrasikan | Test router; metadata tanpa URL stream |
| Series / Detail | Diintegrasikan, **bentuk payload belum terverifikasi live** | Musim dari payload; level-judul atau episode dari payload |
| Episode | **Hanya bila sumber menyertakannya** | Original tidak punya fungsi episode |
| Playback | Diintegrasikan | Embed di Chromium nyata + route `/stream` (login + sesi) |
| Login email, Logout, Account, My List | Tidak diubah | Kode tidak disentuh; test DB tidak bisa dijalankan di sini |
| Google Login | Kode diperbaiki, **belum e2e** | Butuh konfigurasi Google/Supabase (§4) |
| Riwayat | Berfungsi **tanpa resume** untuk embed | Embed lintas-origin tak membuka posisi; heartbeat mengirim `position: 0` |
| Responsif mobile/desktop | Tidak diubah | Komponen baru memakai token & kelas Gen 2; ditinjau lewat screenshot desktop |
| Vercel | Disesuaikan | CSP, Node `22.x`; build Vite belum dijalankan (§6) |

## 8. F. Masalah tersisa dan yang harus Anda lakukan

1. **Jalankan `npm install && npm run build && npm test` dan `npm run smoke:content`** — ini satu-satunya cara memastikan
   build Vite dan API sungguhan. Jika `smoke:content` menunjukkan bentuk payload series berbeda dari yang saya duga, hanya
   `mapDetailEpisodes`/`mapEmbedPlayback` di `normalizers.js` yang perlu disesuaikan, bukan UI.
2. **Isi konfigurasi Google dan tiga env wajib Supabase** (§4, §5). Tanpa itu login/menonton tidak berfungsi, katalog tetap tampil.
3. **Series:** daftar episode per-episode bergantung pada payload yang tidak bisa saya lihat. Selama sumber tidak mengirimnya,
   series diputar lewat satu pemutar level-judul (sama seperti original) dan pemilihan episode dilakukan di dalam pemutar sumber.
4. **Trade-off keamanan embed (sama dengan original):** `frame-src https:` diperlukan karena domain provider embed berganti-ganti;
   server tertentu (2Embed, SuperEmbed, VidSrc, VidLink) hanya mau diputar tanpa sandbox sehingga iklan popup/pengalihan bisa muncul.
   Sandbox ketat dipakai untuk server lain, dan UI memberi catatan saat mode kompatibel aktif.
5. **Ketergantungan pada API pihak ketiga tak resmi:** host-nya sudah berganti tiga kali antar versi project dan bisa mati kapan saja
   (stale-if-error menahan sementara; ganti host lewat `CONTENT_API_BASE_URL`). Konten diputar dari server embed pihak ketiga yang
   lisensinya tidak dapat diverifikasi dari kode; tanggung jawab lisensi konten ada pada operator situs.
6. Temuan lama yang **tidak** saya ubah: skrip `test:e2e` di `package.json` menunjuk `tests/e2e/run.mjs` yang tidak ada; teks beranda
   untuk pengunjung masih menyebut "kuota gratis harian" padahal kuota sudah dihapus.

## 9. Audit keamanan

Pencarian `API_KEY|SECRET|TOKEN|PASSWORD|SERVICE_ROLE|CLIENT_SECRET` di seluruh source: tidak ada kredensial di `src/`; bundel frontend
tidak memuat `sb_secret`, `service_role`, atau nama env server; secret Supabase hanya dibaca di `server/config/env.js` dan
`server/lib/supabase.js`. Satu-satunya literal bernada kunci adalah nilai dummy untuk test lokal (`sb_secret_test_…`). Base URL API konten
dan header `User-Agent`/`Referer` yang tertanam bukan secret. Tidak ada credential palsu atau OAuth bypass yang dibuat.
