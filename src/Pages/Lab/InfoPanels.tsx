/**
 * InfoPanels — the second row: Recent Alerts, Automation jobs,
 * AdGuard DNS stats, GDrive Backup status.
 * Dark-control-room surface language: elevated surface, no light borders.
 */
import { useState } from 'react';
import { Bell, CheckCircle, XCircle, AlertTriangle, Shield, HardDrive, ChevronDown, ChevronRight } from 'lucide-react';
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

// ─── Panel shell — same surface as MachineCard/AINodeCard ────────────────────

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--r-lg)',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  boxShadow: 'var(--shadow-ring), var(--shadow-card)',
  minWidth: 0,
  overflow: 'hidden',
};

function PanelHeader({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      {icon}
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--t3)' }}>
        {title}
      </span>
      {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  );
}

// ─── Alerts Panel ────────────────────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: NtfyAlert[] | null }) {
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const list = alerts ?? [];

  return (
    <div style={panelStyle}>
      <PanelHeader
        icon={<Bell size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
        title="Recent Alerts"
        right={<span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>{list.length}</span>}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 168, overflowY: 'auto' }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t3)', paddingTop: 4, paddingBottom: 4 }}>No recent alerts</div>
        ) : list.slice(0, 8).map(a => {
          const ago = Math.floor((Date.now() / 1000 - a.time) / 60);
          const agoStr = ago < 60 ? `${ago}m` : ago < 1440 ? `${Math.floor(ago / 60)}h` : `${Math.floor(ago / 1440)}d`;
          const prioColor = a.priority >= 4 ? 'var(--err)' : a.priority >= 3 ? 'var(--warn)' : 'var(--t3)';
          const isExpanded = expandedAlert === a.id;

          return (
            <div key={a.id} style={{ borderBottom: '1px solid var(--line)' }}>
              <div
                onClick={() => setExpandedAlert(isExpanded ? null : a.id)}
                style={{ display: 'flex', gap: 6, fontSize: 11, lineHeight: '1.5', paddingTop: 5, paddingBottom: 5, cursor: 'pointer', alignItems: 'flex-start' }}
              >
                <span style={{ color: prioColor, flexShrink: 0, marginTop: 3, fontSize: 7 }}>●</span>
                <span style={{ color: 'var(--t2)', flex: 1, overflow: 'hidden', textOverflow: isExpanded ? 'unset' : 'ellipsis', whiteSpace: isExpanded ? 'normal' : 'nowrap' }}>
                  {a.message}
                </span>
                <span style={{ color: 'var(--t3)', flexShrink: 0, fontSize: 10, fontFamily: 'Geist Mono, monospace', marginLeft: 4 }}>{agoStr}</span>
                {isExpanded
                  ? <ChevronDown size={9} style={{ color: 'var(--t3)', flexShrink: 0, marginTop: 3 }} />
                  : <ChevronRight size={9} style={{ color: 'var(--t3)', flexShrink: 0, marginTop: 3 }} />}
              </div>
              {isExpanded && (
                <div style={{ fontSize: 10, color: 'var(--t2)', background: 'var(--canvas)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 6, wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {a.title && <div style={{ fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>{a.title}</div>}
                  {a.message}
                  {a.tags.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {a.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 9, background: 'var(--raised)', padding: '2px 6px', borderRadius: 4, color: 'var(--t3)' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Automation Panel ─────────────────────────────────────────────────────────

function AutomationPanel({ automation }: { automation: AutomationJob[] | null }) {
  const jobs = automation ?? [];

  return (
    <div style={panelStyle}>
      <PanelHeader
        icon={<CheckCircle size={12} style={{ color: 'var(--ok)', flexShrink: 0 }} />}
        title="Automation"
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {jobs.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t3)', paddingTop: 4 }}>Loading...</div>
        ) : jobs.map(job => (
          <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            {job.status === 'ok'
              ? <CheckCircle size={11} style={{ color: 'var(--ok)', flexShrink: 0 }} />
              : job.status === 'error'
              ? <XCircle size={11} style={{ color: 'var(--err)', flexShrink: 0 }} />
              : <AlertTriangle size={11} style={{ color: 'var(--t3)', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.label}</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{job.schedule}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {job.lastRun ? (
                <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: job.status === 'error' ? 'var(--err)' : 'var(--t3)' }}>
                  {new Date(job.lastRun).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                </span>
              ) : <span style={{ fontSize: 10, color: 'var(--t3)' }}>—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AdGuard Panel ────────────────────────────────────────────────────────────

function AdGuardPanel({ adguard }: { adguard: AdGuardStats | null }) {
  return (
    <div style={panelStyle}>
      <PanelHeader
        icon={<Shield size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
        title="AdGuard DNS"
      />
      {adguard ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 700, fontFamily: 'Geist Mono, monospace', color: 'var(--t1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {adguard.totalQueries >= 1000 ? `${(adguard.totalQueries / 1000).toFixed(1)}k` : adguard.totalQueries}
              </div>
              <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 3, letterSpacing: '0.04em' }}>queries / 24h</div>
            </div>
            <div>
              <div style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 700, fontFamily: 'Geist Mono, monospace', color: 'var(--err)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {adguard.blockedPercent}%
              </div>
              <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 3, letterSpacing: '0.04em' }}>blocked</div>
            </div>
          </div>
          {adguard.avgProcessingTime && (
            <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace' }}>avg {adguard.avgProcessingTime}ms response</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--t3)', paddingTop: 4 }}>Connecting...</div>
      )}
    </div>
  );
}

// ─── GDrive Backup Panel ──────────────────────────────────────────────────────

function BackupPanel({ backup }: { backup: BackupStatus | null }) {
  const statusStyle = backup ? {
    ok:      { background: 'var(--ok-dim)',  color: 'var(--ok)' },
    error:   { background: 'var(--err-dim)', color: 'var(--err)' },
    unknown: { background: 'var(--raised)',  color: 'var(--t3)' },
    never:   { background: 'var(--raised)',  color: 'var(--t3)' },
  }[backup.status] : null;

  return (
    <div style={panelStyle}>
      <PanelHeader
        icon={<HardDrive size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
        title="GDrive Backup"
        right={backup && statusStyle ? (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, ...statusStyle }}>
            {backup.status === 'ok' ? '● OK' : backup.status === 'error' ? '✕ Error' : '— Unknown'}
          </span>
        ) : null}
      />
      {backup ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>
            Last run: <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--t1)', fontSize: 11 }}>{backup.lastRun ?? '—'}</span>
          </div>
          {backup.message && (
            <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'Geist Mono, monospace', background: 'var(--canvas)', borderRadius: 'var(--r-sm)', padding: '8px 10px', maxHeight: 56, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
              {backup.message.split('\n').slice(-4).join('\n')}
            </div>
          )}
        </div>
      ) : (
        <Skeleton className="h-10 mt-1" />
      )}
    </div>
  );
}

// ─── Composite export ──────────────────────────────────────────────────────────

export function InfoPanels({ alerts, automation, adguard, backup }: InfoPanelsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 20 }}>
      <AlertsPanel alerts={alerts} />
      <AutomationPanel automation={automation} />
      <AdGuardPanel adguard={adguard} />
      <BackupPanel backup={backup} />
    </div>
  );
}
