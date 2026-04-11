import {
  Server, Cloud, Database, Globe, HardDrive, Cpu, Monitor,
  Smartphone, Wifi, Radio, Film, Music, Image, Video,
  FileText, Folder, Archive, Download, Upload, Lock,
  Shield, Key, Users, User, Mail, MessageSquare, Bell,
  Calendar, Clock, Activity, TrendingUp, BarChart2, PieChart,
  Code, Terminal, GitBranch, Package, Box, Layers,
  type LucideIcon,
} from 'lucide-react';

export const ICON_MAP: Record<string, LucideIcon> = {
  Server,
  Cloud,
  Database,
  Globe,
  HardDrive,
  Cpu,
  Monitor,
  Smartphone,
  Wifi,
  Radio,
  Film,
  Music,
  Image,
  Video,
  FileText,
  Folder,
  Archive,
  Download,
  Upload,
  Lock,
  Shield,
  Key,
  Users,
  User,
  Mail,
  MessageSquare,
  Bell,
  Calendar,
  Clock,
  Activity,
  TrendingUp,
  BarChart2,
  PieChart,
  Code,
  Terminal,
  GitBranch,
  Package,
  Box,
  Layers,
};

// Canonical list — single source of truth for both the picker and the card renderer
export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export const AVAILABLE_COLORS = [
  { name: 'Blue', value: 'bg-blue-500' },
  { name: 'Green', value: 'bg-green-500' },
  { name: 'Red', value: 'bg-red-500' },
  { name: 'Yellow', value: 'bg-yellow-500' },
  { name: 'Purple', value: 'bg-purple-500' },
  { name: 'Pink', value: 'bg-pink-500' },
  { name: 'Indigo', value: 'bg-indigo-500' },
  { name: 'Orange', value: 'bg-orange-500' },
  { name: 'Teal', value: 'bg-teal-500' },
  { name: 'Cyan', value: 'bg-cyan-500' },
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
