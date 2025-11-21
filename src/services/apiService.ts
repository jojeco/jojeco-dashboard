import { Service, ServiceHealthCheck, ServiceMetrics } from '../types/service';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Token management
let authToken: string | null = localStorage.getItem('authToken');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
}

export function getAuthToken() {
  return authToken;
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const apiService = {
  // Auth
  async register(email: string, password: string, displayName?: string) {
    const data = await fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    setAuthToken(data.token);
    return data.user;
  },

  async login(email: string, password: string) {
    const data = await fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(data.token);
    return data.user;
  },

  async logout() {
    setAuthToken(null);
  },

  async getCurrentUser() {
    return fetchAPI('/auth/me');
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return fetchAPI('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // Services
  async createService(_userId: string, serviceData: Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<string> {
    const data = await fetchAPI('/services', {
      method: 'POST',
      body: JSON.stringify(serviceData),
    });
    return data.id;
  },

  async updateService(serviceId: string, updates: Partial<Service>): Promise<void> {
    await fetchAPI(`/services/${serviceId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteService(serviceId: string): Promise<void> {
    await fetchAPI(`/services/${serviceId}`, {
      method: 'DELETE',
    });
  },

  async getUserServices(_userId: string): Promise<Service[]> {
    return fetchAPI('/services');
  },

  // Real-time subscription simulation (polling)
  subscribeToUserServices(_userId: string, callback: (services: Service[]) => void): () => void {
    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const services = await this.getUserServices(_userId);
        callback(services);
      } catch (error) {
        console.error('Polling error:', error);
      }
      if (active) {
        setTimeout(poll, 5000); // Poll every 5 seconds
      }
    };

    poll();

    return () => {
      active = false;
    };
  },

  // Metrics
  async saveMetrics(metrics: ServiceMetrics): Promise<void> {
    await fetchAPI('/metrics', {
      method: 'POST',
      body: JSON.stringify(metrics),
    });
  },

  async getServiceMetrics(
    serviceId: string,
    startTime: number,
    endTime: number
  ): Promise<ServiceMetrics[]> {
    return fetchAPI(`/metrics/${serviceId}?startTime=${startTime}&endTime=${endTime}`);
  },

  // Health checks
  async saveHealthCheck(healthCheck: ServiceHealthCheck): Promise<void> {
    await fetchAPI('/health-checks', {
      method: 'POST',
      body: JSON.stringify(healthCheck),
    });
  },

  async getServiceHealthHistory(serviceId: string, limit: number = 100): Promise<ServiceHealthCheck[]> {
    return fetchAPI(`/health-checks/${serviceId}?limit=${limit}`);
  },

  // Import/Export
  async exportServices(_userId: string): Promise<string> {
    const services = await fetchAPI('/services/export');
    return JSON.stringify(services, null, 2);
  },

  async importServices(_userId: string, servicesJson: string): Promise<number> {
    const services = JSON.parse(servicesJson);
    const data = await fetchAPI('/services/import', {
      method: 'POST',
      body: JSON.stringify({ services }),
    });
    return data.imported;
  },
};
