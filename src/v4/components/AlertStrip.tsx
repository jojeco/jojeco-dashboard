/**
 * v4 AlertStrip — only renders if something is actually wrong.
 * DESIGN.md: alerts at top of mobile order, top of 4-column rail on desktop.
 * Never fabricate data. If nothing is wrong, renders null.
 */
import { AlertTriangle } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { cn } from '../lib/utils';

export function AlertStrip({ className }: { className?: string }) {
  const { data } = useSnapshot();
  const lab = data?.lab;
  const services = data?.servicesHealth;

  if (!lab && !services) return null;

  const issues: string[] = [];

  // Down services
  if (services) {
    const downList = Object.entries(services)
      .filter(([, s]) => s.status === 'offline')
      .map(([id]) => id);
    if (downList.length > 0) {
      issues.push(
        downList.length === 1
          ? `${downList[0]} is down`
          : `${downList.length} services down: ${downList.slice(0, 3).join(', ')}${downList.length > 3 ? '…' : ''}`
      );
    }
  }

  // Lab-level issues
  if (lab?.issues) {
    for (const issue of lab.issues) {
      if (issue.severity === 'critical' || issue.severity === 'high') {
        issues.push(issue.message);
      }
    }
  }

  // Machine issues
  if (lab?.machines) {
    const offlineMachines = lab.machines.filter(m => !m.online && m.always_on);
    if (offlineMachines.length > 0) {
      issues.push(`${offlineMachines.map(m => m.name).join(', ')} unreachable`);
    }
    const hotMachines = lab.machines.filter(m => m.online && m.temp != null && m.temp > 85);
    if (hotMachines.length > 0) {
      issues.push(`${hotMachines.map(m => `${m.name} ${m.temp}°C`).join(', ')}`);
    }
  }

  if (issues.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-[0.75rem] px-4 py-3 flex items-start gap-3',
        className,
      )}
      style={{
        background: 'color-mix(in srgb, var(--v4-fault) 12%, transparent)',
        boxShadow: 'inset 2px 0 0 var(--v4-fault)',
      }}
      role="alert"
    >
      <AlertTriangle
        size={16}
        strokeWidth={2}
        className="shrink-0 mt-0.5"
        style={{ color: 'var(--v4-fault)' }}
      />
      <ul className="flex flex-col gap-1 min-w-0">
        {issues.map((msg, i) => (
          <li
            key={i}
            className="text-[0.8125rem] leading-snug"
            style={{ color: 'var(--v4-signal)' }}
          >
            {msg}
          </li>
        ))}
      </ul>
    </div>
  );
}
