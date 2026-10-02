// Pengaturan non-rahasia dari tabel app_settings (info dukungan & branding).
// MDFlix 100% gratis: tidak ada lagi harga, kuota, atau pengaturan pembayaran.
// Nilai di bawah adalah DEFAULT yang sama dengan seed migration; database yang menang.

export const DEFAULT_SETTINGS = Object.freeze({
  support: { email: 'supportmdflix@gmail.com', phone: '+62 822-8732-5646' },
  branding: { name: 'MDFlix', tagline: 'Film dan series pilihan, gratis, kapan saja.' },
});

export function createSettingsStore(getAdmin, { ttlMs = 20_000 } = {}) {
  let cached = null;
  let exp = 0;
  return {
    async get() {
      if (cached && exp > Date.now()) return cached;
      const admin = getAdmin();
      let merged = { ...DEFAULT_SETTINGS };
      if (admin) {
        const { data, error } = await admin.from('app_settings').select('key,value');
        // Hanya kunci yang dikenal yang diambil — baris lama (mis. 'pricing') diabaikan.
        if (!error && data) for (const r of data) if (r.key in DEFAULT_SETTINGS) merged = { ...merged, [r.key]: r.value };
      }
      cached = merged;
      exp = Date.now() + ttlMs;
      return merged;
    },
    invalidate() { cached = null; exp = 0; },
  };
}
