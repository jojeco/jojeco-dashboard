export interface Service {
  id: string;
  name: string;
  description: string;
  url: string;
  lanUrl?: string;
  icon: string;
  color: string;
  tags: string[];
  isPinned: boolean;
  healthCheckUrl?: string;
  healthCheckInterval?: number;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

export interface ServiceHealthCheck {
  serviceId: string;
  status: 'online' | 'offline' | 'unknown';
  responseTime?: number;
  statusCode?: number;
  timestamp: number;
  error?: string;
}

export interface ServiceMetrics {
  serviceId: string;
  timestamp: number;
  responseTime: number;
  statusCode: number;
  isOnline: boolean;
}

export interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;   // MB
    total: number;  // MB
    percent: number;
  };
  disk: {
    used: number;   // GB
    total: number;  // GB
    percent: number;
  };
  network: {
    upload: number;   // kbits/s
    download: number; // kbits/s
  };
}

export interface SystemHistoryPoint {
  timestamp: number;
  cpu: number;
}

export type ServiceStatus = 'online' | 'offline' | 'unknown';
