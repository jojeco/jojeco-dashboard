/**
 * v4 AutomationDigest — 9 automation jobs, status chips + last run in mono.
 * DESIGN.md §4: status chips, last run in mono.
 * Data from /api/automation/status via SSE snapshot.automation.
 * Tap a row → AutomationJobDetailModal (schedule, last run, log tail).
 */
import { useState } from 'react';
import { useSnapshot } from '../../hooks/useSnapshot';
import type { AutomationJob } from '../../hooks/useSnapshot';
import { Panel, PanelTitle, Mono, Hairline, EmptyState, Skeleton } from './Primitives';
import { StatusChip } from './Primitives';
import { AutomationJobDetailModal } from './AutomationJobDetailModal';
import { fmtDate } from '../lib/utils';
import { cn } from '../lib/utils';

function jobStatusLevel(status: string): 'nominal' | 'degraded' | 'fault' | 'standby' {
  switch (status?.toLowerCase()) {
    case 'ok': case 'success': case 'done': return 'nominal';
    case 'running': case 'pending': return 'degraded';
    case 'failed': case 'error': return 'fault';
    default: return 'standby';
  }
}

interface JobRowProps {
  job: AutomationJob;
  delay: number;
  onClick: () => void;
}

function JobRow({ job, delay, onClick }: JobRowProps) {
  const level = jobStatusLevel(job.status);
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 py-2.5 px-1 v4-tile v4-settle w-full text-left rounded-[0.5rem]"
      style={{
        animationDelay: `${delay}ms`,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        minHeight: 44,
      }}
    >
      {/* Status chip */}
      <StatusChip level={level} label={job.status || 'unknown'} className="shrink-0" />

      {/* Label */}
      <span
        className="flex-1 text-[0.8125rem] truncate min-w-0"
        style={{ color: 'var(--v4-signal)' }}
        title={job.label}
      >
        {job.label}
      </span>

      {/* Last run */}
      <Mono dim className="text-[0.75rem] shrink-0">
        {job.lastRun ? fmtDate(job.lastRun) : '—'}
      </Mono>
    </button>
  );
}

export function AutomationDigest({ className }: { className?: string }) {
  const { data, loading } = useSnapshot('automation');
  const jobs = data ?? [];
  // automation section has a 60s SSE TTL — null means not-yet-emitted, not empty
  const waiting = loading || data == null;

  const [selectedJob, setSelectedJob] = useState<AutomationJob | null>(null);

  return (
    <>
      <Panel className={cn('p-4', className)}>
        <PanelTitle className="mb-3">Automation</PanelTitle>

        {waiting ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            message="No automation jobs found"
            action="Trigger one from Controls"
          />
        ) : (
          <div className="flex flex-col">
            {jobs.map((job, i) => (
              <div key={job.id}>
                {i > 0 && <Hairline />}
                <JobRow
                  job={job}
                  delay={i * 30}
                  onClick={() => setSelectedJob(job)}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Automation job detail modal ─────────────────────────────── */}
      <AutomationJobDetailModal
        job={selectedJob}
        open={selectedJob !== null}
        onClose={() => setSelectedJob(null)}
      />
    </>
  );
}
