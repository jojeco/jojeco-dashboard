import { BrowserRouter, Routes, Route, useNavigate, Link, useLocation } from 'react-router-dom';
import { Moon, Sun, LogOut, LogIn } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useDarkMode } from './hooks/useDarkMode';
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

const TABS = [
  { id: 'lab',      label: '🏠 Lab',      href: '/' },
  { id: 'services', label: '🔧 Services', href: '/services' },
  { id: 'torrents', label: '⬇️ Torrents', href: '/torrents' },
  { id: 'docker',   label: '🐳 Docker',   href: '/docker' },
  { id: 'media',    label: '🎬 Media',    href: '/media' },
  { id: 'ai',       label: '🤖 AI',       href: '/ai' },
  { id: 'chaos',    label: '☠ Chaos',    href: '/chaos' },
];

function GuestBanner() {
  const navigate = useNavigate();
  return (
    <div className="bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800/60 px-4 py-2 flex items-center justify-between gap-4">
      <p className="text-xs text-blue-700 dark:text-blue-300">
        <span className="font-semibold">Guest view</span> — read-only. Sensitive details are hidden.
      </p>
      <button
        onClick={() => navigate('/login')}
        className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline shrink-0"
      >
        Sign in →
      </button>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useDarkMode();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const active = TABS.find(t => t.href === location.pathname)?.id ?? 'lab';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="text-2xl font-semibold text-gray-900 dark:text-gray-100 shrink-0">jojeco</Link>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDark
                  ? <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  : <Moon className="w-5 h-5 text-gray-700" />}
              </button>
              {currentUser ? (
                <button
                  onClick={() => logout()}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
                  aria-label="Sign in"
                  title="Sign in"
                >
                  <LogIn className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-1 mt-3 pt-1 border-t border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-none -mx-4 px-4">
            {TABS.map(t => (
              <Link key={t.id} to={t.href}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active===t.id ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </header>
      {!currentUser && <GuestBanner />}
      <div className="max-w-7xl mx-auto">{children}</div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/birthday" element={<Birthday />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <PageShell>
                  <LabPage />
                </PageShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/services"
            element={
              <ProtectedRoute>
                <PageShell>
                  <Dashboard />
                </PageShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/torrents"
            element={
              <ProtectedRoute>
                <PageShell>
                  <TorrentsPage />
                </PageShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/docker"
            element={
              <ProtectedRoute>
                <PageShell>
                  <DockerPage />
                </PageShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/media"
            element={
              <ProtectedRoute>
                <PageShell>
                  <MediaPage />
                </PageShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai"
            element={
              <ProtectedRoute>
                <PageShell>
                  <AIPage />
                </PageShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/chaos"
            element={
              <PageShell>
                <ChaosPage />
              </PageShell>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
