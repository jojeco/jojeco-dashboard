import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, Activity, Wifi, Server, X } from 'lucide-react';
import { SystemMetrics } from '../types/service';

interface SystemMonitorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemMonitor: React.FC<SystemMonitorProps> = ({ isOpen, onClose }) => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    timestamp: Date.now(),
    cpu: 0,
    memory: 0,
    disk: 0,
    network: {
      upload: 0,
      download: 0,
    },
  });

  const [history, setHistory] = useState<SystemMetrics[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    // Simulate system metrics (in a real app, this would come from a backend API)
    const interval = setInterval(() => {
      const newMetrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        disk: 65 + Math.random() * 10, // More stable
        network: {
          upload: Math.random() * 10,
          download: Math.random() * 50,
        },
      };

      setMetrics(newMetrics);
      setHistory((prev) => [...prev.slice(-59), newMetrics]); // Keep last 60 data points
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const getStatusColor = (value: number) => {
    if (value < 60) return 'text-green-600 dark:text-green-400';
    if (value < 80) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1) return `${(bytes * 1024).toFixed(2)} KB/s`;
    return `${bytes.toFixed(2)} MB/s`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Server className="text-blue-600 dark:text-blue-400" size={24} />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              System Monitor
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* CPU */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className="text-blue-600 dark:text-blue-400" size={20} />
                <h3 className="font-semibold text-gray-900 dark:text-white">CPU Usage</h3>
              </div>
              <span className={`text-2xl font-bold ${getStatusColor(metrics.cpu)}`}>
                {metrics.cpu.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  metrics.cpu < 60
                    ? 'bg-green-500'
                    : metrics.cpu < 80
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${metrics.cpu}%` }}
              />
            </div>
          </div>

          {/* Memory */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="text-purple-600 dark:text-purple-400" size={20} />
                <h3 className="font-semibold text-gray-900 dark:text-white">Memory Usage</h3>
              </div>
              <span className={`text-2xl font-bold ${getStatusColor(metrics.memory)}`}>
                {metrics.memory.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  metrics.memory < 60
                    ? 'bg-green-500'
                    : metrics.memory < 80
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${metrics.memory}%` }}
              />
            </div>
          </div>

          {/* Disk */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="text-orange-600 dark:text-orange-400" size={20} />
                <h3 className="font-semibold text-gray-900 dark:text-white">Disk Usage</h3>
              </div>
              <span className={`text-2xl font-bold ${getStatusColor(metrics.disk)}`}>
                {metrics.disk.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  metrics.disk < 60
                    ? 'bg-green-500'
                    : metrics.disk < 80
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${metrics.disk}%` }}
              />
            </div>
          </div>

          {/* Network */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="text-teal-600 dark:text-teal-400" size={20} />
              <h3 className="font-semibold text-gray-900 dark:text-white">Network Activity</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Upload</p>
                <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
                  {formatBytes(metrics.network.upload)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Download</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatBytes(metrics.network.download)}
                </p>
              </div>
            </div>
          </div>

          {/* Mini chart */}
          {history.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                CPU History (Last 60s)
              </h3>
              <div className="h-24 flex items-end gap-1">
                {history.map((point, index) => (
                  <div
                    key={index}
                    className="flex-1 bg-blue-500 rounded-t"
                    style={{ height: `${point.cpu}%` }}
                    title={`${point.cpu.toFixed(1)}%`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Note:</strong> In a production environment, system metrics would be provided by a backend API
              or system monitoring agent. This is a demonstration using simulated data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
