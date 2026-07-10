/**
 * v4 System page — slice 2.
 *
 * Sections (mobile-first, single column; desktop 8/4 command-center grid):
 *  1. Fleet summary header — hosts online X/Y, highest CPU
 *  2. Host telemetry grid — HostTile per machine in `lab` SSE section,
 *     click → HostDetailModal (CPU %, RAM, temp, GPU stats)
 *  3. CPU history — LoadChartsPanel (client-buffered, full-width lead)
 *  4. Storage — StoragePanel (all drives, fullest first)
 *  5. AI fleet — per Ollama node: models, loaded model, activity
 *
 * Desktop: charts lead (8-col), AI fleet + storage in rail (4-col).
 * Mobile: strict single column.
 *
 * Data sources:
 *  SSE: useSnapshot('lab')    → Machine[] (cpu, mem, temp, gpu, disks)
 *       useSnapshot('fleet')  → OllamaNode[] + litellm
 *       useSnapshot('ollama') → OllamaSession[] (loaded models per node)
 */
import { useState } from 'react';
import { Activity, Brain } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { HostTile, HostTileSkeleton } from '../components/HostTile';
import { HostDetailModal } from '../components/HostDetailModal';
import { LoadChartsPanel } from '../components/LoadChartsPanel';
import { StoragePanel } from '../components/StoragePanel';
import {
  Panel, PanelTitle, PageTitle, Mono, StatusDot, StatusChip,
  Skeleton, Hairline,
} from '../components/Primitives';
import { fmtBytes } from '../lib/utils';
import type { Machine, OllamaNode, OllamaSession } from '../../hooks/useSnapshot';

// ─── Fleet summary bar ────────────────────────────────────────────────────────

function FleetSummaryBar({ machines, loading }: { machines: Machine[]; loading: boolean }) {
  const online = machines.filter(m => m.online).length;
  const total = machines.length;
  const cpus = machines.filter(m => m.online && m.cpu != null).map(m => m.cpu as number);
  const highestCpu = cpus.length > 0 ? Math.max(...cpus) : null;
  const highestHost = highestCpu != null
    ? machines.find(m => m.online && m.cpu === highestCpu)?.name ?? null
    : null;

  if (loading && total === 0) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-24" />
      </div>
    );
  }

  const allUp = online === total && total > 0;
  const statusLevel = online === 0 ? 'fault' : online < total ? 'degraded' : 'nominal';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
        <StatusDot level={statusLevel} />
        <Mono className="text-[0.875rem]" style={{ color: allUp ? 'var(--v4-nominal)' : 'var(--v4-degraded)' }}>
          {online}/{total}
        </Mono>
        <span className="text-[0.8125rem]" style={{ color: 'var(--v4-readout)' }}>hosts online</span>
      </div>
      {highestCpu != null && highestHost && (
        <div className="flex items-center gap-2">
          <Activity size={12} style={{ color: 'var(--v4-trace)' }} />
          <span className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>
            Peak CPU
          </span>
          <Mono className="text-[0.8125rem]" style={{
            color: highestCpu >= 90 ? 'var(--v4-fault)'
              : highestCpu >= 75 ? 'var(--v4-degraded)'
              : 'var(--v4-signal)',
          }}>
            {highestCpu.toFixed(0)}%
          </Mono>
          <span className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>{highestHost}</span>
        </div>
      )}
    </div>
  );
}

// ─── AI fleet panel ───────────────────────────────────────────────────────────

interface AiFleetPanelProps {
  nodes: OllamaNode[];
  sessions: OllamaSession[];
  litellm: { online: boolean; spend: number | null } | null;
  loading: boolean;
}

