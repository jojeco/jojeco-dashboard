// ─── Media page shared types ──────────────────────────────────────────────────

export interface QueueItem {
  id: number;
  title: string;
  status: string;
  sizeleft: number;
  size: number;
  timeleft?: string;
  estimatedCompletionTime?: string;
  series?: { title: string };
  episode?: { seasonNumber: number; episodeNumber: number; title: string };
  movie?: { title: string; year: number };
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
}

export interface UpcomingEpisode {
  type: 'episode';
  id: number;
  title: string;
  episode: string;
  episodeTitle: string;
  airDate: string;
  hasFile: boolean;
  network: string;
}

export interface UpcomingMovie {
  type: 'movie';
  id: number;
  title: string;
  year: number;
  digitalRelease?: string;
  physicalRelease?: string;
  inCinemas?: string;
  studio?: string;
}

export type UpcomingItem = UpcomingEpisode | UpcomingMovie;

export interface TdarrWorker {
  node: string;
  type: string;
  status: string;
  file: string;
  percentage: number;
  fps: number;
}

export interface TdarrStatus {
  total: number;
  transcoded: number;
  transcodeQueue: number;
  noAction: number;
  transcodeErrors: number;
  healthErrors: number;
  healthOk: number;
  tdarrScore: number;
  sizeDiffGB: number;
  workers: TdarrWorker[];
}

export interface RipStatus {
  status: 'idle' | 'starting' | 'ripping' | 'importing' | 'done' | 'error';
  album: string;
  track: number;
  total: number;
  percent: number;
  trackName: string;
  updatedAt: string;
}

export interface Torrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  dlspeed: number;
  upspeed: number;
  size: number;
  eta: number;
  num_seeds: number;
  num_leechs: number;
}

export interface TransferInfo {
  connection_status: string;
  dl_info_speed: number;
  up_info_speed: number;
  dl_info_data: number;
  up_info_data: number;
}

export type TorrentTab = 'active' | 'done' | 'error';
