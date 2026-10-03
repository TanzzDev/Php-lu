import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmptyState, PageLoading } from './ui.jsx';
import { Link } from 'react-router-dom';

/** Hanya kenyamanan UI. Otorisasi sebenarnya SELALU dilakukan server (lihat server/auth). */
export function RequireAuth({ children }) {
  const { status, profileLoading } = useAuth();
  const loc = useLocation();
  if (status === 'loading' || (status === 'authed' && profileLoading)) return <PageLoading />;
  if (status === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

export function RequireAdmin({ children }) {
  const { status, profileLoading, isAdmin } = useAuth();
  const loc = useLocation();
  if (status === 'loading' || (status === 'authed' && profileLoading)) return <PageLoading />;
  if (status === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!isAdmin) {
    return (
      <div className="page container">
        <EmptyState icon="lock" title="Akses ditolak" text="Halaman ini hanya untuk admin MDFlix.">
          <Link to="/" className="btn btn--primary">Kembali ke beranda</Link>
        </EmptyState>
      </div>
    );
  }
  return children;
}
