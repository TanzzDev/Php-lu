// Test browser untuk pemutar embed: Chromium sungguhan, HTTPS, dan header CSP/Permissions-Policy
// PERSIS dari vercel.json. Membuktikan embed benar-benar dimuat (dan diblokir bila CSP lama dipakai).
//
// Butuh (tidak termasuk dependensi proyek):  playwright + chromium, esbuild, react, react-dom, openssl.
//   npm i --no-save playwright esbuild && npx playwright install chromium
//   node tests/e2e/embed-player.mjs
// Env opsional: ESBUILD_PATH, NODE_PATH_EXTRA (folder node_modules tambahan untuk resolusi react/playwright).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const globalRoot = (() => { try { return execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })();
const extraPaths = [process.env.NODE_PATH_EXTRA, globalRoot].filter(Boolean);
function load(name) {
  for (const base of [import.meta.url, ...extraPaths.map((p) => path.join(p, 'x.js'))]) {
    try { return createRequire(base)(name); } catch { /* coba lokasi berikutnya */ }
  }
  throw new Error(`Modul "${name}" tidak ditemukan. Lihat petunjuk di kepala berkas ini.`);
}
const { chromium } = load('playwright');
const esbuild = (() => { try { return load('esbuild'); } catch { return createRequire(process.env.ESBUILD_PATH + '/x.js')('./'); } })();

// ── header produksi dari vercel.json ──
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const hdr = (key) => vercel.headers.flatMap((r) => r.headers).find((h) => h.key === key).value;
const NEW = { csp: hdr('Content-Security-Policy'), pp: hdr('Permissions-Policy') };
// Header SEBELUM integrasi (hanya YouTube yang boleh di-iframe) — untuk membuktikan kenapa perubahan itu wajib.
const OLD = {
  csp: NEW.csp.replace('frame-src https:', 'frame-src https://www.youtube-nocookie.com'),
  pp: NEW.pp.replace('fullscreen=*', 'fullscreen=(self "https://www.youtube-nocookie.com")'),
};

