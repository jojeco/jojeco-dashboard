/**
 * HomeGrid — the Home board (view-only, no edit mode).
 *
 * Renders the widget grid using react-grid-layout in view mode.
 * On phones (xs/xxs) widgets stack vertically in layout order.
 * Board state (widget set + order) persists to localStorage via lib/homeWidgets.
 */
import { useEffect, useMemo, useState } from 'react';
import RGL from 'react-grid-layout';
type Layout = RGL.Layout;
type Layouts = RGL.Layouts;
// classic react-grid-layout (v1) exposes Responsive + WidthProvider on the
// module namespace (export =). WidthProvider auto-measures container width.
const { Responsive, WidthProvider } = RGL;
const ResponsiveGridLayout = WidthProvider(Responsive);

import { useSnapshot } from '../../hooks/useSnapshot';
import type { Machine } from '../../hooks/useSnapshot';
import { HostDetailModal } from './HostDetailModal';
import {
  WIDGET_MAP, GRID_COLS, GRID_BREAKPOINTS, ROW_HEIGHT, GRID_MARGIN,
  loadBoard, buildLayouts,
  type HomeBoardState, type BreakpointKey,
} from '../lib/homeWidgets';

// Priority + personal-rig ordering carried over from the old HomePage.
const PRIORITY_MACHINES = ['CT100', 'S1', 'S2', 'S3', 'MacMini', 'macmini', 's1', 's2', 's3', 'ct100'];
const PERSONAL_MACHINES = ['jopc', 'macbook', 'jomac', 'ainspc'];

function sortMachines(machines: Machine[]): Machine[] {
  return [...machines].sort((a, b) => {
    const ai = PRIORITY_MACHINES.findIndex(p => p.toLowerCase() === a.id.toLowerCase() || p.toLowerCase() === a.name.toLowerCase());
    const bi = PRIORITY_MACHINES.findIndex(p => p.toLowerCase() === b.id.toLowerCase() || p.toLowerCase() === b.name.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

export default function HomeGrid() {
  const { data, loading } = useSnapshot('lab');
  const machines = useMemo(() => sortMachines(data?.machines ?? []), [data]);

  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [board] = useState<HomeBoardState>(() => loadBoard());
  const bpFromWidth = (w: number): BreakpointKey =>
    w >= 1280 ? 'lg' : w >= 996 ? 'md' : w >= 768 ? 'sm' : w >= 480 ? 'xs' : 'xxs';

  const [bp, setBp] = useState<BreakpointKey>(
    () => (typeof window !== 'undefined' ? bpFromWidth(window.innerWidth) : 'lg')
  );

  // Track breakpoint from window width so the phone-stack path works even though
  // the desktop grid (which fires onBreakpointChange) isn't mounted on phones.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setBp(bpFromWidth(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isPhone = bp === 'xs' || bp === 'xxs';

  const renderCtx = useMemo(() => ({
    machines,
    loading,
    onClickMachine: (m: Machine) => setSelectedMachine(m),
    personalIds: PERSONAL_MACHINES,
  }), [machines, loading]);

  // Guarantee every active widget has a layout entry at every breakpoint. If a
  // breakpoint is missing entirely (schema drift) rebuild it; if it exists but
  // lacks an item (e.g. added on another breakpoint) append a synthesized slot
  // so rgl never drops a child to an overlapping (0,0) default.
  const layouts: Layouts = useMemo(() => {
    const ids = board.activeIds;
    const idSet = new Set(ids);
    const fallback = buildLayouts(ids);
    const out: Layouts = {};
    (Object.keys(GRID_COLS) as BreakpointKey[]).forEach(key => {
      const existing = (board.layouts[key] ?? []).filter((l: Layout) => idSet.has(l.i));
      const present = new Set(existing.map((l: Layout) => l.i));
      const missing = (fallback[key] ?? []).filter((l: Layout) => !present.has(l.i));
      out[key] = existing.length === 0 ? (fallback[key] ?? []) : [...existing, ...missing];
    });
    return out;
  }, [board]);

  return (
    <div>
      {/* ── Header row ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-[1.25rem] font-semibold tracking-tight" style={{ color: 'var(--v4-signal)' }}>
          Home
        </h1>
      </div>

      {/* ── The board: natural stack on phones, grid on desktop ─────────
          On phones the fixed grid-row heights fight touch-sized content,
          so we render a plain content-height column ordered by the desktop
          layout. */}
      {isPhone ? (
        <div className="flex flex-col">
          {[...board.activeIds]
            .sort((a, b) => {
              const la = board.layouts.lg?.find(l => l.i === a);
              const lb = board.layouts.lg?.find(l => l.i === b);
              return (la?.y ?? 0) - (lb?.y ?? 0) || (la?.x ?? 0) - (lb?.x ?? 0);
            })
            .map(id => {
              const def = WIDGET_MAP[id];
              if (!def) return null;
              return (
                <div key={id} className="v4-widget v4-widget--stacked">
                  <div className="v4-widget-body">
                    {def.render(renderCtx)}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
      <ResponsiveGridLayout
        className="v4-home-grid"
        layouts={layouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        margin={GRID_MARGIN}
        containerPadding={[0, 0]}
        isDraggable={false}
        isResizable={false}
        compactType="vertical"
        onBreakpointChange={(nb) => setBp(nb as BreakpointKey)}
        measureBeforeMount={false}
        useCSSTransforms
      >
        {board.activeIds.map(id => {
          const def = WIDGET_MAP[id];
          if (!def) return null;
          return (
            <div key={id} className="v4-widget">
              <div className="v4-widget-body">
                {def.render(renderCtx)}
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
      )}

      {/* ── Host detail modal (shared) ──────────────────────────────── */}
      <HostDetailModal
        machine={selectedMachine}
        open={selectedMachine !== null}
        onClose={() => setSelectedMachine(null)}
      />
    </div>
  );
}
