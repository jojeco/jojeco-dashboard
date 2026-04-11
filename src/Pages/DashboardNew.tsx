import { useState, useEffect, useMemo } from 'react';
import {
  Search, Settings,
  ExternalLink, Clock,
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

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

function StatusDot({ status }: { status: HealthStatus['status'] }) {
  const cls = {
    online:  'bg-emerald-500',
    offline: 'bg-red-500',
    unknown: 'bg-gray-400',
  }[status];
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls} ${status === 'online' ? 'animate-pulse' : ''}`} />;
}

function TagChip({ tag, active, onClick }: { tag: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {tag}
    </button>
  );
}

function ServiceRow({ service, onEdit, health, isGuest }: { service: Service; onEdit: (service: Service) => void; health: HealthStatus; isGuest?: boolean }) {
  const Icon = service.icon ? (ICON_MAP[service.icon] ?? Server) : Server;
  const bestUrl = isGuest ? null : (service.url || service.lanUrl);

  const statusText = {
    online:  'Up',
    offline: 'Down',
    unknown: 'Unknown',
  }[health.status];

  const statusColor = {
    online:  'text-emerald-600 dark:text-emerald-400',
    offline: 'text-red-600 dark:text-red-400',
    unknown: 'text-gray-500 dark:text-gray-400',
  }[health.status];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${isGuest ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer'}`}
      onClick={() => !isGuest && onEdit(service)}
    >
      {/* Status dot */}
      <StatusDot status={health.status} />

      {/* Icon */}
      <div className={`p-1.5 ${service.color ?? 'bg-gray-500'} bg-opacity-15 dark:bg-opacity-25 rounded-md shrink-0`}>
        <Icon className="w-3.5 h-3.5" />
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">{service.name}</span>
        {service.description && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{service.description}</span>
        )}
      </div>

      {/* Tags */}
      {service.tags && service.tags.length > 0 && (
        <div className="hidden sm:flex gap-1 shrink-0">
          {service.tags.slice(0, 2).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Response time */}
      {health.responseTime && (
        <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 hidden md:flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {health.responseTime}ms
        </span>
      )}

      {/* Status label */}
      <span className={`text-xs font-semibold shrink-0 w-14 text-right ${statusColor}`}>{statusText}</span>

      {/* External link */}
      {bestUrl && (
        <a
          href={bestUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-blue-500 transition-colors shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

// ============================================================================
// SETTINGS MODAL
// ============================================================================

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
      <div className="space-y-4">
        {currentUser && (
          <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Signed in as</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{currentUser.email}</p>
            <button
              onClick={() => { onClose(); onPasswordChange(); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors w-full justify-center"
            >
              <Lock className="w-4 h-4" />
              Change Password
            </button>
          </div>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Self-hosted service dashboard with real-time health monitoring.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
          v2.0.0 · {new Date().toISOString().split('T')[0]}
        </p>
      </div>
    </BaseModal>
  );
}

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

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

  // Server-side health checks — API can reach LAN services, browser can't
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
    <div className="px-4 py-6">
      {/* Guest info */}
      {isGuest && (
        <div className="mb-5 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Services</span> — all self-hosted services running in the lab with live health status. Service URLs and internal addresses are hidden in guest view.
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search services…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {totalTracked > 0 && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              onlineCount === totalTracked ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : onlineCount === 0 ? 'bg-red-500/10 text-red-700 dark:text-red-300'
              : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${onlineCount === totalTracked ? 'bg-emerald-500' : onlineCount === 0 ? 'bg-red-500' : 'bg-yellow-500'}`} />
              {onlineCount}/{totalTracked} up
            </div>
          )}
          {!isGuest && (
            <>
              <button
                onClick={() => { setSelectedService(null); setServiceModalOpen(true); }}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                title="Add Service"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
              <button onClick={() => setImportExportOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Import/Export">
                <Download className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
              <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Settings">
                <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allTags.map(tag => (
            <TagChip key={tag} tag={tag} active={selectedTags.has(tag)} onClick={() => toggleTag(tag)} />
          ))}
        </div>
      )}

      <main>
        {/* Pinned services */}
        {pinnedServices.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Pinned</h2>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {pinnedServices.map(service => (
                <ServiceRow key={service.id} service={service} onEdit={s => { setSelectedService(s); setServiceModalOpen(true); }} health={healthMap[service.id] ?? unknownHealth} isGuest={isGuest} />
              ))}
            </div>
          </section>
        )}

        {/* All services */}
        {regularServices.length > 0 && (
          <section>
            {pinnedServices.length > 0 && (
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">All Services</h2>
            )}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {regularServices.map(service => (
                <ServiceRow key={service.id} service={service} onEdit={s => { setSelectedService(s); setServiceModalOpen(true); }} health={healthMap[service.id] ?? unknownHealth} isGuest={isGuest} />
              ))}
            </div>
          </section>
        )}

        {filteredServices.length === 0 && services.length === 0 && (
          <div className="text-center py-16">
            {isGuest ? (
              <p className="text-gray-500 dark:text-gray-400 text-lg">No services to display.</p>
            ) : (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">No services yet!</p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <button
                    onClick={async () => {
                      await serviceService.seedDefaultServices();
                      serviceService.getUserServices().then(setServices);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <Server size={20} />
                    Load JojeCo Services
                  </button>
                  <button
                    onClick={() => { setSelectedService(null); setServiceModalOpen(true); }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium"
                  >
                    <Plus size={20} />
                    Add Manually
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {filteredServices.length === 0 && services.length > 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400 text-lg">No services match your filter.</p>
            <button
              onClick={() => { setSearchTerm(''); setSelectedTags(new Set()); }}
              className="mt-4 text-blue-500 hover:text-blue-600 font-medium"
            >
              Clear filters
            </button>
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPasswordChange={() => setPasswordChangeOpen(true)}
      />

      <PasswordChangeModal
        isOpen={passwordChangeOpen}
        onClose={() => setPasswordChangeOpen(false)}
      />

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
