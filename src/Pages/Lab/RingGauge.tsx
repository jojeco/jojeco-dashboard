/** Animated SVG ring gauge — used for CPU/RAM/Disk/GPU metrics in MachineCard */
import { pctColor } from './utils';

interface RingGaugeProps {
  pct: number;
  warn?: number;
  crit?: number;
  label: string;
  sublabel?: string;
  size?: number;
}

export function RingGauge({ pct, warn = 65, crit = 85, label, sublabel, size = 68 }: RingGaugeProps) {
  const sw = 5;
  const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const fill = (clamped / 100) * circ;
  const color = pctColor(pct, warn, crit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={sw} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth={sw}
            strokeDasharray={`${fill.toFixed(2)} ${(circ - fill).toFixed(2)}`}
            strokeLinecap="round"
            style={{
              animation: 'ringFill 800ms cubic-bezier(0.16,1,0.3,1)',
              transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1), stroke 400ms',
            }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size * 0.195, fontFamily: 'Geist Mono, monospace', fontWeight: 700, lineHeight: 1, color: 'var(--t1)' }}>
            {Math.round(clamped)}
          </span>
          <span style={{ fontSize: size * 0.14, color: 'var(--t3)', lineHeight: 1, marginTop: 1 }}>%</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t2)', letterSpacing: '0.04em' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>{sublabel}</div>}
      </div>
    </div>
  );
}
