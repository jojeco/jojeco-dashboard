/** QuickLinks — app tile grid at the bottom of LabPage */

const QUICK_LINKS = [
  { label: 'Plex',      href: 'https://plex.jojeco.ca',       cat: 'Media',     icon: '🎥' },
  { label: 'Overseerr', href: 'https://seerr.jojeco.ca',      cat: 'Media',     icon: '🎬' },
  { label: 'Navidrome', href: 'https://navidrome.jojeco.ca',  cat: 'Media',     icon: '🎵' },
  { label: 'Nextcloud', href: 'https://cloud.jojeco.ca',      cat: 'Files',     icon: '☁️' },
  { label: 'Paperless', href: 'http://192.168.50.13:8010',    cat: 'Files',     icon: '📄' },
  { label: 'qBit',      href: 'http://192.168.50.13:9091',    cat: 'Downloads', icon: '⬇️' },
  { label: 'Radarr',    href: 'http://192.168.50.13:7878',    cat: 'Downloads', icon: '🎞️' },
  { label: 'Sonarr',    href: 'http://192.168.50.13:8989',    cat: 'Downloads', icon: '📺' },
  { label: 'Prowlarr',  href: 'http://192.168.50.13:9696',    cat: 'Downloads', icon: '🔍' },
  { label: 'LibreChat', href: 'https://ai.jojeco.ca',         cat: 'AI',        icon: '🤖' },
  { label: 'LiteLLM',   href: 'http://192.168.50.13:4000/ui', cat: 'AI',        icon: '🧠' },
  { label: 'Grafana',   href: 'http://192.168.50.13:3002',    cat: 'Infra',     icon: '📊' },
  { label: 'Proxmox',   href: 'https://192.168.50.11:8006',   cat: 'Infra',     icon: '🖥️' },
  { label: 'Portainer', href: 'http://192.168.50.13:9000',    cat: 'Infra',     icon: '🐳' },
  { label: 'ntfy',      href: 'https://ntfy.jojeco.ca',       cat: 'Comms',     icon: '🔔' },
  { label: 'Vikunja',   href: 'http://192.168.50.13:3456',    cat: 'Tools',     icon: '✅' },
  { label: 'Actual',    href: 'http://192.168.50.13:5006',    cat: 'Tools',     icon: '💰' },
  { label: 'Tdarr',     href: 'http://192.168.50.13:8265',    cat: 'Infra',     icon: '⚙️' },
];

export function QuickLinks() {
  return (
    <div>
      <div className="j-section-label">Quick Access</div>
      <div className="j-grid-auto">
        {QUICK_LINKS.map(link => (
          <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="j-app-tile">
            <span className="j-app-tile-icon">{link.icon}</span>
            <span className="j-app-tile-label">{link.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
