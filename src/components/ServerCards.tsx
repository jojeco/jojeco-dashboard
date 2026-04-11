import { useState, useEffect, useCallback } from 'react';
import { Server, Cpu, MemoryStick, HardDrive, Thermometer, Wifi, WifiOff } from 'lucide-react';
import { api } from '../services/api';

interface ServerTemp { type: string; value: number; }
interface DiskInfo { drive?: string; used: number; total: number; percent: number; }
interface ServerInfo {
  id: string; name: string; host: string; os: string; online: boolean;
  cpu?: number;
  memory?: { used: number; total: number; percent: number };
  disk?: DiskInfo;
  disks?: DiskInfo[];
  temps?: ServerTemp[];
}

function bar(pct: number) {
  const color = pct < 60 ? 'bg-green-500' : pct < 80 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function tempColor(c: number) {
  if (c < 60) return 'text-green-600 dark:text-green-400';
  if (c < 80) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function tempLabel(type: string) {
  if (type === 'x86_pkg_temp' || type === 'cpu_package') return 'CPU';
  if (type === 'acpitz') return 'Board';
  if (type === 'pch_cometlake') return 'PCH';
  return type.replace(/_/g, ' ');
}

export function ServerCards() {
  const [servers, setServers] = useState<ServerInfo[]>([]);

  const refresh = useCallback(() => {
    api.get<ServerInfo[]>('/system/servers').then(setServers).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  if (servers.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
      {servers.map(s => (
        <div key={s.id} className={`bg-white dark:bg-gray-800 border rounded-xl p-4 transition-all ${s.online ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className={`w-4 h-4 shrink-0 ${s.online ? 'text-blue-500' : 'text-gray-400'}`} />
              <div>
                <div className="font-medium text-sm text-gray-900 dark:text-white leading-tight">{s.name}</div>
                <div className="text-xs text-gray-500">{s.host} · {s.os}</div>
              </div>
            </div>
            {s.online
              ? <Wifi className="w-4 h-4 text-green-500 shrink-0" />
              : <WifiOff className="w-4 h-4 text-red-400 shrink-0" />}
          </div>

          {s.online && s.cpu !== undefined && (
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                  <span className={s.cpu > 80 ? 'text-red-500' : s.cpu > 60 ? 'text-yellow-500' : 'text-gray-500'}>{s.cpu.toFixed(1)}%</span>
                </div>
                {bar(s.cpu)}
              </div>
              {s.memory && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="flex items-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span>
                    <span>{s.memory.percent.toFixed(1)}% · {s.memory.used >= 1024 ? `${(s.memory.used/1024).toFixed(1)}G` : `${s.memory.used}M`} / {s.memory.total >= 1024 ? `${(s.memory.total/1024).toFixed(0)}G` : `${s.memory.total}M`}</span>
                  </div>
                  {bar(s.memory.percent)}
                </div>
              )}
              {(s.disks ?? (s.disk ? [s.disk] : [])).map((d, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {d.drive ? `Disk ${d.drive}` : 'Disk'}</span>
                    <span>{d.percent.toFixed(1)}% · {d.used}G / {d.total}G</span>
                  </div>
                  {bar(d.percent)}
                </div>
              ))}
              {s.temps && s.temps.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1">
                  <Thermometer className="w-3 h-3 text-gray-400" />
                  {s.temps.map((t, i) => (
                    <span key={i} className={`text-xs font-medium ${tempColor(t.value)}`}>
                      {tempLabel(t.type)} {t.value.toFixed(0)}°C
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!s.online && (
            <p className="text-xs text-gray-400 mt-1">Unreachable</p>
          )}
        </div>
      ))}
    </div>
  );
}
