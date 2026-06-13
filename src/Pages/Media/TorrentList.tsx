import { useState } from 'react';
import { Download, Plus, Play, Pause, Trash2, RotateCcw, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Torrent, TorrentTab } from './types';
import { fmt, fmtEta, stateColor, barColor, classifyTab, STATE_LABELS } from './utils';
import { getToken } from '@/services/api';

const API = '/api';

interface TorrentListProps {
  torrents: Torrent[];
  loading: boolean;
  error: string | null;
  isGuest: boolean;
  onRefresh: () => void;
}

function ActionBtn({
  onClick, title, color, children,
}: { onClick: () => void; title: string; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
        borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
        background: `${color}14`, color,
        minHeight: 32,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

/** Windowed paginator — shows at most 5 page buttons centred around current page. */
function Paginator({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;

  // Build a window of up to 5 page numbers centered on current page
  const WINDOW = 5;
  let start = Math.max(1, page - Math.floor(WINDOW / 2));
  const end = Math.min(pages, start + WINDOW - 1);
  if (end - start < WINDOW - 1) start = Math.max(1, end - WINDOW + 1);
  const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const btnBase = { padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', cursor: 'pointer' as const };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{ ...btnBase, color: page === 1 ? 'var(--t3)' : 'var(--t2)', cursor: page === 1 ? 'default' : 'pointer' }}>‹</button>
      {start > 1 && <span style={{ fontSize: 11, color: 'var(--t3)', padding: '0 2px' }}>…</span>}
      {pageNums.map(p => (
        <button key={p} onClick={() => onPage(p)}
          style={{ ...btnBase, border: `1px solid ${p === page ? 'var(--accent-border)' : 'var(--line)'}`, background: p === page ? 'var(--accent-dim)' : 'var(--raised)', color: p === page ? 'var(--accent)' : 'var(--t2)' }}>
          {p}
        </button>
      ))}
      {end < pages && <span style={{ fontSize: 11, color: 'var(--t3)', padding: '0 2px' }}>…</span>}
      <button onClick={() => onPage(page + 1)} disabled={page === pages}
        style={{ ...btnBase, color: page === pages ? 'var(--t3)' : 'var(--t2)', cursor: page === pages ? 'default' : 'pointer' }}>›</button>
    </div>
  );
}

export function TorrentList({ torrents, loading, error, isGuest, onRefresh }: TorrentListProps) {
  const [tab, setTab] = useState<TorrentTab>('active');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addUrl, setAddUrl] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [confirmDelete, setConfirmDelete] = useState<{ hashes: string[]; label: string } | null>(null);

  const activeTorrents = torrents
    .filter(t => classifyTab(t) === 'active')
    .sort((a, b) => { const ga = a.state === 'downloading' ? 0 : 1, gb = b.state === 'downloading' ? 0 : 1; return ga !== gb ? ga - gb : b.progress - a.progress; });
  const doneTorrents = torrents.filter(t => classifyTab(t) === 'done').sort((a, b) => b.progress - a.progress);
  const errorTorrents = torrents.filter(t => classifyTab(t) === 'error');
  const tabData: Record<TorrentTab, Torrent[]> = { active: activeTorrents, done: doneTorrents, error: errorTorrents };
  const current = tabData[tab];
  const sel = Array.from(selected).filter(h => current.some(t => t.hash === h));
  const pages = Math.ceil(current.length / perPage);
  const pageStart = (page - 1) * perPage;
  const pageItems = current.slice(pageStart, pageStart + perPage);

  const switchTab = (t: TorrentTab) => { setTab(t); setSelected(new Set()); setPage(1); };

  const act = async (action: string, hashes: string[], extra?: Record<string, unknown>) => {
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    await fetch(`${API}/torrents/${action}`, { method: 'POST', headers: h, body: JSON.stringify({ hashes, ...extra }) });
    setTimeout(onRefresh, 800);
  };

  const addTorrent = async () => {
    if (!addUrl.trim()) return;
    const h = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    await fetch(`${API}/torrents/add`, { method: 'POST', headers: h, body: JSON.stringify({ urls: addUrl.trim() }) });
    setAddUrl(''); setShowAdd(false); setTimeout(onRefresh, 1500);
  };

  const toggle = (hash: string) => setSelected(p => { const n = new Set(p); n.has(hash) ? n.delete(hash) : n.add(hash); return n; });
  const toggleAll = (hashes: string[]) => {
    const allSel = hashes.every(h => selected.has(h));
    setSelected(new Set(allSel ? [] : hashes));
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--t3)', fontSize: 13 }}>Loading…</div>
  );
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--err)', fontSize: 13 }}>{error}</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--line)', paddingBottom: 0 }}>
        {([
          { key: 'active' as TorrentTab, label: 'In Progress', count: activeTorrents.length },
          { key: 'done'   as TorrentTab, label: 'Completed',   count: doneTorrents.length  },
          { key: 'error'  as TorrentTab, label: 'Errors',      count: errorTorrents.length },
        ]).map(({ key, label, count }) => (
          <button key={key} onClick={() => switchTab(key)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500, border: 'none', borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, cursor: 'pointer', background: 'none', color: tab === key ? 'var(--accent)' : 'var(--t3)', transition: 'color 120ms', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            {label}
            {count > 0 && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, fontWeight: 600, background: tab === key ? 'var(--accent-dim)' : 'var(--raised)', color: tab === key ? 'var(--accent)' : 'var(--t3)', boxShadow: tab === key ? '0 0 0 1px var(--accent-border)' : 'var(--shadow-ring)' }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
          style={{ fontSize: 11, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--raised)', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit' }}>
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
        </select>

        {!isGuest && (
          <button onClick={() => setShowAdd(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, minHeight: 32, fontFamily: 'inherit' }}>
            <Plus size={13} /> Add
          </button>
        )}

        {current.length > 0 && !isGuest && (
          <button onClick={() => toggleAll(current.map(t => t.hash))}
            style={{ padding: '6px 10px', fontSize: 11, background: 'var(--raised)', color: 'var(--t2)', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit' }}>
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
            <ActionBtn
              onClick={() => setConfirmDelete({ hashes: sel, label: `${sel.length} torrent${sel.length > 1 ? 's' : ''}` })}
              title="Remove" color="var(--err)">
              <Trash2 size={11} /> Remove
            </ActionBtn>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{sel.length} selected</span>
          </>
        )}

        <button onClick={onRefresh} style={{ marginLeft: 'auto', padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Add torrent form */}
      {showAdd && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={addUrl}
            onChange={e => setAddUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTorrent()}
            placeholder="Magnet link or .torrent URL…"
            style={{ flex: 1, minWidth: 0, padding: '8px 12px', background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--t1)', outline: 'none', transition: 'border-color 120ms', fontFamily: 'inherit' }}
            onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-border)'; }}
            onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--line)'; }}
          />
          <button onClick={addTorrent} style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit' }}>Add</button>
          <button onClick={() => setShowAdd(false)} style={{ padding: '8px 10px', background: 'none', color: 'var(--t3)', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
        </div>
      )}

      {/* Torrent list */}
      {current.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t3)' }}>
          <Download size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
          <p style={{ fontSize: 12 }}>{tab === 'active' ? 'No active downloads' : tab === 'done' ? 'No completed torrents' : 'No errors'}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pageItems.map(t => (
              <div
                key={t.hash}
                onClick={() => toggle(t.hash)}
                className="j-panel"
                style={{
                  padding: 14, cursor: 'pointer', transition: 'box-shadow 120ms',
                  boxShadow: selected.has(t.hash)
                    ? '0 0 0 1px var(--accent-border), var(--shadow-card)'
                    : t.state === 'error' ? '0 0 0 1px rgba(239,68,68,0.3), var(--shadow-card)' : undefined,
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div style={{ fontSize: 11, marginTop: 2, color: stateColor(t.state) }}>{STATE_LABELS[t.state] || t.state}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--t2)' }}>{fmt(t.size, '—')}</div>
                    {t.state === 'downloading' && <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--accent)' }}>{fmtEta(t.eta)}</div>}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="j-bar-track" style={{ marginBottom: 8 }}>
                  <div className="j-bar-fill" style={{ width: `${(t.progress * 100).toFixed(1)}%`, background: barColor(tab) }} />
                </div>

                {/* Speed row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, minWidth: 0 }}>
                  <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--t3)', flexShrink: 0 }}>{(t.progress * 100).toFixed(1)}%</span>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
                    {t.dlspeed > 0 && <span style={{ color: 'var(--accent)', fontFamily: 'Geist Mono, monospace' }}>↓ {fmt(t.dlspeed, '0 B')}/s</span>}
                    {t.upspeed > 0 && <span style={{ color: 'var(--ok)', fontFamily: 'Geist Mono, monospace' }}>↑ {fmt(t.upspeed, '0 B')}/s</span>}
                    <span style={{ color: 'var(--t3)' }}>🌱 {t.num_seeds}/{t.num_leechs}</span>
                  </div>
                </div>

                {/* Per-row actions */}
                <div
                  style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}
                  onClick={e => e.stopPropagation()}
                >
                  {tab === 'active' && (
                    t.state.startsWith('paused') || t.state === 'stalledDL'
                      ? <ActionBtn onClick={() => act('resume', [t.hash])} title="Resume" color="var(--ok)"><Play size={10} /> Resume</ActionBtn>
                      : <ActionBtn onClick={() => act('pause', [t.hash])} title="Pause" color="var(--warn)"><Pause size={10} /> Pause</ActionBtn>
                  )}
                  <ActionBtn onClick={() => act('recheck', [t.hash])} title="Recheck" color="var(--t3)"><RotateCcw size={10} /> Recheck</ActionBtn>
                  <div style={{ marginLeft: 'auto' }}>
                    <ActionBtn
                      onClick={() => setConfirmDelete({ hashes: [t.hash], label: 'this torrent' })}
                      title="Remove" color="var(--err)">
                      <Trash2 size={10} /> Remove
                    </ActionBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Paginator page={page} pages={pages} onPage={p => { setPage(p); setSelected(new Set()); }} />
        </>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove torrent?"
        description={`Remove ${confirmDelete?.label ?? 'this torrent'}? The files will NOT be deleted.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmDelete) { act('delete', confirmDelete.hashes, { deleteFiles: false }); setSelected(new Set()); }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
