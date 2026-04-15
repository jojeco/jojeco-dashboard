import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
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
  { id: 'lab',      label: 'Lab',     href: '/',         icon: LayoutDashboard },
  { id: 'services', label: 'Services', href: '/services', icon: Server },
  { id: 'torrents', label: 'Torrents', href: '/torrents', icon: Download },
  { id: 'docker',   label: 'Docker',  href: '/docker',   icon: Container },
  { id: 'media',    label: 'Media',   href: '/media',    icon: Film },
  { id: 'ai',       label: 'AI',      href: '/ai',       icon: Bot },
  { id: 'chaos',    label: 'Chaos',   href: '/chaos',    icon: Zap },
];

// Short labels for the 7-item bottom nav on mobile
const NAV_SHORT: Record<string, string> = {
  lab: 'Lab', services: 'Svcs', torrents: 'DL',
  docker: 'Docker', media: 'Media', ai: 'AI', chaos: 'Chaos',
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = NAV.find(n => n.href === location.pathname)?.id ?? 'lab';
  const w = collapsed ? 64 : 220;

  return (
    <aside
      className={collapsed ? 'j-sidebar-collapsed' : ''}
      style={{
        width: w,
        minHeight: '100dvh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100dvh',
        flexShrink: 0,
        transition: 'width 200ms cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}
    >
      {/* Wordmark / Toggle */}
      <div style={{
        height: 53,
        padding: collapsed ? '0 12px' : '0 16px 0 20px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <Link to="/" style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
            <span style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--t2)',
              whiteSpace: 'nowrap',
            }}>
              Joje<span style={{ color: 'var(--accent)' }}>Co</span>
            </span>
          </Link>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'color 120ms',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {NAV.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <Link
              key={item.id}
              to={item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '10px 0' : '8px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 8,
                marginBottom: 2,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? 'var(--t1)' : 'var(--t2)',
                background: active ? 'var(--raised)' : 'transparent',
                textDecoration: 'none',
                transition: 'background 120ms, color 120ms',
                overflow: 'hidden',
              }}
            >
              <Icon size={15} style={{ color: active ? 'var(--accent)' : 'var(--t3)', flexShrink: 0 }} />
              <span className="j-sidebar-link-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 8px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
        {currentUser ? (
          <button
            onClick={() => logout()}
            title={collapsed ? 'Sign out' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              width: '100%',
              padding: collapsed ? '10px 0' : '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--t3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 120ms, color 120ms',
              overflow: 'hidden',
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
            <LogOut size={14} style={{ flexShrink: 0 }} />
            <span className="j-sidebar-link-label">Sign out</span>
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            title={collapsed ? 'Sign in' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              width: '100%',
              padding: collapsed ? '10px 0' : '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--t3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <LogIn size={14} style={{ flexShrink: 0 }} />
            <span className="j-sidebar-link-label">Sign in</span>
          </button>
        )}
      </div>
    </aside>
  );
}

function MobileHeader() {
  const location = useLocation();
  const activeLabel = NAV.find(n => n.href === location.pathname)?.label ?? 'Lab';

  return (
    <header className="j-mobile-header">
      <span className="j-mobile-logo">
        Joje<span style={{ color: 'var(--accent)' }}>Co</span>
      </span>
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
          <Link
            key={item.id}
            to={item.href}
            className={`j-bottom-nav-item${active ? ' active' : ''}`}
          >
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
    <div style={{
      background: 'rgba(20,184,166,0.06)',
      borderBottom: '1px solid var(--accent-border)',
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexShrink: 0,
    }}>
      <p style={{ fontSize: 12, color: 'var(--t2)' }}>
        <strong style={{ color: 'var(--t1)' }}>Guest view</strong> — read-only. Sensitive details are hidden.
      </p>
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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
  });

  function toggleSidebar() {
    setCollapsed(v => {
      const next = !v;
      try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  if (location.pathname === '/login' || location.pathname === '/birthday') {
    return <>{children}</>;
  }

  if (isMobile) {
    return (
      <div className="j-shell-mobile">
        <MobileHeader />
        {!currentUser && <GuestBanner />}
        <main className="j-mobile-content">
          {children}
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="j-shell-desktop" style={{ minHeight: '100dvh', background: 'var(--canvas)' }}>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!currentUser && <GuestBanner />}
        <main style={{ flex: 1 }}>
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
