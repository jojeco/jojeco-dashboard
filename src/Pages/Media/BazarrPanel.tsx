/**
 * BazarrPanel — compact subtitle status tile for the Media page.
 * Shows wanted count, downloaded total, and 5 most-recently-wanted episodes.
 */
import { useEffect, useState } from 'react';
import { Subtitles } from 'lucide-react';
import { getToken } from '@/services/api';

interface BazarrData {
  wanted: number;
  downloaded: number;
  recent: { series: string; episode: string }[];
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export function BazarrPanel() {
  const [data, setData] = useState<BazarrData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/bazarr/wanted', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  return (
    <div
      className="j-panel"
      style={{ padding: '14px 16px', minWidth: 0 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Subtitles size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>Subtitles</span>
        <a
          href="http://192.168.50.13:6767"
          target="_blank"
          rel="noreferrer"
          style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)', textDecoration: 'none' }}
        >
          Bazarr ↗
        </a>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>Bazarr unavailable</div>
      )}

      {!error && !data && (
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>Loading…</div>
      )}

      {data && (
        <>
          {/* Stat row */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: data.wanted > 0 ? 'var(--warn, #f59e0b)' : 'var(--t1)' }}>
                {data.wanted.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>wanted</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)' }}>
                {data.downloaded.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>downloaded</div>
            </div>
          </div>

          {/* Recent wanted list */}
          {data.recent.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Still wanted
              </div>
              {data.recent.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--t2)',
                    padding: '2px 0',
                    borderBottom: i < data.recent.length - 1 ? '1px solid var(--line)' : undefined,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                    {e.series}
                  </span>
                  <span style={{ color: 'var(--t3)', flexShrink: 0 }}>{e.episode}</span>
                </div>
              ))}
            </div>
          )}

          {data.wanted === 0 && (
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
              All caught up
            </div>
          )}
        </>
      )}
    </div>
  );
}
