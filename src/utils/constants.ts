import {
  Cloud, Server, Film, Cog, Github, Activity, BarChart3,
  Database, Globe, HardDrive, Cpu, Zap, type LucideIcon
} from 'lucide-react';

export const ICON_MAP: Record<string, LucideIcon> = {
  Cloud,
  Server,
  Film,
  Cog,
  Github,
  Activity,
  BarChart3,
  Database,
  Globe,
  HardDrive,
  Cpu,
  Zap,
};

export const AVAILABLE_ICONS = [
  'Server',
  'Cloud',
  'Database',
  'Globe',
  'HardDrive',
  'Cpu',
  'Zap',
  'Film',
  'Cog',
  'Github',
  'Activity',
  'BarChart3',
];

export const AVAILABLE_COLORS = [
  'blue',
  'green',
  'purple',
  'red',
  'yellow',
  'indigo',
  'pink',
  'gray',
];

export const STATUS_CONFIG = {
  online: {
    bg: 'bg-green-500/10 dark:bg-green-500/20',
    text: 'text-green-700 dark:text-green-300',
    label: 'Online',
  },
  offline: {
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    text: 'text-red-700 dark:text-red-300',
    label: 'Offline',
  },
  unknown: {
    bg: 'bg-gray-500/10 dark:bg-gray-500/20',
    text: 'text-gray-700 dark:text-gray-300',
    label: 'Unknown',
  },
};
