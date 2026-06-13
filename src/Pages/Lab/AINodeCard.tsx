/**
 * AINodeCard — one Ollama inference node: online status, model count,
 * model list with tok/s badge, active session indicator.
 */
import { Card } from '@/components/ui/card';
import { OllamaNode, OllamaSession } from '@/hooks/useSnapshot';
import { getSpeed } from './utils';

interface AINodeCardProps {
  node: OllamaNode;
  sessions: OllamaSession[];
}

export function AINodeCard({ node, sessions }: AINodeCardProps) {
  const active = sessions.find(s => s.id === node.id)?.active ?? [];
  const inUse = active.length > 0;

  const sorted = [...node.models].sort((a, b) => {
    if (a.name.startsWith('jojeco-') !== b.name.startsWith('jojeco-'))
      return a.name.startsWith('jojeco-') ? -1 : 1;
    return b.size - a.size;
  });

  const dotStyle = !node.online
    ? { background: 'var(--t3)' }
    : inUse
    ? { background: '#60a5fa', boxShadow: '0 0 0 2px rgba(96,165,250,0.15)', animation: 'pulseDot 2s ease-in-out infinite' }
    : { background: 'var(--ok)', boxShadow: '0 0 0 2px var(--ok-dim)', animation: 'pulseDot 2.5s ease-in-out infinite' };

  return (
    <Card className="p-4" style={{ opacity: node.online ? 1 : 0.5, boxShadow: 'var(--shadow-ring), var(--shadow-card)' }}>
      <div className="flex justify-between items-start mb-2.5">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="j-dot" style={dotStyle} />
            <span className="text-[13px] font-semibold text-[var(--t1)]">{node.name}</span>
          </div>
          <div className="text-[10px] text-[var(--t2)] pl-[15px]">{node.role}</div>
        </div>
        <div className="text-right">
          {node.online && (
            <div className="text-[28px] font-mono font-bold text-[var(--ok)] leading-none">
              {node.models.length}
            </div>
          )}
          <div className="text-[9px] text-[var(--t3)] uppercase tracking-wider">
            {node.online ? 'models' : 'offline'}
          </div>
        </div>
      </div>

      {node.online && sorted.length > 0 && (
        <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-0.5">
          {sorted.slice(0, 4).map(m => {
            const tps = getSpeed(m.name);
            return (
              <div key={m.name} className="flex justify-between items-center">
                <span
                  className="text-[10px] font-mono truncate flex-1 overflow-hidden"
                  style={{ color: m.name.startsWith('jojeco-') ? 'var(--accent)' : 'var(--t2)' }}
                >
                  {m.name}
                </span>
                {tps != null && (
                  <span
                    className="text-[9px] font-mono shrink-0 ml-1.5"
                    style={{ color: tps >= 80 ? 'var(--ok)' : tps >= 20 ? 'var(--warn)' : '#f97316' }}
                  >
                    {tps}t/s
                  </span>
                )}
              </div>
            );
          })}
          {sorted.length > 4 && (
            <span className="text-[9px] text-[var(--t3)] pt-0.5">+{sorted.length - 4} more</span>
          )}
        </div>
      )}

      {inUse && (
        <div className="mt-2 text-[10px] text-[#60a5fa] flex items-center gap-1.5">
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', animation: 'pulseDot 1.5s ease-in-out infinite', display: 'inline-block' }} />
          {active.map(m => m.name.split(':')[0]).join(', ')} running
        </div>
      )}
    </Card>
  );
}
