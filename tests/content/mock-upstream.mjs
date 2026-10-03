// Mock API konten untuk TEST — meniru tata letak endpoint & bentuk payload yang terdokumentasi
// di project original (netlify/api/zaam-movies.js dan komentar normalizeDetail di app.js):
//   /api/movies/{popular|latest|upcoming|top-rated|search|detail/{slug}}
//   detail: { id, slug, type, title, poster, backdrop, rating, year, releaseDate, synopsis, tagline,
//             duration, status, genres[], director, cast[], trailer, imdbId, numberOfSeasons,
//             numberOfEpisodes, seasons[], stream: { primaryIframe, servers: [{ server, url }] } }
//
// PENTING: ini BUKAN API sungguhan. Test yang memakainya membuktikan bahwa adapter MDFlix membangun
// permintaan yang benar dan memetakan bentuk data tersebut — bukan bahwa API produksi berperilaku
// sama. Untuk itu jalankan `npm run smoke:content` (memanggil API sungguhan).
import http from 'node:http';

export const MOVIE_ITEM = { slug: 'movie-1', title: 'Film Uji Satu', poster: 'https://img.example/p1.jpg', rating: 7.1, year: 2021, type: 'Movie' };
export const TV_ITEM = { slug: 'tv-9', title: 'Serial Uji Sembilan', poster: '/abc123.jpg', vote_average: 82, release_date: '2022-03-04', type: 'tv' };

const DETAIL = {
  'movie-1': {
    id: 'movie-1', slug: 'movie-1', type: 'Movie', title: 'Film Uji Satu', poster: 'https://img.example/p1.jpg',
    backdrop: 'https://img.example/b1.jpg', rating: 7.1, year: 2021, releaseDate: '2021-05-01', synopsis: 'Sinopsis uji.',
    tagline: 'Tagline uji', duration: '1h 52m', status: 'Released', genres: ['Aksi', 'Drama'], director: 'Sutradara Uji',
    cast: [{ name: 'Aktor Uji', character: 'Tokoh', profile_path: '/p.jpg' }, 'Nama Saja'],
    trailer: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', imdbId: 'tt0000001', numberOfSeasons: 0, seasons: [],
    stream: {
      primaryIframe: 'https://embed.example/movie/1',
      servers: [
        { server: '2Embed', url: 'https://embed.example/movie/1' },
        { server: 'VidSrc', url: '//vidsrc.example/embed/1' },
        { server: 'Jahat', url: 'javascript:alert(1)' },
        { server: 'Polos', url: 'http://insecure.example/x' },
        { server: 'Duplikat', url: 'https://embed.example/movie/1' },
      ],
    },
  },
  // film tanpa satu pun URL embed yang aman
  'movie-nostream': {
    id: 'movie-nostream', slug: 'movie-nostream', type: 'Movie', title: 'Film Tanpa Stream',
    stream: { servers: [{ server: 'Jahat', url: 'javascript:alert(1)' }] },
  },
  // series dengan stream level-judul saja (seperti yang dipakai original)
  'tv-9': {
    id: 'tv-9', slug: 'tv-9', type: 'TV Series', title: 'Serial Uji Sembilan', poster: 'https://img.example/t9.jpg',
    backdrop: 'https://img.example/t9b.jpg', rating: 8.2, year: 2022, synopsis: 'Sinopsis serial.', genres: ['Drama'],
    numberOfSeasons: 2, numberOfEpisodes: 18,
    seasons: [{ seasonNumber: 1, name: 'Musim 1', episodeCount: 8 }, { seasonNumber: 2, name: 'Musim 2', episodeCount: 10 }],
    cast: [], stream: { primaryIframe: 'https://embed.example/tv/9', servers: [{ server: 'VidLink', url: 'https://embed.example/tv/9' }] },
  },
  // series yang payload-nya menyertakan episode dengan stream sendiri
  'tv-77': {
    id: 'tv-77', slug: 'tv-77', type: 'tv', title: 'Serial Beres Episode', poster: 'https://img.example/t77.jpg',
    seasons: [
      { seasonNumber: 1, name: 'Musim 1', episodes: [
        { episode: 1, title: 'Pilot', stream: { servers: [{ server: 'A', url: 'https://embed.example/tv/77/1/1' }] } },
        { episode: 2, title: 'Dua', stream: { servers: [{ server: 'A', url: 'https://embed.example/tv/77/1/2' }] } },
      ] },
      { seasonNumber: 2, name: 'Musim 2', episodes: [{ episode: 1, title: 'Kembali', stream: { servers: [{ server: 'A', url: 'https://embed.example/tv/77/2/1' }] } }] },
    ],
  },
  // series dengan metadata episode tetapi TANPA stream per-episode → harus jatuh ke level-judul
  'tv-78': {
    id: 'tv-78', slug: 'tv-78', type: 'tv', title: 'Serial Metadata Saja', poster: 'https://img.example/t78.jpg',
    seasons: [{ seasonNumber: 1, name: 'Musim 1', episodes: [{ episode: 1, title: 'Tanpa Stream' }] }],
    stream: { primaryIframe: 'https://embed.example/tv/78' },
  },
  // film dengan array seasons kosong: tipe eksplisit "Movie" tidak boleh berubah jadi series
  'movie-seasons-kosong': {
    id: 'movie-seasons-kosong', slug: 'movie-seasons-kosong', type: 'Movie', title: 'Film Seasons Kosong', seasons: [], numberOfSeasons: 0,
    stream: { primaryIframe: 'https://embed.example/movie/ks' },
  },
};

/** Jalankan mock. Mengembalikan { base, root, calls, setMode, close } — `calls` mencatat path, query, header. */
export async function startMockUpstream() {
  const calls = [];
  let mode = 'ok'; // ok | down | badjson | slow
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers });
    const send = (obj, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
    if (mode === 'down') return send({ status: false, message: 'upstream error' }, 500);
    if (mode === 'badjson') { res.setHeader('content-type', 'application/json'); return res.end('<html>bukan json</html>'); }
    if (mode === 'slow') return; // tidak pernah menjawab → timeout

    const p = u.pathname.replace(/^\/api\/movies/, '');
    const type = u.searchParams.get('type');
    const pool = type === 'movie' ? [MOVIE_ITEM] : [MOVIE_ITEM, TV_ITEM];
    if (p === '/popular') return send({ status: true, results: pool });
    if (p === '/latest') return send({ status: true, results: pool });
    if (p === '/top-rated') return send({ status: true, results: [MOVIE_ITEM] });
    if (p === '/upcoming') return send({ status: true, results: [TV_ITEM] });
    if (p === '/search') {
      const q = (u.searchParams.get('q') ?? '').toLowerCase();
      return send({ status: true, results: [MOVIE_ITEM, TV_ITEM].filter((x) => x.title.toLowerCase().includes(q)) });
    }
    const m = /^\/detail\/(.+)$/.exec(p);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      return DETAIL[slug] ? send({ status: true, results: DETAIL[slug] }) : send({ status: false, message: 'not found' }, 404);
    }
    return send({ status: false, message: 'endpoint tidak ada' }, 404);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const root = `http://127.0.0.1:${server.address().port}`;
  return {
    root, base: `${root}/api/movies`, calls,
    setMode: (m) => { mode = m; },
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }),
  };
}
