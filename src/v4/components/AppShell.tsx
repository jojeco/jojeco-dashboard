import { useState, useEffect, useRef } from 'react';
/**
 * v4 AppShell — mobile bottom tab bar + desktop left rail nav
 * DESIGN.md §5: mobile bottom tab bar (thumb reach), left rail on desktop.
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Server, Film, Sliders, Gamepad2, LogOut, LogIn, Thermometer, Printer, Wrench, Briefcase, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSnapshot } from '../../hooks/useSnapshot';
import { LiveIndicator } from './LiveIndicator';
import { AlertBell } from './AlertBell';
import { cn } from '../lib/utils';
import { getToken } from '../../services/api';

// ── 6-tab nav ───────────────────────────────────────
const TABS = [
  { id: 'home',     label: 'Home',     href: '/v4',          icon: LayoutDashboard },
  { id: 'services', label: 'Services', href: '/v4/services', icon: Server },
  { id: 'media',    label: 'Media',    href: '/v4/media',    icon: Film },
  { id: 'controls', label: 'Controls', href: '/v4/controls', icon: Sliders },
  { id: 'gaming',   label: 'Gaming',   href: '/v4/gaming',   icon: Gamepad2 },
  { id: 'printer',  label: 'Printer',  href: '/v4/printer',  icon: Printer },
  { id: 'tools',    label: 'Tools',    href: '/v4/tools',    icon: Wrench },
  { id: 'jobs',   label: 'Jobs',   href: '/v4/jobs', icon: Briefcase },
] as const;

function useActiveTab() {
  const { pathname } = useLocation();
  return TABS.find(t => t.href === pathname)?.id ?? 'home';
}


// ── AC temperature readout ───────────────────────────────────────────────────
const AC_API = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');

function AcTemps() {
  const [temps, setTemps] = useState<{ indoor: number | null; outdoor: number | null }>({ indoor: null, outdoor: null });

  useEffect(() => {
    const fetch_ = () => {
      const token = getToken();
      fetch(`${AC_API}/api/ac/status`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setTemps({ indoor: d.indoor_temp, outdoor: d.outdoor_temp }))
        .catch(() => {});
    };
    fetch_();
    const id = setInterval(fetch_, 60000);
    return () => clearInterval(id);
  }, []);

  if (temps.indoor == null) return null;

  return (
    <span
      className="flex items-center gap-1 font-mono text-[0.6875rem] tabular-nums"
      style={{ color: 'var(--v4-readout)' }}
      title={`Indoor: ${temps.indoor}°C · Outdoor: ${temps.outdoor}°C`}
    >
      <Thermometer size={11} style={{ color: 'var(--v4-amber)', flexShrink: 0 }} />
      {temps.indoor}°
      {temps.outdoor != null && (
        <span style={{ color: 'var(--v4-trace)' }}>· {temps.outdoor}°</span>
      )}
    </span>
  );
}

// ── Lab status summary (header) ──────────────────────────────────────────────
function LabStatusSummary({ compact = false }: { compact?: boolean }) {
  const { data: lhs } = useSnapshot('labHostServices');
  const groups = lhs?.groups ?? [];
  const all = groups.flatMap(g => g.services);
  if (all.length === 0) return null;

  const total = all.length;
  const down = all.filter(s => !s.online).length;
  const hasIssue = down > 0;

  // Compact: "53/54 ↓1" — fits mobile header; full: "53/54 svc · 1 down"
  const label = compact
    ? `${total - down}/${total}${down > 0 ? ` ↓${down}` : ''}`
    : `${total - down}/${total} svc${down > 0 ? ` · ${down} down` : ''}`;

  return (
    <span
      className="font-mono text-[0.6875rem] tabular-nums"
      style={{ color: hasIssue ? 'var(--v4-fault)' : 'var(--v4-readout)' }}
    >
      {label}
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

      {/* Alert bell */}
      <div className="mb-1">
        <AlertBell placement="rail" />
      </div>

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
      }}
    >
      {/* Logo + page name */}
      <div className="flex items-center gap-2 shrink-0">
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

      {/* Right: compact status + bell + live dot — kept tight to not overflow */}
      <div className="flex items-center gap-2 min-w-0">
        <AcTemps />
        <LabStatusSummary compact />
        <AlertBell placement="header" />
        <LiveIndicator showLabel={false} />
      </div>
    </header>
  );
}

// ── Mobile bottom tab bar ────────────────────────────────────────────────────
// 5 primary tabs always visible + "More" overflow for secondary tabs.
// Keeps each tap target well above 44px and labels legible.
const MOBILE_PRIMARY_IDS = ['home', 'services', 'media', 'controls', 'jobs'] as const;
const PRIMARY_TABS = TABS.filter(t => (MOBILE_PRIMARY_IDS as readonly string[]).includes(t.id));
const SECONDARY_TABS = TABS.filter(t => !(MOBILE_PRIMARY_IDS as readonly string[]).includes(t.id));

function MobileBottomNav() {
  const activeTab = useActiveTab();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const activeIsSecondary = SECONDARY_TABS.some(t => t.id === activeTab);

  // Close "More" when clicking outside
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  return (
    <div ref={moreRef}>
      {/* Secondary tab overflow sheet */}
      {moreOpen && (
        <div
          className="xl:hidden fixed inset-x-4 rounded-[0.75rem] overflow-hidden"
          style={{
            bottom: 'calc(60px + env(safe-area-inset-bottom))',
            background: 'var(--v4-console)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
            border: '1px solid var(--v4-hairline)',
            zIndex: 21,
          }}
        >
          {SECONDARY_TABS.map((tab, i) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                to={tab.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{
                  color: active ? 'var(--v4-amber)' : 'var(--v4-readout)',
                  textDecoration: 'none',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  borderTop: i > 0 ? '1px solid var(--v4-hairline)' : undefined,
                  background: active ? 'var(--v4-raised)' : 'transparent',
                }}
              >
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}

      <nav
        className="xl:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch"
        style={{
          background: 'var(--v4-console)',
          borderTop: '1px solid var(--v4-hairline)',
          height: 56,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {PRIMARY_TABS.map(tab => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              to={tab.href}
              onClick={() => setMoreOpen(false)}
              className="flex flex-col items-center justify-center flex-1 gap-0.5 text-[0.6rem] font-medium tracking-wide uppercase"
              style={{
                color: active ? 'var(--v4-amber)' : 'var(--v4-trace)',
                textDecoration: 'none',
                minHeight: 44,
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span>{tab.label}</span>
            </Link>
          );
        })}

        {/* More button — amber when a secondary tab is active or sheet is open */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className="flex flex-col items-center justify-center flex-1 gap-0.5 text-[0.6rem] font-medium tracking-wide uppercase"
          style={{
            color: (moreOpen || activeIsSecondary) ? 'var(--v4-amber)' : 'var(--v4-trace)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          <MoreHorizontal size={20} strokeWidth={(moreOpen || activeIsSecondary) ? 2.2 : 1.8} />
          <span>More</span>
        </button>
      </nav>
    </div>
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
      <div className="flex items-center gap-3">
        <AcTemps />
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