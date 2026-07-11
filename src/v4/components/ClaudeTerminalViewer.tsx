/**
 * ClaudeTerminalViewer — read-only viewer for the Claude tmux scrollback on CT100.
 * "view terminal" affordance → DetailModal with dark mono scrollback (ContainerLogTail
 * vocabulary), 5s auto-refresh while open. Quiet one-liner when not capturable.
 *
 * Backend: GET /api/claude/terminal → { lines } | { unavailable:true }
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, RefreshCw } from 'lucide-react';
import { getToken } from '../../services/api';
import { DetailModal } from './DetailModal';
import { Skeleton } from './Primitives';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api') as string;

interface TermResult { lines: string[]; unavailable: boolean }

async function fetchTerminal(): Promise<TermResult> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const r = await fetch(`${API_BASE}/claude/terminal`, { headers });
    if (!r.ok) return { lines: [], unavailable: true };
    const data = await r.json();
    if (data && data.unavailable) return { lines: [], unavailable: true };
    if (Array.isArray(data?.lines)) return { lines: data.lines, unavailable: false };
    return { lines: [], unavailable: true };
  } catch {
    return { lines: [], unavailable: true };
  }
}

function TerminalBody() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TermResult | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    const r = await fetchTerminal();
    setResult(r);
    setLoading(false);
  }, []);

  // Initial load + 5s auto-refresh while open
  useEffect(() => {
    void load(true);
    const t = setInterval(() => void load(false), 5000);
    return () => clearInterval(t);
  }, [load]);

  // Keep pinned to the bottom (newest output)
  useEffect(() => {
    if (result && !result.unavailable && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' });
    }
  }, [result]);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => { setResult(null); void load(true); }}
        disabled={loading}
        className="flex items-center gap-1.5 self-end text-[0.6875rem] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', color: 'var(--v4-amber)', fontFamily: "'Geist Mono', monospace" }}
      >
        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
      </button>

      <div className="relative rounded-[0.5rem] overflow-hidden" style={{ background: 'var(--v4-well)' }}>
        {loading && result === null ? (
          <div className="flex flex-col gap-1 p-3">
            {(['w-3/4', 'w-1/2', 'w-4/5', 'w-2/3', 'w-3/5', 'w-1/2'] as const).map((w, i) => (
              <Skeleton key={i} className={`h-4 ${w}`} />
            ))}
          </div>
        ) : result && result.unavailable ? (
          <p className="px-3 py-2.5 text-[0.6875rem]" style={{ color: 'var(--v4-trace)', fontFamily: "'Geist Mono', monospace" }}>
            terminal not capturable — Claude may not be running in tmux
          </p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 360 }}>
            <div className="flex flex-col p-3 min-w-max">
              {(result?.lines ?? []).map((line, i) => (
                <span
                  key={i}
                  className="text-[0.6875rem] leading-5 whitespace-pre"
                  style={{ color: 'var(--v4-signal)', fontFamily: "'Geist Mono', monospace" }}
                >
                  {line || ' '}
                </span>
              ))}
              <div ref={bottomRef} aria-hidden />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ClaudeTerminalViewer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[0.75rem] font-medium transition-opacity hover:opacity-80"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--v4-amber)', fontFamily: "'Geist Mono', monospace", padding: '4px 0' }}
      >
        <Terminal size={12} /> view terminal
      </button>
      <DetailModal open={open} onClose={() => setOpen(false)} title="Claude terminal — CT100">
        {open && <TerminalBody />}
      </DetailModal>
    </>
  );
}
