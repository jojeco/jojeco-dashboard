import { useState, useEffect } from 'react';
import { Service } from '../types/service';
import { serviceService } from '../services/serviceService';

export type HealthStatus = {
  status: 'online' | 'offline' | 'unknown';
  checkedAt: Date;
  responseTime?: number;
};

const healthCache = new Map<string, { result: HealthStatus; expires: number }>();

export function useServiceHealth(service: Service): HealthStatus {
  const [health, setHealth] = useState<HealthStatus>({
    status: 'unknown',
    checkedAt: new Date(),
  });

  useEffect(() => {
    const checkUrl = service.healthCheckUrl || service.url;
    if (!checkUrl) {
      setHealth({ status: 'unknown', checkedAt: new Date() });
      return;
    }

    const cacheKey = checkUrl;
    const cached = healthCache.get(cacheKey);
    const interval = (service.healthCheckInterval || 60) * 1000;

    if (cached && cached.expires > Date.now()) {
      setHealth(cached.result);
      return;
    }

    const controller = new AbortController();
    const startTime = Date.now();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch(checkUrl, {
      method: 'HEAD',
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        const result: HealthStatus = {
          status: res.ok ? 'online' : 'offline',
          checkedAt: new Date(),
          responseTime,
        };
        healthCache.set(cacheKey, { result, expires: Date.now() + interval });
        setHealth(result);

        // Save metrics
        if (result.status === 'online' && result.responseTime) {
          serviceService.saveMetrics({
            serviceId: service.id,
            timestamp: Date.now(),
            responseTime: result.responseTime,
            statusCode: 200,
            isOnline: true,
          }).catch(() => {});
        }
      })
      .catch((_err) => {
        clearTimeout(timeoutId);
        const result: HealthStatus = {
          status: 'offline',
          checkedAt: new Date(),
        };
        healthCache.set(cacheKey, { result, expires: Date.now() + interval });
        setHealth(result);
      });

    const checkInterval = setInterval(() => {
      healthCache.delete(cacheKey);
      const newController = new AbortController();
      const newStartTime = Date.now();
      const newTimeoutId = setTimeout(() => newController.abort(), 5000);

      fetch(checkUrl, {
        method: 'HEAD',
        signal: newController.signal,
      })
        .then((res) => {
          clearTimeout(newTimeoutId);
          const responseTime = Date.now() - newStartTime;
          const result: HealthStatus = {
            status: res.ok ? 'online' : 'offline',
            checkedAt: new Date(),
            responseTime,
          };
          healthCache.set(cacheKey, { result, expires: Date.now() + interval });
          setHealth(result);

          if (result.status === 'online' && result.responseTime) {
            serviceService.saveMetrics({
              serviceId: service.id,
              timestamp: Date.now(),
              responseTime: result.responseTime,
              statusCode: 200,
              isOnline: true,
            }).catch(() => {});
          }
        })
        .catch(() => {
          clearTimeout(newTimeoutId);
          const result: HealthStatus = {
            status: 'offline',
            checkedAt: new Date(),
          };
          healthCache.set(cacheKey, { result, expires: Date.now() + interval });
          setHealth(result);
        });
    }, interval);

    return () => {
      clearInterval(checkInterval);
      controller.abort();
    };
  }, [service]);

  return health;
}
