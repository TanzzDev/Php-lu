// Screenshot halaman publik (tanpa login) di semua viewport. Proses berdiri sendiri.
import { startE2E } from './harness.mjs';
import { pick, mkOut } from './viewports.mjs';

const OUT = mkOut();
const e2e = await startE2E({ label: 'shots-pub' });
const problems = [];
try {
  for (const [name, [width, height, touch]] of pick(process.argv[2])) {
    const page = await e2e.newPage({ width, height }, { touch: Boolean(touch) });
    const shot = async (id) => { await new Promise((r) => setTimeout(r, 300)); await page.screenshot({ path: `${OUT}/${name}-${id}.png` }); };
    const check = async (id) => {
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (o.sw > o.iw + 1) problems.push(`${name}/${id}: scroll horizontal ${o.sw} > ${o.iw}`);
    };
    const go = async (path) => { await page.goto(`${e2e.base}${path}`, { waitUntil: 'networkidle0', timeout: 20000 }); await page.evaluate(() => document.fonts.ready); };

    await go('/'); await shot('home'); await check('home');
    const row = await page.evaluate(() => {
      const t = document.querySelector('.row__track'); const c = t?.querySelector('.card');
      return t && c ? Math.floor((t.clientWidth - 2 * parseFloat(getComputedStyle(t).paddingLeft)) / (c.getBoundingClientRect().width + 12)) : null;
    });
    console.log(`${name} poster/baris:`, row);
    await page.evaluate(() => window.scrollTo(0, 900)); await shot('home-rows');
    await go('/movie/dev-m01'); await shot('movie'); await check('movie');
    await go('/series/dev-s01'); await shot('series'); await check('series');
    await go('/search?q=hujan'); await shot('search'); await check('search');
    await go('/help'); await shot('help'); await check('help');
    await go('/login'); await shot('login'); await check('login');
    await go('/tidak-ada'); await shot('404'); await check('404');

    const csp = await page.evaluate(() => window.__csp);
    if (csp.length) problems.push(`${name}: CSP ${[...new Set(csp)].join('; ')}`);
    const errs = page.errors.filter((e) => !/status of (401|403|404)/.test(e));
    if (errs.length) problems.push(`${name}: ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
    await page.close();
  }
} finally { await e2e.close(); }
console.log(problems.length ? `\nMASALAH:\n- ${problems.join('\n- ')}` : '\nPublik: tidak ada masalah.');
process.exit(problems.length ? 1 : 0);
