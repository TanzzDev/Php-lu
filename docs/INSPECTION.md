# Inspeksi project asli (`Guest-fixed.zip`)

Dilakukan **sebelum** perubahan apa pun, sesuai instruksi brief §1. Isi zip: 6 file, ~89 KB.
Salinan utuh disimpan terpisah selama pengerjaan untuk verifikasi silang.

```
Guest-fixed/
├── README.md
├── netlify.toml
├── netlify/api/zaam-movies.js
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## Identitas project asli

**"ZaamMovie"** oleh **@Zaam** — "Platform info & streaming film" (dari `README.md`). Bukan MDFlix,
bukan project kosong — project nyata dengan fitur berjalan yang perlu diperiksa dulu sebelum
diubah.

## Framework, package manager, entry point

- **Tidak ada framework** (bukan React/Vue/dll) dan **tidak ada `package.json`** — vanilla
  HTML/CSS/JavaScript murni, dimuat sebagai `<script>` biasa.
- **Package manager**: tidak ada (tidak ada dependency ter-install).
- **Entry point**: `public/index.html` memuat `public/css/style.css` dan `public/js/app.js`
  (±1121 baris) secara langsung.
- **Routing**: client-side memakai History API asli (`history.pushState`/`replaceState`) ke path
  seperti `/film/{slug}` dan `/nonton/{slug}`, dengan fallback SPA di `netlify.toml`
  (`/* → /index.html`, status 200). Bukan hash-based, bukan React Router.

## Arsitektur frontend

- DOM helper minimal (`$`/`$$` = `querySelector`/`querySelectorAll`), tanpa virtual DOM.
- Navigasi **sidebar kanan** (desktop) yang otomatis berpindah menjadi **navbar bawah** (mobile)
  pada breakpoint 900px — konsep yang saya pertahankan semangatnya di MDFlix (bottom nav mobile,
  top nav desktop) meski markup & class diganti total sesuai brief §5.
- Proteksi klik-kanan/drag pada `<img>` (`contextmenu`/`dragstart` di-preventDefault) — **kosmetik,
  tidak dipertahankan** di MDFlix (tidak diminta eksplisit brief, dan mudah di-bypass sehingga
  bukan proteksi berarti).
- Top loading bar (`#topload`, width 70%→100%) saat `apiCall()` berjalan — diganti dengan
  skeleton/spinner state per komponen di MDFlix (lebih sesuai arah "loading state profesional").
- Ikon: SVG `<symbol>` sprite inline di `index.html` (14 ikon). Diganti dengan set ikon React
  sendiri (`src/components/Icon.jsx`, garis 1.75, grid 24) — tidak ada aset dicopy.

## API routes & content provider

**Bukan REST path per action** seperti dugaan awal — `netlify/api/zaam-movies.js` adalah **satu**
Netlify Function dengan **satu action ditentukan lewat query-string**:

```
/.netlify/functions/zaam-movies?action=popular&type=all&page=1
                                  action=upcoming&page=1
                                  action=latest&type=all
                                  action=top-rated&type=movie&page=1
                                  action=search&q=...&page=1
                                  action=detail&slug=...      (alias: action=stream)
```

`netlify.toml` mengalias `/api/*` → function ini (`to = "/.netlify/functions/zaam-movies/:splat"`,
status 200, force). Function ini sendiri **memproxy** ke sumber data eksternal:

```js
const BASE_URL = "https://sulthan-stream.web.id/api/movies";
```

dengan header `User-Agent`/`Referer` disamarkan sebagai browser mobile, memanggil endpoint
**path-based** di upstream tsb (`${BASE_URL}/popular?...`, `/upcoming?...`, `/latest?...`,
`/top-rated?...`, `/search?...`, `/detail/{slug}`). README menyebutnya eksplisit sebagai "wrapper
scraper film". Sesuai batasan brief (§9: "Jangan melakukan scraping baru, reverse engineering,
bypass DRM/authentication/paywall/anti-bot"), **saya tidak memperluas atau memperbaiki logika
scraping ini** — seluruh folder `netlify/` dihapus dari MDFlix, tidak diikutsertakan maupun
di-port dalam bentuk apa pun.

Yang **dipertahankan** dari file ini (dipindah ke lapisan Content Provider Adapter MDFlix, bukan
dibuang begitu saja):
- **Bentuk endpoint upstream** (path-based: `/popular`, `/latest`, `/upcoming`, `/top-rated`,
  `/search`, `/detail/{slug}`) → jadi dasar `server/content/providers/legacy.js` (dialect
  `CONTENT_API_DIALECT=legacy`, default), untuk kompatibilitas bila `CONTENT_API_BASE_URL`
  produksi Anda memakai struktur serupa.
- **Cache in-memory 1 jam untuk data yang sama bagi semua orang** (`CACHEABLE_ACTIONS`,
  `memoryCache`) → jadi `server/content/cache.js` (TTL cache + stale-if-error), dipakai
  `server/content/service.js` untuk `list()`/`home()`.
- **Amplop respons yang bervariasi** (`data.results || data`) → `unwrapList`/`unwrapObject`
  di `server/content/normalizers.js` menangani ini plus beberapa bentuk lain.

## Normalisasi data (`normalizeItem`, `normalizeDetail`, `normalizeCastMember`)

Bagian **paling berguna dan paling langsung saya pertahankan** — logikanya diadaptasi hampir 1:1
ke `server/content/normalizers.js` (kini berjalan di server, bukan browser):

- `normalizeItem`: helper `pick(...keys)` mencoba banyak kemungkinan nama field (`title`/`judul`/
  `name`/`nama`, `poster`/`image`/`thumbnail`/`img`/`cover`, `rating`/`score`/`vote_average`/
  `nilai`, `slug`/`id`/`url`/`link`/`href`, dst) — pola persis ini saya pakai lagi di
  `mapSummary()`/`mapMovie()`/`mapSeries()`.
- `normalizeDetail`: mengenali `stream.primaryIframe` / `stream.servers[]` (array
  `{server,url}`) sebagai sumber pemutaran — **konfirmasi konkret** bahwa sumber data lama
  memakai **iframe embed pihak ketiga**, bukan URL video langsung. Ini alasan teknis mengapa
  `providers/legacy.js` di MDFlix **sengaja tidak memetakan `playback`** (lihat
  `docs/CONTENT_API.md`) — embed semacam ini tidak bisa diukur untuk timer kuota Free yang akurat
  (§13 brief: "Timer hanya berkurang ketika video benar-benar sedang diputar"), dan MDFlix
  memutar video lewat elemen `<video>`/HLS sendiri (§32), bukan `<iframe>`.
- `normalizeCastMember`: menangani pemeran berbentuk string biasa atau objek, dan path relatif
  ala TMDB (`profile_path`, mis. `/eASy0n....jpg`) yang perlu dilengkapi jadi URL penuh
  (`https://image.tmdb.org/t/p/w185...`) — dipertahankan persis sebagai `imageUrl()` +
  opsi `tmdbPaths` di `normalizers.js`.

## Autentikasi, database, environment variables

**Tidak ada satu pun.** Tidak ada login, tidak ada session, tidak ada database (Supabase/lainnya),
tidak ada `.env`/`.env.example`, tidak ada baris kode yang membaca `process.env`. "History" yang
disebut README ("riwayat film yang dibuka") tersimpan **di `localStorage` browser** — per-perangkat,
hilang saat cache dibersihkan, tidak bisa disinkronkan lintas perangkat. Ini **diganti dengan
sengaja** oleh tabel `watch_history` di database MDFlix (§16-18 brief secara eksplisit meminta
watch history & My List tersimpan di database, bukan localStorage) — bukan hilang tanpa alasan.

## Membership, payment, admin

**Tidak ada satu pun** — tidak ada konsep user/akun, sehingga tidak ada membership, tidak ada
transaksi/pembayaran, tidak ada dashboard admin. Seluruh sistem ini (§10-28 brief) dibangun baru
sepenuhnya di MDFlix; tidak ada yang bisa "dipertahankan" karena memang belum ada.

## Konfigurasi Vercel, serverless functions, service worker

- **Vercel**: tidak ada `vercel.json` — project ini ditujukan untuk **Netlify** (`netlify.toml`
  mengatur `publish`, `functions`, redirects, headers keamanan dasar `X-Frame-Options`/
  `X-Content-Type-Options`). Header ini dipertahankan semangatnya (dan diperluas jauh lebih ketat
  dengan CSP penuh) di `vercel.json` MDFlix.
- **Serverless functions**: satu, `netlify/api/zaam-movies.js` (Netlify Functions format,
  `exports.handler`) — **tidak kompatibel langsung** dengan format Vercel Functions (`export
  default`). Diganti arsitektur baru: satu Vercel Function (`api/[...path].js`) dengan router
  internal — lihat `docs/ARCHITECTURE.md#kenapa-satu-vercel-function`.
- **Service worker / cache**: tidak ada.
- **PWA metadata**: tidak ada `manifest.json`/ikon PWA.

## Static assets

`public/` hanya berisi `css/`, `js/`, dan `index.html` — **tidak ada folder gambar/aset biner**.
Poster/backdrop di UI asli berasal 100% dari URL API eksternal (kadang path relatif TMDB), dengan
**fallback placeholder inline SVG data-URI** (`PLACEHOLDER_POSTER`/`PLACEHOLDER_AVATAR`, digambar
langsung di `app.js` sebagai string SVG, teks "ZaamMovie" di atas kanvas gelap) saat gambar API
kosong/gagal — pola serupa (fallback tipografis saat poster gagal dimuat) saya pertahankan sebagai
`.card__ph` / komponen `Poster` di MDFlix.

## Routing (ringkasan)

Path History-API: `/home`, `/search`, `/rekomendasi`, `/history`, `/info`, `/film/{slug}`,
`/nonton/{slug}`. Nama path diganti di MDFlix mengikuti struktur & branding baru (`/`, `/search`,
`/movie/:id`, `/series/:id`, `/watch/:kind/:id`, dst) — ini pilihan penamaan internal, bukan
kontrak publik yang perlu dipertahankan identik.

## CSS / design system

Nama tema asli: **"Cinematic Film-Strip Design System"** — palet dasar hitam-nyaris-total +
aksen **gold** (`#e3b23c`) + **crimson** (`#c1272d`), font `Bebas Neue` (display) + `Plus Jakarta
Sans` (body) + `IBM Plex Mono` (data), custom properties di `:root`, breakpoint sidebar↔bottomnav
di 900px. **Arah visual dasarnya (gelap + satu warna aksen keemasan, tipografi display tegas)
selaras dengan brief §4** ("Premium cinematic … dark/black foundation … Typography kuat") — MDFlix
melanjutkan semangat itu dengan token warna, font (Archivo Variable + Figtree Variable), dan
seluruh markup/class yang **ditulis ulang total** (bukan reskin), sesuai instruksi eksplisit
brief §4 ("Jangan hanya mengganti nama dan logo … redesign tampilan menjadi UI MDFlix") dan §2
("Jangan menyalin logo, asset proprietary, atau layout identik").

## Error handling

`apiCall()` menangkap error fetch dan mengembalikan `{status:false, code:0, message:'Tidak dapat
terhubung ke server.'}`; UI menampilkan pesan tersebut. Sederhana, tidak membedakan jenis error.
MDFlix memperluas ini menjadi state error/kosong per-domain yang lebih spesifik (§36 brief) di
level server (`server/lib/errors.js`) maupun UI (`ErrorState`/`EmptyState`).

## Third-party services / API dependencies

Satu: `https://sulthan-stream.web.id/api/movies` (upstream data film, dipanggil dari server lewat
`zaam-movies.js`, bukan langsung dari browser). Tidak ada Google Fonts self-host (dimuat dari CDN
`fonts.googleapis.com`), tidak ada analytics, tidak ada payment gateway, tidak ada auth provider.

## Kesimpulan inspeksi

Project asli adalah **frontend katalog film read-only** yang solid untuk lingkupnya (normalisasi
data yang toleran, UX responsif dasar, caching sisi server) tetapi **tidak memiliki** akun,
database, membership, pembayaran, admin, atau pemutaran video native — seluruhnya berada di luar
cakupan aslinya. Bagian yang **benar-benar dipertahankan dan dipakai ulang** ke MDFlix: pola
normalisasi field yang toleran (`pick()` multi-nama-field), penanganan path relatif TMDB untuk
foto pemeran, konsep cache 1-jam untuk data publik, dan struktur endpoint upstream (untuk
kompatibilitas lewat `CONTENT_API_DIALECT=legacy`). Semua yang lain (autentikasi, database,
membership, pembayaran, watch-session, admin, desain visual, sistem ikon, tipografi, dan seluruh
markup) dibangun baru, sesuai instruksi brief.
