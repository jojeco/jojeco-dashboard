import { Film } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage';

export default function MediaPage() {
  return (
    <PlaceholderPage
      title="Media"
      icon={Film}
      message="Plex, Sonarr, Radarr, and torrent views coming in slice 2"
      action="Check Plex at plex.jojeco.ca"
    />
  );
}
