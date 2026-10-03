import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useConfig } from './config.jsx';
import { useToast } from './toast.jsx';

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Judul halaman + noindex untuk halaman privat (admin, pembayaran, akun). */
export function usePageTitle(title, { noindex = false } = {}) {
  const { brand } = useConfig();
  useEffect(() => {
    document.title = title ? `${title} — ${brand.name}` : `${brand.name} — ${brand.tagline}`;
    let meta = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
      meta.content = 'noindex, nofollow';
    } else meta?.remove();
    return () => { document.querySelector('meta[name="robots"]')?.remove(); };
  }, [title, noindex, brand.name, brand.tagline]);
}

/** Skala fokus/scroll ke atas saat pindah halaman. */
export function useScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); }, [pathname]);
}

/** My List di database (bukan localStorage): status per kartu + toggle optimistik. */
function useMyListState() {
  const { status } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const q = useQuery({ queryKey: ['my-list-ids'], queryFn: () => api('/my-list/ids'), enabled: status === 'authed', staleTime: 60_000 });
  const ids = useMemo(() => new Set(q.data?.ids ?? []), [q.data]);
  const key = (i) => `${i.type}:${i.id}`;

  const m = useMutation({
    mutationFn: ({ item, inList }) => (inList
      ? api(`/my-list/${item.type}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      : api('/my-list', { method: 'POST', body: { contentType: item.type, contentId: item.id } })),
    onMutate: async ({ item, inList }) => {
      await qc.cancelQueries({ queryKey: ['my-list-ids'] });
      const prev = qc.getQueryData(['my-list-ids']);
      const set = new Set(prev?.ids ?? []);
      inList ? set.delete(key(item)) : set.add(key(item));
      qc.setQueryData(['my-list-ids'], { ids: [...set] });
      return { prev };
    },
    onError: (err, vars, ctx) => { qc.setQueryData(['my-list-ids'], ctx?.prev); toast(errorMessage(err), { type: 'error' }); },
    onSuccess: (_, { inList, item }) => toast(inList ? `“${item.title}” dihapus dari Daftar Saya` : `“${item.title}” ditambahkan ke Daftar Saya`, { type: 'ok' }),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['my-list-ids'] }); qc.invalidateQueries({ queryKey: ['my-list'] }); },
  });

  return {
    has: (item) => ids.has(key(item)),
    pending: m.isPending,
    toggle(item) {
      if (status !== 'authed') { nav(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`); return; }
      m.mutate({ item, inList: ids.has(key(item)) });
    },
  };
}

const MyListContext = createContext({ has: () => false, toggle: () => {}, pending: false });
export const useMyList = () => useContext(MyListContext);
export function MyListProvider({ children }) {
  const value = useMyListState();
  return createElement(MyListContext.Provider, { value }, children);
}
