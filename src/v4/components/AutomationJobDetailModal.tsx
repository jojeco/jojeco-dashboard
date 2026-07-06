/**
 * v4 AutomationJobDetailModal — tap a job row in AutomationDigest.
 * Shows schedule, last run, status chip, and lastLines log tail in a Recessed Well.
 * DESIGN.md §4 Log tail: Recessed Well, Geist Mono 0.75rem, newest line slides in.
 */
import { DetailModal } from './DetailModal';
import { Mono, Well, Hairline } from './Primitives';
import { fmtDate } from '../lib/utils';
import type { AutomationJob } from '../../hooks/useSnapshot';

function jobStatusLevel(status: string): 'nominal' | 'degraded' | 'fault' | 'standby' {
  switch (status?.toLowerCase()) {
    case 'ok': case 'success': case 'done': return 'nominal';
    case 'running': case 'pending': return 'degraded';
    case 'failed': case 'error': return 'fault';
    default: return 'standby';
  }
}

interface AutomationJobDetailModalProps {
  job: AutomationJob | null;
  open: boolean;
  onClose: () => void;
}

export function AutomationJobDetailModal({ job, open, onClose }: AutomationJobDetailModalProps) {
  if (!job) return null;

  const level = jobStatusLevel(job.status);

  return (
    <DetailModal
      open={open}
      onClose={onClose}
      title={job.label}
      statusLevel={level}
      statusLabel={job.status || 'unknown'}
    >
      <div className="flex flex-col gap-4">
        {/* ── Schedule + last run ──────────────────────────────── */}
        <div className="flex flex-col gap-0">
          <div className="flex items-center justify-between py-2">
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Schedule</span>
            <Mono dim className="text-[0.75rem]">{job.schedule || '—'}</Mono>
          </div>
          <Hairline />
          <div className="flex items-center justify-between py-2">
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Last run</span>
            <Mono dim className="text-[0.75rem]">{job.lastRun ? fmtDate(job.lastRun) : '—'}</Mono>
          </div>
          <Hairline />
          <div className="flex items-center justify-between py-2">
            <span className="text-[0.75rem]" style={{ color: 'var(--v4-readout)' }}>Status</span>
            <Mono
              className="text-[0.75rem] font-semibold uppercase tracking-wide"
              style={{
                color:
                  level === 'nominal'  ? 'var(--v4-nominal)' :
                  level === 'degraded' ? 'var(--v4-degraded)' :
                  level === 'fault'    ? 'var(--v4-fault)' :
                                         'var(--v4-standby)',
              }}
            >
              {job.status || 'unknown'}
            </Mono>
          </div>
        </div>

        {/* ── Log tail ─────────────────────────────────────────── */}
        {job.lastLines && job.lastLines.length > 0 ? (
          <section>
            <span
              className="text-[0.75rem] font-semibold uppercase tracking-wider block mb-2"
              style={{ color: 'var(--v4-readout)' }}
            >
              Log tail
            </span>
            <Well
              className="px-3 py-3 overflow-y-auto"
              style={{ maxHeight: '18rem' }}
            >
              <div className="flex flex-col gap-0.5">
                {job.lastLines.map((line, i) => (
                  <Mono
                    key={i}
                    trace
                    className="text-[0.75rem] leading-relaxed whitespace-pre-wrap break-all v4-settle"
                    style={{ animationDelay: `${i * 20}ms` }}
                  >
                    {line}
                  </Mono>
                ))}
              </div>
            </Well>
          </section>
        ) : (
          <Well className="px-3 py-4 text-center">
            <Mono trace className="text-[0.75rem]">No log output available</Mono>
          </Well>
        )}
      </div>
    </DetailModal>
  );
}
