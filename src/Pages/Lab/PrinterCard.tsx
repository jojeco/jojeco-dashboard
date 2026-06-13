/**
 * PrinterCard — Bambu P1S live-status card for the Lab page.
 *
 * Data source: useSnapshot('printer') → /api/printer/p1s (15s MQTT poll)
 * Design: surface-elevation only (no light borders), status colors on status
 * only, mobile-safe (minWidth: 0), control-room aesthetic.
 */
import { PrinterStatus } from '@/hooks/useSnapshot';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRemaining(min: number | null | undefined): string | null {
  if (min == null || min < 0) return null;
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function stateColor(state: string | undefined): string {
  if (!state) return 'var(--t3)';
  switch (state) {
    case 'Printing':    return 'var(--ok)';
    case 'Paused':      return 'var(--warn)';
    case 'Failed':      return 'var(--err)';
    case 'Finished':    return 'var(--ok)';
    default:            return 'var(--t3)';
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TempPair({ label, val, target }: { label: string; val: number | null | undefined; target: number | null | undefined }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', lineHeight: 1 }}>
        {val != null ? `${val}°` : '—'}
        {target != null && target > 0 && (
          <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 400, marginLeft: 3 }}>/{target}°</span>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', width: '100%' }}>
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          borderRadius: 2,
          background: 'linear-gradient(90deg, var(--accent) 0%, var(--ok) 100%)',
          transition: 'width 600ms ease',
        }}
      />
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function PrinterCard({ printer }: { printer: PrinterStatus | null }) {
  const isActive = printer?.online && printer.gcode_state === 'Printing';
  const isPaused = printer?.online && printer.gcode_state === 'Paused';

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-lg)',
        padding: '14px 16px',
        boxShadow: 'var(--shadow-ring), var(--shadow-card)',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* Printer icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', letterSpacing: '0.01em', textTransform: 'uppercase' }}>
            Bambu P1S
          </span>
        </div>

        {/* Status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px',
          borderRadius: 99,
          background: 'var(--raised)',
          flexShrink: 0,
        }}>
          {printer?.online && (
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: stateColor(printer.gcode_state),
              boxShadow: isActive ? `0 0 6px ${stateColor(printer.gcode_state)}` : 'none',
              animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
            }} />
          )}
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', color: printer?.online ? stateColor(printer.gcode_state) : 'var(--t3)' }}>
            {!printer || !printer.online ? 'Offline' : (printer.gcode_state ?? 'Unknown')}
          </span>
        </div>
      </div>

      {/* ── Offline state ── */}
      {(!printer || !printer.online) && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--t3)', fontSize: 12 }}>
          Printer offline
        </div>
      )}

      {/* ── Idle / no job ── */}
      {printer?.online && !isActive && !isPaused && (printer.gcode_state === 'Idle' || printer.gcode_state === 'Finished') && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--t3)', fontSize: 12 }}>
          Printer idle — no active job
        </div>
      )}

      {/* ── Active print content ── */}
      {printer?.online && (isActive || isPaused) && (
        <>
          {/* Job name */}
          {printer.job && (
            <div style={{
              fontSize: 12, color: 'var(--t1)', fontWeight: 500,
              marginBottom: 8, lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
              title={printer.job}
            >
              {printer.job}
            </div>
          )}

          {/* Progress bar + pct */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ProgressBar pct={printer.pct ?? 0} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', flexShrink: 0, minWidth: 30, textAlign: 'right' }}>
              {printer.pct ?? 0}%
            </span>
          </div>

          {/* Layer + time remaining */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Layer</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                {printer.layer ?? 0}
                <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 400 }}>/{printer.total_layers ?? '?'}</span>
              </div>
            </div>
            {fmtRemaining(printer.remaining_min) && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Remaining</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{fmtRemaining(printer.remaining_min)}</div>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Speed</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{printer.speed_level ?? '—'}</div>
            </div>
          </div>

          {/* Temps row */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            <TempPair label="Nozzle" val={printer.nozzle_temp} target={printer.nozzle_target} />
            <TempPair label="Bed" val={printer.bed_temp} target={printer.bed_target} />
          </div>

          {/* Filament swatch + type */}
          {(printer.tray_color || printer.tray_type) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {printer.tray_color && (
                <div style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: printer.tray_color,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
                  flexShrink: 0,
                }} />
              )}
              {printer.tray_type && (
                <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>
                  {printer.tray_type}
                  {printer.tray_color && (
                    <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 4 }}>
                      {printer.tray_color}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Error badge */}
          {printer.print_error != null && printer.print_error !== 0 && (
            <div style={{ marginTop: 8, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,60,60,0.12)', color: 'var(--err)', fontSize: 11 }}>
              Print error: {printer.print_error}
            </div>
          )}
        </>
      )}

      {/* ── Non-idle non-printing state (e.g. Preparing, Downloading) ── */}
      {printer?.online && !isActive && !isPaused && printer.gcode_state !== 'Idle' && printer.gcode_state !== 'Finished' && (
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '8px 0' }}>
          {printer.gcode_state}…
        </div>
      )}
    </div>
  );
}
