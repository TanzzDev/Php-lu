// Screenshot halaman yang butuh login (viewer) di semua viewport. Proses berdiri sendiri.
import { startE2E } from './harness.mjs';
import { pick, mkOut } from './viewports.mjs';

const OUT = mkOut();
const e2e = await startE2E({ label: 'shots-usr' });
const problems = [];
try {
  await e2e.stack.createUser('viewer@example.com', { meta: { full_name: 'Dina Viewer' } });
  for (const [name, [width, height, touch]] of pick(process.argv[2])) {
    const page = await e2e.newPage({ width, height }, { touch: Boolean(touch) });
    const shot = async (id) => { await new Promise((r) => setTimeout(r, 300)); await page.screenshot({ path: `${OUT}/${name}-${id}.png` }); };
    const check = async (id) => {
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (o.sw > o.iw + 1) problems.push(`${name}/${id}: scroll horizontal ${o.sw} > ${o.iw}`);
    };
    const go = async (path) => { await page.goto(`${e2e.base}${path}`, { waitUntil: 'networkidle0', timeout: 20000 }); await page.evaluate(() => document.fonts.ready); };

    await e2e.login(page, 'viewer@example.com');
    await go('/profile'); await shot('profile'); await check('profile');
    await go('/my-list'); await shot('mylist-empty'); await check('mylist');
    await go('/account'); await shot('account'); await check('account');
    await go('/watch/movie/dev-m01'); await page.waitForSelector('video', { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1800)); await shot('watch'); await check('watch');
    await go('/watch/episode/dev-s01-s1e2'); await new Promise((r) => setTimeout(r, 1800)); await shot('watch-series'); await check('watch-series');

    const csp = await page.evaluate(() => window.__csp);
    if (csp.length) problems.push(`${name}: CSP ${[...new Set(csp)].join('; ')}`);
    const errs = page.errors.filter((e) => !/status of (401|403|404)/.test(e));
    if (errs.length) problems.push(`${name}: ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
    await page.close();
  }
} finally { await e2e.close(); }
console.log(problems.length ? `\nMASALAH:\n- ${problems.join('\n- ')}` : '\nUser: tidak ada masalah.');
process.exit(problems.length ? 1 : 0);
