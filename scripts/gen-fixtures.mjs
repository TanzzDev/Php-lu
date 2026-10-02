// Membuat aset DATA PENGEMBANGAN: poster/backdrop/thumbnail SVG, video sampel sintetis, dan subtitle.
// Semuanya dihasilkan di sini (tanpa aset pihak ketiga). Jalankan: npm run fixtures  (video butuh ffmpeg)
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MOVIES, SERIES } from '../server/content/fixtures/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'dev');
const art = join(out, 'art');
mkdirSync(art, { recursive: true });

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wrap = (title, max) => {
  const lines = [];
  let cur = '';
  for (const w of title.split(' ')) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
};
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

function scene(w, h, hue, id, { title, focusX = 0.5 }) {
  const grain = `<filter id="g${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${id.length * 7}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/></filter>`;
  const cx = w * focusX;
  const horizon = h * 0.62;
  const ridge = (off, l, amp) => {
    let d = `M0 ${h}`;
    for (let x = 0; x <= w; x += w / 16) d += ` L${x} ${horizon + off + Math.sin(x / w * 7 + hue) * amp + Math.cos(x / w * 3 + off) * amp * 0.6}`;
    return `<path d="${d} L${w} ${h} Z" fill="${hsl(hue + 10, 40, l)}"/>`;
  };
  return `
  <defs>
    <linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hsl(hue, 55, 9)}"/><stop offset=".55" stop-color="${hsl(hue + 18, 62, 24)}"/><stop offset="1" stop-color="${hsl(hue + 34, 70, 42)}"/>
    </linearGradient>
    <radialGradient id="sun${id}" cx="${focusX}" cy=".52" r=".55">
      <stop offset="0" stop-color="${hsl(hue + 40, 90, 72)}" stop-opacity=".9"/><stop offset=".35" stop-color="${hsl(hue + 30, 80, 55)}" stop-opacity=".35"/><stop offset="1" stop-color="${hsl(hue, 60, 20)}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient>
    ${grain}
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky${id})"/>
  <rect width="${w}" height="${h}" fill="url(#sun${id})"/>
  <circle cx="${cx}" cy="${horizon - h * 0.13}" r="${Math.min(w, h) * 0.075}" fill="${hsl(hue + 45, 95, 82)}" opacity=".92"/>
  ${ridge(h * 0.02, 13, h * 0.03)}${ridge(h * 0.09, 9, h * 0.035)}${ridge(h * 0.17, 5, h * 0.03)}
  <rect width="${w}" height="${h}" filter="url(#g${id})" opacity=".09"/>
  <rect width="${w}" height="${h}" fill="url(#fade${id})"/>`;
}

function poster(x) {
  const w = 600, h = 900;
  const lines = wrap(x.title, 13);
  const size = lines.length > 2 ? 58 : 68;
  const y0 = h - 60 - (lines.length - 1) * (size + 6);
  const text = lines.map((l, i) => `<text x="44" y="${y0 + i * (size + 6)}" font-size="${size}" font-weight="800" fill="#f5f1ea" font-family="system-ui,Segoe UI,Helvetica,Arial,sans-serif" letter-spacing="-1.5">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(x.title)}">${scene(w, h, x.hue, `p${x.id}`, { title: x.title, focusX: 0.62 })}${text}<text x="44" y="${h - 22}" font-size="15" fill="#f5f1ea" opacity=".55" font-family="system-ui,sans-serif" letter-spacing="2">DATA PENGEMBANGAN</text></svg>`;
}

function backdrop(x) {
  const w = 1600, h = 900;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(x.title)}">${scene(w, h, x.hue, `b${x.id}`, { title: x.title, focusX: 0.72 })}</svg>`;
}

function thumb(x) {
  const w = 640, h = 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(x.title)}">${scene(w, h, x.hue + 12, `t${x.id}`, { title: x.title, focusX: 0.55 })}</svg>`;
}

for (const m of MOVIES) {
  writeFileSync(join(art, `poster-${m.id}.svg`), poster(m));
  writeFileSync(join(art, `backdrop-${m.id}.svg`), backdrop(m));
}
for (const s of SERIES) {
  writeFileSync(join(art, `poster-${s.id}.svg`), poster(s));
  writeFileSync(join(art, `backdrop-${s.id}.svg`), backdrop(s));
  writeFileSync(join(art, `thumb-${s.id}.svg`), thumb(s));
}
console.log(`✔ ${MOVIES.length + SERIES.length} set gambar → public/dev/art`);

// Subtitle contoh (WebVTT)
const cues = [];
for (let i = 0; i < 12; i++) {
  const fmt = (t) => `00:${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}.000`;
  cues.push(`${i + 1}\n${fmt(i * 5)} --> ${fmt(i * 5 + 4)}\nSubtitle contoh ${i + 1} — data pengembangan.\n`);
}
writeFileSync(join(out, 'sample.id.vtt'), `WEBVTT\n\n${cues.join('\n')}`);
console.log('✔ subtitle contoh → public/dev/sample.id.vtt');

// Video sampel sintetis (bukan konten berlisensi apa pun): pola uji + nada, 60 dtk.
const video = join(out, 'sample.webm');
if (existsSync(video) && !process.argv.includes('--force')) {
  console.log('• sample.webm sudah ada (pakai --force untuk membuat ulang)');
} else {
  const r = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=12:duration=60',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=60',
    '-filter_complex', '[1:a]volume=0.08[a]',
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libvpx', '-b:v', '180k', '-crf', '38', '-deadline', 'realtime', '-cpu-used', '8', '-g', '24',
    '-c:a', 'libopus', '-b:a', '24k', video,
  ], { stdio: 'inherit' });
  console.log(r.status === 0 ? '✔ video sampel → public/dev/sample.webm' : '✖ ffmpeg gagal (pasang ffmpeg untuk membuat video sampel)');
}
