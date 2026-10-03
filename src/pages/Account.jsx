import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useConfig } from '../hooks/config.jsx';
import { usePageTitle } from '../hooks/misc.js';
import { useToast } from '../hooks/toast.jsx';
import { dateLong } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';
import { Avatar } from '../components/Layout.jsx';
import { Field, Spinner } from '../components/ui.jsx';

/** MDFlix 100% gratis: tidak ada paket, kuota, atau masa berlaku. Panel ini hanya informasi. */
export function AccessPanel() {
  return (
    <section className="panel" aria-labelledby="acc-h">
      <h2 id="acc-h" className="panel__title">Akses tontonan</h2>
      <div className="cluster" style={{ marginBottom: 14 }}>
        <span className="badge badge--ok"><Icon name="check" className="icon--xs" style={{ width: 12, height: 12 }} /> Gratis · tanpa batas</span>
      </div>
      <p className="muted">Semua judul di MDFlix dapat kamu tonton tanpa biaya dan tanpa batas waktu selama kamu masuk ke akun. Riwayat tontonan dan Daftar Saya tersimpan otomatis di akunmu.</p>
    </section>
  );
}

export function Profile() {
  usePageTitle('Profil', { noindex: true });
  const { profile, isAdmin } = useAuth();
  return (
    <div className="page container">
      <div className="profile-head">
        <Avatar profile={profile} large />
        <div style={{ minWidth: 0 }}>
          <h1 className="page__title display" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)' }}>{profile?.displayName || 'Pengguna MDFlix'}</h1>
          <p className="muted" style={{ overflowWrap: 'anywhere' }}>{profile?.email}</p>
          <p className="faint" style={{ fontSize: '0.85rem', marginTop: 4 }}>Bergabung {dateLong(profile?.createdAt)}</p>
        </div>
      </div>
      <div className="cards-2">
        <AccessPanel />
        <section className="panel" aria-labelledby="pl-h">
          <h2 id="pl-h" className="panel__title">Pintasan</h2>
          <nav className="linklist" aria-label="Pintasan profil">
            <Link to="/my-list">Daftar Saya <Icon name="chevR" /></Link>
            <Link to="/history">Riwayat &amp; lanjutkan menonton <Icon name="chevR" /></Link>
            <Link to="/account">Pengaturan akun <Icon name="chevR" /></Link>
            <Link to="/help">Bantuan <Icon name="chevR" /></Link>
            {isAdmin && <Link to="/admin">Konsol admin <Icon name="chevR" /></Link>}
          </nav>
        </section>
      </div>
    </div>
  );
}

export function Account() {
  usePageTitle('Pengaturan akun', { noindex: true });
  const { profile, signOut, refreshMe } = useAuth();
  const { support } = useConfig();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(profile?.displayName ?? '');
  const save = useMutation({
    mutationFn: () => api('/auth/profile', { method: 'PATCH', body: { displayName: name } }),
    onSuccess: () => { refreshMe(); toast('Nama diperbarui', { type: 'ok' }); },
    onError: (e) => toast(errorMessage(e), { type: 'error' }),
  });
  const dirty = name.trim() !== (profile?.displayName ?? '') && name.trim().length > 0;

  return (
    <div className="page container">
      <div className="page__head"><h1 className="page__title display">Pengaturan akun</h1></div>
      <div className="stack stack--lg" style={{ maxWidth: 880 }}>
        <section className="panel" aria-labelledby="prof-h">
          <h2 id="prof-h" className="panel__title">Profil</h2>
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (dirty) save.mutate(); }}>
            <Field label="Nama tampilan">{(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />}</Field>
            <Field label="Email" hint="Email tidak dapat diubah dari sini. Hubungi dukungan bila perlu.">{(p) => <input {...p} className="input" value={profile?.email ?? ''} readOnly disabled />}</Field>
            <div><button type="submit" className="btn btn--primary" disabled={!dirty || save.isPending}>{save.isPending && <Spinner small />} Simpan perubahan</button></div>
          </form>
        </section>

        <section className="panel" aria-labelledby="help-h">
          <h2 id="help-h" className="panel__title">Bantuan akun</h2>
          <p className="muted">Untuk mengganti email, menghapus akun, atau kendala lain, hubungi kami di <a className="link" href={`mailto:${support.email}`}>{support.email}</a> atau {support.phone}.</p>
        </section>

        <div><button type="button" className="btn btn--danger" onClick={async () => { await signOut(); qc.clear(); nav('/'); }}><Icon name="logout" /> Keluar dari akun</button></div>
      </div>
    </div>
  );
}

const FAQ = [
  ['Apakah MDFlix benar-benar gratis?', 'Ya. Semua judul dapat ditonton tanpa biaya dan tanpa batas waktu. Tidak ada paket berbayar, langganan, atau kuota harian.'],
  ['Kenapa saya harus masuk (login) untuk menonton?', 'Kamu bebas menjelajah katalog, mencari, dan membuka halaman detail tanpa akun. Masuk diperlukan saat mulai menonton supaya riwayat, Lanjutkan Menonton, dan Daftar Saya tersimpan aman di akunmu dan bisa dibuka dari perangkat lain.'],
  ['Bisakah menonton di dua perangkat sekaligus?', 'Hanya satu pemutaran aktif per akun. Memulai video di perangkat lain akan menghentikan pemutaran sebelumnya.'],
  ['Bagaimana cara melanjutkan tontonan yang terhenti?', 'Progres tersimpan otomatis. Buka Beranda (bagian Lanjutkan Menonton) atau halaman Riwayat, lalu pilih judulnya — pemutaran dilanjutkan dari posisi terakhir.'],
  ['Video tidak mau diputar, apa yang harus dilakukan?', 'Muat ulang halaman, periksa koneksi internet, lalu coba lagi. Jika masih gagal, hubungi dukungan dan sebutkan judul yang dimaksud.'],
];

export function Help() {
  usePageTitle('Bantuan');
  const { support } = useConfig();
  return (
    <div className="page container">
      <div className="page__head"><div><h1 className="page__title display">Bantuan &amp; dukungan</h1><p className="page__sub">Jawaban cepat untuk pertanyaan yang sering diajukan, dan cara menghubungi kami.</p></div></div>
      <div className="stack stack--lg">
        <section aria-labelledby="ct-h">
          <h2 id="ct-h" style={{ fontSize: '1.2rem', marginBottom: 14 }}>Hubungi kami</h2>
          <div className="contact-grid">
            <a className="contact" href={`mailto:${support.email}`}><Icon name="mail" /><span><small>Email</small>{support.email}</span></a>
            <a className="contact" href={`tel:${support.phone.replace(/[^+\d]/g, '')}`}><Icon name="phone" /><span><small>Telepon</small>{support.phone}</span></a>
          </div>
          <p className="muted" style={{ marginTop: 14, maxWidth: '64ch' }}>Sebutkan judul dan perangkat yang kamu pakai agar kami bisa membantu lebih cepat. Kami tidak pernah meminta password atau kode verifikasi Anda.</p>
        </section>
        <section aria-labelledby="faq-h">
          <h2 id="faq-h" style={{ fontSize: '1.2rem', marginBottom: 14 }}>Pertanyaan umum</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><div>{a}</div></details>)}
          </div>
        </section>
      </div>
    </div>
  );
}
