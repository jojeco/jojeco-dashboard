/**
 * Home widget registry + layout persistence for the customizable Home board.
 *
 * A "widget" wraps an existing Home panel (or a compact summary card) so it can
 * live inside a react-grid-layout grid the owner can drag / resize / reorder in
 * Edit mode. Each widget declares a default size per breakpoint column-count so
 * the DEFAULT board mirrors the previous hand-tuned Home arrangement.
 *
 * Persistence: layouts + the active widget set are saved to localStorage under
 * `v4:homeLayout` (versioned). Invalid/absent state falls back to DEFAULT.
 */
import type { ReactNode } from 'react';
import type RGL from 'react-grid-layout';
type Layout = RGL.Layout;
type Layouts = RGL.Layouts;

import { AlertStrip } from '../components/AlertStrip';
import { HostTileDPanel, HostTileDSkeleton } from '../components/HostTileD';
import { ServiceHealthSummary } from '../components/ServiceHealthSummary';
import { StoragePanel } from '../components/StoragePanel';
import { AutomationDigest } from '../components/AutomationDigest';
import { LoadChartsPanel } from '../components/LoadChartsPanel';
import { TorrentsPanel } from '../components/TorrentsPanel';
import { GamingGlance } from '../components/GamingGlance';
import {
  MediaSummaryWidget, ServicesMatrixWidget, GameServersWidget, DownloadsMiniWidget,
} from '../components/HomeSummaryWidgets';

import type { Machine } from '../../hooks/useSnapshot';

// ── Grid geometry ─────────────────────────────────────────────────────────────
// 12-col grid on desktop; single col (1 unit wide, cols=1) on phones.
export const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 1, xxs: 1 } as const;
export const GRID_BREAKPOINTS = { lg: 1280, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
export const ROW_HEIGHT = 8;   // px per grid row unit — fine granularity for height tuning
export const GRID_MARGIN: [number, number] = [16, 16];

export type BreakpointKey = keyof typeof GRID_COLS;

// Per-widget default sizing. `wLg` is width in a 12-col grid; `h` is height in
// ROW_HEIGHT units. Minimums keep a widget usable when the owner shrinks it.
export interface WidgetSize {
  wLg: number;   // width on lg/md (12-col)
  h: number;     // height in row units (all breakpoints unless overridden)
  minW: number;
  minH: number;
  hSm?: number;  // optional taller/shorter on sm/xs
}

export interface WidgetDef {
  id: string;
  title: string;
  /** compact one-liner shown in the Add-widget picker */
  blurb: string;
  size: WidgetSize;
  /** render the widget body. Host props are threaded through for the hosts widget. */
  render: (ctx: WidgetRenderCtx) => ReactNode;
}

export interface WidgetRenderCtx {
  machines: Machine[];
  loading: boolean;
  onClickMachine: (m: Machine) => void;
  personalIds: string[];
}

// ── The registry ──────────────────────────────────────────────────────────────
// heights are generous; react-grid-layout content overflows gracefully but we
// size to typical content to avoid clipping.

export const WIDGETS: WidgetDef[] = [
  {
    id: 'alerts',
    title: 'Alerts',
    blurb: 'Lab alert strip — only surfaces when something is wrong',
    size: { wLg: 12, h: 8, minW: 3, minH: 4 },
    render: () => <AlertStrip />,
  },
  {
    id: 'hosts',
    title: 'Hosts',
    blurb: 'Instrument rows for every machine + personal rigs',
    size: { wLg: 8, h: 76, minW: 4, minH: 24, hSm: 82 },
    render: ({ machines, loading, onClickMachine, personalIds }) =>
      loading
        ? <HostTileDSkeleton />
        : (
          <HostTileDPanel
            machines={machines}
            onClickMachine={onClickMachine}
            secondaryIds={personalIds}
          />
        ),
  },
  {
    id: 'services',
    title: 'Service Health',
    blurb: 'Per-host service up/down counts (tap for detail)',
    size: { wLg: 4, h: 34, minW: 3, minH: 16 },
    render: () => <ServiceHealthSummary />,
  },
  {
    id: 'automation',
    title: 'Automation',
    blurb: 'Scheduled jobs — last run + status',
    size: { wLg: 4, h: 46, minW: 3, minH: 20 },
    render: () => <AutomationDigest />,
  },
  {
    id: 'storage',
    title: 'Storage',
    blurb: 'Drives grouped by host, fullest-first',
    size: { wLg: 8, h: 56, minW: 4, minH: 20 },
    render: () => <StoragePanel />,
  },
  {
    id: 'load',
    title: 'Load Charts',
    blurb: 'Live CPU history across servers',
    size: { wLg: 8, h: 34, minW: 4, minH: 18 },
    render: () => <LoadChartsPanel />,
  },
  {
    id: 'downloads',
    title: 'Downloads',
    blurb: 'qBittorrent transfer glance',
    size: { wLg: 4, h: 22, minW: 3, minH: 12 },
    render: () => <TorrentsPanel />,
  },
  {
    id: 'gaming',
    title: 'Gaming',
    blurb: 'Game server glance (Minecraft + Vintage Story)',
    size: { wLg: 4, h: 24, minW: 3, minH: 12 },
    render: () => <GamingGlance />,
  },

  // ── addable-from-other-tabs summary widgets ──────────────────────────────
  {
    id: 'media',
    title: 'Media Summary',
    blurb: 'qBit speeds + Sonarr/Radarr queue (from Media tab)',
    size: { wLg: 4, h: 24, minW: 3, minH: 14 },
    render: () => <MediaSummaryWidget />,
  },
  {
    id: 'serviceMatrix',
    title: 'Service Matrix',
    blurb: 'Compact per-host service dot matrix (from Services tab)',
    size: { wLg: 4, h: 30, minW: 3, minH: 14 },
    render: () => <ServicesMatrixWidget />,
  },
  {
    id: 'gameServers',
    title: 'Game Servers',
    blurb: 'Per-game-server status list (from Gaming tab)',
    size: { wLg: 4, h: 24, minW: 3, minH: 12 },
    render: () => <GameServersWidget />,
  },
  {
    id: 'downloadsMini',
    title: 'Downloads (mini)',
    blurb: 'Compact speed + connection glance',
    size: { wLg: 3, h: 20, minW: 2, minH: 12 },
    render: () => <DownloadsMiniWidget />,
  },
];

export const WIDGET_MAP: Record<string, WidgetDef> =
  Object.fromEntries(WIDGETS.map(w => [w.id, w]));

// ── Default board ───────────────────────────────────────────────────────────
// Mirrors the previous Home: lead column = alerts, hosts, load, storage;
// rail = services, gaming, automation, downloads. IDs on the DEFAULT board:
export const DEFAULT_WIDGET_IDS = [
  'alerts', 'hosts', 'services', 'load', 'gaming', 'storage', 'automation', 'downloads',
];

// Build a Layouts object for a given set of widget ids using a shelf-packing
// pass per breakpoint so widgets never overlap and flow left-to-right, top-down.
export function buildLayouts(ids: string[]): Layouts {
  const lg = packLayout(ids, 12, 'lg');
  const md = packLayout(ids, 12, 'md');
  const sm = packLayout(ids, 6, 'sm');
  // single column on phones — full width, stacked in order
  const single = packSingleColumn(ids);
  return { lg, md, sm, xs: single, xxs: single };
}

function widthFor(def: WidgetDef, cols: number): number {
  if (cols === 12) return Math.min(def.size.wLg, 12);
  if (cols === 6) return Math.min(def.size.wLg <= 4 ? def.size.wLg : 6, 6);
  return cols;
}

function heightFor(def: WidgetDef, single: boolean): number {
  return single && def.size.hSm != null ? def.size.hSm : def.size.h;
}

function packLayout(ids: string[], cols: number, _bp: string): Layout[] {
  const out: Layout[] = [];
  // simple shelf packer: track current x + current shelf height
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const id of ids) {
    const def = WIDGET_MAP[id];
    if (!def) continue;
    const w = widthFor(def, cols);
    const h = heightFor(def, false);
    if (x + w > cols) { x = 0; y += shelfH; shelfH = 0; }
    out.push({
      i: id, x, y, w, h,
      minW: def.size.minW, minH: def.size.minH,
    });
    x += w;
    shelfH = Math.max(shelfH, h);
  }
  return out;
}

