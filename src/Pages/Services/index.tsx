/**
 * ServicesPage (v3) — rebuilt with shadcn Card + design-system tokens.
 *
 * Design rules enforced:
 *  • Surface elevation only — no explicit border/borderColor on cards
 *  • Status stripe via inset box-shadow (j-card-err / shadow composition)
 *  • Hairline dividers: 1px solid var(--line) for structural separation only
 *  • Section labels: 10px uppercase t3, 0.08em tracking
 *  • Status color ONLY on status content (dots, labels, numbers)
 *  • All prominent numbers: tabular-nums, Geist Mono
 *  • Mobile-first: 2-column grid at 390px; horizontal tag scroll; safe-area padding
 *
 * Data (Phase 2): health from SSE snapshot (servicesHealth section), sparklines
 * via 30min poll (not in snapshot), services via serviceService.
 * Docker collapsible section via DockerSection (self-contained 8s poll).
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Search, Settings,
  Plus, Download, Lock, Server, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Service } from '@/types/service';
import { serviceService } from '@/services/serviceService';
import { ServiceModal } from '@/components/ServiceModal';
import { ImportExportModal } from '@/components/ImportExportModal';
import { PasswordChangeModal } from '@/components/PasswordChangeModal';
import { BaseModal } from '@/components/BaseModal';
import { type HealthStatus } from '@/hooks/useServiceHealth';
import { api } from '@/services/api';
import { useSnapshot } from '@/hooks/useSnapshot';
import { ServiceCard } from './ServiceCard';
import { DockerSection } from './DockerSection';

// ── Settings Modal ─────────────────────────────────────────────────────────────

function SettingsModal({
  isOpen, onClose, onPasswordChange,
}: { isOpen: boolean; onClose: () => void; onPasswordChange: () => void }) {
  const { currentUser } = useAuth();
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Settings" maxWidth="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {currentUser && (
          <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--line)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Signed in as</p>
            <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 12 }}>{currentUser.email}</p>
            <button
              onClick={() => { onClose(); onPasswordChange(); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '8px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Lock size={14} /> Change Password
            </button>
          </div>
        )}
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>Self-hosted service dashboard with real-time health monitoring.</p>
        <p style={{ fontSize: 11, color: 'var(--t3)', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          v2.0.0 · {new Date().toISOString().split('T')[0]}
        </p>
      </div>
    </BaseModal>
  );
}

// ── Tag chip ───────────────────────────────────────────────────────────────────

function TagChip({ tag, active, onClick }: { tag: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        border: 'none',
        boxShadow: active ? '0 0 0 1px var(--accent-border)' : 'var(--shadow-ring)',
        background: active ? 'var(--accent-dim)' : 'var(--raised)',
        color: active ? 'var(--accent)' : 'var(--t2)',
        transition: 'background 120ms, color 120ms, box-shadow 120ms',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
      {tag}
    </button>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}

// ── CollapsibleContainers ─────────────────────────────────────────────────────

function CollapsibleContainers() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 32, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: open ? 20 : 0 }}
      >
        {open
          ? <ChevronDown size={14} style={{ color: 'var(--t3)' }} />
          : <ChevronRight size={14} style={{ color: 'var(--t3)' }} />}
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Containers
        </span>
        {!open && <span style={{ fontSize: 11, color: 'var(--t3)' }}>click to expand</span>}
      </button>
      {open && <DockerSection />}
    </div>
  );
}

// ── ServicesPage ──────────────────────────────────────────────────────────────

const unknownHealth: HealthStatus = { status: 'unknown', checkedAt: new Date() };

export default function ServicesPage() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;

  const [searchTerm, setSearchTerm]           = useState('');
  const [selectedTags, setSelectedTags]       = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const [services, setServices] = useState<Service[]>(() => {
    try { const v = localStorage.getItem('cache_services'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [sparklines, setSparklines] = useState<Record<string, (number | null)[]>>({});

  // ── Health from SSE snapshot (replaces 60s setInterval) ─────────────────────
  const { data: snapshotData } = useSnapshot();
  const rawHealth = snapshotData?.servicesHealth ?? null;
  const healthMap: Record<string, HealthStatus> = useMemo(() => {
    if (!rawHealth) return {};
    const mapped: Record<string, HealthStatus> = {};
    for (const [id, h] of Object.entries(rawHealth)) {
      mapped[id] = { status: h.status as HealthStatus['status'], checkedAt: new Date(), responseTime: h.responseTime };
    }
    return mapped;
  }, [rawHealth]);
  const onlineCounts: Record<string, boolean> = useMemo(() => {
    const counts: Record<string, boolean> = {};
    for (const [id, h] of Object.entries(healthMap)) {
      counts[id] = h.status === 'online';
    }
    return counts;
  }, [healthMap]);

  // ── Service subscription ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = serviceService.subscribeToUserServices(s => {
      setServices(s);
      try { localStorage.setItem('cache_services', JSON.stringify(s)); } catch {}
    });
    return () => unsub();
  }, []);

  // ── Sparklines (30min poll — not in snapshot, low-frequency is fine) ─────────
  useEffect(() => {
    const fetchSpark = () => {
      api.get<Record<string, (number | null)[]>>('/health/sparklines')
        .then(data => setSparklines(data))
        .catch(() => {});
    };
    fetchSpark();
    const id = setInterval(fetchSpark, 30 * 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    services.forEach(s => s.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const matchSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchTags = selectedTags.size === 0 || s.tags?.some(t => selectedTags.has(t));
      return matchSearch && matchTags;
    });
  }, [services, searchTerm, selectedTags]);

  const pinnedServices  = filteredServices.filter(s => s.isPinned);
  const regularServices = filteredServices.filter(s => !s.isPinned);

  const onlineCount  = Object.values(onlineCounts).filter(Boolean).length;
  const totalTracked = Object.keys(onlineCounts).length;

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const handleSaveService = async (serviceData: Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (selectedService) {
      await serviceService.updateService(selectedService.id, serviceData);
    } else {
      await serviceService.createService(serviceData);
    }
  };

  const openEdit = (s: Service) => { setSelectedService(s); setServiceModalOpen(true); };
  const openAdd  = () => { setSelectedService(null); setServiceModalOpen(true); };

  // ── Status pill color ─────────────────────────────────────────────────────────
  const allUp  = totalTracked > 0 && onlineCount === totalTracked;
  const allDwn = totalTracked > 0 && onlineCount === 0;
  const statusPillColor = allUp ? 'var(--ok)' : allDwn ? 'var(--err)' : 'var(--warn)';
  const statusPillBg    = allUp ? 'rgba(34,197,94,0.08)' : allDwn ? 'rgba(239,68,68,0.08)' : 'rgba(234,179,8,0.08)';
  const statusDotClass  = allUp ? 'j-dot-ok' : allDwn ? 'j-dot-err' : 'j-dot-warn';

  return (
    <div>
      {/* Guest info banner */}
      {isGuest && (
        <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10, background: 'var(--accent-dim)', boxShadow: '0 0 0 1px var(--accent-border)', fontSize: 12, color: 'var(--t2)' }}>
          <strong style={{ color: 'var(--t1)' }}>Services</strong> — all self-hosted services with live health status. URLs hidden in guest view.
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--t1)', lineHeight: 1 }}>
          Services
        </h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, letterSpacing: '0.02em' }}>
          Self-hosted services · live health monitoring
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }} />
          <input
            type="text"
            placeholder="Search services…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9, background: 'var(--raised)', border: 'none', borderRadius: 8, fontSize: 13, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box', boxShadow: 'var(--shadow-ring)', transition: 'box-shadow 120ms' }}
            onFocus={e => (e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 2px var(--accent-border)'}
            onBlur={e => (e.currentTarget as HTMLInputElement).style.boxShadow = 'var(--shadow-ring)'}
          />
        </div>
        {/* Status + actions row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {totalTracked > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: statusPillBg, color: statusPillColor, boxShadow: `0 0 0 1px ${statusPillColor}33`, fontVariantNumeric: 'tabular-nums' }}>
              <span className={`j-dot ${statusDotClass}`} />
              {onlineCount}/{totalTracked} up
            </div>
          ) : <div />}
          {!isGuest && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={openAdd}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'opacity 120ms' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}>
                <Plus size={13} /> Add
              </button>
              <button onClick={() => setImportExportOpen(true)} title="Import / Export"
                style={{ padding: '6px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', transition: 'background 120ms, color 120ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}>
                <Download size={14} />
              </button>
              <button onClick={() => setSettingsOpen(true)} title="Settings"
                style={{ padding: '6px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', transition: 'background 120ms, color 120ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}>
                <Settings size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tag filter row — horizontal scroll, no scrollbar */}
      {allTags.length > 0 && (
        <div style={{ marginBottom: 16, overflowX: 'auto', marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }} className="scrollbar-none">
          <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
            {allTags.map(tag => (
              <TagChip key={tag} tag={tag} active={selectedTags.has(tag)} onClick={() => toggleTag(tag)} />
            ))}
          </div>
        </div>
      )}

      {/* Service grids */}
      <main>
        {/* Pinned */}
        {pinnedServices.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <SectionLabel>Pinned</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {pinnedServices.map(s => (
                <ServiceCard key={s.id} service={s} onEdit={openEdit} health={healthMap[s.id] ?? unknownHealth} isGuest={isGuest} sparkline={sparklines[s.id]} />
              ))}
            </div>
          </section>
        )}

        {/* All Services */}
        {regularServices.length > 0 && (
          <section>
            {pinnedServices.length > 0 && <SectionLabel>All Services</SectionLabel>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {regularServices.map(s => (
                <ServiceCard key={s.id} service={s} onEdit={openEdit} health={healthMap[s.id] ?? unknownHealth} isGuest={isGuest} sparkline={sparklines[s.id]} />
              ))}
            </div>
          </section>
        )}

        {/* Empty — no services at all */}
        {filteredServices.length === 0 && services.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            {isGuest ? (
              <p style={{ fontSize: 14, color: 'var(--t3)' }}>No services to display.</p>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'var(--t3)', marginBottom: 16 }}>No services yet!</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={async () => { await serviceService.seedDefaultServices(); serviceService.getUserServices().then(setServices); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <Server size={15} /> Load JojeCo Services
                  </button>
                  <button
                    onClick={openAdd}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--raised)', color: 'var(--t1)', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, boxShadow: 'var(--shadow-ring)' }}>
                    <Plus size={15} /> Add Manually
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Empty — filters applied, no match */}
        {filteredServices.length === 0 && services.length > 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ fontSize: 14, color: 'var(--t3)', marginBottom: 12 }}>No services match your filter.</p>
            <button onClick={() => { setSearchTerm(''); setSelectedTags(new Set()); }}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear filters
            </button>
          </div>
        )}
      </main>

      {/* Collapsible containers section */}
      <CollapsibleContainers />

      {/* Modals */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onPasswordChange={() => setPasswordChangeOpen(true)} />
      <PasswordChangeModal isOpen={passwordChangeOpen} onClose={() => setPasswordChangeOpen(false)} />
      <ServiceModal
        isOpen={serviceModalOpen}
        onClose={() => { setServiceModalOpen(false); setSelectedService(null); }}
        onSave={handleSaveService}
        onDelete={serviceService.deleteService.bind(serviceService)}
        service={selectedService}
      />
      <ImportExportModal
        isOpen={importExportOpen}
        onClose={() => setImportExportOpen(false)}
        onExport={serviceService.exportServices.bind(serviceService)}
        onImport={serviceService.importServices.bind(serviceService)}
      />
    </div>
  );
}
