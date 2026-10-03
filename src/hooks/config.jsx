import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { ErrorState, PageLoading } from '../components/ui.jsx';

const ConfigContext = createContext(null);
export const useConfig = () => useContext(ConfigContext);

/** Konfigurasi publik dari server: branding, dukungan, harga, kunci publishable. Semuanya dari database/env server. */
export function ConfigProvider({ children }) {
  const q = useQuery({ queryKey: ['config'], queryFn: () => api('/config/public', { auth: false }), staleTime: 5 * 60_000 });
  if (q.isPending) return <PageLoading label="Memuat MDFlix" />;
  if (q.isError) {
    return (
      <div className="page-loading">
        <ErrorState title="MDFlix tidak dapat dimuat" text="Server sedang tidak dapat dihubungi. Periksa koneksi internet Anda lalu coba lagi." onRetry={() => q.refetch()} />
      </div>
    );
  }
  return <ConfigContext.Provider value={q.data}>{children}</ConfigContext.Provider>;
}
