/**
 * HomeGrid — the customizable Home board.
 *
 * VIEW mode  : grid locked (isDraggable / isResizable false). Reads clean like a
 *              normal dashboard; taps pass through to widget content (host rows →
 *              modal, panels → their tabs).
 * EDIT mode  : react-grid-layout drag + resize handles enabled, each widget gets
 *              a drag bar + remove (×), and an "+ Add widget" picker appears. On
 *              xs/xxs (phones) resize is disabled — reorder still works.
 *
 * Layout + active-widget set persist to localStorage via lib/homeWidgets.
 */
import { useCallback, useMemo, useState } from 'react';
import RGL from 'react-grid-layout';
type Layout = RGL.Layout;
type Layouts = RGL.Layouts;
// classic react-grid-layout (v1) exposes Responsive + WidthProvider on the
// module namespace (export =). WidthProvider auto-measures container width.
const { Responsive, WidthProvider } = RGL;
const ResponsiveGridLayout = WidthProvider(Responsive);
import { Plus, X, GripVertical, RotateCcw, Check, Pencil } from 'lucide-react';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { useSnapshot } from '../../hooks/useSnapshot';
import type { Machine } from '../../hooks/useSnapshot';
import { HostDetailModal } from './HostDetailModal';
import { Button } from './Primitives';
import { cn } from '../lib/utils';
import {
  WIDGETS, WIDGET_MAP, GRID_COLS, GRID_BREAKPOINTS, ROW_HEIGHT, GRID_MARGIN,
  loadBoard, saveBoard, defaultBoard, buildLayouts,
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
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [board, setBoard] = useState<HomeBoardState>(() => loadBoard());
  const [bp, setBp] = useState<BreakpointKey>('lg');

  const isPhone = bp === 'xs' || bp === 'xxs';

  const renderCtx = useMemo(() => ({
    machines,
    loading,
    onClickMachine: (m: Machine) => setSelectedMachine(m),
    personalIds: PERSONAL_MACHINES,
  }), [machines, loading]);

  // Persist helper
  const persist = useCallback((next: HomeBoardState) => {
    setBoard(next);
    saveBoard(next);
  }, []);

  // rgl fires this on drag/resize; we only trust it while editing so a view-mode
  // width recalculation doesn't clobber the saved layout.
  const onLayoutChange = useCallback((_current: Layout[], all: Layouts) => {
    if (!editing) return;
    persist({ activeIds: board.activeIds, layouts: all });
  }, [editing, board.activeIds, persist]);

  const addWidget = useCallback((id: string) => {
    if (board.activeIds.includes(id)) return;
    const def = WIDGET_MAP[id];
    if (!def) return;
    const activeIds = [...board.activeIds, id];
    // append to every breakpoint layout at the bottom (y large → rgl compacts up)
    const layouts: Layouts = { ...board.layouts };
    (Object.keys(GRID_COLS) as BreakpointKey[]).forEach(key => {
      const cols = GRID_COLS[key];
      const single = cols === 1;
      const w = single ? 1 : Math.min(def.size.wLg, cols);
      const existing = layouts[key] ? [...layouts[key]] : [];
      existing.push({
        i: id, x: 0, y: Infinity as unknown as number, w,
        h: def.size.h, minW: single ? 1 : def.size.minW, minH: def.size.minH,
      });
      layouts[key] = existing;
    });
    persist({ activeIds, layouts });
    setPickerOpen(false);
  }, [board, persist]);

  const removeWidget = useCallback((id: string) => {
    const activeIds = board.activeIds.filter(x => x !== id);
    const layouts: Layouts = {};
    (Object.keys(board.layouts) as BreakpointKey[]).forEach(key => {
      layouts[key] = (board.layouts[key] ?? []).filter(l => l.i !== id);
    });
    persist({ activeIds, layouts });
  }, [board, persist]);

  const resetBoard = useCallback(() => {
    persist(defaultBoard());
  }, [persist]);

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
      const existing = (board.layouts[key] ?? []).filter(l => idSet.has(l.i));
      const present = new Set(existing.map(l => l.i));
      const missing = (fallback[key] ?? []).filter(l => !present.has(l.i));
      out[key] = existing.length === 0 ? (fallback[key] ?? []) : [...existing, ...missing];
    });
    return out;
  }, [board]);

  const availableToAdd = WIDGETS.filter(w => !board.activeIds.includes(w.id));

  return (
    <div>
      {/* ── Header row: title + edit toggle ─────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-[1.25rem] font-semibold tracking-tight" style={{ color: 'var(--v4-signal)' }}>
          Home
        </h1>
        <div className="flex items-center gap-2">
          {editing && (
            <>
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-[0.8125rem]"
                onClick={() => setPickerOpen(v => !v)}
              >
                <Plus size={15} /> Add widget
              </Button>
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-[0.8125rem]"
                style={{ color: 'var(--v4-readout)' }}
                onClick={resetBoard}
              >
                <RotateCcw size={14} /> Reset
              </Button>
            </>
          )}
          <Button
            variant={editing ? 'primary' : 'secondary'}
            className="px-3 py-1.5 text-[0.8125rem]"
            onClick={() => { setEditing(v => !v); setPickerOpen(false); }}
          >
            {editing ? <><Check size={15} /> Done</> : <><Pencil size={14} /> Edit Layout</>}
          </Button>
        </div>
      </div>

      {/* ── Add-widget picker ───────────────────────────────────────── */}
      {editing && pickerOpen && (
        <div
          className="mb-4 rounded-[0.75rem] p-3"
          style={{ background: 'var(--v4-console)', boxShadow: '0 1px 0 rgba(0,0,0,0.4)' }}
        >
          {availableToAdd.length === 0 ? (
            <p className="text-[0.8125rem]" style={{ color: 'var(--v4-readout)' }}>
              All widgets are on the board.
            </p>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {availableToAdd.map(w => (
                <button
                  key={w.id}
                  onClick={() => addWidget(w.id)}
                  className="flex flex-col items-start gap-1 rounded-[0.5rem] p-2.5 text-left transition-colors"
                  style={{ background: 'var(--v4-raised)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--v4-hover, #21262d)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--v4-raised)')}
                >
                  <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium" style={{ color: 'var(--v4-signal)' }}>
                    <Plus size={13} style={{ color: 'var(--v4-amber)' }} /> {w.title}
                  </span>
                  <span className="text-[0.6875rem] leading-snug" style={{ color: 'var(--v4-trace)' }}>
                    {w.blurb}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── The grid ────────────────────────────────────────────────── */}
      <ResponsiveGridLayout
        className={cn('v4-home-grid', editing && 'v4-home-grid--editing')}
        layouts={layouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        margin={GRID_MARGIN}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing && !isPhone}
        draggableHandle=".v4-widget-drag"
        compactType="vertical"
        onLayoutChange={onLayoutChange}
        onBreakpointChange={(nb) => setBp(nb as BreakpointKey)}
        measureBeforeMount={false}
        useCSSTransforms
      >
        {board.activeIds.map(id => {
          const def = WIDGET_MAP[id];
          if (!def) return null;
          return (
            <div key={id} className="v4-widget">
              {editing && (
                <div className="v4-widget-chrome">
                  <span className="v4-widget-drag flex items-center gap-1.5">
                    <GripVertical size={14} style={{ color: 'var(--v4-trace)' }} />
                    <span className="text-[0.6875rem] uppercase tracking-[0.06em]" style={{ color: 'var(--v4-readout)' }}>
                      {def.title}
                    </span>
                  </span>
                  <button
                    onClick={() => removeWidget(id)}
                    className="flex items-center justify-center rounded"
                    style={{ width: 22, height: 22, background: 'transparent', cursor: 'pointer' }}
                    aria-label={`Remove ${def.title}`}
                    title={`Remove ${def.title}`}
                  >
                    <X size={14} style={{ color: 'var(--v4-fault)' }} />
                  </button>
                </div>
              )}
              <div className={cn('v4-widget-body', editing && 'v4-widget-body--editing')}>
                {def.render(renderCtx)}
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>

      {/* ── Host detail modal (shared) ──────────────────────────────── */}
      <HostDetailModal
        machine={selectedMachine}
        open={selectedMachine !== null}
        onClose={() => setSelectedMachine(null)}
      />
    </div>
  );
}
