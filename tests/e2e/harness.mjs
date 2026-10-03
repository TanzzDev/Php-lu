// Harness E2E: stack Supabase lokal + API + hasil build (dist/) dengan CSP produksi + Chromium.
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { startStack } from '../stack/stack.mjs';
import { loadEnv } from '../../server/config/env.js';
import { createHandler } from '../../server/router.js';
import { createServeHandler } from '../../scripts/serve.js';

export async function startE2E({ label = 'e2e' } = {}) {
  const stack = await startStack(label);
  const env = loadEnv({
    NODE_ENV: 'test', SUPABASE_URL: stack.url, SUPABASE_PUBLISHABLE_KEY: stack.publishableKey, SUPABASE_SECRET_KEY: stack.secretKey,
    SITE_URL: 'http://localhost',
  });
  const api = createHandler({ env });
  const server = http.createServer(createServeHandler({ api, relaxForLocalHttp: stack.url }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const exe = process.env.CHROME_PATH || '/tmp/chromium';
  const browser = await puppeteer.launch({
    executablePath: exe, headless: 'shell',
    // Argumen biasa (bukan --single-process milik paket Lambda yang tidak stabil untuk banyak navigasi).
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--lang=id-ID', '--allow-insecure-localhost'],
  });

  async function newPage(viewport = { width: 1440, height: 900 }, { touch = false } = {}) {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
    page.errors = [];
    page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (!/aborted|ERR_ABORTED/.test(r.failure()?.errorText ?? '')) page.errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
    await page.evaluateOnNewDocument(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    return page;
  }

  async function login(page, email, password = 'password-12345') {
    // Sandbox CI ini kadang CPU-throttled (banyak screenshot berurutan); beri jeda ekstra dan satu retry
    // sebelum menyerah, supaya flakiness lingkungan tidak disalahartikan sebagai bug aplikasi.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(`${base}/login`, { waitUntil: 'networkidle0', timeout: 20000 });
        await page.waitForSelector('input[type=email]', { timeout: 20000 });
        await page.evaluate(() => { document.querySelector('input[type=email]').value = ''; document.querySelector('input[type=password]').value = ''; });
        await page.type('input[type=email]', email, { delay: 5 });
        await page.type('input[type=password]', password, { delay: 5 });
        await Promise.all([page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 }), page.click('button[type=submit]')]);
        await page.waitForNetworkIdle({ idleTime: 400, timeout: 10000 }).catch(() => {});
        return;
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
  }

  return {
    stack, base, browser, newPage, login,
    async close() { await browser.close(); server.close(); server.closeAllConnections?.(); await stack.stop(); },
  };
}
