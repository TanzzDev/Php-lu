// Screenshot konsol admin (desktop + mobile).
// PENTING: jalankan SATU viewport per proses (`node shots-admin.mjs d1440`, lalu
// `node shots-admin.mjs m390`), bukan tanpa argumen. Menjalankan viewport non-touch dan
// touch di browser Puppeteer yang sama pada sandbox ini membuat navigasi kedua macet
// (CDP menahan profil emulasi sentuh dari page sebelumnya) — murni keterbatasan alat uji,
// bukan bug aplikasi: login mandiri di setiap viewport maupun via shots-public/shots-user
// (yang juga memakai emulasi sentuh) selalu berhasil.
import { startE2E } from './harness.mjs';
import { mkOut } from './viewports.mjs';

const OUT = mkOut();
const VP = { d1440: [1440, 900], m390: [390, 844, true] };
if (!process.argv[2]) { console.error('Gunakan: node shots-admin.mjs <d1440|m390>'); process.exit(1); }
const e2e = await startE2E({ label: 'shots-adm' });
const problems = [];
try {
  await e2e.stack.createUser('root@example.com', { role: 'ADMIN', meta: { full_name: 'Root Admin' } });
  const someone = await e2e.stack.createUser('sample.user@example.com', { meta: { full_name: 'Sample User' } });
  const only = process.argv[2]?.split(',');
  for (const [name, [width, height, touch]] of Object.entries(VP)) {
    if (only && !only.includes(name)) continue;
    const page = await e2e.newPage({ width, height }, { touch: Boolean(touch) });
    await e2e.login(page, 'root@example.com');
    for (const [id, path] of [['overview', '/admin'], ['users', '/admin/users'], ['user-detail', null], ['watching', '/admin/watching'], ['history', '/admin/history'], ['audit', '/admin/audit'], ['settings', '/admin/settings']]) {
      if (id === 'user-detail') {
        await page.goto(`${e2e.base}/admin/users/${someone.id}`, { waitUntil: 'networkidle0', timeout: 20000 });
      } else {
        await page.goto(`${e2e.base}${path}`, { waitUntil: 'networkidle0', timeout: 20000 });
      }
      await new Promise((r) => setTimeout(r, 350));
      await page.screenshot({ path: `${OUT}/${name}-admin-${id}.png` });
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (o.sw > o.iw + 1) problems.push(`${name}/admin-${id}: scroll horizontal ${o.sw} > ${o.iw}`);
    }
    const errs = page.errors.filter((e) => !/401|403/.test(e));
    if (errs.length) problems.push(`${name}/admin errors: ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
    const csp = await page.evaluate(() => window.__csp);
    if (csp.length) problems.push(`${name}/admin CSP: ${[...new Set(csp)].join('; ')}`);
    await page.close();
  }
} finally { await e2e.close(); }
console.log(problems.length ? `\nMASALAH:\n- ${problems.join('\n- ')}` : '\nAdmin: tidak ada masalah.');
process.exit(problems.length ? 1 : 0);
