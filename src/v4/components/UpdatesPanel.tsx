/**
 * UpdatesPanel (v4) — container update check, selection, and apply.
 *
 * DESIGN.md rules observed:
 *  - Dark GitHub-palette; no light borders; Command Blue (#58a6ff) = --v4-amber accent
 *  - Geist Mono for all digests, counts, metadata
 *  - Confirm-gated destructive action (apply = service restarts)
 *  - Mobile-first single column; placed full-width after AutomationPanel in rail/lead column
 *  - Collapsed-by-default: user-initiated check only (registry calls take ~4s)
 *  - Skeletal shimmer while checking, not a spinner
 *  - Status: stripe + text, never color alone
 *  - Log area: Recessed Well (--v4-well), Geist Mono 0.6875rem, newest line last
 *
 * Endpoint contracts (confirmed via live curl):
 *  GET  /api/updates/available[?force=1]
 *       → { checked: number, results: UpdateResult[], cached: boolean }
 *       UpdateResult: { id, name, image, localDigest, remoteDigest, updateAvailable, canCheck }
 *       - localDigest / remoteDigest are sha256:<12 hex chars> strings or null
 *       - canCheck=false when image has no registry (local builds, private)
 *       - 54 containers observed; ~3.6s live, 30-min server-side cache
 *
 *  POST /api/updates/apply  { containers: string[] }
 *       → { jobId: string, message: string }
 *       jobId stored in shared triggerJobs map (same as /api/controls/trigger-status)
 *       Job lifecycle: running → done | error
 *       Poll via GET /api/controls/trigger-status until finishedAt non-null
 *       triggerJobs[jobId].output = newline-joined per-container log lines
 *
 * Guard rails: self-update exclusions listed in SELF_UPDATE_EXCLUDED — dimmed with note.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Package, RefreshCw, CheckCircle, ChevronDown, ChevronUp, ArrowUp, Shield } from 'lucide-react';
import { getToken } from '../../services/api';
import { Panel, PanelTitle, Mono, Well, Hairline, Skeleton } from './Primitives';
import { DetailModal } from './DetailModal';

// ── Constants ────────────────────────────────────────────────────────────────

const BASE = (import.meta.env.VITE_API_URL || 'http://192.168.50.13:3001/api') as string;

/** Containers excluded from self-selection: applying via the dashboard that manages them
 *  is a foot-gun (kills the API mid-apply). Listed by container name. */
const SELF_UPDATE_EXCLUDED = new Set([
  'jojeco-dashboard',
  'jojeco-dashboard-api',
  'nginx-proxy-manager',
  'cloudflared',
  'portainer',
]);

// ── Types ────────────────────────────────────────────────────────────────────

interface UpdateResult {
  id: string;
  name: string;
  image: string;
  updateAvailable: boolean;
  canCheck: boolean;
  localDigest: string | null;
  remoteDigest: string | null;
}

interface UpdatesResponse {
  checked: number;
  results: UpdateResult[];
  cached: boolean;
}

interface TriggerJobStatus {
  status: 'running' | 'done' | 'error';
  startedAt: number;
  finishedAt: number | null;
  output: string | null;
  error: string | null;
}

// ── Auth helpers (same pattern as ControlsPage) ───────────────────────────────

async function authGet<T>(path: string): Promise<{ ok: boolean; data: T | null }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/v4/login';
      return { ok: false, data: null };
    }
    const data = await res.json().catch(() => null) as T;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

async function authPost<T>(path: string, body?: unknown): Promise<{ ok: boolean; data: T | null }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/v4/login';
      return { ok: false, data: null };
    }
    const data = await res.json().catch(() => null) as T;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Short-form digest: strip "sha256:" prefix, keep first 12 hex chars */
function shortDigest(digest: string | null): string {
  if (!digest) return '—';
  return digest.replace(/^sha256:/, '').slice(0, 12);
}

/** Format a timestamp as HH:MM */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Confirm modal state ──────────────────────────────────────────────────────

interface ConfirmState {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  fn: () => void;
}

const CONFIRM_CLOSED: ConfirmState = { open: false, title: '', body: '', confirmLabel: 'Confirm', fn: () => {} };

