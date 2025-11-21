import React, { useEffect, useState, useRef } from 'react';
import { ServiceMetrics } from '../types/service';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

interface ServiceGraphProps {
  serviceId: string;
  serviceName: string;
  metrics: ServiceMetrics[];
  timeRange: '1h' | '6h' | '24h' | '7d';
}

export const ServiceGraph: React.FC<ServiceGraphProps> = ({
  serviceName,
  metrics,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState({
    avgResponseTime: 0,
    minResponseTime: 0,
    maxResponseTime: 0,
    uptime: 0,
  });

  useEffect(() => {
    if (metrics.length === 0) return;

    // Calculate statistics
    const responseTimes = metrics.map(m => m.responseTime);
    const onlineCount = metrics.filter(m => m.isOnline).length;

    setStats({
      avgResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      uptime: Math.round((onlineCount / metrics.length) * 100),
    });

    // Draw graph
    drawGraph();
  }, [metrics]);

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas || metrics.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get theme
    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#1f2937' : '#ffffff';
    const gridColor = isDark ? '#374151' : '#e5e7eb';
    const lineColor = isDark ? '#3b82f6' : '#2563eb';
    const textColor = isDark ? '#d1d5db' : '#374151';
    const areaColor = isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.1)';

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Calculate scales
    const maxResponse = Math.max(...metrics.map(m => m.responseTime)) * 1.1;

    // Draw grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + ((height - padding * 2) / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      // Y-axis labels
      const value = Math.round(maxResponse - (maxResponse / 5) * i);
      ctx.fillStyle = textColor;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${value}ms`, padding - 5, y + 4);
    }

    // Vertical grid lines (time)
    const timeStep = (width - padding * 2) / 5;
    for (let i = 0; i <= 5; i++) {
      const x = padding + timeStep * i;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();

      // X-axis labels
      const timeIndex = Math.floor((metrics.length - 1) * (i / 5));
      const date = new Date(metrics[timeIndex]?.timestamp || Date.now());
      const timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = textColor;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(timeLabel, x, height - padding + 20);
    }

    // Draw area under the line
    ctx.beginPath();
    ctx.fillStyle = areaColor;
    metrics.forEach((metric, index) => {
      const x = padding + ((width - padding * 2) / (metrics.length - 1)) * index;
      const y = height - padding - ((metric.responseTime / maxResponse) * (height - padding * 2));
      if (index === 0) {
        ctx.moveTo(x, height - padding);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.lineTo(width - padding, height - padding);
    ctx.closePath();
    ctx.fill();

    // Draw response time line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    metrics.forEach((metric, index) => {
      const x = padding + ((width - padding * 2) / (metrics.length - 1)) * index;
      const y = height - padding - ((metric.responseTime / maxResponse) * (height - padding * 2));
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw status dots
    metrics.forEach((metric, index) => {
      const x = padding + ((width - padding * 2) / (metrics.length - 1)) * index;
      const y = height - padding - ((metric.responseTime / maxResponse) * (height - padding * 2));

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = metric.isOnline ? '#10b981' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = bgColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  };

  if (metrics.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {serviceName} - Performance
        </h3>
        <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <Activity className="mr-2" size={24} />
          No metrics available yet
        </div>
      </div>
    );
  }

  const trend = metrics.length > 1
    ? metrics[metrics.length - 1].responseTime - metrics[0].responseTime
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {serviceName} - Performance
      </h3>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Response</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {stats.avgResponseTime}ms
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Min / Max</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {stats.minResponseTime} / {stats.maxResponseTime}ms
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Uptime</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">
            {stats.uptime}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Trend</p>
          <p className={`text-xl font-bold flex items-center ${
            trend > 0 ? 'text-red-600' : trend < 0 ? 'text-green-600' : 'text-gray-600'
          }`}>
            {trend > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            {Math.abs(trend)}ms
          </p>
        </div>
      </div>

      {/* Graph */}
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        className="w-full"
        style={{ maxHeight: '300px' }}
      />
    </div>
  );
};
