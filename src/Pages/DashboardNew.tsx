import { useState, useEffect, useMemo } from 'react';
import {
  Search, Settings, Moon, Sun,
  ExternalLink, CheckCircle2, XCircle, HelpCircle, LogOut,
  User as UserIcon, Plus, Download, Monitor, Lock, Server, Activity,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Service, ServiceMetrics } from '../types/service';
import { serviceService } from '../services/serviceService';
import { ServiceModal } from '../components/ServiceModal';
import { ImportExportModal } from '../components/ImportExportModal';
import { ServiceGraph } from '../components/ServiceGraph';
import { SystemMonitor } from '../components/SystemMonitor';
import { PasswordChangeModal } from '../components/PasswordChangeModal';
import { BaseModal } from '../components/BaseModal';
import { useDarkMode } from '../hooks/useDarkMode';
import { useServiceHealth, type HealthStatus } from '../hooks/useServiceHealth';
import { ICON_MAP } from '../utils/constants';

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

function StatusPill({ status, responseTime }: HealthStatus) {
  const statusConfig = {
    online:  { bg: 'bg-green-500/10 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-300', icon: CheckCircle2, label: 'Online' },
    offline: { bg: 'bg-red-500/10 dark:bg-red-500/20',   text: 'text-red-700 dark:text-red-300',   icon: XCircle,      label: 'Offline' },
    unknown: { bg: 'bg-gray-500/10 dark:bg-gray-500/20', text: 'text-gray-700 dark:text-gray-300', icon: HelpCircle,   label: 'Unknown' },
  };
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
      {responseTime && <span className="text-[10px] opacity-60">{responseTime}ms</span>}
    </div>
  );
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

