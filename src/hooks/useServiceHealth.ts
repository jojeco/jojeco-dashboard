import { useState, useEffect } from 'react';
import { Service } from '../types/service';
import { serviceService } from '../services/serviceService';

export type HealthStatus = {
  status: 'online' | 'offline' | 'unknown';
  checkedAt: Date;
  responseTime?: number;
};

const healthCache = new Map<string, { result: HealthStatus; expires: number }>();

// Internal/private IPs and hostnames that can't be reached from an external browser
const PRIVATE_URL = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.|::1)/;

export function useServiceHealth(service: Service): HealthStatus {
  const [health, setHealth] = useState<HealthStatus>({
    status: 'unknown',
    checkedAt: new Date(),
  });

  useEffect(() => {
    const checkUrl = service.healthCheckUrl || service.url;
    if (!checkUrl || PRIVATE_URL.test(checkUrl)) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, service.url, service.healthCheckUrl, service.healthCheckInterval]);

  return health;
}
