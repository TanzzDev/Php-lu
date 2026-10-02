import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mengisi URL absolut untuk og:image/twitter:image saat build (crawler butuh URL penuh).
// Hanya SITE_URL / URL produksi Vercel yang dipakai — tidak ada secret yang disisipkan ke bundle.
function siteUrlPlugin() {
  const site = (process.env.SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  ).replace(/\/+$/, '');
  return {
    name: 'mdflix-site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', site),
  };
}

export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: { port: 3000, host: true },
});
