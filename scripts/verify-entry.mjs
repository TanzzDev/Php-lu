// Sanity check sebelum `vite build` (dijalankan otomatis oleh npm lifecycle "prebuild").
//
// Kenapa ini ada: kesalahan Rollup "failed to resolve import ... from index.html" hampir
// selalu berarti referensi <script src="..."> di index.html TIDAK cocok persis (case-sensitive)
// dengan nama file yang benar-benar ada di disk. Ini nyaris tidak pernah muncul di mesin
// developer (macOS/Windows: filesystem case-insensitive, "Main.jsx" dan "main.jsx" dianggap
// sama) tapi SELALU gagal di server build Vercel (Linux: case-sensitive). fs.existsSync juga
// akan "berbohong" di macOS/Windows karena ikut aturan filesystem yang sama, jadi di sini kita
// sengaja membandingkan string persis terhadap fs.readdirSync — supaya masalah ini ketahuan
// SEBELUM push ke Vercel, bukan cuma sesudah build production gagal.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'index.html');

function fail(message) {
  console.error(`\n✗ verify-entry: ${message}\n`);
  process.exit(1);
}

if (!existsSync(indexPath)) fail(`index.html tidak ditemukan di root project (${indexPath}).`);

const html = await import('node:fs/promises').then((fs) => fs.readFile(indexPath, 'utf8'));
const match = html.match(/<script\s+type=["']module["']\s+src=["']([^"']+)["']/i)
  ?? html.match(/<script\s+src=["']([^"']+)["']\s+type=["']module["']/i);

if (!match) fail('Tidak menemukan <script type="module" src="..."> di index.html.');

const referenced = match[1]; // contoh: "/src/main.jsx"
const relPath = referenced.replace(/^\//, ''); // "src/main.jsx"
const segments = relPath.split('/');
const fileName = segments.pop();
let dir = root;

for (const seg of segments) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    fail(
      `index.html merujuk "${referenced}", tapi folder "${relative(root, dir)}" tidak ada.\n` +
      `  Isi yang benar-benar ada di sekitar situ perlu dicek manual di repo Anda.`,
    );
  }
  if (!entries.includes(seg)) {
    const near = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
    fail(
      `index.html merujuk "${referenced}", tapi folder "${seg}" tidak ditemukan persis (case-sensitive) di "${relative(root, dir) || '.'}"/.\n` +
      (near
        ? `  Yang ada malah "${near}" — perbedaan besar/kecil huruf ini valid di macOS/Windows tapi GAGAL di build Linux Vercel.\n` +
          `  Perbaiki salah satu: ganti nama folder jadi "${seg}", atau ubah referensi di index.html jadi "${near}".`
        : `  Tidak ada folder dengan nama mirip di situ sama sekali — kemungkinan belum ter-commit/ter-push ke git.`),
    );
  }
  dir = join(dir, seg);
}

let entries;
try {
  entries = readdirSync(dir);
} catch {
  fail(`Folder "${relative(root, dir)}" tidak bisa dibaca.`);
}

if (!entries.includes(fileName)) {
  const near = entries.find((e) => e.toLowerCase() === fileName.toLowerCase());
  fail(
    `index.html merujuk "${referenced}", tapi file "${fileName}" tidak ditemukan persis (case-sensitive) di folder "${relative(root, dir) || '.'}"/.\n` +
    (near
      ? `  Yang ada malah "${near}" — perbedaan besar/kecil huruf ini valid di macOS/Windows tapi GAGAL di build Linux Vercel (persis error "Rollup failed to resolve import").\n` +
        `  Perbaiki salah satu: ganti nama file jadi "${fileName}", atau ubah referensi di index.html jadi "${near}".\n` +
        `  Jika ini terjadi setelah rename di macOS/Windows, git kadang tidak mencatat rename huruf besar/kecil dengan benar —\n` +
        `  jalankan: git mv ${fileName} tmp-rename && git mv tmp-rename ${near ?? fileName} lalu commit ulang.`
      : `  Tidak ada file dengan nama mirip di folder itu sama sekali — kemungkinan file belum ter-commit/ter-push ke git.\n` +
        `  Cek dengan: git ls-files | grep -i ${fileName}`),
  );
}

console.log(`✓ verify-entry: index.html → ${referenced} ditemukan persis (case-sensitive) di disk.`);
