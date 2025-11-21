import { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Zap } from 'lucide-react';

interface SystemMetrics {
  cpu: number;
  memory: { used: number; total: number };
  disk: { used: number; total: number };
  uptime: number;
}

export default function SystemStats() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Fetch CPU
        const cpuRes = await fetch('http://localhost:19999/api/v1/data?chart=system.cpu&after=-1&format=json');
        const cpuData = await cpuRes.json();
        
        // Fetch Memory
        const memRes = await fetch('http://localhost:19999/api/v1/data?chart=system.ram&after=-1&format=json');
        const memData = await memRes.json();
        
        // Fetch Disk
        // const diskRes = await fetch('http://localhost:19999/api/v1/data?chart=disk_space._&after=-1&format=json');
        // const diskData = await diskRes.json();

        // Parse the data
        const cpuUsage = 100 - (cpuData.data[0][1] || 0); // Invert idle to get usage
        const memUsed = memData.data[0][1] || 0;
        const memTotal = memData.data[0].reduce((a: number, b: number) => a + b, 0);

        setMetrics({
          cpu: Math.round(cpuUsage),
          memory: {
            used: Math.round(memUsed / 1024), // Convert to GB
            total: Math.round(memTotal / 1024)
          },
          disk: {
            used: 0, // TODO: Parse disk data when available
            total: 0
          },
          uptime: 0
        });
        
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch metrics');
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-4">
          <div className="h-20 bg-gray-700 rounded"></div>
          <div className="h-20 bg-gray-700 rounded"></div>
          <div className="h-20 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <Activity className="w-5 h-5" />
          <h3 className="font-semibold">System Monitor</h3>
        </div>
        <p className="text-gray-400 text-sm">{error || 'No data available'}</p>
      </div>
    );
  }

  const getColorClass = (percent: number) => {
    if (percent < 60) return 'bg-green-500';
    if (percent < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-blue-400" />
        <h3 className="font-semibold text-white">System Monitor</h3>
      </div>

      <div className="space-y-4">
        {/* CPU */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">CPU</span>
            </div>
            <span className="text-sm font-medium text-white">{metrics.cpu}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getColorClass(metrics.cpu)}`}
              style={{ width: `${metrics.cpu}%` }}
            ></div>
          </div>
        </div>

        {/* Memory */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">Memory</span>
            </div>
            <span className="text-sm font-medium text-white">
              {metrics.memory.used} / {metrics.memory.total} GB
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getColorClass(
                (metrics.memory.used / metrics.memory.total) * 100
              )}`}
              style={{ width: `${(metrics.memory.used / metrics.memory.total) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Disk */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300">Disk (C:)</span>
            </div>
            <span className="text-sm font-medium text-white">
              {metrics.disk.used} / {metrics.disk.total} GB
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getColorClass(
                (metrics.disk.used / metrics.disk.total) * 100
              )}`}
              style={{ width: `${(metrics.disk.used / metrics.disk.total) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      <a
        href="http://localhost:19999"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        View Full Dashboard →
      </a>
    </div>
  );
}