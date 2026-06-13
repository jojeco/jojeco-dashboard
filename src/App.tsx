import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, Component, ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

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

import { LogOut, LogIn, Server, Film, Zap, LayoutDashboard, Sliders, Sun, Moon, Sword, Mic, Home } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SnapshotProvider } from './hooks/useSnapshot';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './Pages/Login';
import ServicesPage from './Pages/Services';
import { Birthday } from './Pages/Birthday';
import DockerPage from './Pages/DockerPage';
import MediaAndTorrentsPageV3 from './Pages/Media';
import AIPage from './Pages/AIPage';
import LabPage from './Pages/Lab';
import ChaosPage from './Pages/ChaosPage';
import ControlsPage from './Pages/Controls';
import MinecraftPage from './Pages/MinecraftPage';
import KioskPage from './Pages/Kiosk/KioskPage';
import JarvisPage from './Pages/JarvisPage';
import HomeAssistantPage from './Pages/HomeAssistantPage';


// ─── Theme Hook ───────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('jojeco_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    // Legacy data-theme (existing pages use CSS vars gated on [data-theme="light"])
    root.setAttribute('data-theme', theme);
    // shadcn/ui class-based dark mode
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    localStorage.setItem('jojeco_theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV = [
  { id: 'lab',       label: 'Lab',       href: '/',          icon: LayoutDashboard },
  { id: 'services',  label: 'Services',  href: '/services',  icon: Server },
  { id: 'media',     label: 'Media',     href: '/media',     icon: Film },
  { id: 'controls',  label: 'Controls',  href: '/controls',  icon: Sliders },
  { id: 'minecraft', label: 'Minecraft', href: '/minecraft', icon: Sword },
  { id: 'chaos',     label: 'Chaos',     href: '/chaos',     icon: Zap },
  { id: 'jarvis',    label: 'Jarvis',    href: '/jarvis',    icon: Mic },
  { id: 'home',      label: 'Home',      href: '/home',      icon: Home },
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

// ─── Desktop Icon Rail ────────────────────────────────────────────────────────
function IconNav({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const activeId = NAV.find(n => n.href === location.pathname)?.id ?? 'lab';

  return (
    <aside className="j-icon-nav">
      <Link to="/" className="j-icon-nav-logo" title="JojeCo Lab">J</Link>

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

      <button
        onClick={onToggleTheme}
        className="j-icon-btn"
        data-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

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

// ─── Mobile Header ────────────────────────────────────────────────────────────
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

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
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

// ─── Guest Banner ─────────────────────────────────────────────────────────────
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

// ─── Page Shell ───────────────────────────────────────────────────────────────
// Wraps every page. Login/birthday/kiosk bypass and render full-screen.
// All existing pages render inside their original CSS — the new shell is purely
// structural scaffolding. Page-by-page shadcn porting happens in Phase 1 pages.
function PageShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { theme, toggle: toggleTheme } = useTheme();

  const isFullscreen = ['/login', '/birthday', '/kiosk'].includes(location.pathname);
  if (isFullscreen) return <>{children}</>;

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

// ─── Root App ─────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SnapshotProvider>
        <PageShell>
          <Routes>
            <Route path="/login"    element={<Login />} />
            <Route path="/birthday" element={<Birthday />} />
            <Route path="/"         element={<ProtectedRoute><ErrorBoundary><LabPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/services" element={<ProtectedRoute><ServicesPage /></ProtectedRoute>} />
            <Route path="/torrents" element={<ProtectedRoute><MediaAndTorrentsPageV3 /></ProtectedRoute>} />
            <Route path="/docker"   element={<ProtectedRoute><DockerPage /></ProtectedRoute>} />
            <Route path="/media"    element={<ProtectedRoute><MediaAndTorrentsPageV3 /></ProtectedRoute>} />
            <Route path="/ai"       element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
            <Route path="/chaos"    element={<ChaosPage />} />
            <Route path="/controls"   element={<ProtectedRoute><ErrorBoundary><ControlsPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/minecraft"  element={<ProtectedRoute><ErrorBoundary><MinecraftPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/kiosk"      element={<ErrorBoundary><KioskPage /></ErrorBoundary>} />
            <Route path="/jarvis"     element={<ProtectedRoute><ErrorBoundary><JarvisPage /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/home"       element={<ProtectedRoute><ErrorBoundary><HomeAssistantPage /></ErrorBoundary></ProtectedRoute>} />
          </Routes>
        </PageShell>
        <Toaster />
        </SnapshotProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
