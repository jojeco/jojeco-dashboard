/**
 * v4 AlertStrip — only renders if something is actually wrong.
 * DESIGN.md: alerts at top of mobile order, top of 4-column rail on desktop.
 * Never fabricate data. If nothing is wrong, renders a quiet "history" affordance.
 * Tappable → opens AlertHistoryModal with 48h ntfy feed.
 */
import { useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { useSnapshot } from '../../hooks/useSnapshot';
import { AlertHistoryModal } from './AlertHistoryModal';
import { cn } from '../lib/utils';

export function AlertStrip({ className }: { className?: string }) {
  const { data } = useSnapshot();
  const lab = data?.lab;
  const services = data?.servicesHealth;
  const [historyOpen, setHistoryOpen] = useState(false);

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

  // History modal (always rendered, separate from the strip)
  const historyModal = (
    <AlertHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
  );

  // No issues — render a quiet history link only (minimal footprint, not distracting)
  if (issues.length === 0) {
    if (!lab && !services) return <>{historyModal}</>;
    return (
      <>
        {historyModal}
        <button
          onClick={() => setHistoryOpen(true)}
          className={cn(
            'flex items-center gap-1.5 self-start rounded-[0.5rem] px-3 py-1.5 text-[0.75rem] transition-opacity hover:opacity-80 active:opacity-60',
            className,
          )}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--v4-trace)',
            fontFamily: "'Geist Mono', monospace",
          }}
        >
          <History size={12} className="shrink-0" />
          alert history
        </button>
      </>
    );
  }

  // Issues present — render the alert strip as a tappable button
  return (
    <>
      {historyModal}
      <button
        onClick={() => setHistoryOpen(true)}
        className={cn(
          'w-full rounded-[0.75rem] px-4 py-3 flex items-start gap-3 text-left v4-tile',
          className,
        )}
        style={{
          background: 'color-mix(in srgb, var(--v4-fault) 12%, transparent)',
          boxShadow: 'inset 2px 0 0 var(--v4-fault)',
          border: 'none',
          cursor: 'pointer',
        }}
        role="alert"
        aria-label="View alert history"
      >
        <AlertTriangle
          size={16}
          strokeWidth={2}
          className="shrink-0 mt-0.5"
          style={{ color: 'var(--v4-fault)' }}
        />
        <ul className="flex flex-col gap-1 min-w-0 flex-1">
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
        {/* Subtle cue that it's tappable */}
        <History
          size={13}
          className="shrink-0 mt-0.5 self-center"
          style={{ color: 'var(--v4-trace)' }}
          aria-hidden
        />
      </button>
    </>
  );
}
