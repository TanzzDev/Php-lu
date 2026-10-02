import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/Layout.jsx';
import { RequireAdmin, RequireAuth } from './components/guards.jsx';
import { PageLoading } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import { MovieDetail, SeriesDetail } from './pages/Detail.jsx';
import { History, MyList } from './pages/Library.jsx';
import { Login, AuthCallback } from './pages/Auth.jsx';
import { Account, Help, Profile } from './pages/Account.jsx';
import { PrivacyPolicy, TermsOfService, LicensePage, CookiePolicy } from './pages/Legal.jsx';
import NotFound from './pages/NotFound.jsx';

// Player (hls.js) dan konsol admin dimuat saat dibutuhkan agar bundel awal tetap ringan.
const Watch = lazy(() => import('./pages/Watch.jsx'));
const WatchLayout = lazy(() => import('./pages/Watch.jsx').then((m) => ({ default: m.WatchLayout })));
const AdminLayout = lazy(() => import('./components/admin.jsx').then((m) => ({ default: m.AdminLayout })));
const adminPage = (name) => lazy(() => import('./pages/admin/people.jsx').then((m) => ({ default: m[name] })));
const moneyPage = (name) => lazy(() => import('./pages/admin/money.jsx').then((m) => ({ default: m[name] })));
const Overview = adminPage('Overview');
const Users = adminPage('Users');
const UserDetail = adminPage('UserDetail');
const Watching = moneyPage('Watching');
const AdminHistory = moneyPage('AdminHistory');
const Audit = moneyPage('Audit');
const Settings = moneyPage('Settings');

const guard = (el) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="search" element={<Search />} />
          <Route path="movie/:id" element={<MovieDetail />} />
          <Route path="series/:id" element={<SeriesDetail />} />
          <Route path="help" element={<Help />} />
          <Route path="privacy" element={<PrivacyPolicy />} />
          <Route path="terms" element={<TermsOfService />} />
          <Route path="license" element={<LicensePage />} />
          <Route path="cookies" element={<CookiePolicy />} />
          <Route path="my-list" element={guard(<MyList />)} />
          <Route path="history" element={guard(<History />)} />
          <Route path="profile" element={guard(<Profile />)} />
          <Route path="account" element={guard(<Account />)} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route element={<WatchLayout />}>
          <Route path="watch/:kind/:id" element={guard(<Watch />)} />
        </Route>

        <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="watching" element={<Watching />} />
          <Route path="history" element={<AdminHistory />} />
          <Route path="audit" element={<Audit />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
