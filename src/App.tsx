import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LogOut, LogIn, Server, Download, Container, Film, Bot, Zap, LayoutDashboard, ChevronLeft, ChevronRight } from 'lucide-react';
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

function Sidebar() {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  const activeId = NAV.find(n => n.href === location.pathname)?.id ?? 'lab';

  return (
    <aside className={`j-sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Logo */}
      <div className="j-sidebar-logo">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div className="j-sidebar-logomark">J</div>
          <span className="j-sidebar-wordmark">
            Joje<span style={{ color: 'var(--accent)' }}>Co</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="j-sidebar-nav">
        {NAV.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to={item.href}
              className={`j-nav-item${active ? ' active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={16} />
              <span className="j-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="j-sidebar-footer">
        {currentUser ? (
          <button
            onClick={() => logout()}
            className="j-nav-item"
            style={{ width: '100%' }}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut size={16} />
            <span className="j-nav-label">Sign out</span>
          </button>
        ) : (
          <Link to="/login" className="j-nav-item" title={collapsed ? 'Sign in' : undefined}>
            <LogIn size={16} style={{ color: 'var(--accent)' }} />
            <span className="j-nav-label" style={{ color: 'var(--accent)' }}>Sign in</span>
          </Link>
        )}
        <button
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end',
            padding: '6px 10px', border: 'none', background: 'none', color: 'var(--t3)',
            width: '100%', transition: 'color 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--t1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const location = useLocation();
  const activeLabel = NAV.find(n => n.href === location.pathname)?.label ?? 'Lab';
  return (
    <header className="j-mobile-header">
      <div className="j-mobile-logo">
        <div className="j-mobile-logo-dot" />
        Joje<span style={{ color: 'var(--accent)' }}>Co</span>
      </div>
      <span className="j-mobile-page-title">{activeLabel}</span>
      <div className="j-mobile-spacer" />
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
            <Icon size={20} />
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
      <p><strong style={{ color: 'var(--t1)' }}>Guest view</strong> — read-only. Sensitive details hidden.</p>
      <button
        onClick={() => navigate('/login')}
        style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
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
    <div className="j-shell">
      <Sidebar />
      <main className="j-main">
        {!currentUser && <GuestBanner />}
        <div className="j-content">{children}</div>
      </main>
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
