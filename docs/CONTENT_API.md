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
| `original` (**default**; `legacy` = alias) | API konten **MDFlix Original** — `https://thanz-stream.web.id/api/movies`, **tertanam di source**. `CONTENT_API_BASE_URL` hanya untuk mengganti host bila API itu pindah. | `server/content/providers/original.js` |
| `native` | `CONTENT_API_BASE_URL` mengarah ke API yang mengikuti **kontrak internal MDFlix** di bawah (wajib mengisi `CONTENT_API_BASE_URL`; tanpa itu → 503) | `server/content/providers/native.js` |
| `fixture` | Data fiktif untuk pengembangan offline & test. **Produksi (`VERCEL_ENV=production`) menolaknya** → `unavailable.js` → katalog `503 CONTENT_UNAVAILABLE`; data contoh tidak pernah tampil ke pengguna sungguhan. | `server/content/providers/fixture.js` |

### Provider `original` — endpoint yang dibawa dari project original

Project original hanya membungkus satu API publik (tanpa kunci/secret) di `netlify/api/zaam-movies.js`.
Mapping endpoint-nya dipertahankan apa adanya:

| MDFlix | Request ke upstream | Catatan |
|---|---|---|
| `list popular` | `GET {base}/popular?page=&type=` | `type` hanya `all`/`movie` |
| `list latest` | `GET {base}/latest?type=` | tanpa `page` (seperti original) |
| `list upcoming` | `GET {base}/upcoming?page=` | tanpa `type` |
| `list top_rated` | `GET {base}/top-rated?page=&type=movie` | original selalu `movie` |
| `search` | `GET {base}/search?q=&page=` | minimal 2 karakter |
| `movie` / `series` / `episode` / playback | `GET {base}/detail/{slug}` | "stream" di original = alias detail; sumber video ada di payload `stream` |

Header yang dikirim sama dengan function original: `User-Agent` Chrome mobile, `Referer` ke host sumber,
`Accept: */*`. Series disaring dari daftar `all` di sisi MDFlix, sehingga nilai `type=series`/`tv` yang tidak
terbukti diterima sumber tidak pernah dikirim.

**Playback = embed.** Payload detail membawa `stream: { primaryIframe, servers: [{ server, url }] }`. Provider memetakannya
menjadi `Playback { type: 'embed', source, servers[] }`; hanya URL `https:` yang lolos (`javascript:`, `data:`, `http:`
dibuang; `//host/x` dianggap https). URL embed **tidak** ada di metadata publik — hanya keluar dari `GET /movies/:id/stream`
dan `GET /episodes/:id/stream`, yang mewajibkan login + sesi tonton aktif untuk konten yang sama.

**Series.** Original **tidak punya** endpoint/fungsi episode — ia hanya menampilkan `numberOfSeasons`/`numberOfEpisodes`
dan memutar series lewat `stream` level-judul. Perilaku itu dipertahankan:

- Bila payload detail menyertakan episode **dengan stream sendiri** (`seasons[].episodes[]` atau `episodes[]`) → daftar
  episode nyata (`id` = `{seriesId}:s{musim}e{episode}`) dan playback per-episode.
- Selain itu → `series.titleStream = "{seriesId}:play"`; Detail menampilkan tombol **Tonton** yang memutar stream level-judul
  (episode semu musim 0 / episode 0 — label S/E disembunyikan di UI). Pemilihan episode ditangani pemutar sumber.
- Tidak ada episode atau endpoint yang dikarang. Bentuk payload series sungguhan belum dapat diverifikasi dari sandbox
  pengembangan; jalankan `npm run smoke:content` untuk melihat apa yang benar-benar dijawab API.

**Riwayat tonton.** Pemutar embed lintas-origin tidak membuka status/posisi putar, jadi riwayat hanya mencatat bahwa judul
dibuka (posisi 0) dan tidak ada "lanjutkan dari menit ke-N" untuk sumber embed.

## Model internal

```ts
Summary  { id, type: 'movie'|'series', title, poster, backdrop, year, rating, genres[], description }
Movie    extends Summary { releaseDate, tagline, trailer, status, cast[], duration, director }
Series   extends Summary { releaseDate, tagline, trailer, status, cast[], creator, seasons[], titleStream }
Season   { number, title, episodeCount }
Episode  { id, seriesId, seasonNumber, episodeNumber, title, description, thumbnail, duration }
Playback { source, type: 'hls'|'mp4'|'webm'|'embed', quality, subtitles[], audio[], servers[{name,url}], duration, expiresAt }
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
