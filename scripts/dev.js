// Server pengembangan: Vite (HMR) + API di satu port — jalankan dengan `npm run dev`.
import http from 'node:http';
import { createServer as createVite } from 'vite';

try { process.loadEnvFile?.('.env'); } catch { /* .env opsional */ }
const { handleRequest } = await import('../server/router.js');

const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
const port = Number(process.env.PORT || 3000);

http.createServer((req, res) => {
  if (req.url?.startsWith('/api/') || req.url === '/api') return handleRequest(req, res);
  vite.middlewares(req, res);
}).listen(port, () => console.log(`MDFlix dev → http://localhost:${port}`));
