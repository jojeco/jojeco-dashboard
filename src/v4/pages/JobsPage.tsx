import { useState, useEffect, useCallback } from 'react';
import { Briefcase, ExternalLink, CheckCircle2, RefreshCw, Clock } from 'lucide-react';
import { Panel, Skeleton } from '../components/Primitives';
import { getToken } from '../../services/api';

interface Job {
  id: string;
  title: string;
  company: string;
  url: string;
  score: number;
  reason: string;
  job_type: string;
  source: string;
  posted_at: string;
  found_at: string;
  applied: 0 | 1;
}

type Filter = 'high' | 'all' | 'not_applied' | 'applied';

const FILTER_TABS: { id: Filter; label: string }[] = [
  { id: 'high', label: 'High Score' },
  { id: 'not_applied', label: 'To Apply' },
  { id: 'applied', label: 'Applied' },
  { id: 'all', label: 'All' },
];

function scoreBg(score: number) {
  if (score >= 9) return 'rgba(63,185,80,0.85)';
  if (score >= 7) return 'rgba(210,153,34,0.85)';
  return 'rgba(88,166,255,0.25)';
}
function scoreColor(score: number) {
  if (score >= 7) return '#fff';
  return 'var(--v4-accent)';
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lastRun, setLastRun] = useState('');
  const [filter, setFilter] = useState<Filter>('high');
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const authHdr = useCallback(
    () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const apiFilter = filter === 'high' ? 'all' : filter;
      const res = await fetch(`/api/jobs?filter=${apiFilter}&limit=300`, { headers: authHdr() });
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setLastRun(data.last_run ?? '');
    } finally {
      setLoading(false);
    }
  }, [filter, authHdr]);

  useEffect(() => { load(); }, [load]);

  const visible = filter === 'high' ? jobs.filter(j => j.score >= 8) : jobs;

  const markApplied = async (id: string, applied: 0 | 1) => {
    setApplyingId(id);
    try {
      await fetch(`/api/jobs/${id}/applied`, {
        method: 'POST', headers: authHdr(), body: JSON.stringify({ applied }),
      });
      setJobs(prev => prev.map(j => j.id === id ? { ...j, applied } : j));
    } finally {
      setApplyingId(null);
    }
  };

  const triggerScan = async () => {
    setTriggering(true);
    try {
      await fetch('/api/jobs/trigger', { method: 'POST', headers: authHdr() });
      setTimeout(load, 3000);
    } finally {
      setTimeout(() => setTriggering(false), 3000);
    }
  };

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto" style={{ color: 'var(--v4-text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Briefcase size={18} style={{ color: 'var(--v4-blue)' }} />
          <span className="font-semibold text-[1rem]">Job Tracker</span>
        </div>
        <div className="flex items-center gap-3">
          {lastRun && (
            <span className="text-[0.6875rem] flex items-center gap-1" style={{ color: 'var(--v4-trace)' }}>
              <Clock size={11} /> {relativeTime(lastRun)}
            </span>
          )}
          <button
            onClick={triggerScan}
            disabled={triggering}
            className="flex items-center gap-1 px-2 py-1 rounded text-[0.6875rem]"
            style={{ background: 'var(--v4-surface)', color: triggering ? 'var(--v4-trace)' : 'var(--v4-text)' }}
          >
            <RefreshCw size={11} className={triggering ? 'animate-spin' : ''} />
            {triggering ? 'Scanning…' : 'Scan'}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded" style={{ background: 'var(--v4-surface)' }}>
        {FILTER_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className="flex-1 py-1.5 rounded text-[0.75rem] font-medium transition-colors"
            style={{
              background: filter === t.id ? 'var(--v4-void)' : 'transparent',
              color: filter === t.id ? 'var(--v4-text)' : 'var(--v4-trace)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Count */}
      {!loading && (
        <div className="text-[0.6875rem] mb-3" style={{ color: 'var(--v4-trace)' }}>
          {visible.length} {visible.length === 1 ? 'job' : 'jobs'}
          {filter === 'high' && ' · score 8+'}
        </div>
      )}

      {/* Job list */}
      <Panel className="overflow-hidden p-0">
        {loading ? (
          <div className="p-4 flex flex-col gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-[0.875rem]" style={{ color: 'var(--v4-trace)' }}>
            No jobs in this view
          </div>
        ) : (
          <ul>
            {visible.map((job, idx) => (
              <li
                key={job.id}
                style={{
                  borderTop: idx > 0 ? '1px solid var(--v4-hairline)' : 'none',
                }}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Score badge */}
                  <div
                    className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-[0.75rem] font-bold mt-0.5"
                    style={{ background: scoreBg(job.score), color: scoreColor(job.score) }}
                  >
                    {job.score}
                  </div>

                  {/* Job info — clickable */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => window.open(job.url, '_blank', 'noopener')}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-[0.875rem] truncate">{job.company}</span>
                      {job.job_type && (
                        <span
                          className="shrink-0 text-[0.625rem] px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--v4-surface)', color: 'var(--v4-trace)' }}
                        >
                          {job.job_type}
                        </span>
                      )}
                    </div>
                    <div className="text-[0.8125rem] truncate" style={{ color: 'var(--v4-trace)' }}>
                      {job.title}
                    </div>
                    {job.posted_at && (
                      <div className="text-[0.625rem] mt-0.5" style={{ color: 'var(--v4-trace)' }}>
                        {relativeTime(job.posted_at)} · {job.source}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink size={13} style={{ color: 'var(--v4-trace)' }} />
                    </a>
                    {job.applied === 0 ? (
                      <button
                        onClick={() => markApplied(job.id, 1)}
                        disabled={applyingId === job.id}
                        className="text-[0.625rem] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--v4-green)', color: 'var(--v4-void)', opacity: applyingId === job.id ? 0.5 : 1 }}
                      >
                        Applied
                      </button>
                    ) : (
                      <button
                        onClick={() => markApplied(job.id, 0)}
                        disabled={applyingId === job.id}
                        className="text-[0.625rem] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--v4-surface)', color: 'var(--v4-trace)', opacity: applyingId === job.id ? 0.5 : 1 }}
                      >
                        <CheckCircle2 size={10} className="inline mr-0.5" />undo
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
