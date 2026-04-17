import { useState, useEffect, useMemo } from 'react';
import {
  Search, Settings,
  ExternalLink,
  Plus, Download, Lock, Server,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Service } from '../types/service';
import { serviceService } from '../services/serviceService';
import { ServiceModal } from '../components/ServiceModal';
import { ImportExportModal } from '../components/ImportExportModal';
import { PasswordChangeModal } from '../components/PasswordChangeModal';
import { BaseModal } from '../components/BaseModal';
import { type HealthStatus } from '../hooks/useServiceHealth';
import { api } from '../services/api';
import { ICON_MAP } from '../utils/constants';

function TagChip({ tag, active, onClick }: { tag: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid', transition: 'all 120ms',
        background: active ? 'var(--accent-dim)' : 'var(--raised)',
        color: active ? 'var(--accent)' : 'var(--t2)',
        borderColor: active ? 'var(--accent-border)' : 'var(--line)',
      }}>
      {tag}
    </button>
  );
}

function ServiceCard({ service, onEdit, health, isGuest }: { service: Service; onEdit: (service: Service) => void; health: HealthStatus; isGuest?: boolean }) {
  const Icon = service.icon ? (ICON_MAP[service.icon] ?? Server) : Server;
  const bestUrl = isGuest ? null : (service.url || service.lanUrl);

  const dotClass = health.status === 'online' ? 'j-dot-ok' : health.status === 'offline' ? 'j-dot-err' : 'j-dot-off';
  const statusColor = health.status === 'online' ? 'var(--ok)' : health.status === 'offline' ? 'var(--err)' : 'var(--t3)';

  return (
    <div className="j-panel"
      style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, cursor: isGuest ? 'default' : 'pointer', transition: 'border-color 120ms',
        borderColor: health.status === 'offline' ? 'rgba(244,63,94,0.25)' : 'var(--line)' }}
      onClick={() => !isGuest && onEdit(service)}
      onMouseEnter={e => { if (!isGuest) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-border)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = health.status === 'offline' ? 'rgba(244,63,94,0.25)' : 'var(--line)'; }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ padding: 8, background: 'var(--raised)', borderRadius: 8, border: '1px solid var(--line)' }}>
          <Icon size={14} style={{ color: 'var(--t2)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {health.responseTime && (
            <span style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--t3)' }}>{health.responseTime}ms</span>
          )}
          <span className={`j-dot ${dotClass}`} style={health.status === 'online' ? { animation: 'pulseDot 2s ease-in-out infinite' } : {}} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</div>
        {service.description && (
          <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{service.description}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
        {service.tags && service.tags.slice(0, 2).map(tag => (
          <span key={tag} style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: 'var(--raised)', color: 'var(--t3)', border: '1px solid var(--line)' }}>
            {tag}
          </span>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>
            {health.status === 'online' ? 'Up' : health.status === 'offline' ? 'Down' : '—'}
          </span>
          {bestUrl && (
            <a href={bestUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--t3)', transition: 'color 120ms' }}
              onClick={e => e.stopPropagation()}
              onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)'}
              onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'var(--t3)'}>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  isOpen,
  onClose,
  onPasswordChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPasswordChange: () => void;
}) {
  const { currentUser } = useAuth();

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Settings" maxWidth="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {currentUser && (
          <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--line)' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', marginBottom: 4 }}>Signed in as</p>
            <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 12 }}>{currentUser.email}</p>
            <button
              onClick={() => { onClose(); onPasswordChange(); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '8px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              <Lock size={14} />
              Change Password
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

export default function Dashboard() {
  const { currentUser } = useAuth();
  const isGuest = !currentUser;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [services, setServices] = useState<Service[]>(() => {
    try { const v = localStorage.getItem('cache_services'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [onlineCounts, setOnlineCounts] = useState<Record<string, boolean>>({});
  const [healthMap, setHealthMap] = useState<Record<string, HealthStatus>>({});

  useEffect(() => {
    const unsubscribe = serviceService.subscribeToUserServices(s => {
      setServices(s);
      try { localStorage.setItem('cache_services', JSON.stringify(s)); } catch {}
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchHealth = () => {
      api.get<Record<string, { status: string; responseTime?: number }>>('/services/health')
        .then(data => {
          const mapped: Record<string, HealthStatus> = {};
          const counts: Record<string, boolean> = {};
          for (const [id, h] of Object.entries(data)) {
            mapped[id] = { status: h.status as HealthStatus['status'], checkedAt: new Date(), responseTime: h.responseTime };
            counts[id] = h.status === 'online';
          }
          setHealthMap(mapped);
          setOnlineCounts(counts);
        })
        .catch(() => {});
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 60_000);
    return () => clearInterval(id);
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    services.forEach(s => s.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const matchesSearch =
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTags =
        selectedTags.size === 0 || service.tags?.some(t => selectedTags.has(t));
      return matchesSearch && matchesTags;
    });
  }, [searchTerm, selectedTags, services]);

  const pinnedServices  = filteredServices.filter(s => s.isPinned);
  const regularServices = filteredServices.filter(s => !s.isPinned);

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

  const unknownHealth: HealthStatus = { status: 'unknown', checkedAt: new Date() };
  const onlineCount  = Object.values(onlineCounts).filter(Boolean).length;
  const totalTracked = Object.keys(onlineCounts).length;

  return (
    <div className="j-content">
      {isGuest && (
        <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', fontSize: 12, color: 'var(--t2)' }}>
          <strong style={{ color: 'var(--t1)' }}>Services</strong> — all self-hosted services with live health status. URLs hidden in guest view.
        </div>
      )}

      {/* Toolbar */}
      <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }} />
          <input
            type="text"
            placeholder="Search services…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 120ms' }}
            onFocus={e => (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-border)'}
            onBlur={e => (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--line)'}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {totalTracked > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: onlineCount === totalTracked ? 'rgba(16,185,129,0.08)' : onlineCount === 0 ? 'rgba(244,63,94,0.08)' : 'rgba(245,158,11,0.08)',
              color: onlineCount === totalTracked ? 'var(--ok)' : onlineCount === 0 ? 'var(--err)' : 'var(--warn)',
              border: `1px solid ${onlineCount === totalTracked ? 'rgba(16,185,129,0.2)' : onlineCount === 0 ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
              <span className={`j-dot ${onlineCount === totalTracked ? 'j-dot-ok' : onlineCount === 0 ? 'j-dot-err' : 'j-dot-warn'}`} />
              {onlineCount}/{totalTracked} up
            </div>
          ) : <div />}
          {!isGuest && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => { setSelectedService(null); setServiceModalOpen(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                <Plus size={13} /> Add
              </button>
              <button onClick={() => setImportExportOpen(true)}
                style={{ padding: 6, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', transition: 'background 120ms, color 120ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}>
                <Download size={14} />
              </button>
              <button onClick={() => setSettingsOpen(true)}
                style={{ padding: 6, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', transition: 'background 120ms, color 120ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--raised)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'; }}>
                <Settings size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div style={{ marginBottom: 16, overflowX: 'auto', marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }} className="scrollbar-none">
          <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
            {allTags.map(tag => (
              <TagChip key={tag} tag={tag} active={selectedTags.has(tag)} onClick={() => toggleTag(tag)} />
            ))}
          </div>
        </div>
      )}

      <main>
        {pinnedServices.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              Pinned
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {pinnedServices.map(service => (
                <ServiceCard key={service.id} service={service} onEdit={s => { setSelectedService(s); setServiceModalOpen(true); }} health={healthMap[service.id] ?? unknownHealth} isGuest={isGuest} />
              ))}
            </div>
          </section>
        )}

        {regularServices.length > 0 && (
          <section>
            {pinnedServices.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                All Services
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {regularServices.map(service => (
                <ServiceCard key={service.id} service={service} onEdit={s => { setSelectedService(s); setServiceModalOpen(true); }} health={healthMap[service.id] ?? unknownHealth} isGuest={isGuest} />
              ))}
            </div>
          </section>
        )}

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
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                    <Server size={16} /> Load JojeCo Services
                  </button>
                  <button
                    onClick={() => { setSelectedService(null); setServiceModalOpen(true); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--raised)', color: 'var(--t1)', borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                    <Plus size={16} /> Add Manually
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {filteredServices.length === 0 && services.length > 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ fontSize: 14, color: 'var(--t3)', marginBottom: 12 }}>No services match your filter.</p>
            <button onClick={() => { setSearchTerm(''); setSelectedTags(new Set()); }}
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear filters
            </button>
          </div>
        )}
      </main>

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
