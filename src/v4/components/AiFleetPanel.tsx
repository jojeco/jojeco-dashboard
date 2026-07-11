/**
 * AiFleetPanel — per-Ollama-node fleet status (models, loaded model, activity)
 * plus LiteLLM health/spend. Moved off the retired System tab into Services
 * (2026-07-11). Reads the `fleet` + `ollama` SSE sections itself so callers just
 * drop <AiFleetPanel /> in.
 */
import { Brain } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono, StatusDot, StatusChip, Skeleton, Hairline } from './Primitives';
import { fmtBytes } from '../lib/utils';
import type { OllamaNode, OllamaSession } from '../../hooks/useSnapshot';

export function AiFleetPanel() {
  const { data: fleetData, loading } = useSnapshot('fleet');
  const { data: ollamaRaw } = useSnapshot('ollama');

  const nodes = (fleetData?.nodes ?? []) as OllamaNode[];
  const litellm = fleetData?.litellm ?? null;
  const sessions = (ollamaRaw ?? []) as OllamaSession[];

  // Build a map: nodeId → loaded models from OllamaSession[]
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
