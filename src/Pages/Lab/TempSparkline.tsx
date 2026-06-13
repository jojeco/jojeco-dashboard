/** 24h temperature history sparkline — CPU (blue) + GPU (orange) */

export interface TempPoint { timestamp: number; cpu_temp: number | null; gpu_temp: number | null }

export function TempSparkline({ history }: { history: TempPoint[] }) {
  if (!history || history.length < 2) {
    return <div style={{ fontSize: 10, color: 'var(--t3)' }}>No history</div>;
  }

  const W = 280, H = 40;
  const cpu = history.map(p => p.cpu_temp).filter(Boolean) as number[];
  const gpu = history.map(p => p.gpu_temp).filter(Boolean) as number[];
  const all = [...cpu, ...gpu];
  if (!all.length) return null;

  const minV = Math.max(0, Math.min(...all) - 5);
  const maxV = Math.max(...all) + 5;
  const n = history.length;
  const toX = (i: number) => (i / (n - 1)) * W;
  const toY = (v: number) => H - ((v - minV) / (maxV - minV)) * H;
  const pts = (arr: (number | null)[]) =>
    arr.map((v, i) => (v ? `${toX(i).toFixed(1)},${toY(v).toFixed(1)}` : null)).filter(Boolean).join(' ');

  const diffH = (Date.now() - history[0].timestamp) / 3600000;
  const ago = diffH < 1 ? `${Math.round(diffH * 60)}m` : `${diffH.toFixed(0)}h`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--t3)', marginBottom: 4 }}>
        <span>{ago} ago</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {cpu.length > 0 && <span style={{ color: '#60a5fa' }}>CPU {cpu[cpu.length-1]?.toFixed(0)}°</span>}
          {gpu.length > 0 && <span style={{ color: '#fb923c' }}>GPU {gpu[gpu.length-1]?.toFixed(0)}°</span>}
        </span>
        <span>now</span>
      </div>
      <svg width={W} height={H} style={{ width: '100%', overflow: 'visible' }}>
        {maxV > 80 && (
          <rect x={0} y={toY(80)} width={W} height={H - toY(80)} fill="rgba(239,68,68,0.05)" />
        )}
        {cpu.length > 1 && (
          <polyline points={pts(history.map(p => p.cpu_temp))} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round" />
        )}
        {gpu.length > 1 && (
          <polyline points={pts(history.map(p => p.gpu_temp))} fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinejoin="round" />
        )}
        {cpu.length > 0 && <circle cx={toX(n-1)} cy={toY(cpu[cpu.length-1])} r="2.5" fill="#60a5fa" />}
        {gpu.length > 0 && <circle cx={toX(n-1)} cy={toY(gpu[gpu.length-1])} r="2.5" fill="#fb923c" />}
      </svg>
    </div>
  );
}
