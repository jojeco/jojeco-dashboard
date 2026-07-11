/**
 * useLabStream — SSE-backed data layer (Phase 2).
 *
 * Connects to GET /api/stream, which pushes the full snapshot payload every
 * 15 seconds. Falls back to polling /api/snapshot if SSE is unavailable.
 *
 * Exported state matches SnapshotContextValue so pages need no changes other
 * than swapping `useSnapshot` → `useLabStream`.
 *
 * PERF (2026-07-11): localStorage hydration for instant paint.
 *   On mount, state is pre-populated from localStorage (key v4:lastSnapshot)
 *   before any network call.  The REST fill and SSE stream replace it with
 *   live data.  stale=true while the cached copy is >60 s old so the
 *   LiveIndicator can show "SYNCING…" instead of "LIVE".
 *
 * Connection lifecycle:
 *  - Hydrates from localStorage immediately (no network, zero delay)
 *  - Opens EventSource on mount (with auth token in URL param — EventSource
 *    doesn't support custom headers, so we pass token as ?token=... and the
 *    backend reads it from req.query.token)
 *  - On error: exponential back-off, max 30 s, then retries indefinitely
 *  - On page-hide (visibility): closes connection; re-opens on page-show
 *  - Cleans up all timers and the EventSource on unmount
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StreamStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

// SnapshotSections is defined in useSnapshot.tsx; we use unknown here to avoid
// a circular import. The Provider casts it via SnapshotSections on consumption.
export interface LabStreamState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any> | null;
  at: number | null;
  loading: boolean;
  /** True while the displayed data is from localStorage cache (>60 s old). */
  stale: boolean;
  /** Manual refresh — hits /api/snapshot REST endpoint immediately */
  refresh: () => void;
  /** SSE connection health */
  streamStatus: StreamStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken(): string | null { return localStorage.getItem('auth_token'); }

const BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : '';

function streamUrl(): string {
  const token = getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${BASE_URL}/api/stream${qs}`;
}

function snapshotUrl(): string {
  return `${BASE_URL}/api/snapshot`;
}

// Back-off: 2s → 4s → 8s → … → 30s cap
function nextDelay(current: number): number {
  return Math.min(current * 2, 30_000);
}

// ── localStorage cache ────────────────────────────────────────────────────────

const LS_KEY = 'v4:lastSnapshot';
const STALE_MS = 60_000; // data older than 60 s is shown as stale

interface CachedSnapshot {
  at: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: Record<string, any>;
}

function loadFromCache(): CachedSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSnapshot;
    if (!parsed || typeof parsed.at !== 'number' || !parsed.sections) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToCache(snap: CachedSnapshot): void {
  try {
    // Cap payload at ~1.5 MB to avoid quota errors on mobile browsers.
    const str = JSON.stringify(snap);
    if (str.length > 1_500_000) return;
    localStorage.setItem(LS_KEY, str);
  } catch {
    // Quota exceeded or private mode — silently skip
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLabStream(): LabStreamState {
  // Hydrate from localStorage synchronously before first render so panels
  // paint with last-known data immediately (no skeleton frames).
  const cachedSnap = loadFromCache();
  const initialData = cachedSnap?.sections ?? null;
  const initialAt   = cachedSnap?.at ?? null;
  const initialStale = cachedSnap ? (Date.now() - cachedSnap.at > STALE_MS) : false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData]   = useState<Record<string, any> | null>(initialData);
  const [at, setAt]       = useState<number | null>(initialAt);
  // loading=true only when there is NO data at all (nothing in cache + no network yet)
  const [loading, setLoading] = useState(initialData === null);
  const [stale, setStale] = useState(initialStale);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');

  const esRef    = useRef<EventSource | null>(null);
  const backoff  = useRef(2_000);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge sections, skipping null/undefined — server emits null for sections
  // not refreshed in a given tick; replacing wholesale wiped good data (v4 fix).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mergeSections = useCallback((incoming: Record<string, any>, snapshotAt: number) => {
    setData(prev => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next: Record<string, any> = { ...(prev ?? {}) };
      for (const [k, v] of Object.entries(incoming)) if (v != null) next[k] = v;
      // Persist merged snapshot to localStorage so next page-load is instant
      saveToCache({ at: snapshotAt, sections: next });
      return next;
    });
    setAt(snapshotAt);
    setStale(false);
  }, []);

  // ── Manual REST refresh (used by SnapshotProvider-compatible refresh()) ───
  const refresh = useCallback(async () => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(snapshotUrl(), { headers });
      if (!res.ok) return;
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mergeSections(json.sections, json.at as number);
      setLoading(false);
    } catch { /* keep stale */ }
  }, [mergeSections]);

  // ── SSE connection lifecycle ──────────────────────────────────────────────
  const connect = useCallback(() => {
    // Close any existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setStreamStatus('connecting');
    const es = new EventSource(streamUrl());
    esRef.current = es;

    es.onopen = () => {
      backoff.current = 2_000; // reset back-off on successful connect
      setStreamStatus('connected');
    };

    es.onmessage = (evt) => {
      try {
        const json = JSON.parse(evt.data);
        if (json.sections) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          mergeSections(json.sections, json.at as number);
          setLoading(false);
          setStreamStatus('connected');
        }
      } catch { /* malformed frame — ignore */ }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setStreamStatus('reconnecting');

      const delay = backoff.current;
      backoff.current = nextDelay(delay);
      console.warn(`[SSE] disconnected, retrying in ${delay / 1000}s`);

      retryRef.current = setTimeout(() => {
        if (!document.hidden) connect();
      }, delay);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility handling — disconnect when tab hidden, reconnect on show ───
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // Pause — close to avoid stale keepalive charges
        if (esRef.current) { esRef.current.close(); esRef.current = null; }
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
        setStreamStatus('closed');
      } else {
        // Resume — mark as stale until fresh data arrives
        const cached = loadFromCache();
        if (cached && Date.now() - cached.at > STALE_MS) setStale(true);
        backoff.current = 2_000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connect, refresh]);

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    void refresh(); // instant fill from REST cache; SSE merge keeps it live (nulls skipped)
    connect();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };
  }, [connect]);

  return { data, at, loading, stale, refresh, streamStatus };
}
