import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, Component, ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 32, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', fontSize: 13 }}>
        <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 8 }}>Render error</div>
        <div>{this.state.err}</div>
      </div>
    );
    return this.props.children;
  }
}
import { LogOut, LogIn, Server, Film, Zap, LayoutDashboard, Sliders, Sun, Moon, Sword } from 'lucide-react';
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
import ControlsPage from './Pages/ControlsPage';
import MinecraftPage from './Pages/MinecraftPage';

function MediaAndTorrentsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div>
        <div className="j-section-label" style={{ marginBottom: 16 }}>Torrents</div>
        <TorrentsPage />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 36 }}>
        <div className="j-section-label" style={{ marginBottom: 16 }}>Media Queue & Upcoming</div>
        <MediaPage />
      </div>
    </div>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('jojeco_theme') as 'dark' | 'light') || 'dark';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jojeco_theme', theme);
  }, [theme]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}

const NAV = [
  { id: 'lab',       label: 'Lab',       href: '/',          icon: LayoutDashboard },
  { id: 'services',  label: 'Services',  href: '/services',  icon: Server },
  { id: 'media',     label: 'Media',     href: '/media',     icon: Film },
  { id: 'controls',  label: 'Controls',  href: '/controls',  icon: Sliders },
  { id: 'minecraft', label: 'Minecraft', href: '/minecraft', icon: Sword },
  { id: 'chaos',     label: 'Chaos',     href: '/chaos',     icon: Zap },
];


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

function IconNav({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const activeId = NAV.find(n => n.href === location.pathname)?.id ?? 'lab';

  return (
    <aside className="j-icon-nav">
      {/* Logo mark */}
      <Link to="/" className="j-icon-nav-logo" title="JojeCo Lab">J</Link>

      {/* Nav items */}
      {NAV.map(item => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            to={item.href}
            className={`j-icon-btn${active ? ' active' : ''}`}
            data-label={item.label}
          >
            <Icon size={18} />
          </Link>
        );
      })}

      <div className="j-icon-nav-spacer" />

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        className="j-icon-btn"
        data-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Auth */}
      {currentUser ? (
        <button
          onClick={() => logout()}
          className="j-icon-btn"
          data-label="Sign out"
          style={{ color: 'var(--t3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--err)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}
        >
          <LogOut size={16} />
        </button>
      ) : (
        <Link to="/login" className="j-icon-btn" data-label="Sign in" style={{ color: 'var(--accent)' }}>
          <LogIn size={16} />
        </Link>
      )}
    </aside>
  );
}

function MobileHeader({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  const location = useLocation();
  const activeLabel = NAV.find(n => n.href === location.pathname)?.label ?? 'Lab';
  return (
    <header className="j-mobile-header">
      <div className="j-mobile-logo">
        <div className="j-mobile-logo-mark">J</div>
        Joje<span style={{ color: 'var(--accent)' }}>Co</span>
      </div>
      <span className="j-mobile-page-title">{activeLabel}</span>
      <button onClick={onToggleTheme} style={{ background: 'none', border: 'none', color: 'var(--t3)', padding: 4, cursor: 'pointer' }}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
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
            <Icon size={19} />
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
      >Sign in →</button>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { theme, toggle: toggleTheme } = useTheme();

  if (location.pathname === '/login' || location.pathname === '/birthday') {
    return <>{children}</>;
  }

  if (isMobile) {
    return (
      <div className="j-shell-mobile">
        <MobileHeader theme={theme} onToggleTheme={toggleTheme} />
        {!currentUser && <GuestBanner />}
        <main className="j-mobile-content">{children}</main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="j-shell">
      <IconNav theme={theme} onToggleTheme={toggleTheme} />
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
            <Route path="/"         element={<ProtectedRoute><ErrorBoundary><LabPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/services" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/torrents" element={<ProtectedRoute><MediaAndTorrentsPage /></ProtectedRoute>} />
            <Route path="/docker"   element={<ProtectedRoute><DockerPage /></ProtectedRoute>} />
            <Route path="/media"    element={<ProtectedRoute><MediaAndTorrentsPage /></ProtectedRoute>} />
            <Route path="/ai"       element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
            <Route path="/chaos"    element={<ChaosPage />} />
            <Route path="/controls"   element={<ProtectedRoute><ErrorBoundary><ControlsPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/minecraft"  element={<ProtectedRoute><ErrorBoundary><MinecraftPage /></ErrorBoundary></ProtectedRoute>} />
          </Routes>
        </PageShell>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
