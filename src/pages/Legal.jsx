import { NavLink } from 'react-router-dom';
import { useConfig } from '../hooks/config.jsx';
import { usePageTitle } from '../hooks/misc.js';
import { dateLong } from '../lib/format.js';

// Tanggal revisi terakhir untuk masing-masing dokumen. Ubah nilai ini (format
// ISO, mis. '2026-09-24') setiap kali isi halaman terkait direvisi.
const UPDATED = {
  privacy: '2026-09-29',
  terms: '2026-09-29',
  license: '2026-09-29',
  cookies: '2026-09-29',
};

const LEGAL_LINKS = [
  { to: '/privacy', label: 'Kebijakan Privasi' },
  { to: '/terms', label: 'Syarat & Ketentuan' },
  { to: '/license', label: 'Lisensi' },
  { to: '/cookies', label: 'Kebijakan Cookie' },
];

/** Navigasi pil antar-halaman legal — dipakai di keempat halaman agar mudah berpindah. */
function LegalNav() {
  return (
    <nav className="legal__nav" aria-label="Halaman legal lainnya">
      {LEGAL_LINKS.map((l) => <NavLink key={l.to} to={l.to} end>{l.label}</NavLink>)}
    </nav>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}

function LegalPage({ title, lead, updated, children }) {
  usePageTitle(title);
  return (
    <div className="page container">
      <div className="legal">
        <div className="page__head">
          <div>
            <h1 className="page__title display">{title}</h1>
            <p className="page__sub">{lead}</p>
            <p className="legal__updated">Terakhir diperbarui: {dateLong(updated)}</p>
          </div>
        </div>
        <LegalNav />
        <div className="legal__body">{children}</div>
      </div>
    </div>
  );
}

/* ============================== Privacy Policy ============================== */

export function PrivacyPolicy() {
  const { support } = useConfig();
  return (
    <LegalPage
      title="Kebijakan Privasi"
      lead="Halaman ini menjelaskan data apa saja yang dikumpulkan MDFlix, bagaimana data itu dipakai dan dilindungi, serta pilihan yang Anda miliki atas data Anda."
      updated={UPDATED.privacy}
    >
      <p className="notice" style={{ maxWidth: 'none', marginBottom: 30 }}>
        <span>
          <strong style={{ color: 'inherit' }}>Ringkasan singkat</strong> (bukan pengganti isi lengkap di bawah): MDFlix gratis untuk semua pengguna terdaftar — kami menyimpan data akun serta
          riwayat &amp; sesi menonton Anda, semuanya di database yang dilindungi. Kami tidak memasang cookie
          iklan/pelacak dan tidak menjual data Anda. Anda bisa mengosongkan Riwayat dan Daftar Saya sendiri kapan saja; untuk menghapus akun
          sepenuhnya, hubungi kami di <a className="link" href={`mailto:${support.email}`}>{support.email}</a>.
        </span>
      </p>

      <Section id="data-dikumpulkan" title="1. Data yang Kami Kumpulkan">
        <h3>a. Data akun</h3>
        <ul>
          <li>Saat mendaftar dengan email &amp; password: email dan password Anda. Password dikelola sepenuhnya oleh sistem autentikasi Supabase Auth dalam bentuk terenkripsi — MDFlix tidak pernah menyimpan atau dapat melihat password Anda dalam bentuk teks biasa.</li>
          <li>Saat masuk dengan &ldquo;Lanjutkan dengan Google&rdquo;: autentikasi ditangani oleh Supabase Auth dan Google. Nama tampilan dan foto profil dari akun Google Anda hanya dipakai untuk mengisi profil MDFlix yang masih kosong, tidak menimpa yang sudah Anda atur sendiri.</li>
          <li>Profil MDFlix Anda: nama tampilan, foto profil (opsional), peran akun (pengguna biasa atau admin), status aktif/nonaktif, waktu akun dibuat, dan waktu masuk terakhir.</li>
        </ul>
        <h3>b. Data sesi menonton</h3>
        <p>Untuk fitur Lanjutkan Menonton, memastikan hanya satu pemutaran aktif per akun, dan mencegah penyalahgunaan sesi, server kami mencatat sesi menonton: konten yang ditonton, status pemutaran (main/jeda/buffering/selesai), posisi &amp; durasi tontonan, waktu mulai, dan detak (heartbeat) berkala. Data ini tidak pernah dipakai untuk membatasi waktu menonton Anda — MDFlix tidak memiliki kuota atau timer menonton dalam bentuk apa pun.</p>
        <h3>c. Riwayat tontonan &amp; Daftar Saya</h3>
        <p>Riwayat menyimpan judul, posisi terakhir, persentase selesai, dan waktu terakhir ditonton untuk fitur &ldquo;Lanjutkan menonton&rdquo; — Anda dapat menghapus item satu per satu atau mengosongkan seluruhnya kapan saja. Daftar Saya menyimpan judul yang Anda tandai — Anda dapat menambah/menghapus kapan saja.</p>
        <h3>d. Alamat IP</h3>
        <p>Alamat IP diproses sementara di memori server untuk mencegah penyalahgunaan (pembatasan laju permintaan) dan tidak disimpan permanen untuk tujuan ini. Khusus login ke akun admin, alamat IP dicatat pada log audit keamanan internal sebagai bagian dari akuntabilitas akses istimewa.</p>
        <p className="faint">Kami tidak mengumpulkan data yang tidak benar-benar dipakai oleh fitur MDFlix — kami tidak memasang piksel iklan, tidak menjalankan pelacak perilaku lintas situs, dan tidak membeli/menjual data profil dari atau ke pihak ketiga.</p>
      </Section>

      <Section id="cara-pakai" title="2. Bagaimana Kami Menggunakan Data Anda">
        <ul>
          <li>Menyediakan &amp; mengautentikasi akun Anda, serta menjaga sesi masuk tetap berjalan.</li>
          <li>Menyediakan fitur Lanjutkan Menonton dan menjaga satu pemutaran aktif per akun.</li>
          <li>Menampilkan Riwayat tontonan dan Daftar Saya milik Anda sendiri.</li>
          <li>Mencegah penyalahgunaan layanan, misalnya berbagi kredensial akun.</li>
          <li>Memberikan dukungan pelanggan saat Anda menghubungi kami.</li>
        </ul>
        <p>Kami tidak menggunakan data Anda untuk pengambilan keputusan otomatis yang berdampak hukum, dan tidak menggunakannya untuk iklan bertarget.</p>
      </Section>

      <Section id="autentikasi" title="3. Autentikasi & Keamanan Login">
        <ul>
          <li>Login dikelola oleh Supabase Auth, penyedia infrastruktur autentikasi pihak ketiga yang kami pakai. Baik lewat email/password maupun Google, kredensial Anda tidak pernah melewati atau disimpan di kode aplikasi MDFlix — MDFlix hanya menerima token sesi yang sudah diautentikasi.</li>
          <li>Sesi masuk Anda disimpan oleh SDK Supabase di localStorage peramban Anda agar Anda tetap masuk di kunjungan berikutnya. Selengkapnya ada di <NavLink to="/cookies">Kebijakan Cookie</NavLink> kami.</li>
          <li>Setiap permintaan ke API MDFlix diautentikasi lewat token (bukan cookie), dan server kami selalu memvalidasi ulang identitas &amp; hak akses Anda — peran akun tidak pernah dipercaya begitu saja dari perangkat Anda.</li>
        </ul>
      </Section>

      <Section id="cookie" title="4. Cookie, localStorage, dan Teknologi Serupa">
        <p>Ringkasan singkat di sini; penjelasan lengkap ada di <NavLink to="/cookies">Kebijakan Cookie</NavLink> kami. Kami tidak memasang cookie iklan/pelacak. Penyimpanan lokal yang kami pakai murni bersifat esensial, yaitu dari Supabase Auth agar sesi masuk Anda tetap berjalan.</p>
      </Section>

      <Section id="pihak-ketiga" title="5. Layanan Pihak Ketiga">
        <p>Kami menggunakan sejumlah penyedia infrastruktur tepercaya untuk menjalankan MDFlix:</p>
        <ul>
          <li><strong>Supabase</strong> — autentikasi akun &amp; database tempat data Anda (profil, riwayat, Daftar Saya, dsb.) disimpan dan dilindungi.</li>
          <li><strong>Google</strong> — sebagai opsi login (&ldquo;Lanjutkan dengan Google&rdquo;) lewat Supabase Auth.</li>
          <li><strong>Vercel</strong> — platform hosting &amp; server tempat aplikasi dan fungsi API MDFlix berjalan.</li>
          <li><strong>Penyedia data katalog (Content API)</strong> — sumber data judul, deskripsi, dan gambar film/series, dikonfigurasi oleh admin kami. Tergantung mode yang dikonfigurasi, gambar poster dapat dimuat langsung oleh peramban Anda dari CDN pihak ketiga (mis. image.tmdb.org).</li>
          <li><strong>YouTube</strong> (mode privasi &ldquo;-nocookie&rdquo;) — dipakai untuk menampilkan trailer resmi bila tersedia.</li>
        </ul>
        <p className="faint">Masing-masing pihak ketiga di atas memiliki kebijakan privasinya sendiri untuk data yang mereka proses.</p>
      </Section>

      <Section id="keamanan" title="6. Keamanan Data">
        <ul>
          <li>Setiap baris data di database kami dilindungi Row Level Security — secara teknis, akun biasa hanya bisa membaca/mengubah datanya sendiri.</li>
          <li>Perubahan yang menyangkut peran akun atau status aktif hanya bisa terjadi lewat fungsi server yang diperketat — peramban tidak pernah menulis langsung ke data sensitif tersebut.</li>
          <li>Log audit internal untuk tindakan admin (mis. perubahan role, penghapusan akun) bersifat tercatat permanen demi akuntabilitas, dan tidak bisa diubah/dihapus oleh siapa pun, termasuk kami sendiri.</li>
          <li>Kami menegakkan header keamanan &amp; Content Security Policy yang ketat di setiap halaman untuk mencegah script pihak ketiga yang tidak diinginkan berjalan di situs kami.</li>
          <li>Kunci rahasia server tidak pernah dikirim ke peramban, dan pesan error yang tampil ke pengguna disaring agar tidak membocorkan detail internal.</li>
        </ul>
        <p>Meski begitu, tidak ada sistem yang sepenuhnya bebas risiko. Bila Anda menemukan celah keamanan, mohon laporkan ke kami lewat kontak di bagian bawah halaman ini.</p>
      </Section>

      <Section id="retensi" title="7. Berapa Lama Data Disimpan">
        <ul>
          <li>Data akun &amp; aktivitas Anda disimpan selama akun Anda aktif.</li>
          <li>Log audit keamanan internal disimpan sebagai jejak permanen demi akuntabilitas, sebagaimana dijelaskan pada bagian Keamanan Data.</li>
        </ul>
      </Section>

      <Section id="hapus-akun" title="8. Penghapusan Akun & Data">
        <ul>
          <li>Saat ini penghapusan akun dilakukan oleh admin kami atas permintaan Anda — belum ada tombol hapus akun mandiri di aplikasi. Silakan hubungi kami di <a className="link" href={`mailto:${support.email}`}>{support.email}</a> untuk mengajukan permintaan ini. Sebagai langkah pengaman, penghapusan mensyaratkan konfirmasi ulang alamat email akun yang bersangkutan.</li>
          <li>Setelah akun dihapus, profil, sesi &amp; riwayat menonton, dan Daftar Saya Anda akan ikut terhapus secara permanen.</li>
          <li>Sebagian catatan log keamanan internal (mis. jejak audit yang menyimpan salinan email pada waktu suatu tindakan terjadi) tetap kami simpan demi akuntabilitas keamanan, sebagaimana lazimnya praktik layanan online.</li>
          <li>Anda tidak perlu menghapus akun untuk mengosongkan Riwayat atau Daftar Saya — kedua fitur itu bisa Anda kelola sendiri kapan saja tanpa menghubungi kami.</li>
        </ul>
      </Section>

      <Section id="hak-anda" title="9. Hak Anda atas Data">
        <p>Anda berhak untuk:</p>
        <ul>
          <li>Melihat dan memperbarui data profil Anda (nama tampilan) langsung dari halaman Pengaturan akun.</li>
          <li>Meminta salinan/rincian data akun Anda dengan menghubungi dukungan kami.</li>
          <li>Meminta koreksi atas data yang keliru.</li>
          <li>Meminta penghapusan akun &amp; data Anda — lihat bagian di atas.</li>
          <li>Menghubungi kami bila punya pertanyaan atau keberatan atas cara kami memproses data Anda.</li>
        </ul>
      </Section>

      <Section id="privasi-anak" title="10. Privasi Anak">
        <p>MDFlix tidak ditujukan untuk anak-anak di bawah usia yang disyaratkan hukum yang berlaku untuk menyetujui pemrosesan data pribadi secara mandiri, dan kami tidak dengan sengaja mengumpulkan data dari mereka tanpa persetujuan orang tua/wali. Bila Anda adalah orang tua/wali dan meyakini anak Anda membuat akun tanpa persetujuan Anda, silakan hubungi kami agar dapat kami tindak lanjuti.</p>
      </Section>

      <Section id="perubahan" title="11. Perubahan Kebijakan Ini">
        <p>Kami dapat memperbarui kebijakan ini dari waktu ke waktu, misalnya saat menambah fitur baru. Tanggal &ldquo;Terakhir diperbarui&rdquo; di bagian atas halaman ini selalu mencerminkan revisi terbaru. Perubahan signifikan akan kami upayakan untuk diinformasikan lewat aplikasi.</p>
      </Section>

      <Section id="kontak" title="12. Hubungi Kami">
        <p>Pertanyaan seputar privasi, permintaan data, atau laporan keamanan dapat dikirim ke <a className="link" href={`mailto:${support.email}`}>{support.email}</a> {support.phone ? <>atau {support.phone}</> : null}.</p>
      </Section>
    </LegalPage>
  );
}

/* ============================== Terms of Service ============================== */

export function TermsOfService() {
  const { support } = useConfig();
  return (
    <LegalPage
      title="Syarat & Ketentuan"
      lead="Ketentuan ini mengatur penggunaan Anda atas layanan MDFlix. Dengan membuat akun atau menggunakan MDFlix, Anda dianggap menyetujui ketentuan berikut."
      updated={UPDATED.terms}
    >
      <Section id="penerimaan" title="1. Penerimaan Ketentuan">
        <p>Dengan mengakses atau menggunakan MDFlix (situs mdflix.web.id beserta aplikasi terkait), Anda menyetujui untuk terikat pada Syarat &amp; Ketentuan ini serta <NavLink to="/privacy">Kebijakan Privasi</NavLink> kami. Bila Anda tidak setuju, mohon untuk tidak menggunakan layanan ini.</p>
      </Section>

      <Section id="tentang-layanan" title="2. Tentang Layanan">
        <p>MDFlix adalah platform streaming film dan series yang <strong>gratis sepenuhnya</strong> untuk seluruh pengguna terdaftar — tidak ada paket berbayar, kuota harian, maupun batas waktu menonton. Anda dapat menjelajah katalog, mencari, dan membuka halaman detail tanpa akun; masuk (login) diperlukan saat mulai menonton. Ketersediaan judul, kualitas pemutaran, dan fitur dapat berubah sewaktu-waktu.</p>
      </Section>

      <Section id="akun-pengguna" title="3. Akun Pengguna">
        <ul>
          <li>Anda harus mendaftar menggunakan email yang valid dan milik Anda sendiri, atau masuk lewat akun Google Anda.</li>
          <li>Anda bertanggung jawab menjaga kerahasiaan kredensial akun Anda dan atas seluruh aktivitas yang terjadi lewat akun Anda.</li>
          <li>Satu akun ditujukan untuk satu pengguna. Hanya satu sesi pemutaran yang dapat aktif dalam satu waktu per akun — memulai pemutaran di perangkat lain akan menghentikan pemutaran sebelumnya.</li>
          <li>Segera beri tahu kami bila Anda menduga ada akses tidak sah ke akun Anda.</li>
          <li>Anda harus memenuhi batas usia minimum yang berlaku di wilayah Anda untuk membuat akun secara mandiri.</li>
        </ul>
      </Section>

      <Section id="akses-gratis" title="4. Akses Tanpa Biaya">
        <p>MDFlix disediakan tanpa biaya kepada seluruh pengguna terdaftar. Tidak ada paket berbayar, langganan, transaksi pembelian, kuota menonton harian, maupun timer pembatas di dalam layanan ini. Kami berhak mengubah cakupan atau fitur layanan gratis ini di masa depan; perubahan signifikan akan kami upayakan untuk diinformasikan lewat aplikasi sebelum berlaku.</p>
      </Section>

      <Section id="penggunaan-wajar" title="5. Penggunaan yang Wajar & Larangan">
        <p>Anda setuju untuk tidak:</p>
        <ul>
          <li>Membagikan kredensial akun Anda kepada pihak lain atau menggunakan akun secara bersama-sama secara komersial.</li>
          <li>Mencoba mengakali, memanipulasi, atau melewati mekanisme keamanan layanan ini.</li>
          <li>Mencoba mengakses akun, data, atau fitur admin milik pengguna lain tanpa hak.</li>
          <li>Melakukan rekayasa balik (reverse engineering), scraping otomatis, atau membebani sistem kami secara berlebihan.</li>
          <li>Mengunggah, menyebarkan, atau menautkan konten ilegal lewat fitur layanan ini.</li>
          <li>Menggunakan layanan untuk tujuan yang melanggar hukum yang berlaku.</li>
        </ul>
      </Section>

      <Section id="penyalahgunaan" title="6. Penyalahgunaan & Sanksi">
        <p>Kami berhak membatasi, menangguhkan sementara, atau menonaktifkan akun yang terindikasi melanggar ketentuan ini atau membahayakan keamanan layanan — termasuk tanpa pemberitahuan sebelumnya bila situasinya mendesak. Setiap tindakan administratif terhadap akun dicatat pada log audit internal kami.</p>
      </Section>

      <Section id="penghentian" title="7. Penghentian Akun">
        <ul>
          <li>Anda dapat menghentikan penggunaan MDFlix kapan saja dan meminta penghapusan akun Anda dengan menghubungi dukungan kami — lihat proses selengkapnya di <NavLink to="/privacy#hapus-akun">Kebijakan Privasi</NavLink> bagian &ldquo;Penghapusan Akun &amp; Data&rdquo;.</li>
          <li>Kami dapat menonaktifkan atau menghapus akun yang melanggar ketentuan ini secara serius atau berulang.</li>
        </ul>
      </Section>

      <Section id="perubahan-layanan" title="8. Perubahan Layanan">
        <p>Kami dapat menambah, mengubah, atau menghentikan fitur, tampilan, katalog, maupun bagian mana pun dari layanan ini dari waktu ke waktu untuk menjaga dan meningkatkan kualitas MDFlix. Kami akan berupaya menginformasikan perubahan besar yang berdampak langsung pada Anda.</p>
      </Section>

      <Section id="kekayaan-intelektual" title="9. Konten & Hak Kekayaan Intelektual">
        <ul>
          <li>Perangkat lunak, desain, dan kode sumber MDFlix dilindungi hak cipta dan tunduk pada <NavLink to="/license">Lisensi</NavLink> kami.</li>
          <li>Metadata dan gambar film/series ditampilkan berdasarkan data dari penyedia katalog pihak ketiga; MDFlix tidak mengklaim kepemilikan atas konten film/series itu sendiri.</li>
        </ul>
      </Section>

      <Section id="batasan-tanggung-jawab" title="10. Batasan Tanggung Jawab">
        <ul>
          <li>Layanan disediakan &ldquo;sebagaimana adanya&rdquo;. Kami berupaya menjaga MDFlix tetap tersedia dan berjalan lancar, namun tidak menjamin layanan akan bebas gangguan, bebas galat, atau tersedia tanpa jeda setiap saat.</li>
          <li>Sepanjang diizinkan hukum yang berlaku, MDFlix tidak bertanggung jawab atas kerugian tidak langsung yang timbul dari penggunaan atau ketidakmampuan menggunakan layanan ini, di luar hal-hal yang secara hukum tidak dapat dibatasi.</li>
          <li>Ketentuan ini tidak mengurangi hak Anda sebagai konsumen yang dilindungi hukum yang berlaku dan tidak dapat dikesampingkan lewat perjanjian.</li>
        </ul>
      </Section>

      <Section id="hukum-berlaku" title="11. Hukum yang Berlaku">
        <p>Ketentuan ini disusun dan ditafsirkan sesuai hukum yang berlaku di Indonesia, tanpa mengesampingkan hak Anda berdasarkan hukum perlindungan konsumen setempat.</p>
      </Section>

      <Section id="kontak" title="12. Kontak">
        <p>Pertanyaan mengenai Syarat &amp; Ketentuan ini dapat disampaikan ke <a className="link" href={`mailto:${support.email}`}>{support.email}</a>.</p>
      </Section>
    </LegalPage>
  );
}

/* ============================== License ============================== */

const THIRD_PARTY_LIBS = [
  { name: 'React & React DOM', use: 'Fondasi antarmuka pengguna', license: 'MIT' },
  { name: 'React Router', use: 'Navigasi/routing halaman', license: 'MIT' },
  { name: 'TanStack Query', use: 'Pengambilan & cache data dari server', license: 'MIT' },
  { name: '@supabase/supabase-js', use: 'Klien autentikasi & database Supabase', license: 'MIT' },
  { name: 'hls.js', use: 'Pemutaran video streaming (HLS)', license: 'Apache License 2.0' },
  { name: 'zod', use: 'Validasi data', license: 'MIT' },
  { name: 'Vite & @vitejs/plugin-react', use: 'Alat build & pengembangan', license: 'MIT' },
  { name: 'Fontsource (Archivo, Figtree)', use: 'Font antarmuka', license: 'Paket npm: MIT · berkas font: umumnya SIL OFL' },
];

export function LicensePage() {
  const { support } = useConfig();
  return (
    <LegalPage
      title="Lisensi"
      lead="Ketentuan lisensi untuk kode sumber MDFlix, serta lisensi pustaka pihak ketiga yang dipakai di dalamnya."
      updated={UPDATED.license}
    >
      <Section id="lisensi-sumber" title="1. Lisensi Kode Sumber MDFlix — Proprietary License">
        <p>Seluruh kode sumber, arsitektur, desain, dan aset orisinal MDFlix (&ldquo;Perangkat Lunak&rdquo;) adalah milik pemilik MDFlix dan dilindungi hukum hak cipta yang berlaku. Perangkat Lunak ini didistribusikan di bawah lisensi <strong>proprietary</strong> (hak cipta penuh) — <strong>bukan</strong> lisensi open-source.</p>
        <p>Kecuali dengan izin tertulis dari pemilik MDFlix, Anda <strong>tidak diperbolehkan</strong> untuk:</p>
        <ul>
          <li>Menyalin, mendistribusikan, atau membagikan kode sumber Perangkat Lunak ini, baik sebagian maupun seluruhnya.</li>
          <li>Menjual kembali atau menyewakan Perangkat Lunak ini dalam bentuk apa pun.</li>
          <li>Memodifikasi Perangkat Lunak untuk kemudian didistribusikan ulang (fork publik, turunan, atau white-label).</li>
          <li>Menggunakan Perangkat Lunak ini, atau bagian mana pun darinya, untuk tujuan komersial di luar operasional resmi MDFlix.</li>
          <li>Menghapus atau mengubah pemberitahuan hak cipta maupun atribusi lisensi ini dari Perangkat Lunak.</li>
        </ul>
        <p>Pelanggaran atas ketentuan lisensi ini dapat berakibat pada tindakan hukum sesuai hukum yang berlaku.</p>
        <p>Untuk permintaan izin penggunaan, kerja sama lisensi, atau pertanyaan seputar lisensi ini, silakan hubungi <a className="link" href={`mailto:${support.email}`}>{support.email}</a>.</p>
      </Section>

      <Section id="lisensi-pihak-ketiga" title="2. Lisensi Pustaka Pihak Ketiga">
        <p>MDFlix dibangun dengan memanfaatkan sejumlah pustaka/dependency open-source. Lisensi proprietary pada bagian 1 <strong>hanya</strong> berlaku untuk kode sumber orisinal MDFlix — MDFlix tidak mengklaim kepemilikan apa pun atas pustaka pihak ketiga berikut, dan masing-masing tetap sepenuhnya tunduk pada lisensi open-source yang dipublikasikan oleh pemilik/pengelolanya:</p>
        <div className="table-wrap" style={{ marginTop: 16, marginBottom: 12 }}>
          <table className="table">
            <thead><tr><th>Pustaka</th><th>Kegunaan</th><th>Lisensi</th></tr></thead>
            <tbody>
              {THIRD_PARTY_LIBS.map((l) => (
                <tr key={l.name}>
                  <td className="cell-main" data-label="Pustaka"><span className="cell-strong">{l.name}</span></td>
                  <td data-label="Kegunaan">{l.use}</td>
                  <td data-label="Lisensi">{l.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint">Info di atas kami sediakan untuk kemudahan referensi berdasarkan pengetahuan kami saat ini. Teks lisensi resmi dan terkini untuk setiap pustaka selalu mengacu pada yang dipublikasikan oleh proyek/pengelola masing-masing (lihat berkas <code>package.json</code> pada kode sumber untuk versi persis yang dipakai).</p>
      </Section>

      <Section id="konten-data" title="3. Konten & Data Katalog">
        <p>Data judul, deskripsi, dan gambar film/series yang ditampilkan di MDFlix bersumber dari penyedia data katalog pihak ketiga yang dikonfigurasi secara terpisah. MDFlix tidak mengklaim hak cipta atas film, series, maupun metadata tersebut. Selama pengembangan, MDFlix juga dapat menampilkan data contoh fiktif yang jelas ditandai sebagai &ldquo;Data pengembangan&rdquo; dan bukan konten berlisensi.</p>
      </Section>
    </LegalPage>
  );
}

/* ============================== Cookie Policy ============================== */

export function CookiePolicy() {
  const { support } = useConfig();
  return (
    <LegalPage
      title="Kebijakan Cookie"
      lead="Halaman ini menjelaskan cookie, localStorage, dan teknologi penyimpanan serupa yang benar-benar dipakai MDFlix — dan yang tidak kami pakai."
      updated={UPDATED.cookies}
    >
      <Section id="ringkasan" title="1. Ringkasan">
        <p>MDFlix dirancang untuk meminimalkan penyimpanan yang tidak perlu di peramban Anda. Kami tidak memasang cookie iklan atau pelacak perilaku pihak ketiga. Penyimpanan lokal yang kami pakai murni bersifat esensial, yaitu untuk menjaga Anda tetap masuk (login).</p>
      </Section>

      <Section id="yang-dipakai" title="2. Yang Kami Pakai">
        <h3>a. Penyimpanan sesi login (localStorage) — esensial</h3>
        <p>Saat Anda masuk ke MDFlix, pustaka Supabase Auth yang kami gunakan menyimpan token sesi login Anda di localStorage peramban Anda. Ini memungkinkan Anda tetap masuk saat membuka kembali MDFlix tanpa perlu login ulang setiap saat. Tanpa penyimpanan ini, fitur login tidak dapat berfungsi.</p>
        <h3>b. Autentikasi berbasis token, bukan cookie sesi</h3>
        <p>Permintaan dari peramban Anda ke server MDFlix diautentikasi menggunakan token (header Authorization), bukan cookie sesi tradisional.</p>
        <h3>c. Data fitur (Riwayat & Daftar Saya) disimpan di server, bukan di peramban</h3>
        <p>Riwayat tontonan dan Daftar Saya Anda disimpan di database MDFlix yang terhubung ke akun Anda, bukan di localStorage/cookie peramban — sehingga data ini tetap dapat Anda akses dari perangkat mana pun setelah masuk.</p>
      </Section>

      <Section id="pihak-ketiga" title="3. Konten & Layanan Pihak Ketiga yang Dapat Menyetel Penyimpanannya Sendiri">
        <ul>
          <li><strong>Google / Supabase Auth</strong> (saat proses login) — alur login, termasuk &ldquo;Lanjutkan dengan Google&rdquo;, dapat melibatkan cookie milik Google/Supabase selama proses autentikasi berlangsung, di luar kendali langsung MDFlix.</li>
          <li><strong>YouTube</strong> (mode privasi &ldquo;-nocookie&rdquo;) — trailer resmi (bila tersedia) ditampilkan lewat sematan youtube-nocookie.com, domain yang secara khusus dipakai Google untuk mengurangi penyetelan cookie sebelum Anda berinteraksi dengan video. Setelah Anda memutar video tersebut, Google/YouTube dapat menyetel cookie sesuai kebijakan privasi mereka sendiri.</li>
          <li><strong>CDN gambar pihak ketiga</strong> — bergantung pada konfigurasi penyedia katalog kami, gambar poster/thumbnail film-series dapat dimuat langsung oleh peramban Anda dari CDN pihak ketiga (mis. image.tmdb.org). Ini adalah permintaan gambar biasa, bukan pelacak, namun tetap merupakan koneksi ke server pihak ketiga.</li>
        </ul>
      </Section>

      <Section id="tidak-dipakai" title="4. Yang TIDAK Kami Pakai">
        <ul>
          <li>Kami tidak memasang cookie iklan, piksel pelacak, atau alat analitik pihak ketiga (mis. Google Analytics) di kode MDFlix.</li>
          <li>Kami tidak menjual atau membagikan data penyimpanan lokal Anda ke pengiklan.</li>
          <li>MDFlix menegakkan Content Security Policy yang ketat di setiap halaman untuk mencegah script pihak ketiga yang tidak kami maksudkan berjalan di situs ini.</li>
        </ul>
      </Section>

      <Section id="kelola" title="5. Mengelola atau Menghapus Penyimpanan Lokal">
        <p>Anda dapat menghapus data situs/localStorage MDFlix kapan saja lewat pengaturan peramban Anda (biasanya di bagian &ldquo;Privasi&rdquo; atau &ldquo;Data situs&rdquo;). Perlu diketahui bahwa menghapusnya akan membuat Anda otomatis keluar (logout) dari MDFlix, dan Anda perlu masuk kembali.</p>
      </Section>

      <Section id="kontak" title="6. Pertanyaan">
        <p>Pertanyaan mengenai cookie atau penyimpanan lokal dapat Anda kirim ke <a className="link" href={`mailto:${support.email}`}>{support.email}</a>. Untuk gambaran lebih lengkap soal data yang kami proses, lihat <NavLink to="/privacy">Kebijakan Privasi</NavLink> kami.</p>
      </Section>
    </LegalPage>
  );
}