function packSingleColumn(ids: string[]): Layout[] {
  const out: Layout[] = [];
  let y = 0;
  for (const id of ids) {
    const def = WIDGET_MAP[id];
    if (!def) continue;
    const h = heightFor(def, true);
    out.push({
      i: id, x: 0, y, w: 1, h,
      minW: 1, minH: def.size.minH,
    });
    y += h;
  }
  return out;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'v4:homeLayout';
const STORAGE_VERSION = 1;

interface PersistShape {
  v: number;
  activeIds: string[];
  layouts: Layouts;
}

export interface HomeBoardState {
  activeIds: string[];
  layouts: Layouts;
}

export function defaultBoard(): HomeBoardState {
  return {
    activeIds: [...DEFAULT_WIDGET_IDS],
    layouts: buildLayouts(DEFAULT_WIDGET_IDS),
  };
}

export function loadBoard(): HomeBoardState {
  if (typeof window === 'undefined') return defaultBoard();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultBoard();
    const parsed = JSON.parse(raw) as PersistShape;
    if (
      !parsed ||
      parsed.v !== STORAGE_VERSION ||
      !Array.isArray(parsed.activeIds) ||
      typeof parsed.layouts !== 'object'
    ) {
      return defaultBoard();
    }
    // drop unknown widget ids (registry may have shrunk between versions)
    const activeIds = parsed.activeIds.filter(id => WIDGET_MAP[id]);
    if (activeIds.length === 0) return defaultBoard();
    return { activeIds, layouts: parsed.layouts };
  } catch {
    return defaultBoard();
  }
}

export function saveBoard(state: HomeBoardState): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistShape = {
      v: STORAGE_VERSION,
      activeIds: state.activeIds,
      layouts: state.layouts,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — non-fatal, board just won't persist */
  }
}

export function clearBoard(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
