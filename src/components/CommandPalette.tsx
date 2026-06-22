/**
 * CommandPalette — global ⌘K / Ctrl+K fuzzy search overlay.
 *
 * Sections:
 *   Pages       — jump to any dashboard page
 *   Services    — open a service URL (from snapshot servicesHealth)
 *   Containers  — restart/stop/start a container (via /api/controls or /api/docker)
 *   Triggers    — fire an automation action from the Controls page
 *
 * UX:
 *   - ⌘K / Ctrl+K anywhere → opens
 *   - Escape → closes
 *   - ↑/↓ arrows navigate; Enter selects
 *   - Mobile: floating "⌘" button in bottom-right corner
 *   - No light borders on dark — uses surface elevation + low-alpha separators
 */

import {
  useState, useEffect, useRef, useCallback, useMemo, createContext, useContext,
} from 'react';
import {
  Command, LayoutDashboard, Server, Film, Sliders, Zap, Sword, Mic,
  Home, ExternalLink, RefreshCw, Square, Play, ShieldCheck, Database,
  GitBranch, Bot, Search, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSnapshot } from '@/hooks/useSnapshot';
import { getToken } from '@/services/api';

// ─── Context (so App.tsx can expose the toggle function) ─────────────────────

interface PaletteCtx { open: () => void }
const PaletteContext = createContext<PaletteCtx>({ open: () => {} });
export function usePalette() { return useContext(PaletteContext); }

// ─── Item types ───────────────────────────────────────────────────────────────

type ItemKind = 'page' | 'service' | 'container-action' | 'trigger';

interface PaletteItem {
  id: string;
  kind: ItemKind;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  keywords?: string;
  action: () => void | Promise<void>;
  /** Only for container-actions — 'restart' | 'stop' | 'start' */
  containerAction?: 'restart' | 'stop' | 'start';
  dangerous?: boolean;
}

// ─── Fuzzy match (simple contains scoring) ───────────────────────────────────

