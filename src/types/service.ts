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
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  network: {
    upload: number;
    download: number;
  };
}

export type ServiceStatus = 'online' | 'offline' | 'unknown';
