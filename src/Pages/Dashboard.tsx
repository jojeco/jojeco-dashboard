import { useState, useEffect, useMemo } from 'react';
import { Cloud, Server, Film, Cog, Github, Search, Settings, Moon, Sun, ExternalLink, CheckCircle2, XCircle, HelpCircle, X, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContextAPI';
import SystemStats from '../components/SystemStats';


// ============================================================================
// TYPES & CONFIG
// ============================================================================

type Service = {
  name: string;
  icon?: string;
  description?: string;
  publicUrl?: string;
  lanUrl?: string;
  healthUrl?: string;
  tags?: string[];
  pinned?: boolean;
};

const SERVICES: Service[] = [
  {
    name: "Nextcloud",
    icon: "Cloud",
    description: "Personal cloud storage & collaboration",
    publicUrl: "https://cloud.jojeco.ca",
    lanUrl: "http://localhost:8880",
    healthUrl: "https://cloud.jojeco.ca/status.php",
    tags: ["storage", "productivity"],
    pinned: true,
  },
  {
    name: "Pi Services",
    icon: "Server",
    description: "Raspberry Pi service monitor",
    lanUrl: "https://192.168.50.184:9090/system/services",
    healthUrl: "https://192.168.50.184:9090",
    tags: ["infra", "monitoring"],
  },
  {
    name: "Plex",
    icon: "Film",
    description: "Media server",
    lanUrl: "http://192.168.50.201:32400/web",
    healthUrl: "http://192.168.50.201:32400/web/index.html",
    tags: ["media"],
  },
  {
    name: "Jackett",
    icon: "Cog",
    description: "Indexer for torrent automation",
    lanUrl: "http://192.168.50.201:9117",
    healthUrl: "http://192.168.50.201:9117",
    tags: ["automation", "indexer"],
  },
  {
    name: "GitHub",
    icon: "Github",
    description: "My public repos",
    publicUrl: "https://github.com/jojeco",
    healthUrl: "https://github.com/jojeco",
    tags: ["dev"],
  },
];

const ICON_MAP: Record<string, any> = {
  Cloud,
  Server,
  Film,
  Cog,
  Github,
};

// ============================================================================
// HOOKS
// ============================================================================

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', String(isDark));
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return [isDark, setIsDark] as const;
}

type HealthStatus = {
  status: 'online' | 'offline' | 'unknown';
  checkedAt: Date;
};

const healthCache = new Map<string, { result: HealthStatus; expires: number }>();

