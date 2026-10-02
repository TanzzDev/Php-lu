import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/figtree/index.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/player.css';
import './styles/admin.css';
import './styles/legal.css';
import App from './App.jsx';
import { ConfigProvider } from './hooks/config.jsx';
import { ToastProvider } from './hooks/toast.jsx';
import { MyListProvider } from './hooks/misc.js';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ApiError } from './lib/api.js';
import { ErrorState } from './components/ui.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => (err instanceof ApiError ? err.status >= 500 && count < 2 : count < 2),
    },
  },
});

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error('UI error:', err?.message); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page-loading">
        <ErrorState title="Terjadi kesalahan" text="Halaman gagal ditampilkan. Muat ulang untuk mencoba lagi." onRetry={() => window.location.reload()} />
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Boundary>
          <ConfigProvider>
            <ToastProvider>
              <AuthProvider>
                <MyListProvider><App /></MyListProvider>
              </AuthProvider>
            </ToastProvider>
          </ConfigProvider>
        </Boundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
