# Content API — kontrak internal & adapter

MDFlix tidak pernah bergantung langsung pada struktur URL/response provider konten manapun.
Seluruh frontend dan business logic (watch-session, riwayat, My List) hanya
berbicara dengan **model internal** di bawah, lewat `server/content/service.js`. Provider yang
sesungguhnya "dipetakan" di satu lapisan adapter (`server/content/providers/*.js`). Mengganti
provider produksi = mengganti/menambah satu adapter + `CONTENT_API_BASE_URL`, tanpa menyentuh UI.

```
Provider (HTTP)  →  normalizer  →  model internal (Zod-validated)  →  cache  →  API MDFlix  →  frontend
```

## Provider yang tersedia

| `CONTENT_API_DIALECT` | Kapan dipakai | Sumber |
|---|---|---|
| `legacy` (default) | `CONTENT_API_BASE_URL` mengarah ke API dengan tata letak endpoint yang **sama seperti project asli** (`Guest-fixed.zip`) — `/api/movies/popular\|latest\|upcoming\|top-rated\|search`, `/api/movies/detail/{slug}` | `server/content/providers/legacy.js` |
| `native` | `CONTENT_API_BASE_URL` mengarah ke API yang mengikuti **kontrak internal MDFlix** di bawah secara langsung | `server/content/providers/native.js` |
| *(kosong)* | `CONTENT_API_BASE_URL` tidak diisi | Development: `fixture.js` (data fiktif, jelas berlabel). **Produksi (`VERCEL_ENV=production`): `unavailable.js`** — katalog mengembalikan `503 CONTENT_UNAVAILABLE`, tidak pernah diam-diam menampilkan data contoh ke pengguna sungguhan. |

Provider `legacy` **hanya memetakan metadata** (judul, poster, genre, cast, seasons). Ia dengan
sengaja **tidak memetakan playback** (`getMoviePlayback`/`getEpisodePlayback` → `null`), karena
sumber lama menyediakan tautan `iframe` embed pihak ketiga yang (a) tidak bisa diukur untuk
timer kuota Free yang akurat, dan (b) asal lisensinya tidak dapat diverifikasi dari kode. Selama
memakai dialect ini, tombol Tonton akan menampilkan "Video belum tersedia" — ini keadaan yang
jujur, bukan bug. Ketika Content API produksi Anda (yang Anda kontrol sendiri, sesuai instruksi
"CONTENT_API_BASE_URL=https://sulthan-stream.com") menyediakan sumber video langsung (MP4/HLS),
tambahkan pemetaannya di `native.js`, atau tulis adapter baru — lihat "Membuat adapter baru" di
bawah.

## Model internal

```ts
Summary  { id, type: 'movie'|'series', title, poster, backdrop, year, rating, genres[], description }
Movie    extends Summary { releaseDate, tagline, trailer, status, cast[], duration, director }
Series   extends Summary { releaseDate, tagline, trailer, status, cast[], creator, seasons[] }
Season   { number, title, episodeCount }
Episode  { id, seriesId, seasonNumber, episodeNumber, title, description, thumbnail, duration }
Playback { source, type: 'hls'|'mp4'|'webm', quality, subtitles[], audio[], duration, expiresAt }
```

Didefinisikan sebagai skema Zod di `server/content/models.js` — setiap response provider
divalidasi lewat skema ini sebelum sampai ke frontend (`server/content/service.js`). Data yang
tidak lolos validasi (URL berbahaya, field hilang) **dibuang senyap**, bukan diteruskan mentah —
lihat contoh di `tests/api/functional.test.mjs` ("provider native … membuang data tak valid").

## Kontrak endpoint internal (dialect `native`)

```
GET  /api/movies?list=&type=&genre=&page=
GET  /api/movies/search?q=&page=
GET  /api/movies/{id}
GET  /api/movies/{id}/stream
GET  /api/series/{id}
GET  /api/series/{id}/seasons
GET  /api/series/{id}/seasons/{season}/episodes
GET  /api/episodes/{id}
GET  /api/episodes/{id}/stream
GET  /api/recommendations?basedOn=
```

Ini persis kontrak yang diminta di brief — dipakai apa adanya oleh `native.js`. Jika Content API
produksi Anda punya struktur field yang berbeda (nama field lain, unit durasi berbeda, dll),
**ubah hanya di adapter**, endpoint kontrak di atas tidak perlu berubah.

## Membuat adapter baru

1. Salin `server/content/providers/native.js` sebagai titik awal.
2. Gunakan helper toleran di `server/content/normalizers.js` (`mapSummary`, `mapMovie`,
   `toSeconds`, `toRating`, dll.) — helper ini sudah menangani variasi nama field umum (mis.
   `poster`/`posterUrl`/`image`/`thumbnail`, durasi dalam menit vs detik vs teks "1h 52m").
3. Daftarkan di `selectProvider()` (`server/content/service.js`) dengan nilai
   `CONTENT_API_DIALECT` baru.
4. Jangan mengklaim `playback` tersedia (`getMoviePlayback`/`getEpisodePlayback`) kecuali
   provider benar-benar mengembalikan URL sumber video langsung yang bisa diputar `<video>`/HLS.

## Data pengembangan (fixture)

`server/content/fixtures/data.js` — 12 film + 4 series fiktif, ditandai jelas
(`DEV_NOTICE = 'Data pengembangan — bukan konten berlisensi.'`) di setiap deskripsi. Poster/
backdrop dibuat sendiri sebagai SVG bergradien (`scripts/gen-fixtures.mjs`, tanpa aset pihak
ketiga) dan video sampel adalah video uji sintetis 60 detik (`testsrc2` + nada sinus dari
ffmpeg), bukan cuplikan film apa pun. Provider ini **tidak pernah aktif di produksi**
(`env.isProd` → `unavailable.js`).