let tmp, bundleJs, bundleCss, cert, app, embed, appUrl, embedUrl, browser, headers = NEW;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdflix-embed-'));
  await esbuild.build({
    entryPoints: [path.join(here, 'embed-harness.jsx')], bundle: true, outdir: tmp, jsx: 'automatic', format: 'iife',
    nodePaths: extraPaths, logLevel: 'error', loader: { '.css': 'css' },
  });
  bundleJs = fs.readFileSync(path.join(tmp, 'embed-harness.js'));
  bundleCss = fs.readFileSync(path.join(tmp, 'embed-harness.css'));

  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem'),
    '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  cert = { key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(path.join(tmp, 'c.pem')) };

  app = https.createServer(cert, (req, res) => {
    const u = new URL(req.url, 'https://x');
    if (u.pathname === '/main.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundleJs); }
    if (u.pathname === '/main.css') { res.setHeader('content-type', 'text/css'); return res.end(bundleCss); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-security-policy', headers.csp);
    res.setHeader('permissions-policy', headers.pp);
    res.end('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>harness</title><link rel="stylesheet" href="/main.css"></head><body><div id="root"></div><script src="/main.js"></script></body></html>');
  });
  // "Pemutar pihak ketiga": origin BERBEDA (port lain). Memberi tahu parent apa yang dilihatnya.
  embed = https.createServer(cert, (req, res) => {
    const u = new URL(req.url, 'https://x');
    if (u.pathname === '/hang') return; // tidak pernah menjawab
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><title>${u.pathname}</title><body>PLAYER ${u.pathname}<script>
      parent.postMessage({ path: ${JSON.stringify(u.pathname)}, fullscreenEnabled: document.fullscreenEnabled, sandboxed: !!window.frameElement === false }, '*');
      if (${JSON.stringify(u.pathname)} === '/nav') { try { top.location.href = ${JSON.stringify('https://127.0.0.1/hijack')}; } catch (e) { parent.postMessage({ path: '/nav', navBlocked: String(e.name) }, '*'); } }
    </script></body>`);
  });
  await Promise.all([app, embed].map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
  appUrl = `https://127.0.0.1:${app.address().port}`;
  embedUrl = `https://127.0.0.1:${embed.address().port}`;
  browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
});
after(async () => {
  await browser?.close();
  for (const s of [app, embed]) await new Promise((r) => { s?.close(r); s?.closeAllConnections?.(); });
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function open(servers, { h = NEW, clock = false } = {}) {
  headers = h;
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const logs = [], messages = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.exposeFunction('__msg', (d) => messages.push(d));
  await page.addInitScript(() => window.addEventListener('message', (e) => window.__msg({ origin: e.origin, ...(e.data ?? {}) })));
  if (clock) await page.clock.install();
  // domcontentloaded: iframe yang sengaja tidak pernah selesai (/hang) menahan event `load` halaman induk.
  await page.goto(`${appUrl}/?servers=${encodeURIComponent(JSON.stringify(servers))}`, { waitUntil: 'domcontentloaded' });
  await page.locator('iframe.player__frame').waitFor();
  return { page, ctx, logs, messages, close: () => ctx.close() };
}
const S = (name, p) => ({ name, url: `${embedUrl}${p}` });
const waitFor = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } return null; };

describe('pemutar embed di Chromium dengan header produksi (vercel.json)', () => {
  it('CSP SEBELUM integrasi memblokir iframe embed (alasan perubahan wajib)', async () => {
    const t = await open([S('Server A', '/a')], { h: OLD });
    try {
      assert.ok(await waitFor(() => t.logs.some((l) => /frame-src/.test(l) && /Refused to frame/i.test(l))), `log: ${t.logs.join(' | ')}`);
      await t.page.waitForTimeout(400);
      assert.equal(t.messages.length, 0, 'pemutar tidak boleh sempat dimuat');
    } finally { await t.close(); }
  });

  it('CSP + Permissions-Policy SESUDAH integrasi: pemutar dimuat, fullscreen tersedia, status = playing', async () => {
    const t = await open([S('Server A', '/a')]);
    try {
      const m = await waitFor(() => t.messages.find((x) => x.path === '/a'));
      assert.ok(m, `pemutar tidak termuat. log: ${t.logs.join(' | ')}`);
      assert.equal(m.fullscreenEnabled, true, 'fullscreen harus bisa didelegasikan ke embed');
      assert.ok(await waitFor(async () => (await t.page.evaluate(() => window.__states)).at(-1) === 'playing'), 'state playing');
      assert.equal(await t.page.locator('.player__center').count(), 0, 'spinner hilang setelah termuat');
      assert.equal(await t.page.locator('.player__overlay').count(), 0);
      assert.equal(t.logs.some((l) => /Refused to/i.test(l)), false, t.logs.join(' | '));
    } finally { await t.close(); }
  });

  it('Permissions-Policy lama (hanya YouTube) mematikan fullscreen di embed', async () => {
    const t = await open([S('Server A', '/a')], { h: { csp: NEW.csp, pp: OLD.pp } });
    try {
      const m = await waitFor(() => t.messages.find((x) => x.path === '/a'));
      assert.ok(m);
      assert.equal(m.fullscreenEnabled, false);
    } finally { await t.close(); }
  });

  it('server biasa: sandbox ketat + no-referrer; navigasi top-level dari embed diblokir', async () => {
    const t = await open([S('Server A', '/nav')]);
    try {
      const f = t.page.locator('iframe.player__frame');
      assert.equal(await f.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation allow-orientation-lock');
      assert.equal(await f.getAttribute('referrerpolicy'), 'no-referrer');
      assert.match(await f.getAttribute('allow'), /fullscreen/);
      await t.page.waitForTimeout(800);
      assert.equal(new URL(t.page.url()).origin, appUrl, 'halaman induk tidak boleh dialihkan oleh embed');
      assert.equal(await t.page.locator('.embed-bar__note').count(), 0);
    } finally { await t.close(); }
  });

  it('server dikenal butuh kompatibilitas (VidSrc): tanpa sandbox + catatan iklan; tombol manual disembunyikan', async () => {
    const t = await open([S('VidSrc', '/v')]);
    try {
      assert.ok(await waitFor(() => t.messages.find((x) => x.path === '/v')));
      const f = t.page.locator('iframe.player__frame');
      assert.equal(await f.getAttribute('sandbox'), null);
      assert.equal(await f.getAttribute('referrerpolicy'), null);
      assert.match(await t.page.locator('.embed-bar__note').innerText(), /hanya bisa diputar dalam mode kompatibel/);
      assert.equal(await t.page.getByRole('button', { name: /mode kompatibel/i }).count(), 0);
    } finally { await t.close(); }
  });

  it('ganti server lewat tab: iframe baru dimuat, tab aktif berpindah', async () => {
    const t = await open([S('Server A', '/a'), S('Server B', '/b')]);
    try {
      assert.ok(await waitFor(() => t.messages.find((x) => x.path === '/a')));
      const chips = t.page.locator('.embed-bar__servers .chip');
      assert.equal(await chips.count(), 2);
      assert.equal(await chips.nth(0).getAttribute('aria-pressed'), 'true');
      await chips.nth(1).click();
      assert.ok(await waitFor(() => t.messages.find((x) => x.path === '/b')), 'server B termuat');
      assert.equal(await chips.nth(1).getAttribute('aria-pressed'), 'true');
      assert.equal(await chips.nth(0).getAttribute('aria-pressed'), 'false');
      assert.match(await t.page.locator('iframe.player__frame').getAttribute('src'), /\/b$/);
      assert.equal(await t.page.locator('iframe.player__frame').count(), 1, 'iframe lama dilepas');
    } finally { await t.close(); }
  });

  it('mode kompatibel manual melepas sandbox lalu bisa dimatikan lagi', async () => {
    const t = await open([S('Server A', '/a')]);
    try {
      const f = t.page.locator('iframe.player__frame');
      await t.page.getByRole('button', { name: /coba mode kompatibel/i }).click();
      await waitFor(async () => (await f.getAttribute('sandbox')) === null);
      assert.equal(await f.getAttribute('sandbox'), null);
      assert.match(await t.page.locator('.embed-bar__note').innerText(), /melonggarkan pembatasan/);
      await t.page.getByRole('button', { name: /matikan mode kompatibel/i }).click();
      await waitFor(async () => (await f.getAttribute('sandbox')) !== null);
      assert.match(await f.getAttribute('sandbox'), /allow-scripts/);
    } finally { await t.close(); }
  });

  it('server yang tidak merespons: overlay gagal setelah 15 detik, "Muat ulang" memasang iframe baru', async () => {
    const t = await open([S('Server A', '/hang')], { clock: true });
    try {
      assert.equal(await t.page.locator('.player__overlay').count(), 0);
      await t.page.clock.fastForward(16_000);
      const overlay = t.page.locator('.player__overlay[role="alert"]');
      await overlay.waitFor({ timeout: 3000 });
      assert.match(await overlay.innerText(), /Server tidak merespons/);
      assert.equal((await t.page.evaluate(() => window.__states)).at(-1), 'paused');
      await overlay.getByRole('button', { name: /muat ulang/i }).click();
      await waitFor(async () => (await t.page.locator('.player__overlay').count()) === 0);
      assert.equal(await t.page.locator('.player__overlay').count(), 0, 'overlay hilang saat memuat ulang');
      assert.equal(await t.page.locator('iframe.player__frame').count(), 1);
    } finally { await t.close(); }
  });
});

// Opsional: EMBED_SHOT=/path/shot.png node --test tests/e2e/embed-player.mjs  → tangkapan layar untuk tinjauan visual.
describe('tangkapan layar (opsional)', { skip: !process.env.EMBED_SHOT }, () => {
  it('menyimpan screenshot pemutar dengan beberapa server', async () => {
    const t = await open([S('2Embed', '/a'), S('Server B', '/b'), S('VidLink', '/c')]);
    try {
      await waitFor(() => t.messages.find((x) => x.path === '/a'));
      await t.page.screenshot({ path: process.env.EMBED_SHOT, clip: { x: 0, y: 0, width: 1100, height: 760 } });
    } finally { await t.close(); }
  });
});
