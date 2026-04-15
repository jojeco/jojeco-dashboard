import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, LogIn, Server, Download, Container, Film, Bot, Zap, LayoutDashboard } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './Pages/Login';
import Dashboard from './Pages/DashboardNew';
import { Birthday } from './Pages/Birthday';
import TorrentsPage from './Pages/TorrentsPage';
import DockerPage from './Pages/DockerPage';
import MediaPage from './Pages/MediaPage';
import AIPage from './Pages/AIPage';
import LabPage from './Pages/LabPage';
import ChaosPage from './Pages/ChaosPage';

const NAV = [
  { id: 'lab',      label: 'Lab',      href: '/',         icon: LayoutDashboard },
  { id: 'services', label: 'Services', href: '/services', icon: Server },
  { id: 'torrents', label: 'Torrents', href: '/torrents', icon: Download },
  { id: 'docker',   label: 'Docker',   href: '/docker',   icon: Container },
  { id: 'media',    label: 'Media',    href: '/media',    icon: Film },
  { id: 'ai',       label: 'AI',       href: '/ai',       icon: Bot },
  { id: 'chaos',    label: 'Chaos',    href: '/chaos',    icon: Zap },
];

function Sidebar() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = NAV.find(n => n.href === location.pathname)?.id ?? 'lab';

  return (
    <aside
      style={{
        width: 220,
        minHeight: '100dvh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100dvh',
        flexShrink: 0,
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--line)' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--t2)',
          }}>
            Joje<span style={{ color: 'var(--accent)' }}>Co</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {NAV.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                marginBottom: 2,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? 'var(--t1)' : 'var(--t2)',
                background: active ? 'var(--raised)' : 'transparent',
                textDecoration: 'none',
                transition: 'background 120ms, color 120ms',
              }}
            >
              <Icon size={15} style={{ color: active ? 'var(--accent)' : 'var(--t3)', flexShrink: 0 }} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--line)' }}>
        {currentUser ? (
          <button
            onClick={() => logout()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--t3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,63,94,0.08)';
              (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)';
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--t3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 120ms, color 120ms',
            }}
          >
            <LogIn size={14} />
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}

function GuestBanner() {
  const navigate = useNavigate();
  return (
    <div style={{
      background: 'rgba(20,184,166,0.06)',
      borderBottom: '1px solid var(--accent-border)',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <p style={{ fontSize: 12, color: 'var(--t2)' }}>
        <strong style={{ color: 'var(--t1)' }}>Guest view</strong> — read-only. Sensitive details are hidden.
      </p>
      <button
        onClick={() => navigate('/login')}
        style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Sign in →
      </button>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const location = useLocation();

  // Don't show sidebar on login/birthday
  if (location.pathname === '/login' || location.pathname === '/birthday') {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--canvas)' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!currentUser && <GuestBanner />}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PageShell>
          <Routes>
            <Route path="/login"    element={<Login />} />
            <Route path="/birthday" element={<Birthday />} />
            <Route path="/"         element={<ProtectedRoute><LabPage /></ProtectedRoute>} />
            <Route path="/services" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/torrents" element={<ProtectedRoute><TorrentsPage /></ProtectedRoute>} />
            <Route path="/docker"   element={<ProtectedRoute><DockerPage /></ProtectedRoute>} />
            <Route path="/media"    element={<ProtectedRoute><MediaPage /></ProtectedRoute>} />
            <Route path="/ai"       element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
            <Route path="/chaos"    element={<ChaosPage />} />
          </Routes>
        </PageShell>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
