// Menyimpan tujuan setelah login (path lokal) selama redirect OAuth ke Google dan kembali.
//
// Kenapa bukan query ?next= pada redirectTo: Supabase mencocokkan redirectTo dengan daftar
// Redirect URLs; URL berisi query sering tidak cocok dengan entri "…/auth/callback" polos
// (terutama di localhost/preview), sehingga pengguna mendarat di Site URL. Dengan redirectTo
// polos + penyimpanan sementara di sessionStorage, satu entri "…/auth/callback" sudah cukup.
const KEY = 'mdflix.auth.next';

const defaultStore = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

export function rememberNext(next, storage = defaultStore()) {
  try { storage?.setItem(KEY, next); } catch { /* penyimpanan diblokir: kembali ke beranda */ }
}
export function peekNext(storage = defaultStore()) {
  try { return storage?.getItem(KEY) ?? null; } catch { return null; }
}
export function clearNext(storage = defaultStore()) {
  try { storage?.removeItem(KEY); } catch { /* abaikan */ }
}
