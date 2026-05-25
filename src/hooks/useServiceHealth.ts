import { useState, useEffect } from 'react';
import { Service } from '../types/service';
import { serviceService } from '../services/serviceService';

export type HealthStatus = {
  status: 'online' | 'offline' | 'unknown';
  checkedAt: Date;
  responseTime?: number;
  source?: 'server' | 'browser';
};

const healthCache = new Map<string, { result: HealthStatus; expires: number }>();

// Server-side health results shared across all hook instances
let serverHealthCache: Record<string, HealthStatus> = {};
let serverHealthFetchedAt = 0;
const SERVER_HEALTH_TTL = 60 * 1000; // re-fetch server results every 60s

async function fetchServerHealth() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;
  try {
    const base = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/api$/, '');
    const r = await fetch(`${base}/api/health/services`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return;
    const data = await r.json();
    const cache: Record<string, HealthStatus> = {};
    for (const svc of data.services ?? []) {
      cache[svc.serviceId] = {
        status: svc.status as 'online' | 'offline' | 'unknown',
        checkedAt: new Date(svc.checkedAt),
        responseTime: svc.responseTime ?? undefined,
        source: 'server',
      };
    }
    serverHealthCache = cache;
    serverHealthFetchedAt = Date.now();
  } catch { /* ignore */ }
}

// Internal/private IPs and hostnames that can't be reached from an external browser
const PRIVATE_URL = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.|::1)/;

export function useServiceHealth(service: Service): HealthStatus {
  const [health, setHealth] = useState<HealthStatus>({
    status: 'unknown',
    checkedAt: new Date(),
  });

  useEffect(() => {
    const checkUrl = service.healthCheckUrl || service.url;
    if (!checkUrl) return;

    // Private URLs: can't check from browser on WAN — use server-side result only
    if (PRIVATE_URL.test(checkUrl)) {
      const applyServerResult = () => {
        const cached = serverHealthCache[service.id];
        setHealth(cached ?? { status: 'unknown', checkedAt: new Date(), source: 'server' });
      };

      if (Date.now() - serverHealthFetchedAt > SERVER_HEALTH_TTL) {
        fetchServerHealth().then(applyServerResult);
      } else {
        applyServerResult();
      }

      const interval = setInterval(() => {
        fetchServerHealth().then(applyServerResult);
      }, SERVER_HEALTH_TTL);
      return () => clearInterval(interval);
    }

    // Public URL — browser-side check (prefer server result if fresher)
    const cacheKey = checkUrl;
    const cached = healthCache.get(cacheKey);
    const intervalMs = (service.healthCheckInterval || 60) * 1000;

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
          source: 'browser',
        };
        healthCache.set(cacheKey, { result, expires: Date.now() + intervalMs });
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
      .catch((_err) => {
        clearTimeout(timeoutId);
        const result: HealthStatus = {
          status: 'offline',
          checkedAt: new Date(),
          source: 'browser',
        };
        healthCache.set(cacheKey, { result, expires: Date.now() + intervalMs });
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
            source: 'browser',
          };
          healthCache.set(cacheKey, { result, expires: Date.now() + intervalMs });
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
            source: 'browser',
          };
          healthCache.set(cacheKey, { result, expires: Date.now() + intervalMs });
          setHealth(result);
        });
    }, intervalMs);

    return () => {
      clearInterval(checkInterval);
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, service.url, service.healthCheckUrl, service.healthCheckInterval]);

  return health;
}
