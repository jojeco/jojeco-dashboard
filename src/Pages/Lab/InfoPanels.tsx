/**
 * InfoPanels — the second row: Recent Alerts, Automation jobs,
 * AdGuard DNS stats, GDrive Backup status.
 */
import { useState } from 'react';
import { Bell, CheckCircle, XCircle, AlertTriangle, Shield, HardDrive, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NtfyAlert, AutomationJob } from '@/hooks/useSnapshot';

// ─── Types passed in ──────────────────────────────────────────────────────────

interface AdGuardStats { totalQueries: number; blockedQueries: number; blockedPercent: string; avgProcessingTime: string | null }
interface BackupStatus { lastRun: string | null; status: 'ok' | 'error' | 'unknown' | 'never'; message: string }

interface InfoPanelsProps {
  alerts: NtfyAlert[] | null;
  automation: AutomationJob[] | null;
  adguard: AdGuardStats | null;
  backup: BackupStatus | null;
}

// ─── Alerts Panel ────────────────────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: NtfyAlert[] | null }) {
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const list = alerts ?? [];

  return (
    <Card className="p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Bell size={13} style={{ color: 'var(--accent)' }} />
        <span className="j-panel-title">Recent Alerts</span>
        <span className="text-[10px] text-[var(--t3)] ml-auto">{list.length}</span>
      </div>
      <div className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
        {list.length === 0 ? (
          <div className="text-[11px] text-[var(--t3)] py-1">No recent alerts</div>
        ) : list.slice(0, 8).map(a => {
          const ago = Math.floor((Date.now() / 1000 - a.time) / 60);
          const agoStr = ago < 60 ? `${ago}m` : ago < 1440 ? `${Math.floor(ago / 60)}h` : `${Math.floor(ago / 1440)}d`;
          const prioColor = a.priority >= 4 ? 'var(--err)' : a.priority >= 3 ? 'var(--warn)' : 'var(--t3)';
          const isExpanded = expandedAlert === a.id;

          return (
            <div key={a.id} className="border-b border-[var(--line)]">
              <div
                onClick={() => setExpandedAlert(isExpanded ? null : a.id)}
                className="flex gap-1.5 text-[11px] leading-relaxed py-0.5 cursor-pointer items-start"
              >
                <span style={{ color: prioColor, flexShrink: 0, marginTop: 3, fontSize: 8 }}>●</span>
                <span className="text-[var(--t2)] flex-1 overflow-hidden" style={{ textOverflow: 'ellipsis', whiteSpace: isExpanded ? 'normal' : 'nowrap' }}>
                  {a.message}
                </span>
                <span className="text-[var(--t3)] shrink-0 text-[10px] font-mono ml-1">{agoStr}</span>
                {isExpanded ? <ChevronDown size={10} className="text-[var(--t3)] shrink-0 mt-0.5" /> : <ChevronRight size={10} className="text-[var(--t3)] shrink-0 mt-0.5" />}
              </div>
              {isExpanded && (
                <div className="text-[10px] text-[var(--t2)] bg-[var(--canvas)] rounded-md px-2 py-1.5 mb-1 break-words whitespace-pre-wrap leading-relaxed">
                  {a.title && <div className="font-semibold text-[var(--t1)] mb-0.5">{a.title}</div>}
                  {a.message}
                  {a.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {a.tags.map(tag => (
                        <span key={tag} className="text-[9px] bg-[var(--raised)] px-1 py-0.5 rounded text-[var(--t3)]">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Automation Panel ─────────────────────────────────────────────────────────

function AutomationPanel({ automation }: { automation: AutomationJob[] | null }) {
  const jobs = automation ?? [];

  return (
    <Card className="p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CheckCircle size={13} style={{ color: 'var(--ok)' }} />
        <span className="j-panel-title">Automation</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {jobs.length === 0 ? (
          <div className="text-[11px] text-[var(--t3)] py-1">Loading...</div>
        ) : jobs.map(job => (
          <div key={job.id} className="flex items-center gap-2 text-[11px]">
            {job.status === 'ok'
              ? <CheckCircle size={11} className="shrink-0" style={{ color: 'var(--ok)' }} />
              : job.status === 'error'
              ? <XCircle size={11} className="shrink-0" style={{ color: 'var(--err)' }} />
              : <AlertTriangle size={11} className="shrink-0 text-[var(--t3)]" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[var(--t1)]">{job.label}</div>
              <div className="text-[10px] text-[var(--t3)]">{job.schedule}</div>
            </div>
            <div className="text-right shrink-0">
              {job.lastRun ? (
                <span className="text-[10px] font-mono" style={{ color: job.status === 'error' ? 'var(--err)' : 'var(--t3)' }}>
                  {new Date(job.lastRun).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                </span>
              ) : <span className="text-[10px] text-[var(--t3)]">—</span>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── AdGuard Panel ────────────────────────────────────────────────────────────

function AdGuardPanel({ adguard }: { adguard: AdGuardStats | null }) {
  return (
    <Card className="p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Shield size={13} style={{ color: 'var(--accent)' }} />
        <span className="j-panel-title">AdGuard DNS</span>
      </div>
      {adguard ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-4">
            <div>
              <div className="text-[22px] font-bold font-mono text-[var(--t1)] leading-none">
                {adguard.totalQueries >= 1000 ? `${(adguard.totalQueries / 1000).toFixed(1)}k` : adguard.totalQueries}
              </div>
              <div className="text-[9px] text-[var(--t3)] mt-0.5">queries (24h)</div>
            </div>
            <div>
              <div className="text-[22px] font-bold font-mono leading-none" style={{ color: 'var(--err)' }}>
                {adguard.blockedPercent}%
              </div>
              <div className="text-[9px] text-[var(--t3)] mt-0.5">blocked</div>
            </div>
          </div>
          {adguard.avgProcessingTime && (
            <div className="text-[10px] text-[var(--t3)] font-mono">avg {adguard.avgProcessingTime}ms response</div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-[var(--t3)] py-1">Connecting...</div>
      )}
    </Card>
  );
}

// ─── GDrive Backup Panel ──────────────────────────────────────────────────────

function BackupPanel({ backup }: { backup: BackupStatus | null }) {
  return (
    <Card className="p-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <HardDrive size={13} style={{ color: 'var(--accent)' }} />
        <span className="j-panel-title">GDrive Backup</span>
        {backup && (
          <span
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: backup.status === 'ok' ? 'var(--ok-dim)' : backup.status === 'error' ? 'rgba(244,63,94,0.1)' : 'var(--raised)',
              color: backup.status === 'ok' ? 'var(--ok)' : backup.status === 'error' ? 'var(--err)' : 'var(--t3)',
            }}
          >
            {backup.status === 'ok' ? '● OK' : backup.status === 'error' ? '✕ Error' : '— Unknown'}
          </span>
        )}
      </div>
      {backup ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] text-[var(--t2)]">
            Last run:{' '}
            <span className="font-mono text-[var(--t1)]">{backup.lastRun ?? '—'}</span>
          </div>
          {backup.message && (
            <div
              className="text-[10px] text-[var(--t3)] font-mono bg-[var(--canvas)] rounded-md px-2 py-1.5 max-h-14 overflow-y-auto whitespace-pre-wrap break-all"
            >
              {backup.message.split('\n').slice(-4).join('\n')}
            </div>
          )}
        </div>
      ) : (
        <Skeleton className="h-10" />
      )}
    </Card>
  );
}

// ─── Composite export ──────────────────────────────────────────────────────────

export function InfoPanels({ alerts, automation, adguard, backup }: InfoPanelsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 20 }}>
      <AlertsPanel alerts={alerts} />
      <AutomationPanel automation={automation} />
      <AdGuardPanel adguard={adguard} />
      <BackupPanel backup={backup} />
    </div>
  );
}
