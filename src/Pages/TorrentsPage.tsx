import { useState, useEffect, useCallback } from 'react';
import { Download, Upload, Plus, Play, Pause, Trash2, RotateCcw, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { getToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const API = '/api';

interface Torrent {
  hash: string; name: string; state: string; progress: number;
  dlspeed: number; upspeed: number; size: number; eta: number;
  num_seeds: number; num_leechs: number;
}
interface TransferInfo {
  connection_status: string; dl_info_speed: number; up_info_speed: number; dl_info_data: number; up_info_data: number;
}

function fmt(b: number) {
  if (!b) return '0 B';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}
function fmtEta(s: number) {
  if (s < 0 || s > 604800) return '∞';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function stateColor(s: string): string {
  if (['downloading', 'metaDL', 'allocating'].includes(s)) return 'var(--accent)';
  if (['uploading', 'stalledUP', 'queuedUP', 'forcedUP'].includes(s)) return 'var(--ok)';
  if (s.startsWith('paused')) return 'var(--warn)';
  if (['error', 'missingFiles'].includes(s)) return 'var(--err)';
  return 'var(--t3)';
}
function barColor(tab: Tab): string {
  if (tab === 'done') return 'var(--ok)';
  if (tab === 'error') return 'var(--err)';
  return 'var(--accent)';
}
const STATE_LABELS: Record<string, string> = {
  downloading: 'Downloading', uploading: 'Seeding', pausedDL: 'Paused', pausedUP: 'Done (seeding paused)',
  stalledDL: 'Stalled', stalledUP: 'Seeding (idle)', queuedDL: 'Queued', checkingDL: 'Checking',
  error: 'Error', missingFiles: 'Missing files', allocating: 'Allocating', metaDL: 'Fetching metadata',
  forcedUP: 'Force seeding',
};

type Tab = 'active' | 'done' | 'error';

function classifyTab(t: Torrent): Tab {
  if (['error', 'missingFiles'].includes(t.state)) return 'error';
  if (['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(t.state) || t.progress >= 1) return 'done';
  return 'active';
}

function ActionBtn({ onClick, title, color, children }: { onClick: () => void; title: string; color: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
        background: `${color}14`, color }}>
      {children}
    </button>
  );
}

export default function TorrentsPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [transfer, setTransfer] = useState<TransferInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addUrl, setAddUrl] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('active');

  const refresh = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    try {
      const [tRes, xRes] = await Promise.all([
        fetch(`${API}/torrents/list`, { headers: h }),
        fetch(`${API}/torrents/transfer`, { headers: h }),
      ]);
      if (tRes.ok) setTorrents(await tRes.json());
      if (xRes.ok) setTransfer(await xRes.json());
      setError(null);
    } catch { setError('Cannot reach API'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);

  const switchTab = (t: Tab) => { setTab(t); setSelected(new Set()); };

  const act = async (action: string, hashes: string[], extra?: Record<string, unknown>) => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    await fetch(`${API}/torrents/${action}`, { method: 'POST', headers: h, body: JSON.stringify({ hashes, ...extra }) });
    setTimeout(refresh, 800);
  };

  const addTorrent = async () => {
    if (!addUrl.trim()) return;
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    await fetch(`${API}/torrents/add`, { method: 'POST', headers: h, body: JSON.stringify({ urls: addUrl.trim() }) });
    setAddUrl(''); setShowAdd(false); setTimeout(refresh, 1500);
  };

  const toggle = (hash: string) => setSelected(p => { const n = new Set(p); n.has(hash) ? n.delete(hash) : n.add(hash); return n; });
  const toggleAll = (hashes: string[]) => {
    const allSelected = hashes.every(h => selected.has(h));
    setSelected(new Set(allSelected ? [] : hashes));
  };

  const activeTorrents = torrents.filter(t => classifyTab(t) === 'active')
    .sort((a, b) => { const ga = a.state === 'downloading' ? 0 : 1, gb = b.state === 'downloading' ? 0 : 1; return ga !== gb ? ga - gb : b.progress - a.progress; });
  const doneTorrents = torrents.filter(t => classifyTab(t) === 'done').sort((a, b) => b.progress - a.progress);
  const errorTorrents = torrents.filter(t => classifyTab(t) === 'error');

  const tabData: Record<Tab, Torrent[]> = { active: activeTorrents, done: doneTorrents, error: errorTorrents };
  const current = tabData[tab];
  const sel = Array.from(selected).filter(h => current.some(t => t.hash === h));

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: 'var(--t3)', fontSize: 13 }}>Loading...</div>;
  if (error) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, color: 'var(--err)', fontSize: 13 }}>{error}</div>;

  return (
    <div className="j-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isGuest && (
        <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', fontSize: 12, color: 'var(--t2)' }}>
          <strong style={{ color: 'var(--t1)' }}>Torrents</strong> — active download queue via qBittorrent. Queue management requires sign-in.
        </div>
      )}

      {/* Transfer stats */}
      {transfer && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { icon: Download, label: 'Download', val: fmt(transfer.dl_info_speed) + '/s', color: 'var(--accent)' },
            { icon: Upload, label: 'Upload', val: fmt(transfer.up_info_speed) + '/s', color: 'var(--ok)' },
            { icon: Download, label: 'Session DL', val: fmt(transfer.dl_info_data), color: 'var(--t3)' },
          ].map(({ icon: Icon, label, val, color }) => (
            <div key={label} className="j-panel" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon size={12} style={{ color }} />
                <span style={{ fontSize: 10, color: 'var(--t3)' }}>{label}</span>
              </div>
              <div style={{ fontSize: 20, fontFamily: 'Geist Mono, monospace', fontWeight: 700, color: 'var(--t1)' }}>{val}</div>
            </div>
          ))}
          <div className="j-panel" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              {transfer.connection_status === 'connected'
                ? <Wifi size={12} style={{ color: 'var(--ok)' }} />
                : <WifiOff size={12} style={{ color: 'var(--warn)' }} />}
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>VPN</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', textTransform: 'capitalize' }}>{transfer.connection_status}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--line)', paddingBottom: 0 }}>
        {([
          { key: 'active' as Tab, label: 'In Progress', count: activeTorrents.length },
          { key: 'done' as Tab, label: 'Completed', count: doneTorrents.length },
          { key: 'error' as Tab, label: 'Errors', count: errorTorrents.length },
        ]).map(({ key, label, count }) => (
          <button key={key} onClick={() => switchTab(key)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500, border: 'none', borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, cursor: 'pointer', background: 'none', color: tab === key ? 'var(--accent)' : 'var(--t3)', transition: 'color 120ms', display: 'flex', alignItems: 'center', gap: 6 }}>
            {label}
            {count > 0 && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600,
                background: tab === key ? 'var(--accent-dim)' : 'var(--raised)',
                color: tab === key ? 'var(--accent)' : 'var(--t3)',
                border: `1px solid ${tab === key ? 'var(--accent-border)' : 'var(--line)'}` }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {!isGuest && (
          <button onClick={() => setShowAdd(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            <Plus size={13} /> Add
          </button>
        )}
        {current.length > 0 && !isGuest && (
          <button onClick={() => toggleAll(current.map(t => t.hash))}
            style={{ padding: '6px 10px', fontSize: 11, background: 'var(--raised)', color: 'var(--t2)', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer' }}>
            {current.every(t => selected.has(t.hash)) ? 'Deselect all' : 'Select all'}
          </button>
        )}
        {sel.length > 0 && (
          <>
            {tab === 'active' && (
              <>
                <ActionBtn onClick={() => act('resume', sel)} title="Resume" color="var(--ok)"><Play size={11} /> Resume</ActionBtn>
                <ActionBtn onClick={() => act('pause', sel)} title="Pause" color="var(--warn)"><Pause size={11} /> Pause</ActionBtn>
              </>
            )}
            {tab === 'done' && (
              <ActionBtn onClick={() => act('resume', sel)} title="Re-seed" color="var(--ok)"><Play size={11} /> Re-seed</ActionBtn>
            )}
            <ActionBtn onClick={() => act('recheck', sel)} title="Recheck" color="var(--t2)"><RotateCcw size={11} /> Recheck</ActionBtn>
            <ActionBtn onClick={() => { if (confirm(`Remove ${sel.length} torrent(s)?`)) { act('delete', sel, { deleteFiles: false }); setSelected(new Set()); } }} title="Remove" color="var(--err)">
              <Trash2 size={11} /> Remove
            </ActionBtn>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{sel.length} selected</span>
          </>
        )}
        <button onClick={refresh} style={{ marginLeft: 'auto', padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={addUrl} onChange={e => setAddUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTorrent()}
            placeholder="Magnet link or .torrent URL…"
            style={{ flex: 1, padding: '8px 12px', background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--t1)', outline: 'none', transition: 'border-color 120ms' }}
            onFocus={e => (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-border)'}
            onBlur={e => (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--line)'}
          />
          <button onClick={addTorrent} style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Add</button>
          <button onClick={() => setShowAdd(false)} style={{ padding: '8px 10px', background: 'none', color: 'var(--t3)', border: 'none', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
        </div>
      )}

      {/* Torrent list */}
      {current.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--t3)' }}>
          <Download size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
          <p style={{ fontSize: 13 }}>{tab === 'active' ? 'No active downloads' : tab === 'done' ? 'No completed torrents' : 'No errors'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {current.map(t => (
            <div key={t.hash} onClick={() => toggle(t.hash)} className="j-panel"
              style={{ padding: 14, cursor: 'pointer', transition: 'border-color 120ms',
                borderColor: selected.has(t.hash) ? 'var(--accent)' : t.state === 'error' ? 'rgba(244,63,94,0.3)' : 'var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                  <div style={{ fontSize: 11, marginTop: 2, color: stateColor(t.state) }}>{STATE_LABELS[t.state] || t.state}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--t2)' }}>{fmt(t.size)}</div>
                  {t.state === 'downloading' && <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--accent)' }}>{fmtEta(t.eta)}</div>}
                </div>
              </div>
              <div className="j-bar-track" style={{ marginBottom: 8 }}>
                <div className="j-bar-fill" style={{ width: `${(t.progress * 100).toFixed(1)}%`, background: barColor(tab) }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--t3)' }}>{(t.progress * 100).toFixed(1)}%</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  {t.dlspeed > 0 && <span style={{ color: 'var(--accent)' }}>↓ {fmt(t.dlspeed)}/s</span>}
                  {t.upspeed > 0 && <span style={{ color: 'var(--ok)' }}>↑ {fmt(t.upspeed)}/s</span>}
                  <span style={{ color: 'var(--t3)' }}>🌱 {t.num_seeds}/{t.num_leechs}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
                {tab === 'active' && (
                  t.state.startsWith('paused') || t.state === 'stalledDL'
                    ? <ActionBtn onClick={() => act('resume', [t.hash])} title="Resume" color="var(--ok)"><Play size={10} /> Resume</ActionBtn>
                    : <ActionBtn onClick={() => act('pause', [t.hash])} title="Pause" color="var(--warn)"><Pause size={10} /> Pause</ActionBtn>
                )}
                <ActionBtn onClick={() => act('recheck', [t.hash])} title="Recheck" color="var(--t3)"><RotateCcw size={10} /> Recheck</ActionBtn>
                <div style={{ marginLeft: 'auto' }}>
                  <ActionBtn onClick={() => { if (confirm('Remove torrent?')) act('delete', [t.hash], { deleteFiles: false }); }} title="Remove" color="var(--err)">
                    <Trash2 size={10} /> Remove
                  </ActionBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
