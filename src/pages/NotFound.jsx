import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/misc.js';
import { EmptyState } from '../components/ui.jsx';

export default function NotFound() {
  usePageTitle('Halaman tidak ditemukan');
  return (
    <div className="page container">
      <EmptyState icon="search" title="Halaman tidak ditemukan" text="Alamat yang kamu tuju tidak ada atau sudah dipindahkan.">
        <Link to="/" className="btn btn--primary">Kembali ke beranda</Link>
        <Link to="/help" className="btn btn--ghost">Butuh bantuan?</Link>
      </EmptyState>
    </div>
  );
}
