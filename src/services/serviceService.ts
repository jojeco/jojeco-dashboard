import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Service, ServiceHealthCheck, ServiceMetrics } from '../types/service';

const SERVICES_COLLECTION = 'services';
const HEALTH_CHECKS_COLLECTION = 'healthChecks';
const METRICS_COLLECTION = 'serviceMetrics';

export const serviceService = {
  // Create a new service
  async createService(userId: string, serviceData: Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<string> {
    const now = Date.now();
    const docRef = await addDoc(collection(db, SERVICES_COLLECTION), {
      ...serviceData,
      userId,
      createdAt: now,
      updatedAt: now,
    });
    return docRef.id;
  },

  // Update an existing service
  async updateService(serviceId: string, updates: Partial<Service>): Promise<void> {
    const serviceRef = doc(db, SERVICES_COLLECTION, serviceId);
    await updateDoc(serviceRef, {
      ...updates,
      updatedAt: Date.now(),
    });
  },

  // Delete a service
  async deleteService(serviceId: string): Promise<void> {
    const serviceRef = doc(db, SERVICES_COLLECTION, serviceId);
    await deleteDoc(serviceRef);
  },

  // Get all services for a user
  async getUserServices(userId: string): Promise<Service[]> {
    const q = query(
      collection(db, SERVICES_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Service));
  },

  // Subscribe to user services (real-time updates)
  subscribeToUserServices(userId: string, callback: (services: Service[]) => void): () => void {
    const q = query(
      collection(db, SERVICES_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const services = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Service));
      callback(services);
    });
  },

  // Save health check result
  async saveHealthCheck(healthCheck: ServiceHealthCheck): Promise<void> {
    await addDoc(collection(db, HEALTH_CHECKS_COLLECTION), healthCheck);
  },

  // Get recent health checks for a service
  async getServiceHealthHistory(serviceId: string, limit: number = 100): Promise<ServiceHealthCheck[]> {
    const q = query(
      collection(db, HEALTH_CHECKS_COLLECTION),
      where('serviceId', '==', serviceId),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.slice(0, limit).map(doc => doc.data() as ServiceHealthCheck);
  },

  // Save service metrics
  async saveMetrics(metrics: ServiceMetrics): Promise<void> {
    await addDoc(collection(db, METRICS_COLLECTION), metrics);
  },

  // Get metrics for a service in a time range
  async getServiceMetrics(
    serviceId: string,
    startTime: number,
    endTime: number
  ): Promise<ServiceMetrics[]> {
    const q = query(
      collection(db, METRICS_COLLECTION),
      where('serviceId', '==', serviceId),
      where('timestamp', '>=', startTime),
      where('timestamp', '<=', endTime),
      orderBy('timestamp', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as ServiceMetrics);
  },

  // Export all user services
  async exportServices(userId: string): Promise<string> {
    const services = await this.getUserServices(userId);
    return JSON.stringify(services, null, 2);
  },

  // Import services (replaces existing)
  async importServices(userId: string, servicesJson: string): Promise<number> {
    const services = JSON.parse(servicesJson) as Omit<Service, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[];

    let imported = 0;
    for (const service of services) {
      await this.createService(userId, service);
      imported++;
    }

    return imported;
  },
};
