/**
 * v4 Router — mounts the new design system at /v4/* routes.
 * Old routes stay intact under their original paths.
 *
 * Navigation: "/" redirects to "/v4" so the new shell is the default.
 * Legacy pages still accessible at their original paths.
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import HomePage from './pages/HomePageV5';
import ServicesPage from './pages/ServicesPage';
import MediaPage from './pages/MediaPage';
import ControlsPage from './pages/ControlsPage';
import GamingPage from './pages/GamingPage';
import LoginPage from './pages/LoginPage';
import KioskPage from './pages/KioskPage';
import PrinterPage from './pages/PrinterPage';
import ToolsPage from './pages/ToolsPage';
import JobsPage from './pages/JobsPage';
import JarvisPage from './pages/JarvisPage';
import { useAuth } from '../contexts/AuthContext';
import './v4.css';

function V4ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  if (loading) {
    // Skeletal loading — match void bg, no spinner
    return (
      <div
        className="v4-root flex items-center justify-center min-h-[100dvh]"
        style={{ background: 'var(--v4-void)' }}
      >
        <div
          className="font-mono text-[0.75rem]"
          style={{ color: 'var(--v4-trace)' }}
        >
          authenticating…
        </div>
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/v4/login" replace />;
  return <>{children}</>;
}

export function V4Routes() {
  return (
    <Routes>
      {/* Login — fullscreen, no shell */}
      <Route path="/v4/login" element={<LoginPage />} />

      {/* Protected routes — inside AppShell */}
      <Route
        path="/v4"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <HomePage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />
      <Route
        path="/v4/services"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <ServicesPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />
      <Route
        path="/v4/media"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <MediaPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />
      <Route
        path="/v4/controls"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <ControlsPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />
      <Route
        path="/v4/gaming"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <GamingPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />
      <Route
        path="/v4/printer"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <PrinterPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />
      <Route
        path="/v4/tools"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <ToolsPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />

      <Route
        path="/v4/jobs"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <JobsPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />

      <Route
        path="/v4/jarvis"
        element={
          <V4ProtectedRoute>
            <AppShell>
              <JarvisPage />
            </AppShell>
          </V4ProtectedRoute>
        }
      />
      {/* Kiosk — fullscreen, no shell, no auth required */}
      <Route path="/v4/kiosk" element={<KioskPage />} />

      {/* Legacy /v4/system removed — the AI fleet moved to Services, telemetry lives on Home. */}
      <Route path="/v4/system" element={<Navigate to="/v4" replace />} />
    </Routes>
  );
}
