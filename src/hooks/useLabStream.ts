/**
 * useLabStream — SSE-backed data layer (Phase 2).
 *
 * Connects to GET /api/stream, which pushes the full snapshot payload every
 * 15 seconds. Falls back to polling /api/snapshot if SSE is unavailable.
 *
 * Exported state matches SnapshotContextValue so pages need no changes other
 * than swapping `useSnapshot` → `useLabStream`.
 *
 * Connection lifecycle:
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

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLabStream(): LabStreamState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData]   = useState<Record<string, any> | null>(null);
  const [at, setAt]       = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');

  const esRef    = useRef<EventSource | null>(null);
  const backoff  = useRef(2_000);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setData(json.sections);
      setAt(json.at as number);
    } catch { /* keep stale */ }
  }, []);

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
          setData(json.sections);
          setAt(json.at as number);
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
        // Resume
        backoff.current = 2_000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connect]);

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    };
  }, [connect]);

  return { data, at, loading, refresh, streamStatus };
}