function ServiceCard({ service, onEdit }: { service: Service; onEdit: (service: Service) => void }) {
  const health = useServiceHealth(service);
  const Icon = service.icon ? (ICON_MAP[service.icon] ?? Server) : Server;
  const bestUrl = service.url || service.lanUrl;

  return (
    <div
      className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
      onClick={() => onEdit(service)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${service.color} bg-opacity-20 dark:bg-opacity-30 rounded-lg`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{service.name}</h3>
            {service.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{service.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <StatusPill {...health} />
      </div>

      {service.tags && service.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {service.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-md">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <a
          href={bestUrl || '#'}
          target={bestUrl ? '_blank' : undefined}
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            bestUrl
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          }`}
          onClick={e => bestUrl ? e.stopPropagation() : e.preventDefault()}
        >
          Open
          {bestUrl && <ExternalLink className="w-4 h-4" />}
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// HEADER
// ============================================================================

function Header({
  searchTerm, onSearchChange, onSettingsClick, onAddService,
  onImportExport, onToggleMetrics, onSystemMonitor, showMetrics, isDark, onToggleDark,
}: {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSettingsClick: () => void;
  onAddService: () => void;
  onImportExport: () => void;
  onToggleMetrics: () => void;
  onSystemMonitor: () => void;
  showMetrics: boolean;
  isDark: boolean;
  onToggleDark: () => void;
}) {
  const { currentUser, logout } = useAuth();

  const searchInput = (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        placeholder="Search services…"
        value={searchTerm}
        onChange={e => onSearchChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
      />
    </div>
  );

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 shrink-0">jojeco</h1>

          <div className="hidden md:flex flex-1 max-w-md mx-8">{searchInput}</div>

          <div className="flex items-center gap-2">
            {currentUser && (
              <div className="hidden sm:flex items-center gap-2 mr-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {currentUser.displayName || currentUser.email}
                </span>
              </div>
            )}

            <button
              onClick={onAddService}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              title="Add Service"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>

            <button onClick={onImportExport} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Import/Export">
              <Download className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>

            <button
              onClick={onToggleMetrics}
              className={`p-2 rounded-lg transition-colors ${
                showMetrics
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
              title="Toggle Metrics"
            >
              <Activity className="w-5 h-5" />
            </button>

            <button onClick={onSystemMonitor} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="System Monitor">
              <Monitor className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>

            <button onClick={onToggleDark} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Toggle dark mode">
              {isDark ? <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" /> : <Moon className="w-5 h-5 text-gray-700" />}
            </button>

            <button onClick={onSettingsClick} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Settings">
              <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>

            {currentUser && (
              <button
                onClick={() => logout()}
                className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="md:hidden mt-3">{searchInput}</div>
      </div>
    </header>
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
  const [isDark, setIsDark] = useDarkMode();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [systemMonitorOpen, setSystemMonitorOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [metricsData, setMetricsData] = useState<Record<string, ServiceMetrics[]>>({});
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');

  // Subscribe to services (polls every 30s, refetches on login/logout)
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = serviceService.subscribeToUserServices(setServices);
    return () => unsubscribe();
  }, [currentUser]);

  // Load metrics for each service when the metrics panel is visible
  useEffect(() => {
    if (!showMetrics || services.length === 0) return;

    const now = Date.now();
    const ranges = { '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000, '7d': 604_800_000 };
    const startTime = now - ranges[timeRange];

    Promise.all(
      services.map(service =>
        serviceService.getServiceMetrics(service.id, startTime, now)
          .then(metrics => ({ serviceId: service.id, metrics }))
      )
    ).then(results => {
      const map: Record<string, ServiceMetrics[]> = {};
      results.forEach(({ serviceId, metrics }) => { map[serviceId] = metrics; });
      setMetricsData(map);
    });
  }, [showMetrics, services, timeRange]);

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Header
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onSettingsClick={() => setSettingsOpen(true)}
        onAddService={() => { setSelectedService(null); setServiceModalOpen(true); }}
        onImportExport={() => setImportExportOpen(true)}
        onToggleMetrics={() => setShowMetrics(v => !v)}
        onSystemMonitor={() => setSystemMonitorOpen(true)}
        showMetrics={showMetrics}
        isDark={isDark}
        onToggleDark={() => setIsDark(v => !v)}
      />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {allTags.map(tag => (
              <TagChip key={tag} tag={tag} active={selectedTags.has(tag)} onClick={() => toggleTag(tag)} />
            ))}
          </div>
        )}

        {/* Metrics panel */}
        {showMetrics && filteredServices.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Performance Metrics</h2>
              <div className="flex gap-2">
                {(['1h', '6h', '24h', '7d'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      timeRange === range
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {filteredServices.map(service => (
                <ServiceGraph
                  key={service.id}
                  serviceId={service.id}
                  serviceName={service.name}
                  metrics={metricsData[service.id] || []}
                  timeRange={timeRange}
                />
              ))}
            </div>
          </div>
        )}

        {/* Pinned services */}
        {pinnedServices.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Pinned</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pinnedServices.map(service => (
                <ServiceCard key={service.id} service={service} onEdit={s => { setSelectedService(s); setServiceModalOpen(true); }} />
              ))}
            </div>
          </section>
        )}

        {/* All services */}
        {regularServices.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">All Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {regularServices.map(service => (
                <ServiceCard key={service.id} service={service} onEdit={s => { setSelectedService(s); setServiceModalOpen(true); }} />
              ))}
            </div>
          </section>
        )}

        {filteredServices.length === 0 && services.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">No services yet!</p>
            <button
              onClick={() => { setSelectedService(null); setServiceModalOpen(true); }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Plus size={20} />
              Add Your First Service
            </button>
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

      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400">
          <button onClick={() => setImportExportOpen(true)} className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
            Import/Export
          </button>
          <span className="text-xs">v2.0.0 · {services.length} service{services.length !== 1 ? 's' : ''}</span>
        </div>
      </footer>

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

      <SystemMonitor
        isOpen={systemMonitorOpen}
        onClose={() => setSystemMonitorOpen(false)}
      />
    </div>
  );
}
