import { api } from './api';
import { Service, ServiceHealthCheck, ServiceMetrics } from '../types/service';

export const serviceService = {
  async createService(
    serviceData: Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'userId'>
  ): Promise<string> {
    const { id } = await api.post<{ id: string }>('/services', serviceData);
    return id;
  },

  async updateService(serviceId: string, updates: Partial<Service>): Promise<void> {
    await api.put(`/services/${serviceId}`, updates);
  },

  async deleteService(serviceId: string): Promise<void> {
    await api.delete(`/services/${serviceId}`);
  },

  async getUserServices(): Promise<Service[]> {
    return api.get<Service[]>('/services');
  },

  // Polls every 30s — returns cleanup function matching Firestore onSnapshot signature
  subscribeToUserServices(callback: (services: Service[]) => void): () => void {
    this.getUserServices().then(callback).catch(console.error);
    const interval = setInterval(() => {
      this.getUserServices().then(callback).catch(console.error);
    }, 30_000);
    return () => clearInterval(interval);
  },

  async saveHealthCheck(healthCheck: ServiceHealthCheck): Promise<void> {
    await api.post('/health-checks', healthCheck);
  },

  async getServiceHealthHistory(serviceId: string, limit = 100): Promise<ServiceHealthCheck[]> {
    return api.get<ServiceHealthCheck[]>(`/health-checks/${serviceId}?limit=${limit}`);
  },

  async saveMetrics(metrics: ServiceMetrics): Promise<void> {
    await api.post('/metrics', metrics);
  },

  async getServiceMetrics(
    serviceId: string,
    startTime: number,
    endTime: number
  ): Promise<ServiceMetrics[]> {
    return api.get<ServiceMetrics[]>(
      `/metrics/${serviceId}?startTime=${startTime}&endTime=${endTime}`
    );
  },

  async exportServices(): Promise<string> {
    const services = await api.get<object[]>('/services/export');
    return JSON.stringify(services, null, 2);
  },

  async importServices(servicesJson: string): Promise<number> {
    const services = JSON.parse(servicesJson);
    const { imported } = await api.post<{ imported: number }>('/services/import', { services });
    return imported;
  },

  async seedDefaultServices(): Promise<number> {
    const result = await api.post<{ inserted?: number; skipped?: boolean }>('/services/seed', {});
    return result.inserted ?? 0;
  },
};