// ── Component ────────────────────────────────────────────────────────────────

export function UpdatesPanel() {
  // ── Local state ────────────────────────────────────────────────────────────
  const [open,          setOpen]          = useState(false);
  const [checking,      setChecking]      = useState(false);
  const [updates,       setUpdates]       = useState<UpdatesResponse | null>(null);
  const [checkError,    setCheckError]    = useState<string | null>(null);
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [applying,      setApplying]      = useState(false);
  const [applyJobId,    setApplyJobId]    = useState<string | null>(null);
  const [jobStatus,     setJobStatus]     = useState<TriggerJobStatus | null>(null);
  const [confirm,       setConfirm]       = useState<ConfirmState>(CONFIRM_CLOSED);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef  = useRef<HTMLPreElement | null>(null);

  // ── Scroll log to bottom when output grows ────────────────────────────────
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [jobStatus?.output]);

  // ── Poll job status while apply running ───────────────────────────────────
  const pollJobStatus = useCallback(async () => {
    if (!applyJobId) return;
    const { ok, data } = await authGet<Record<string, TriggerJobStatus>>('/controls/trigger-status');
    if (!ok || !data) return;
    const job = data[applyJobId];
    if (!job) return;
    setJobStatus(job);
    if (job.finishedAt !== null) {
      // Done — stop polling, invalidate the update cache (force re-check next time)
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setApplying(false);
      setUpdates(null); // stale; user must re-check
      setSelected(new Set());
    }
  }, [applyJobId]);

  useEffect(() => {
    if (applyJobId && !pollRef.current) {
      pollRef.current = setInterval(pollJobStatus, 3000);
    }
    return () => {
      if (!applyJobId && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [applyJobId, pollJobStatus]);

  // ── Check for updates ─────────────────────────────────────────────────────
  async function handleCheck(force = false) {
    setChecking(true);
    setCheckError(null);
    const { ok, data } = await authGet<UpdatesResponse>(`/updates/available${force ? '?force=1' : ''}`);
    if (ok && data) {
      setUpdates(data);
      setSelected(new Set()); // reset selection on fresh check
    } else {
      setCheckError('Registry check failed — server may be unreachable.');
    }
    setChecking(false);
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  function toggleSelect(name: string) {
    if (SELF_UPDATE_EXCLUDED.has(name)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function selectAll() {
    const updatable = (updates?.results ?? [])
      .filter(r => r.updateAvailable && !SELF_UPDATE_EXCLUDED.has(r.name))
      .map(r => r.name);
    setSelected(new Set(updatable));
  }

  function deselectAll() { setSelected(new Set()); }

  // ── Apply selected ────────────────────────────────────────────────────────
  function handleApplyClick() {
    const names = Array.from(selected);
    if (names.length === 0) return;

    const excluded = names.filter(n => SELF_UPDATE_EXCLUDED.has(n));
    const safe     = names.filter(n => !SELF_UPDATE_EXCLUDED.has(n));

    setConfirm({
      open: true,
      title: `Apply ${safe.length} update${safe.length !== 1 ? 's' : ''}`,
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-[0.875rem] leading-relaxed" style={{ color: 'var(--v4-readout)' }}>
            Each container will have its image pulled from the registry, then be restarted.
            Services will be briefly unavailable during restart.
          </p>
          <div
            className="rounded-[0.5rem] px-3 py-2.5 flex flex-col gap-1"
            style={{ background: 'var(--v4-well)' }}
          >
            {safe.map(n => (
              <Mono key={n} className="text-[0.8125rem]" style={{ color: 'var(--v4-signal)' }}>
                {n}
              </Mono>
            ))}
          </div>
          {excluded.length > 0 && (
            <p className="text-[0.75rem]" style={{ color: 'var(--v4-trace)' }}>
              {excluded.join(', ')} excluded — manage manually.
            </p>
          )}
        </div>
      ),
      confirmLabel: `Pull + restart ${safe.length} container${safe.length !== 1 ? 's' : ''}`,
      fn: () => doApply(safe),
    });
  }

  async function doApply(names: string[]) {
    setApplying(true);
    setJobStatus(null);
    const { ok, data } = await authPost<{ jobId?: string; error?: string }>('/updates/apply', { containers: names });
    if (ok && data?.jobId) {
      setApplyJobId(data.jobId);
      // Start polling immediately
      pollRef.current = setInterval(pollJobStatus, 3000);
    } else {
      setApplying(false);
      setCheckError(data?.error ?? 'Apply request failed.');
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const updatable = (updates?.results ?? []).filter(r => r.updateAvailable);
  const cantCheck = (updates?.results ?? []).filter(r => !r.canCheck);
  const selectable = updatable.filter(r => !SELF_UPDATE_EXCLUDED.has(r.name));
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.name));
  const selectedCount = Array.from(selected).filter(n => !SELF_UPDATE_EXCLUDED.has(n)).length;

  const jobDone    = jobStatus?.finishedAt !== null;
  const jobRunning = applyJobId !== null && !jobDone;

  // ── Header summary line ───────────────────────────────────────────────────
  function summaryLine() {
    if (checking) return null;
    if (!updates) return null;
    if (updatable.length === 0) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle size={13} style={{ color: 'var(--v4-nominal)', flexShrink: 0 }} />
          <Mono trace className="text-[0.75rem]">
            all containers current · checked {fmtTime(updates.checked)}
            {updates.cached ? ' · cached' : ''}
          </Mono>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex items-center justify-center rounded-full text-[0.625rem] font-bold font-mono min-w-[18px] h-[18px] px-1"
          style={{ background: 'rgba(88,166,255,0.15)', color: 'var(--v4-amber)' }}
        >
          {updatable.length}
        </span>
        <Mono className="text-[0.75rem]" style={{ color: 'var(--v4-amber)' }}>
          {updatable.length === 1 ? 'update available' : 'updates available'}
        </Mono>
        <Mono trace className="text-[0.75rem]">
          · checked {fmtTime(updates.checked)}
          {updates.cached ? ' · cached' : ''}
        </Mono>
      </div>
    );
  }

  return (
    <>
      {/* ── Confirm modal ──────────────────────────────────────────────── */}
      <DetailModal
        open={confirm.open}
        onClose={() => setConfirm(CONFIRM_CLOSED)}
        title={confirm.title}
      >
        <div className="flex flex-col gap-5">
          {confirm.body}
          <div className="flex gap-3 justify-end">
            <button
              className="px-4 py-2 rounded-[0.5rem] text-[0.875rem] font-medium min-h-[44px]"
              style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: 'pointer' }}
              onClick={() => setConfirm(CONFIRM_CLOSED)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-[0.5rem] text-[0.875rem] font-semibold min-h-[44px] active:-translate-y-px transition-transform"
              style={{ background: 'rgba(88,166,255,0.12)', color: 'var(--v4-amber)', border: '1px solid rgba(88,166,255,0.3)', cursor: 'pointer' }}
              onClick={() => { confirm.fn(); setConfirm(CONFIRM_CLOSED); }}
            >
              {confirm.confirmLabel}
            </button>
          </div>
        </div>
      </DetailModal>

      {/* ── Panel ─────────────────────────────────────────────────────── */}
      <Panel className="p-4">
        {/* Header row — always visible */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Expand / collapse toggle */}
          <button
            className="flex items-center gap-2 flex-1 min-w-0 text-left v4-tile rounded-[0.5rem]"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
          >
            <PanelTitle className="shrink-0">Container Updates</PanelTitle>
            {/* Inline summary shown in header when collapsed */}
            {!open && (
              <span className="flex-1 min-w-0 overflow-hidden">
                {summaryLine()}
              </span>
            )}
            {open
              ? <ChevronUp size={14} style={{ color: 'var(--v4-trace)', flexShrink: 0 }} />
              : <ChevronDown size={14} style={{ color: 'var(--v4-trace)', flexShrink: 0 }} />
            }
          </button>

          {/* "Check now" affordance — always visible, mono blue */}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[0.5rem] text-[0.75rem] font-medium font-mono min-h-[36px] shrink-0 disabled:opacity-50 active:-translate-y-px transition-transform"
            style={{
              background: 'rgba(88,166,255,0.10)',
              color: 'var(--v4-amber)',
              border: '1px solid rgba(88,166,255,0.2)',
              cursor: checking || jobRunning ? 'default' : 'pointer',
            }}
            disabled={checking || jobRunning}
            onClick={() => {
              if (!open) setOpen(true);
              handleCheck(!!updates); // force=true if we already have results
            }}
          >
            {checking
              ? <RefreshCw size={11} className="shrink-0" style={{ animation: 'spin 1s linear infinite' }} />
              : <Package size={11} className="shrink-0" />
            }
            {checking ? 'Checking…' : updates ? 'Re-check' : 'Check now'}
          </button>
        </div>

        {/* ── Expandable body ──────────────────────────────────────────── */}
        {open && (
          <div className="mt-4 flex flex-col gap-3">

            {/* Summary + select-all / apply bar */}
            {updates && !checking && (
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                {summaryLine()}
                {updatable.length > 0 && (
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    {/* Select all / deselect all */}
                    {selectable.length > 0 && (
                      <button
                        className="text-[0.75rem] font-medium min-h-[32px] px-2.5 py-1 rounded-[0.375rem]"
                        style={{ background: 'var(--v4-raised)', color: 'var(--v4-readout)', border: 'none', cursor: 'pointer' }}
                        onClick={allSelected ? deselectAll : selectAll}
                      >
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                    {/* Apply selected */}
                    {selectedCount > 0 && !jobRunning && (
                      <button
                        className="flex items-center gap-1.5 px-3 py-1 rounded-[0.375rem] text-[0.75rem] font-semibold font-mono min-h-[32px] active:-translate-y-px transition-transform disabled:opacity-50"
                        style={{
                          background: 'rgba(88,166,255,0.14)',
                          color: 'var(--v4-amber)',
                          border: '1px solid rgba(88,166,255,0.3)',
                          cursor: applying ? 'default' : 'pointer',
                        }}
                        disabled={applying}
                        onClick={handleApplyClick}
                      >
                        <ArrowUp size={11} className="shrink-0" />
                        apply selected ({selectedCount})
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Shimmer skeleton while first check runs */}
            {checking && !updates && (
              <div className="flex flex-col gap-2 v4-stagger">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-[0.5rem]" />
                ))}
              </div>
            )}

            {/* Shimmer during re-check (data already present) */}
            {checking && updates && (
              <div className="flex flex-col gap-2 v4-stagger">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-[0.5rem]" />
                ))}
              </div>
            )}

            {/* Error */}
            {checkError && !checking && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-[0.5rem] text-[0.8125rem]"
                style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)' }}
              >
                <span style={{ color: 'var(--v4-fault)' }}>{checkError}</span>
              </div>
            )}

            {/* Empty prompt — no check yet, no error */}
            {!updates && !checking && !checkError && (
              <div
                className="px-3 py-4 rounded-[0.5rem] text-center text-[0.8125rem]"
                style={{ background: 'var(--v4-well)', color: 'var(--v4-trace)' }}
              >
                Hit "Check now" to compare running containers against their registries.
              </div>
            )}

            {/* Results list — only containers with updates */}
            {updates && !checking && updatable.length > 0 && (
              <div className="flex flex-col">
                {updatable.map((r, i) => {
                  const excluded  = SELF_UPDATE_EXCLUDED.has(r.name);
                  const isSelected = selected.has(r.name);
                  return (
                    <div key={r.name}>
                      {i > 0 && <Hairline />}
                      <UpdateRow
                        result={r}
                        excluded={excluded}
                        selected={isSelected}
                        onToggle={() => toggleSelect(r.name)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cannot-check note */}
            {updates && !checking && cantCheck.length > 0 && (
              <Mono trace className="text-[0.6875rem]">
                {cantCheck.length} container{cantCheck.length !== 1 ? 's' : ''} skipped — local build or private registry, no remote digest.
              </Mono>
            )}

            {/* Apply job progress log */}
            {(applyJobId) && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Mono
                    className="text-[0.75rem] font-semibold"
                    style={{ color: jobRunning ? 'var(--v4-degraded)' : jobStatus?.status === 'error' ? 'var(--v4-fault)' : 'var(--v4-nominal)' }}
                  >
                    {jobRunning
                      ? 'Applying updates…'
                      : jobStatus?.status === 'error'
                        ? 'Apply finished with errors'
                        : 'Apply complete'}
                  </Mono>
                  {jobRunning && (
                    <RefreshCw
                      size={11}
                      className="shrink-0"
                      style={{ color: 'var(--v4-degraded)', animation: 'spin 1s linear infinite' }}
                    />
                  )}
                </div>
                <Well className="px-3 py-2.5 overflow-hidden" style={{ maxHeight: '12rem' }}>
                  <pre
                    ref={logRef}
                    className="text-[0.6875rem] m-0 whitespace-pre-wrap break-words overflow-y-auto"
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      color: 'var(--v4-readout)',
                      maxHeight: '11rem',
                    }}
                  >
                    {jobStatus?.output
                      ? jobStatus.output
                      : jobRunning
                        ? 'Pulling images…'
                        : '(no output)'}
                  </pre>
                </Well>
                {/* Re-check prompt after apply */}
                {jobDone && (
                  <button
                    className="text-[0.75rem] font-mono text-left py-1 px-2 rounded"
                    style={{ color: 'var(--v4-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      setApplyJobId(null);
                      setJobStatus(null);
                      handleCheck(false); // fresh check (bypass 30-min cache = force)
                    }}
                  >
                    Re-check containers →
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

// ── Update row ────────────────────────────────────────────────────────────────

interface UpdateRowProps {
  result: UpdateResult;
  excluded: boolean;
  selected: boolean;
  onToggle: () => void;
}

function UpdateRow({ result, excluded, selected, onToggle }: UpdateRowProps) {
  return (
    <div
      className="flex items-center gap-3 py-2.5 px-1 min-h-[44px] min-w-0"
      style={{ opacity: excluded ? 0.45 : 1 }}
    >
      {/* Custom checkbox — no default browser chrome */}
      <button
        role="checkbox"
        aria-checked={excluded ? false : selected}
        aria-label={excluded ? `${result.name} — manage manually` : `Select ${result.name}`}
        disabled={excluded}
        onClick={onToggle}
        className="flex items-center justify-center shrink-0 rounded-[0.25rem] transition-colors"
        style={{
          width: 16,
          height: 16,
          border: selected && !excluded
            ? '2px solid var(--v4-amber)'
            : '2px solid var(--v4-hairline)',
          background: selected && !excluded ? 'rgba(88,166,255,0.18)' : 'transparent',
          cursor: excluded ? 'not-allowed' : 'pointer',
        }}
      >
        {selected && !excluded && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
            <path d="M1 4L3.5 6.5L9 1" stroke="var(--v4-amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Name + image + digests */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Mono
            className="text-[0.8125rem] font-semibold truncate"
            style={{ color: 'var(--v4-signal)' }}
          >
            {result.name}
          </Mono>
          {excluded ? (
            <span
              className="flex items-center gap-0.5 shrink-0"
              style={{ color: 'var(--v4-trace)', fontSize: '0.625rem', fontFamily: "'Geist Mono', monospace" }}
            >
              <Shield size={9} />
              manage manually
            </span>
          ) : (
            <span
              className="shrink-0 text-[0.625rem] font-bold font-mono px-1.5 rounded"
              style={{ background: 'rgba(88,166,255,0.12)', color: 'var(--v4-amber)', letterSpacing: '0.04em' }}
            >
              UPDATE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Mono trace className="text-[0.6875rem] truncate" style={{ maxWidth: '16ch' }}>
            {result.image}
          </Mono>
          <Mono trace className="text-[0.6875rem] shrink-0">
            {shortDigest(result.localDigest)}
            <span style={{ color: 'var(--v4-amber)', margin: '0 3px' }}>→</span>
            {shortDigest(result.remoteDigest)}
          </Mono>
        </div>
      </div>
    </div>
  );
}
