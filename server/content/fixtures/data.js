// DATA PENGEMBANGAN — fiktif, bukan katalog berlisensi.
// Hanya dipakai bila CONTENT_API_BASE_URL kosong dan bukan produksi.
// Judul, sinopsis, nama pemeran, dan gambar (dibuat oleh scripts/gen-fixtures.mjs) dibuat khusus
// sebagai placeholder pengembangan.

export const DEV_NOTICE = 'Data pengembangan — bukan konten berlisensi.';

const CAST = ['Pemeran Contoh 1', 'Pemeran Contoh 2', 'Pemeran Contoh 3', 'Pemeran Contoh 4'];

const movie = (n, title, year, rating, genres, minutes, hue, synopsis) => ({
  id: `dev-m${String(n).padStart(2, '0')}`, type: 'movie', title, year, rating, genres,
  duration: minutes * 60, hue, description: `${DEV_NOTICE} ${synopsis}`,
});

export const MOVIES = [
  movie(1, 'Hujan di Ujung Dermaga', 2025, 8.1, ['Drama', 'Romansa'], 112, 205, 'Seorang penjaga mercusuar menerima surat dari masa lalu pada malam badai terpanjang tahun itu.'),
  movie(2, 'Lorong Terakhir', 2024, 7.6, ['Thriller', 'Misteri'], 104, 12, 'Sebuah pengejaran di pasar tengah malam berubah menjadi teka-teki tentang siapa yang sebenarnya diburu.'),
  movie(3, 'Pelabuhan Senja', 2026, 7.9, ['Drama'], 98, 28, 'Tiga bersaudara berkumpul kembali untuk menjual kapal peninggalan ayah mereka.'),
  movie(4, 'Api di Kaki Gunung', 2023, 7.2, ['Aksi', 'Petualangan'], 121, 8, 'Tim relawan harus menyeberangi hutan terbakar demi menjemput satu desa terakhir.'),
  movie(5, 'Kereta Malam Menuju Timur', 2025, 8.4, ['Misteri', 'Drama'], 109, 262, 'Di gerbong nomor tujuh, seorang penumpang tanpa tiket tahu terlalu banyak tentang semua orang.'),
  movie(6, 'Cahaya dari Seberang', 2022, 6.9, ['Fiksi Ilmiah'], 117, 190, 'Sinyal aneh dari pulau tak berpenghuni memaksa seorang teknisi radio mengambil keputusan sulit.'),
  movie(7, 'Rumah di Balik Kabut', 2024, 7.0, ['Horor', 'Misteri'], 95, 150, 'Keluarga kecil pindah ke rumah dinas di dataran tinggi yang selalu diselimuti kabut.'),
  movie(8, 'Garis Pantai', 2026, 7.7, ['Dokumenter'], 88, 175, 'Potret setahun kehidupan nelayan dan penjaga penyu di sepanjang satu garis pantai.'),
  movie(9, 'Suara dari Menara', 2023, 7.3, ['Komedi', 'Keluarga'], 101, 48, 'Kekacauan lucu terjadi ketika pengeras suara menara desa tak sengaja menyiarkan obrolan rahasia warga.'),
  movie(10, 'Nadir', 2025, 8.0, ['Fiksi Ilmiah', 'Thriller'], 126, 285, 'Kru stasiun bawah laut kehilangan kontak dengan permukaan dan mulai saling mencurigai.'),
  movie(11, 'Pesta di Atas Perahu', 2022, 6.8, ['Komedi', 'Romansa'], 99, 330, 'Pernikahan di atas perahu wisata berubah kacau saat mesin mati di tengah danau.'),
  movie(12, 'Penjaga Musim Hujan', 2026, 7.8, ['Fantasi', 'Petualangan'], 114, 225, 'Seorang anak menemukan cara memanggil hujan di negeri yang sudah tiga tahun kemarau.'),
];

const series = (n, title, year, rating, genres, hue, synopsis, seasonEps) => {
  const id = `dev-s${String(n).padStart(2, '0')}`;
  return {
    id, type: 'series', title, year, rating, genres, hue, description: `${DEV_NOTICE} ${synopsis}`,
    seasons: seasonEps.map((eps, si) => ({
      number: si + 1,
      title: `Musim ${si + 1}`,
      episodes: Array.from({ length: eps }, (_, ei) => ({
        id: `${id}-s${si + 1}e${ei + 1}`,
        seasonNumber: si + 1,
        episodeNumber: ei + 1,
        title: `Episode ${ei + 1}`,
        duration: (38 + ((ei * 7 + si * 3) % 14)) * 60,
        description: `${DEV_NOTICE} Cerita episode ${ei + 1} dari musim ${si + 1}.`,
      })),
    })),
  };
};

export const SERIES = [
  series(1, 'Kota Tanpa Peta', 2025, 8.3, ['Drama', 'Misteri'], 240, 'Seorang kartografer muda mencoba memetakan kota yang jalannya berubah setiap malam.', [4, 3]),
  series(2, 'Jejak di Pasar Malam', 2024, 7.5, ['Komedi', 'Keluarga'], 40, 'Keluarga pedagang keliling menghadapi sederet kejadian tak terduga dari satu kota ke kota lain.', [5]),
  series(3, 'Dapur Tengah Malam', 2026, 7.9, ['Drama'], 18, 'Kisah para pekerja shift malam di dapur sebuah hotel tua yang hampir tutup.', [3, 3]),
  series(4, 'Langit Selatan', 2023, 7.1, ['Fiksi Ilmiah', 'Petualangan'], 200, 'Ekspedisi ilmiah di ujung selatan menemukan sesuatu yang bergerak di bawah es.', [4]),
];

export const GENRES = [...new Set([...MOVIES, ...SERIES].flatMap((x) => x.genres))].sort();

export const SAMPLE = {
  source: '/dev/sample.webm',
  type: 'webm',
  duration: 60,
  subtitles: [{ lang: 'id', label: 'Bahasa Indonesia', src: '/dev/sample.id.vtt', default: false }],
  audio: [{ lang: 'und', label: 'Audio contoh' }],
};

export { CAST };