function useServiceHealth(service: Service): HealthStatus {
  const [health, setHealth] = useState<HealthStatus>({
    status: 'unknown',
    checkedAt: new Date(),
  });

  useEffect(() => {
    if (!service.healthUrl) {
      setHealth({ status: 'unknown', checkedAt: new Date() });
      return;
    }

    const cacheKey = service.healthUrl;
    const cached = healthCache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      setHealth(cached.result);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    fetch(service.healthUrl, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors',
    })
      .then((res) => {
        clearTimeout(timeoutId);
        const result: HealthStatus = {
          status: res.ok || res.status === 0 ? 'online' : 'offline',
          checkedAt: new Date(),
        };
        healthCache.set(cacheKey, { result, expires: Date.now() + 60000 });
        setHealth(result);
      })
      .catch((_err) => {
        clearTimeout(timeoutId);
        const result: HealthStatus = {
          status: 'unknown',
          checkedAt: new Date(),
        };
        healthCache.set(cacheKey, { result, expires: Date.now() + 60000 });
        setHealth(result);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [service.healthUrl]);

  return health;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatusPill({ status, checkedAt }: HealthStatus) {
  const statusConfig = {
    online: { bg: 'bg-green-500/10 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-300', icon: CheckCircle2, label: 'Online' },
    offline: { bg: 'bg-red-500/10 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-300', icon: XCircle, label: 'Offline' },
    unknown: { bg: 'bg-gray-500/10 dark:bg-gray-500/20', text: 'text-gray-700 dark:text-gray-300', icon: HelpCircle, label: 'Unknown' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;
  const timeAgo = Math.floor((Date.now() - checkedAt.getTime()) / 1000);

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
      {timeAgo < 10 && <span className="text-[10px] opacity-60">now</span>}
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

function ServiceCard({ service }: { service: Service }) {
  const health = useServiceHealth(service);
  const Icon = service.icon ? ICON_MAP[service.icon] : Server;
  const bestUrl = service.publicUrl || service.lanUrl;

  const hasNoUrl = !service.publicUrl && !service.lanUrl;

  return (
    <div className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 transition-all hover:shadow-lg hover:-translate-y-0.5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <Icon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
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
        {hasNoUrl && (
          <span className="text-xs text-amber-600 dark:text-amber-400" title="No URL configured">
            ⚠️ No URL
          </span>
        )}
      </div>

      {service.tags && service.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {service.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-md"
            >
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
          onClick={(e) => !bestUrl && e.preventDefault()}
        >
          Open
          {bestUrl && <ExternalLink className="w-4 h-4" />}
        </a>
      </div>

      {health.status === 'unknown' && service.healthUrl && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Status check failed (CORS/network). Service may still be available.
        </p>
      )}
    </div>
  );
}

function Header({
  searchTerm,
  onSearchChange,
  onSettingsClick,
  isDark,
  onToggleDark,
}: {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSettingsClick: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}) {
  const { currentUser, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">jojeco</h1>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search services..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser && (
              <div className="hidden sm:flex items-center gap-2 mr-2">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </div>
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {currentUser.displayName || currentUser.email}
                </span>
              </div>
            )}

            <button
              onClick={onToggleDark}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="w-5 h-5 text-gray-700 dark:text-gray-300" /> : <Moon className="w-5 h-5 text-gray-700" />}
            </button>
            
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>

            {currentUser && (
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="md:hidden mt-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search services..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentUser } = useAuth();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>
        <div className="space-y-4">
          {currentUser && (
            <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Signed in as:</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{currentUser.email}</p>
            </div>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This dashboard provides quick access to your self-hosted services with health monitoring.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            To add or edit services, modify the <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">services.ts</code> file.
          </p>
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Version: 1.0.0 | Build: {new Date().toISOString().split('T')[0]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function Dashboard() {
  const [isDark, setIsDark] = useDarkMode();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    SERVICES.forEach((service) => {
      service.tags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, []);

  const filteredServices = useMemo(() => {
    return SERVICES.filter((service) => {
      const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTags = selectedTags.size === 0 ||
        service.tags?.some((tag) => selectedTags.has(tag));

      return matchesSearch && matchesTags;
    });
  }, [searchTerm, selectedTags]);

  const pinnedServices = filteredServices.filter((s) => s.pinned);
  const regularServices = filteredServices.filter((s) => !s.pinned);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <Header
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onSettingsClick={() => setSettingsOpen(true)}
        isDark={isDark}
        onToggleDark={() => setIsDark(!isDark)}
      />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {allTags.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <TagChip
                  key={tag}
                  tag={tag}
                  active={selectedTags.has(tag)}
                  onClick={() => toggleTag(tag)}
                />
              ))}
            </div>
          </div>
        )}

        {pinnedServices.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Pinned</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <SystemStats />
              </div>
              {pinnedServices.map((service) => (
                <ServiceCard key={service.name} service={service} />
              ))}
            </div>
          </section>
        )}

        {regularServices.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">All Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <SystemStats />
              </div>
              {regularServices.map((service) => (
                <ServiceCard key={service.name} service={service} />
              ))}
            </div>
          </section>
        )}

        {filteredServices.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400 text-lg">No services match your filter.</p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedTags(new Set());
              }}
              className="mt-4 text-blue-500 hover:text-blue-600 font-medium"
            >
              Clear filters
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex gap-4">
              <a href="#" className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
                Edit Config
              </a>
              <a href="#" className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
                Docs
              </a>
            </div>
            <div className="text-xs">
              v1.0.0 | Built {new Date().toISOString().split('T')[0]}
            </div>
          </div>
        </div>
      </footer>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}