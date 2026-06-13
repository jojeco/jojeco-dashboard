import { Cpu, Zap } from 'lucide-react';
import type { TdarrStatus } from './types';
import { workerTypeLabel } from './utils';

export function TdarrPanel({ tdarr }: { tdarr: TdarrStatus | null }) {
  if (!tdarr) {
    return (
      <div className="j-panel" style={{ padding: 16, opacity: 0.5, fontSize: 12, color: 'var(--t3)', textAlign: 'center' }}>
        Tdarr unavailable
      </div>
    );
  }

  const score = tdarr.tdarrScore ?? 0;
  const activeWorkers = tdarr.workers.filter(w =>
    w.status === 'Execute' || w.status === 'Processing' || w.status === 'Scanning'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
        {[
          { label: 'Library Score', value: `${score.toFixed(1)}%`, color: score >= 90 ? 'var(--ok)' : score >= 70 ? 'var(--warn)' : 'var(--err)' },
          { label: 'Transcoded',   value: tdarr.transcoded.toLocaleString(), color: 'var(--ok)' },
          {
            label: tdarr.transcodeQueue > 0 ? 'In Queue' : 'Errors',
            value: tdarr.transcodeQueue > 0 ? tdarr.transcodeQueue.toLocaleString() : tdarr.transcodeErrors.toLocaleString(),
            color: tdarr.transcodeQueue > 0 ? 'var(--accent)' : tdarr.transcodeErrors > 0 ? 'var(--err)' : 'var(--t3)',
          },
          { label: 'Space Saved', value: tdarr.sizeDiffGB > 0 ? `${tdarr.sizeDiffGB.toFixed(0)} GB` : '—', color: tdarr.sizeDiffGB > 0 ? 'var(--ok)' : 'var(--t3)' },
        ].map(s => (
          <div key={s.label} className="j-panel" style={{ padding: '8px 10px', textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: 'Geist Mono, monospace' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* HEVC coverage progress */}
      <div className="j-panel" style={{ padding: '10px 14px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 6, fontFamily: 'Geist Mono, monospace', flexWrap: 'wrap', gap: 4 }}>
          <span>HEVC Coverage</span>
          <span style={{ color: 'var(--t1)', fontWeight: 600 }}>
            {tdarr.noAction.toLocaleString()} / {tdarr.total.toLocaleString()} — {score.toFixed(1)}%
          </span>
        </div>
        <div className="j-bar-track">
          <div className="j-bar-fill" style={{ width: `${score}%`, background: score >= 90 ? 'var(--ok)' : 'var(--warn)', transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Already HEVC',      value: tdarr.noAction,         color: 'var(--t3)' },
            { label: 'Transcoded by Tdarr', value: tdarr.transcoded,     color: 'var(--ok)' },
            { label: 'Errors',             value: tdarr.transcodeErrors, color: tdarr.transcodeErrors > 0 ? 'var(--err)' : 'var(--t3)' },
            { label: 'Health errors',      value: tdarr.healthErrors,    color: tdarr.healthErrors > 0 ? 'var(--warn)' : 'var(--t3)' },
          ].map(s => (
            <div key={s.label} style={{ fontSize: 10, color: s.color, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontFamily: 'Geist Mono, monospace' }}>{s.value.toLocaleString()}</span>
              <span style={{ color: 'var(--t3)', marginLeft: 3 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active workers */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={11} style={{ color: 'var(--t3)' }} />
          Workers
          <span style={{ fontWeight: 400, color: 'var(--t3)' }}>({activeWorkers.length} active)</span>
        </div>
        {activeWorkers.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t3)', padding: '8px 0' }}>No active workers</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeWorkers.map((w, i) => {
              const { label, color } = workerTypeLabel(w.type);
              return (
                <div key={i} className="j-panel" style={{ padding: '8px 12px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color, padding: '1px 6px', borderRadius: 4, background: `${color}18`, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 10, color: 'var(--t3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.node}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <Zap size={9} />{w.fps} fps
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-word', marginBottom: 4 }}>
                    {w.file || '—'}
                  </div>
                  <div className="j-bar-track" style={{ height: 3 }}>
                    <div className="j-bar-fill" style={{ width: `${w.percentage}%`, background: color, transition: 'width 1s linear' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3, textAlign: 'right', fontFamily: 'Geist Mono, monospace' }}>{w.percentage}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
