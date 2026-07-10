/**
 * ContainerLogTail — lazy-loaded log tail via Loki.
 * DESIGN.md: Recessed Well, Geist Mono 0.6875–0.75rem, newest line last,
 * x-scroll (no wrap), shimmer loading, quiet unavailable one-liner.
 * Fetch fires only when expanded (not on modal open).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { getToken } from '../../services/api';
import { Mono, Skeleton } from './Primitives';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api') as string;

export interface LogEntry {
  ts: number;
  line: string;
}

interface LogResult {
  entries: LogEntry[];
  unavailable: boolean;
  reason?: string;
}

function formatLogTs(tsMs: number): string {
  const d = new Date(tsMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

async function fetchLogs(containerName: string, lines = 100): Promise<LogResult> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${API_BASE}/logs/container/${encodeURIComponent(containerName)}?lines=${lines}`, { headers });
  if (!r.ok) return { entries: [], unavailable: true, reason: `HTTP ${r.status}` };
  const data = await r.json();
  if (data && 'unavailable' in data && data.unavailable) {
    return { entries: [], unavailable: true, reason: data.reason ?? 'Loki unavailable' };
  }
  if (!Array.isArray(data)) return { entries: [], unavailable: true, reason: 'Unexpected response' };
  return { entries: data as LogEntry[], unavailable: false };
}

interface ContainerLogTailProps {
  containerName: string;
  lines?: number;
}

export function ContainerLogTail({ containerName, lines = 100 }: ContainerLogTailProps) {
  const [expanded, setExpanded]   = useState(false);
  const [loading,  setLoading]    = useState(false);
  const [result,   setResult]     = useState<LogResult | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchLogs(containerName, lines);
    setResult(r);
    setLoading(false);
  }, [containerName, lines]);

  // Fetch only when first expanded
  useEffect(() => {
    if (expanded && result === null) {
      void load();
    }
  }, [expanded, result, load]);

  // Scroll to bottom when logs load
  useEffect(() => {
    if (result && !result.unavailable && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' });
    }
  }, [result]);

  return (
    <div className="flex flex-col gap-2">
      {/* Toggle affordance */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 self-start text-[0.75rem] font-medium transition-opacity hover:opacity-80 active:opacity-60"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--v4-amber)',
          padding: '4px 0',
          fontFamily: "'Geist Mono', monospace",
        }}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'hide logs' : 'show logs'}
      </button>

      {/* Log body — only rendered when expanded */}
      {expanded && (
        <div
          className="relative rounded-[0.5rem] overflow-hidden"
          style={{ background: 'var(--v4-well)' }}
        >
          {/* Refresh button */}
          <button
            onClick={() => { setResult(null); void load(); }}
            disabled={loading}
            aria-label="Refresh logs"
            className="absolute top-2 right-2 z-10 flex items-center justify-center rounded transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{
              background: 'rgba(88,166,255,0.10)',
              border: 'none',
              cursor: loading ? 'default' : 'pointer',
              width: 24,
              height: 24,
              color: 'var(--v4-amber)',
            }}
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>

          {loading ? (
            /* Shimmer — matches log line dimensions */
            <div className="flex flex-col gap-1 p-3 pr-9">
              {(['w-3/4', 'w-1/2', 'w-4/5', 'w-2/3', 'w-3/5'] as const).map((w, i) => (
                <Skeleton key={i} className={`h-4 ${w}`} />
              ))}
            </div>
          ) : result && result.unavailable ? (
            <p
              className="px-3 py-2.5 text-[0.6875rem]"
              style={{ color: 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}
            >
              {result.reason ?? 'log tail unavailable'}
            </p>
          ) : result && result.entries.length === 0 ? (
            <p
              className="px-3 py-2.5 text-[0.6875rem]"
              style={{ color: 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}
            >
              no log lines found for "{containerName}"
            </p>
          ) : (
            <div
              className="overflow-x-auto overflow-y-auto"
              style={{ maxHeight: 320 }}
            >
              <div className="flex flex-col p-3 pr-9 min-w-max">
                {(result?.entries ?? []).map((entry, i) => (
                  <div key={`${entry.ts}-${i}`} className="flex items-start gap-2 group">
                    <Mono
                      trace
                      className="text-[0.6875rem] shrink-0 select-none leading-5"
                      style={{ userSelect: 'none' }}
                    >
                      {formatLogTs(entry.ts)}
                    </Mono>
                    <span
                      className="text-[0.6875rem] leading-5 whitespace-pre break-normal"
                      style={{ color: 'var(--v4-signal)', fontFamily: "'Geist Mono', monospace" }}
                    >
                      {entry.line}
                    </span>
                  </div>
                ))}
                <div ref={bottomRef} aria-hidden />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
