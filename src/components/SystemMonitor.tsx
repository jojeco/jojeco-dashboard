import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, Activity, Wifi } from 'lucide-react';
import { api } from '../services/api';
import { SystemMetrics, SystemHistoryPoint } from '../types/service';
import { BaseModal } from './BaseModal';

interface SystemMonitorProps {
  isOpen: boolean;
  onClose: () => void;
}

function getBarColor(pct: number) {
  if (pct < 60) return 'bg-green-500';
  if (pct < 80) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getTextColor(pct: number) {
  if (pct < 60) return 'text-green-600 dark:text-green-400';
  if (pct < 80) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function formatNet(kbps: number) {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(2)} Mbps`;
  return `${Math.round(kbps)} kbps`;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  percent: number;
}

function MetricCard({ icon, label, value, subtitle, percent }: MetricCardProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{label}</h3>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
        </div>
        <span className={`text-2xl font-bold ${getTextColor(percent)}`}>{value}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${getBarColor(percent)}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

export const SystemMonitor: React.FC<SystemMonitorProps> = ({ isOpen, onClose }) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<SystemHistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Seed history from Netdata on open
    api.get<SystemHistoryPoint[]>('/system/history?points=60')
      .then(setHistory)
      .catch(() => {}); // History is optional; polling will fill it in

    const fetchMetrics = () => {
      api.get<SystemMetrics>('/system/metrics')
        .then(data => {
          setMetrics(data);
          setError(null);
          setHistory(prev => [
            ...prev.slice(-59),
            { timestamp: Date.now(), cpu: data.cpu },
          ]);
        })
        .catch(() => {
          setError('Cannot reach system metrics. Is Netdata running on port 19999?');
        });
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="System Monitor" maxWidth="xl" scrollable>
      {error ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-red-500 dark:text-red-400 font-medium">{error}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Netdata runs at port 19999. The Express API proxies metrics via{' '}
            <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
              /api/system/metrics
            </code>
            .
          </p>
        </div>
      ) : !metrics ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Loading system metrics…
        </div>
      ) : (
        <div className="space-y-4">
          <MetricCard
            icon={<Cpu className="text-blue-500" size={20} />}
            label="CPU"
            value={`${metrics.cpu.toFixed(1)}%`}
            percent={metrics.cpu}
          />

          <MetricCard
            icon={<Activity className="text-purple-500" size={20} />}
            label="Memory"
            value={`${metrics.memory.percent.toFixed(1)}%`}
            subtitle={`${metrics.memory.used.toLocaleString()} / ${metrics.memory.total.toLocaleString()} MB`}
            percent={metrics.memory.percent}
          />

          <MetricCard
            icon={<HardDrive className="text-orange-500" size={20} />}
            label="Disk (root)"
            value={`${metrics.disk.percent.toFixed(1)}%`}
            subtitle={`${metrics.disk.used} / ${metrics.disk.total} GB`}
            percent={metrics.disk.percent}
          />

          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="text-teal-500" size={20} />
              <h3 className="font-semibold text-gray-900 dark:text-white">Network</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Download</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatNet(metrics.network.download)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Upload</p>
                <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
                  {formatNet(metrics.network.upload)}
                </p>
              </div>
            </div>
          </div>

          {history.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                CPU History (last {history.length}s)
              </h3>
              <div className="h-24 flex items-end gap-0.5">
                {history.map((point, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t transition-all duration-300 ${
                      point.cpu < 60
                        ? 'bg-blue-400'
                        : point.cpu < 80
                        ? 'bg-yellow-400'
                        : 'bg-red-400'
                    }`}
                    style={{ height: `${Math.max(2, point.cpu)}%` }}
                    title={`${point.cpu.toFixed(1)}%`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </BaseModal>
  );
};