function score(item: PaletteItem, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const haystack = `${item.label} ${item.sublabel ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  if (haystack.startsWith(q)) return 3;
  if (item.label.toLowerCase().includes(q)) return 2;
  if (haystack.includes(q)) return 1;
  return 0;
}

// ─── Pages ───────────────────────────────────────────────────────────────────

const PAGE_ITEMS: Omit<PaletteItem, 'action'>[] = [
  { id: 'p-lab',       kind: 'page', label: 'Lab',        sublabel: 'Machine overview + health', icon: <LayoutDashboard size={15} />, keywords: 'home dashboard overview machines' },
  { id: 'p-services',  kind: 'page', label: 'Services',   sublabel: 'App tiles + Docker',        icon: <Server size={15} />,         keywords: 'docker apps portainer plex' },
  { id: 'p-media',     kind: 'page', label: 'Media',      sublabel: 'Torrents + queue',          icon: <Film size={15} />,            keywords: 'sonarr radarr tdarr qbittorrent' },
  { id: 'p-controls',  kind: 'page', label: 'Controls',   sublabel: 'Power + containers',        icon: <Sliders size={15} />,         keywords: 'restart shutdown wake server' },
  { id: 'p-chaos',     kind: 'page', label: 'Chaos',      sublabel: 'Chaos monkey + deps',       icon: <Zap size={15} />,             keywords: 'chaos monkey dependency' },
  { id: 'p-minecraft', kind: 'page', label: 'Minecraft',  sublabel: 'Game servers',              icon: <Sword size={15} />,           keywords: 'mc game server' },
  { id: 'p-jarvis',    kind: 'page', label: 'Jarvis',     sublabel: 'Voice + AI assistant',      icon: <Mic size={15} />,             keywords: 'voice ai assistant' },
  { id: 'p-home',      kind: 'page', label: 'Home Assist',sublabel: 'Home automation',           icon: <Home size={15} />,            keywords: 'home assistant ha lights' },
  { id: 'p-alerts',    kind: 'page', label: 'Alerts',     sublabel: 'Lab alert feed',            icon: <ShieldCheck size={15} />,     keywords: 'ntfy alerts notifications' },
];

const PAGE_ROUTES: Record<string, string> = {
  'p-lab': '/', 'p-services': '/services', 'p-media': '/media',
  'p-controls': '/controls', 'p-chaos': '/chaos', 'p-minecraft': '/minecraft',
  'p-jarvis': '/jarvis', 'p-home': '/home', 'p-alerts': '/alerts',
};

// ─── Triggers ────────────────────────────────────────────────────────────────

const TRIGGER_DEFS = [
  { id: 'health',         label: 'Health Check',  icon: <ShieldCheck size={15} />, desc: 'Check all service chains' },
  { id: 'backup',         label: 'GDrive Backup', icon: <Database size={15} />,    desc: 'Dump DBs + sync to GDrive' },
  { id: 'snapshot',       label: 'Update Check',  icon: <RefreshCw size={15} />,   desc: 'Pull latest images, report updates' },
  { id: 'sync-context',   label: 'Sync Context',  icon: <GitBranch size={15} />,   desc: 'Push memory + context to GitHub' },
  { id: 'claude-server3', label: 'Claude → S3',   icon: <Bot size={15} />,         desc: 'Start Claude Code on Server 3' },
  { id: 'claude-server1', label: 'Claude → S1',   icon: <Bot size={15} />,         desc: 'Start Claude Code on Server 1' },
];

// ─── API helper ──────────────────────────────────────────────────────────────

const BASE = (import.meta.env.VITE_API_URL || 'http://192.168.50.13:3001/api') as string;

async function authPost(path: string): Promise<{ ok: boolean; msg: string }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, msg: String(data.message ?? data.error ?? (res.ok ? 'OK' : 'Error')) };
  } catch {
    return { ok: false, msg: 'Network error' };
  }
}

// ─── Result feedback pill ─────────────────────────────────────────────────────

function ActionFeedback({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      background: ok ? 'var(--ok-dim)' : 'var(--err-dim)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
      color: ok ? 'var(--ok)' : 'var(--err)',
      padding: '8px 16px',
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {msg}
    </div>
  );
}

// ─── Group label ─────────────────────────────────────────────────────────────

function GroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--t3)',
      padding: '8px 12px 4px',
    }}>{label}</div>
  );
}

// ─── Item row ────────────────────────────────────────────────────────────────

function PaletteRow({
  item, active, onClick, status,
}: { item: PaletteItem; active: boolean; onClick: () => void; status?: 'running' | 'done' | 'error' }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 7,
        background: active ? 'var(--raised)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 80ms',
        minWidth: 0,
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--t3)', flexShrink: 0, display: 'flex' }}>
        {item.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label}
        </span>
        {item.sublabel && (
          <span style={{ fontSize: 11, color: 'var(--t3)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.sublabel}
          </span>
        )}
      </span>
      {item.kind === 'service' && (
        <ExternalLink size={11} style={{ color: 'var(--t3)', flexShrink: 0 }} />
      )}
      {item.kind === 'container-action' && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 99,
          background: item.containerAction === 'stop' ? 'var(--err-dim)' : item.containerAction === 'start' ? 'var(--ok-dim)' : 'var(--raised-2)',
          color: item.containerAction === 'stop' ? 'var(--err)' : item.containerAction === 'start' ? 'var(--ok)' : 'var(--t3)',
          flexShrink: 0,
        }}>
          {item.containerAction}
        </span>
      )}
      {item.kind === 'trigger' && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 99,
          background: status === 'running' ? 'var(--accent-dim)' : 'var(--raised-2)',
          color: status === 'running' ? 'var(--accent)' : 'var(--t3)',
          flexShrink: 0,
        }}>
          {status === 'running' ? 'running…' : 'trigger'}
        </span>
      )}
    </button>
  );
}

// ─── Main palette modal ───────────────────────────────────────────────────────

function CommandPaletteModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery]     = useState('');
  const [activeIdx, setActive] = useState(0);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [runningTriggers, setRunning] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data } = useSnapshot();

  // Focus input on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on outside click
  const overlayRef = useRef<HTMLDivElement>(null);

  // Show feedback, auto-dismiss after 2.5s
  const showFeedback = useCallback((msg: string, ok: boolean) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 2500);
  }, []);

  // ── Build item list ────────────────────────────────────────────────────────

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];

    // Pages
    PAGE_ITEMS.forEach(p => out.push({
      ...p,
      action: () => { onClose(); navigate(PAGE_ROUTES[p.id]); },
    }));

    // Services (from snapshot — just names + health; URLs come from /api/services)
    const health = data?.servicesHealth ?? {};
    const docker = data?.docker ?? [];

    // We don't have service URLs in snapshot, but docker containers we can act on
    // Add container actions for each running container
    docker.forEach(c => {
      if (c.state === 'running') {
        out.push({
          id: `c-restart-${c.name}`,
          kind: 'container-action',
          label: c.name,
          sublabel: `Container · ${c.state}`,
          icon: <RefreshCw size={15} />,
          keywords: `docker container restart ${c.name}`,
          containerAction: 'restart',
          action: async () => {
            const { ok, msg } = await authPost(`/controls/container/${c.name}/restart`);
            showFeedback(ok ? `Restarted ${c.name}` : msg, ok);
            onClose();
          },
        });
      }
      if (c.state === 'running') {
        out.push({
          id: `c-stop-${c.name}`,
          kind: 'container-action',
          label: c.name,
          sublabel: `Container · running → stop`,
          icon: <Square size={15} />,
          keywords: `docker container stop ${c.name}`,
          containerAction: 'stop',
          dangerous: true,
          action: async () => {
            const { ok, msg } = await authPost(`/controls/container/${c.name}/stop`);
            showFeedback(ok ? `Stopped ${c.name}` : msg, ok);
            onClose();
          },
        });
      }
      if (c.state !== 'running') {
        out.push({
          id: `c-start-${c.name}`,
          kind: 'container-action',
          label: c.name,
          sublabel: `Container · ${c.state} → start`,
          icon: <Play size={15} />,
          keywords: `docker container start ${c.name}`,
          containerAction: 'start',
          action: async () => {
            const { ok, msg } = await authPost(`/controls/container/${c.name}/start`);
            showFeedback(ok ? `Started ${c.name}` : msg, ok);
            onClose();
          },
        });
      }
    });

    // Also show health-checked services with their URLs if we have them cached
    // (health section has IDs, not URLs — add as navigation items to /services)
    const healthIds = Object.keys(health);
    if (healthIds.length > 0) {
      healthIds.forEach(id => {
        const h = health[id];
        out.push({
          id: `svc-${id}`,
          kind: 'service',
          label: id,
          sublabel: h.status === 'online' ? `Online · ${h.responseTime ?? '?'}ms` : h.status,
          icon: <Server size={15} />,
          keywords: `service ${id} ${h.status}`,
          action: () => { onClose(); navigate('/services'); },
        });
      });
    }

    // Triggers
    TRIGGER_DEFS.forEach(t => {
      out.push({
        id: `trig-${t.id}`,
        kind: 'trigger',
        label: t.label,
        sublabel: t.desc,
        icon: t.icon,
        keywords: `trigger action ${t.label} ${t.desc}`,
        action: async () => {
          setRunning(r => new Set(r).add(t.id));
          const { ok, msg } = await authPost(`/controls/trigger/${t.id}`);
          setRunning(r => { const n = new Set(r); n.delete(t.id); return n; });
          showFeedback(ok ? `${t.label} started` : msg, ok);
          onClose();
        },
      });
    });

    return out;
  }, [data, navigate, onClose, showFeedback]);

  // ── Filter + score ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!query.trim()) {
      // No query: show pages + triggers only (don't show all containers by default)
      return items.filter(i => i.kind === 'page' || i.kind === 'trigger');
    }
    return items
      .map(i => ({ item: i, s: score(i, query) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.item);
  }, [items, query]);

  // Reset active index on filter change
  useEffect(() => { setActive(0); }, [filtered]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIdx]?.action();
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // ── Group items for display ────────────────────────────────────────────────

  type Group = { label: string; items: PaletteItem[] };

  const groups = useMemo<Group[]>(() => {
    if (query.trim()) {
      // Flat filtered list with no group headers when searching
      return filtered.length > 0 ? [{ label: '', items: filtered }] : [];
    }
    const pages     = filtered.filter(i => i.kind === 'page');
    const triggers  = filtered.filter(i => i.kind === 'trigger');
    const g: Group[] = [];
    if (pages.length)    g.push({ label: 'Navigation',  items: pages });
    if (triggers.length) g.push({ label: 'Actions',     items: triggers });
    return g;
  }, [filtered, query]);

  // ─── Render ────────────────────────────────────────────────────────────────

  let globalIdx = 0;

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'clamp(48px, 12vh, 140px)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: 560,
        background: 'var(--surface)',
        borderRadius: 14,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 32px 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100dvh - 120px)',
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}>
          <Search size={15} style={{ color: 'var(--t3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, containers, actions…"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: 'var(--t1)',
              caretColor: 'var(--accent)',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 2 }}
            >
              <X size={13} />
            </button>
          )}
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
            padding: '2px 6px', borderRadius: 5,
            background: 'var(--raised-2)', color: 'var(--t3)',
            border: '1px solid var(--line)',
            flexShrink: 0,
          }}>ESC</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', padding: '4px 4px 8px' }}>
          {groups.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
              No results for "{query}"
            </div>
          ) : (
            groups.map(group => (
              <div key={group.label}>
                {group.label && <GroupLabel label={group.label} />}
                {group.items.map(item => {
                  const idx = globalIdx++;
                  const triggerId = item.id.startsWith('trig-') ? item.id.replace('trig-', '') : '';
                  return (
                    <div key={item.id} data-idx={idx}>
                      <PaletteRow
                        item={item}
                        active={idx === activeIdx}
                        onClick={() => item.action()}
                        status={triggerId && runningTriggers.has(triggerId) ? 'running' : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          display: 'flex',
          gap: 12,
          padding: '8px 14px',
          borderTop: '1px solid var(--line)',
          flexShrink: 0,
        }}>
          {[
            ['↑↓', 'navigate'],
            ['↵', 'select'],
            ['⎋', 'close'],
          ].map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t3)' }}>
              <span style={{
                padding: '1px 5px', borderRadius: 4,
                background: 'var(--raised-2)', color: 'var(--t2)',
                border: '1px solid var(--line)', fontWeight: 600,
                fontFamily: 'Geist Mono, monospace',
              }}>{key}</span>
              {label}
            </span>
          ))}
        </div>
      </div>

      {feedback && <ActionFeedback msg={feedback.msg} ok={feedback.ok} />}
    </div>
  );
}

// ─── Provider + trigger button ────────────────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open  = useCallback(() => setIsOpen(true),  []);
  const close = useCallback(() => setIsOpen(false), []);

  // Global keyboard shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(v => !v);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <PaletteContext.Provider value={{ open }}>
      {children}
      {isOpen && <CommandPaletteModal onClose={close} />}
    </PaletteContext.Provider>
  );
}

// ─── Mobile FAB trigger (rendered inside the mobile header) ──────────────────

export function PaletteFab() {
  const { open } = usePalette();
  return (
    <button
      onClick={open}
      aria-label="Command palette"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'var(--raised)',
        border: '1px solid var(--line)',
        color: 'var(--t2)',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <Command size={14} />
    </button>
  );
}

// ─── Desktop icon-nav button ──────────────────────────────────────────────────

export function PaletteNavButton() {
  const { open } = usePalette();
  return (
    <button
      onClick={open}
      className="j-icon-btn"
      data-label="Command Palette (⌘K)"
      aria-label="Command Palette"
    >
      <Command size={16} />
    </button>
  );
}
