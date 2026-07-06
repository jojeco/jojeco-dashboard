/**
 * v4 AppShell — mobile bottom tab bar + desktop left rail nav
 * DESIGN.md §5: mobile bottom tab bar (thumb reach), left rail on desktop.
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Server, Film, Sliders, Cpu, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSnapshot } from '../../hooks/useSnapshot';
import { LiveIndicator } from './LiveIndicator';
import { cn } from '../lib/utils';

// ── 5-tab nav (DESIGN.md: 5 tabs max) ───────────────────────────────────────
const TABS = [
  { id: 'home',     label: 'Home',     href: '/v4',          icon: LayoutDashboard },
  { id: 'services', label: 'Services', href: '/v4/services', icon: Server },
  { id: 'media',    label: 'Media',    href: '/v4/media',    icon: Film },
  { id: 'controls', label: 'Controls', href: '/v4/controls', icon: Sliders },
  { id: 'system',   label: 'System',   href: '/v4/system',   icon: Cpu },
] as const;

function useActiveTab() {
  const { pathname } = useLocation();
  return TABS.find(t => t.href === pathname)?.id ?? 'home';
}

// ── Lab status summary (header) ──────────────────────────────────────────────
function LabStatusSummary() {
  const { data } = useSnapshot();
  const services = data?.servicesHealth;
  if (!services) return null;

  const entries = Object.values(services);
  const total = entries.length;
  const down = entries.filter(s => s.status === 'offline').length;
  const hasIssue = down > 0;

  return (
    <span
      className="font-mono text-[0.6875rem] tabular-nums"
      style={{ color: hasIssue ? 'var(--v4-fault)' : 'var(--v4-readout)' }}
    >
      {total} svc{down > 0 ? ` · ${down} down` : ' · all up'}
    </span>
  );
}

// ── Desktop left rail ────────────────────────────────────────────────────────
function DesktopRail() {
  const activeTab = useActiveTab();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside
      className="hidden xl:flex flex-col items-center gap-1 py-4 shrink-0"
      style={{
        width: 56,
        background: 'var(--v4-console)',
        borderRight: 'none', // no borders — surface contrast separates
        minHeight: '100dvh',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
      }}
    >
      {/* Logo */}
      <Link
        to="/v4"
        className="flex items-center justify-center w-9 h-9 rounded-[0.625rem] mb-3 font-semibold text-[0.9rem] tracking-tight"
        style={{
          background: 'var(--v4-amber)',
          color: 'var(--v4-void)',
          textDecoration: 'none',
        }}
        title="JojeCo Lab"
      >
        J
      </Link>

      {/* Nav tabs */}
      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            to={tab.href}
            title={tab.label}
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-[0.5rem] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
            )}
            style={{
              background: active ? 'var(--v4-raised)' : 'transparent',
              color: active ? 'var(--v4-amber)' : 'var(--v4-readout)',
              textDecoration: 'none',
              outlineColor: 'var(--v4-amber)',
            }}
          >
            <Icon size={18} />
          </Link>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Live indicator */}
      <div className="mb-2">
        <LiveIndicator showLabel={false} />
      </div>

      {/* Auth */}
      {currentUser ? (
        <button
          onClick={() => logout().then(() => navigate('/v4/login'))}
          title="Sign out"
          className="flex items-center justify-center w-9 h-9 rounded-[0.5rem] transition-colors hover:bg-[var(--v4-raised)]"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--v4-trace)' }}
        >
          <LogOut size={16} />
        </button>
      ) : (
        <Link
          to="/v4/login"
          title="Sign in"
          className="flex items-center justify-center w-9 h-9 rounded-[0.5rem]"
          style={{ color: 'var(--v4-amber)', textDecoration: 'none' }}
        >
          <LogIn size={16} />
        </Link>
      )}
    </aside>
  );
}

// ── Mobile header ────────────────────────────────────────────────────────────
function MobileHeader() {
  const activeTab = useActiveTab();
  const activeLabel = TABS.find(t => t.id === activeTab)?.label ?? 'Home';

  return (
    <header
      className="xl:hidden sticky top-0 z-20 flex items-center justify-between px-4"
      style={{
        background: 'var(--v4-raised)',
        height: 48,
        // No border bottom — surface contrast separates from content below
      }}
    >
      {/* Logo + page name */}
      <div className="flex items-center gap-2">
        <span
          className="flex items-center justify-center w-7 h-7 rounded-[0.4rem] font-semibold text-[0.8rem]"
          style={{ background: 'var(--v4-amber)', color: 'var(--v4-void)' }}
        >
          J
        </span>
        <span
          className="text-[0.875rem] font-semibold tracking-tight"
          style={{ color: 'var(--v4-signal)' }}
        >
          {activeLabel}
        </span>
      </div>

      {/* Right: status + live dot */}
      <div className="flex items-center gap-3">
        <LabStatusSummary />
        <LiveIndicator showLabel={false} />
      </div>
    </header>
  );
}

// ── Mobile bottom tab bar ────────────────────────────────────────────────────
function MobileBottomNav() {
  const activeTab = useActiveTab();

  return (
    <nav
      className="xl:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch"
      style={{
        background: 'var(--v4-console)',
        height: 56,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            to={tab.href}
            className="flex flex-col items-center justify-center flex-1 gap-0.5 text-[0.6rem] font-medium tracking-wide uppercase"
            style={{
              color: active ? 'var(--v4-amber)' : 'var(--v4-trace)',
              textDecoration: 'none',
              minHeight: 44, // tap target
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ── v4 sticky header bar (desktop) ──────────────────────────────────────────
function DesktopTopBar() {
  return (
    <header
      className="hidden xl:flex items-center justify-between px-6 shrink-0"
      style={{
        height: 44,
        background: 'var(--v4-raised)',
      }}
    >
      <span
        className="text-[0.75rem] font-semibold tracking-[0.06em] uppercase"
        style={{ color: 'var(--v4-readout)' }}
      >
        JojeCo Lab
      </span>
      <div className="flex items-center gap-4">
        <LabStatusSummary />
        <LiveIndicator />
      </div>
    </header>
  );
}

// ── Full shell ───────────────────────────────────────────────────────────────
interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="v4-root flex min-h-[100dvh]">
      {/* Desktop rail */}
      <DesktopRail />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile header */}
        <MobileHeader />

        {/* Desktop top bar */}
        <DesktopTopBar />

        {/* Page content */}
        <main
          className="flex-1 min-w-0 px-4 py-4 xl:px-6 xl:py-6"
          style={{
            paddingBottom: 'calc(56px + 1rem + env(safe-area-inset-bottom))',
          }}
        >
          <div className="xl:pb-0" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <MobileBottomNav />
      </div>
    </div>
  );
}