function AiFleetPanel({ nodes, sessions, litellm, loading }: AiFleetPanelProps) {
  // Build a map: nodeId/host → loaded models from OllamaSession[]
  const loadedMap = new Map<string, Array<{ name: string; size_vram?: number }>>();
  for (const s of sessions) {
    if (s.active && s.active.length > 0) loadedMap.set(s.id, s.active);
  }

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={13} style={{ color: 'var(--v4-trace)' }} />
          <PanelTitle>AI Fleet</PanelTitle>
        </div>
        {litellm && (
          <div className="flex items-center gap-2">
            <StatusDot level={litellm.online ? 'nominal' : 'fault'} />
            <span className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>LiteLLM</span>
            {litellm.spend != null && (
              <Mono className="text-[0.6875rem]" trace>${litellm.spend.toFixed(2)}</Mono>
            )}
          </div>
        )}
      </div>

      {loading && nodes.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : nodes.length === 0 ? (
        <div className="py-4 text-center text-[0.8125rem]" style={{ color: 'var(--v4-trace)' }}>
          No AI nodes in fleet — check LiteLLM / Ollama connectivity
        </div>
      ) : (
        <div className="flex flex-col gap-1 v4-stagger">
          {nodes.map((node, idx) => {
            const loaded = loadedMap.get(node.id) ?? [];
            const isActive = loaded.length > 0;

            return (
              <div key={node.id}>
                {idx > 0 && <Hairline className="my-2" />}
                <div className="flex flex-col gap-2 py-1">
                  {/* Node header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot level={node.online ? (isActive ? 'nominal' : 'standby') : 'fault'} />
                      <span className="text-[0.8125rem] font-semibold truncate" style={{ color: 'var(--v4-signal)' }}>
                        {node.name}
                      </span>
                      <Mono className="text-[0.6875rem]" trace>{node.host}</Mono>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && (
                        <StatusChip level="nominal" label={`${loaded.length} active`} />
                      )}
                      {!node.online && (
                        <StatusChip level="fault" label="DOWN" />
                      )}
                    </div>
                  </div>

                  {/* Loaded models */}
                  {isActive && (
                    <div className="flex flex-col gap-1 pl-4">
                      {loaded.map((m, mi) => (
                        <div key={mi} className="flex items-center justify-between gap-2">
                          <Mono className="text-[0.6875rem] truncate" style={{ color: 'var(--v4-amber)' }}>
                            {m.name}
                          </Mono>
                          {m.size_vram != null && m.size_vram > 0 && (
                            <Mono className="text-[0.6875rem] shrink-0" trace>
                              {fmtBytes(m.size_vram)} VRAM
                            </Mono>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Available models count */}
                  {node.models && node.models.length > 0 && (
                    <div className="pl-4">
                      <span className="text-[0.6875rem]" style={{ color: 'var(--v4-trace)' }}>
                        {node.models.length} model{node.models.length !== 1 ? 's' : ''} available
                        {node.role && ` · ${node.role}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ─── Host grid ────────────────────────────────────────────────────────────────

const PRIORITY_ORDER = ['ct100', 's1', 's2', 's3', 'macmini', 'jopc', 'macbook'];

function sortMachines(machines: Machine[]): Machine[] {
  return [...machines].sort((a, b) => {
    const ai = PRIORITY_ORDER.indexOf(a.id.toLowerCase());
    const bi = PRIORITY_ORDER.indexOf(b.id.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function SystemPage() {
  const { data: labData, loading: labLoading } = useSnapshot('lab');
  const { data: fleetData, loading: fleetLoading } = useSnapshot('fleet');
  const { data: ollamaRaw } = useSnapshot('ollama');

  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  const machines = labData?.machines ?? [];
  const sorted = sortMachines(machines);

  const nodes = (fleetData?.nodes ?? []) as OllamaNode[];
  const litellm = fleetData?.litellm ?? null;
  const sessions = (ollamaRaw ?? []) as OllamaSession[];

  const skeletonCount = 6;

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 mb-4">
        <PageTitle>System</PageTitle>
        <FleetSummaryBar machines={machines} loading={labLoading} />
      </div>

      {/* ── Mobile layout: strict single column ──────────────────────────── */}
      <div className="flex flex-col gap-4 xl:hidden">
        {/* Host grid */}
        <section>
          <PanelTitle className="mb-3">Hosts</PanelTitle>
          {labLoading && machines.length === 0 ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {Array.from({ length: skeletonCount }).map((_, i) => <HostTileSkeleton key={i} />)}
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-[0.8125rem]" style={{ color: 'var(--v4-trace)' }}>
              No host data — check SSE connection
            </p>
          ) : (
            <div className="grid gap-3 v4-stagger" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {sorted.map(m => (
                <HostTile key={m.id} machine={m} onClick={() => setSelectedMachine(m)} />
              ))}
            </div>
          )}
        </section>

        {/* CPU history */}
        <LoadChartsPanel />

        {/* Storage */}
        <StoragePanel />

        {/* AI fleet */}
        <AiFleetPanel
          nodes={nodes}
          sessions={sessions}
          litellm={litellm}
          loading={fleetLoading}
        />
      </div>

      {/* ── Desktop: 8/4 command-center grid ─────────────────────────────── */}
      <div
        className="hidden xl:grid gap-6"
        style={{ gridTemplateColumns: '8fr 4fr', alignItems: 'start' }}
      >
        {/* Lead (8): hosts + CPU history + storage */}
        <div className="flex flex-col gap-4">
          {/* Host grid — wider tiles on desktop */}
          <section>
            <PanelTitle className="mb-3">Hosts</PanelTitle>
            {labLoading && machines.length === 0 ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {Array.from({ length: skeletonCount }).map((_, i) => <HostTileSkeleton key={i} />)}
              </div>
            ) : sorted.length === 0 ? (
              <p className="text-[0.8125rem]" style={{ color: 'var(--v4-trace)' }}>
                No host data — check SSE connection
              </p>
            ) : (
              <div className="grid gap-3 v4-stagger" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {sorted.map(m => (
                  <HostTile key={m.id} machine={m} onClick={() => setSelectedMachine(m)} />
                ))}
              </div>
            )}
          </section>

          {/* CPU history — centerpiece of this page */}
          <LoadChartsPanel />

          {/* Storage */}
          <StoragePanel />
        </div>

        {/* Rail (4): AI fleet */}
        <div className="flex flex-col gap-4">
          <AiFleetPanel
            nodes={nodes}
            sessions={sessions}
            litellm={litellm}
            loading={fleetLoading}
          />
        </div>
      </div>

      {/* ── Host detail modal ─────────────────────────────────────────────── */}
      <HostDetailModal
        machine={selectedMachine}
        open={selectedMachine !== null}
        onClose={() => setSelectedMachine(null)}
      />
    </>
  );
}
