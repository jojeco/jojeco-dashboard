/**
 * UpdatesPanel — checks running containers against registries and lets
 * the user select updates to apply. Apply requires confirmation (passed as handler).
 */
import { Package, RefreshCw, Loader, CheckCircle, ArrowUpCircle } from 'lucide-react';
import type { UpdateResult } from './types';
import { relativeTime } from './utils';

interface UpdatesPanelProps {
  updates: { checked: number | null; results: UpdateResult[]; cached?: boolean } | null;
  loading: Record<string, boolean>;
  applyJobId: string | null;
  selectedUpdates: Set<string>;
  onCheck: (force?: boolean) => void;
  onSelectUpdate: (name: string, checked: boolean) => void;
  onSelectAll: () => void;
  onApply: () => void;  // parent wires confirm dialog
}

export function UpdatesPanel({
  updates,
  loading,
  applyJobId,
  selectedUpdates,
  onCheck,
  onSelectUpdate,
  onSelectAll,
  onApply,
}: UpdatesPanelProps) {
  const updatesAvailable = updates?.results.filter(u => u.updateAvailable) ?? [];

  const baseBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    minHeight: 40,
    borderRadius: 'var(--r-sm)',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: 'none',
    background: 'var(--raised)',
    color: 'var(--t2)',
    boxShadow: 'var(--shadow-ring)',
    transition: 'background 120ms, color 120ms',
    flexShrink: 0,
  };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {updates?.checked && (
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>
              {updates.cached ? 'cached · ' : ''}checked {relativeTime(updates.checked)}
            </span>
          )}
          {updatesAvailable.length > 0 && selectedUpdates.size > 0 && (
            <>
              <button
                style={{ ...baseBtn, padding: '6px 10px', minHeight: 36, fontSize: 11 }}
                onClick={onSelectAll}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
              >
                Select all
              </button>
              <button
                style={{
                  ...baseBtn,
                  padding: '6px 12px',
                  minHeight: 36,
                  fontSize: 11,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  boxShadow: '0 0 0 1px var(--accent-border)',
                }}
                disabled={loading['applyUpdates'] || !!applyJobId}
                onClick={onApply}
                onMouseEnter={e => { if (!loading['applyUpdates'] && !applyJobId) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(20,184,166,0.22)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dim)'; }}
              >
                <ArrowUpCircle size={11} style={{ flexShrink: 0 }} />
                {applyJobId ? 'Applying…' : `Apply (${selectedUpdates.size})`}
              </button>
            </>
          )}
        </div>

        {/* Check / Re-check button */}
        <button
          style={baseBtn}
          disabled={loading['updates']}
          onClick={() => onCheck(!!updates)}
          onMouseEnter={e => { if (!loading['updates']) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; } }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'; }}
        >
          {loading['updates']
            ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
            : updates ? <RefreshCw size={11} style={{ flexShrink: 0 }} /> : <Package size={11} style={{ flexShrink: 0 }} />
          }
          {loading['updates'] ? 'Checking…' : updates ? 'Re-check' : 'Check for updates'}
        </button>
      </div>

      {/* Loading state */}
      {loading['updates'] && !updates && (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--r)',
            padding: '24px 20px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--t3)',
            boxShadow: 'var(--shadow-ring)',
          }}
        >
          <Loader size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
          <div>Checking containers against registry… this takes a minute.</div>
        </div>
      )}

      {/* Empty prompt */}
      {!updates && !loading['updates'] && (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--r)',
            padding: '20px 16px',
            fontSize: 13,
            color: 'var(--t3)',
            textAlign: 'center',
            boxShadow: 'var(--shadow-ring)',
          }}
        >
          Click "Check for updates" to compare running containers against their registries.
        </div>
      )}

      {/* Results */}
      {updates && (
        <>
          {updatesAvailable.length === 0 && updates.results.filter(u => u.canCheck).length > 0 && (
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 'var(--r-sm)',
                padding: '10px 16px',
                fontSize: 13,
                color: 'var(--ok)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
                boxShadow: 'var(--shadow-ring)',
              }}
            >
              <CheckCircle size={14} style={{ flexShrink: 0 }} /> All containers are up to date
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {updates.results.filter(u => u.updateAvailable || u.canCheck).map(u => (
              <div
                key={u.name}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 'var(--r-sm)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: u.updateAvailable
                    ? '0 0 0 1px rgba(99,179,237,0.2)'
                    : 'var(--shadow-ring)',
                  minWidth: 0,
                }}
              >
                {u.updateAvailable ? (
                  <input
                    type="checkbox"
                    checked={selectedUpdates.has(u.name)}
                    onChange={e => onSelectUpdate(u.name, e.target.checked)}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 14, flexShrink: 0 }} />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--t1)',
                        fontFamily: "'Geist Mono', monospace",
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      {u.name}
                    </span>
                    {u.updateAvailable && (
                      <span
                        style={{
                          fontSize: 10,
                          background: 'rgba(99,179,237,0.12)',
                          color: 'var(--accent)',
                          borderRadius: 4,
                          padding: '1px 6px',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        UPDATE
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--t3)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: "'Geist Mono', monospace",
                    }}
                  >
                    {u.image}
                    {u.localDigest && <span> · local: {u.localDigest}…</span>}
                    {u.updateAvailable && u.remoteDigest && (
                      <span style={{ color: 'var(--accent)' }}> → {u.remoteDigest}…</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {updates.results.filter(u => !u.canCheck).length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--t3)', padding: '6px 2px' }}>
                {updates.results.filter(u => !u.canCheck).length} container(s) could not be checked (private/unknown registry)
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
