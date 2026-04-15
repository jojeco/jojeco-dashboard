import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
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

const NAV_SHORT: Record<string, string> = {
  lab: 'Lab', services: 'Svcs', torrents: 'DL',
  docker: 'Docker', media: 'Media', ai: 'AI', chaos: 'Chaos',
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return matches;
}

function TopNav() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = NAV.find(n => n.href === location.pathname)?.id ?? 'lab';

  return (
    <nav className="j-topnav">
      <Link to="/" className="j-topnav-logo">
        Joje<span style={{ color: 'var(--accent)' }}>Co</span>
      </Link>

      <div className="j-topnav-items">
        {NAV.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to={item.href}
              className={`j-topnav-item${active ? ' active' : ''}`}
            >
              <Icon size={13} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="j-topnav-auth">
        {currentUser ? (
          <button
            onClick={() => logout()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 11px', borderRadius: 8, fontSize: 12,
              color: 'var(--t3)', background: 'transparent', border: '1px solid var(--line)',
              cursor: 'pointer', transition: 'all 120ms',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(244,63,94,0.08)';
              (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,63,94,0.25)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)';
            }}
          >
            <LogOut size={12} />
            Sign out
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 11px', borderRadius: 8, fontSize: 12,
              color: 'var(--accent)', background: 'var(--accent-dim)',
              border: '1px solid var(--accent-border)', cursor: 'pointer',
            }}
          >
            <LogIn size={12} />
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
}

function MobileHeader() {
  const location = useLocation();
  const activeLabel = NAV.find(n => n.href === location.pathname)?.label ?? 'Lab';
  return (
    <header className="j-mobile-header">
      <span className="j-mobile-logo">Joje<span style={{ color: 'var(--accent)' }}>Co</span></span>
      <span className="j-mobile-title">{activeLabel}</span>
      <div style={{ width: 52 }} />
    </header>
  );
}

function BottomNav() {
  const location = useLocation();
  const activeId = NAV.find(n => n.href === location.pathname)?.id ?? 'lab';
  return (
    <nav className="j-bottom-nav">
      {NAV.map(item => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <Link key={item.id} to={item.href} className={`j-bottom-nav-item${active ? ' active' : ''}`}>
            <Icon size={18} />
            <span>{NAV_SHORT[item.id]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function GuestBanner() {
  const navigate = useNavigate();
  return (
    <div className="j-guest-banner">
      <p><strong style={{ color: 'var(--t1)' }}>Guest view</strong> — read-only. Sensitive details are hidden.</p>
      <button
        onClick={() => navigate('/login')}
        style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        Sign in →
      </button>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (location.pathname === '/login' || location.pathname === '/birthday') {
    return <>{children}</>;
  }

  if (isMobile) {
    return (
      <div className="j-shell-mobile">
        <MobileHeader />
        {!currentUser && <GuestBanner />}
        <main className="j-mobile-content">{children}</main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="j-shell-desktop">
      <TopNav />
      {!currentUser && <GuestBanner />}
      <main style={{ flex: 1 }}>{children}</main>
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
