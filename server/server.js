import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { readdir, readFile } from 'fs/promises';
import https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
import db from './database.js';
import { dockerRequest } from './lib/docker.js';
import { SSH_KEY, SSH_OPTS } from './lib/ssh.js';
import authRoutes from './routes/auth.js';
import dockerRoutes from './routes/docker.js';
import mediaRoutes from './routes/media.js';
import torrentsRoutes from './routes/torrents.js';
import jarvisRoutes from './routes/jarvis.js';
import chaosRoutes from './routes/chaos.js';
import adguardRoutes from './routes/adguard.js';
import kioskRoutes from './routes/kiosk.js';
import controlsRoutes from './routes/controls.js';
import { triggerJobs } from './lib/state.js';

const execFileAsync = promisify(execFile);

import {
  authMiddleware,
  optionalAuthMiddleware,
  hashPassword,
} from './auth.js';
import { lanOrAuth, sseAuthMiddleware } from './lib/middleware.js';

const app = express();
const PORT = process.env.PORT || 3001;

// trust proxy disabled — req.ip now reflects actual socket IP, not XFF header
// This prevents the XFF auth bypass where spoofed X-Forwarded-For: 192.168.50.x bypassed lanOrAuth
// lanOrAuth + sseAuthMiddleware live in ./lib/middleware.js (Phase 3 route split)

// Middleware
// CORS allowlist (Phase A 2026-07-06): same-origin /api is the normal path (nginx proxy);
// list covers direct-origin dev/staging access + the public hostname. No wildcard.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ||
  'https://dash.jojeco.ca,http://192.168.50.13:3005,http://192.168.50.13:3007,http://localhost:3005,http://localhost:5173'
).split(',');
app.use(cors({ origin: (origin, cb) => cb(null, !origin || CORS_ORIGINS.includes(origin)), credentials: true }));
app.use(express.json());

// ============================================================================
// AUTH ROUTES — extracted to ./routes/auth.js (Phase 3 route split)
// ============================================================================
app.use(authRoutes);

// ============================================================================
// SERVICE ROUTES
// ============================================================================

app.get('/api/services', optionalAuthMiddleware, (req, res) => {
  try {
    let userId = req.user?.userId;
    if (!userId) {
      // Guest: serve first user's services
      const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
      if (!firstUser) return res.json([]);
      userId = firstUser.id;
    }
    const stmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY created_at DESC');
    const services = stmt.all(userId);

    const parsed = services.map(service => {
      const s = {
        ...service,
        tags: JSON.parse(service.tags || '[]'),
        isPinned: Boolean(service.is_pinned),
        lanUrl: service.lan_url,
        healthCheckUrl: service.health_check_url,
        healthCheckInterval: service.health_check_interval,
        createdAt: service.created_at,
        updatedAt: service.updated_at,
        userId: service.user_id,
      };
      if (req.isGuest) {
        delete s.url; delete s.lanUrl; delete s.lan_url;
        delete s.healthCheckUrl; delete s.health_check_url;
        delete s.userId; delete s.user_id;
      }
      return s;
    });

    res.json(parsed);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.post('/api/services', authMiddleware, (req, res) => {
  try {
    const {
      name,
      description,
      url,
      lanUrl,
      icon,
      color,
      tags,
      isPinned,
      healthCheckUrl,
      healthCheckInterval,
    } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL required' });
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO services (
        id, user_id, name, description, url, lan_url, icon, color,
        tags, is_pinned, health_check_url, health_check_interval,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      req.user.userId,
      name,
      description || '',
      url,
      lanUrl || null,
      icon || 'Server',
      color || 'bg-blue-500',
      JSON.stringify(tags || []),
      isPinned ? 1 : 0,
      healthCheckUrl || null,
      healthCheckInterval || 60,
      now,
      now
    );

    res.json({ id, message: 'Service created successfully' });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

app.put('/api/services/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      url,
      lanUrl,
      icon,
      color,
      tags,
      isPinned,
      healthCheckUrl,
      healthCheckInterval,
    } = req.body;

    // Verify ownership
    const checkStmt = db.prepare('SELECT user_id FROM services WHERE id = ?');
    const service = checkStmt.get(id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (service.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE services
      SET name = ?, description = ?, url = ?, lan_url = ?, icon = ?,
          color = ?, tags = ?, is_pinned = ?, health_check_url = ?,
          health_check_interval = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      name,
      description || '',
      url,
      lanUrl || null,
      icon || 'Server',
      color || 'bg-blue-500',
      JSON.stringify(tags || []),
      isPinned ? 1 : 0,
      healthCheckUrl || null,
      healthCheckInterval || 60,
      now,
      id
    );

    res.json({ message: 'Service updated successfully' });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.delete('/api/services/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const checkStmt = db.prepare('SELECT user_id FROM services WHERE id = ?');
    const service = checkStmt.get(id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (service.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const stmt = db.prepare('DELETE FROM services WHERE id = ?');
    stmt.run(id);

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// ============================================================================
// METRICS ROUTES
// ============================================================================

app.post('/api/metrics', authMiddleware, (req, res) => {
  try {
    const { serviceId, timestamp, responseTime, statusCode, isOnline } = req.body;

    const stmt = db.prepare(`
      INSERT INTO service_metrics (service_id, timestamp, response_time, status_code, is_online)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(serviceId, timestamp, responseTime, statusCode, isOnline ? 1 : 0);
    res.json({ message: 'Metrics saved' });
  } catch (error) {
    console.error('Save metrics error:', error);
    res.status(500).json({ error: 'Failed to save metrics' });
  }
});

app.get('/api/metrics/:serviceId', authMiddleware, (req, res) => {
  try {
    const { serviceId } = req.params;
    const { startTime, endTime } = req.query;

    const stmt = db.prepare(`
      SELECT * FROM service_metrics
      WHERE service_id = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    const metrics = stmt.all(serviceId, parseInt(startTime), parseInt(endTime));

    const parsed = metrics.map(m => ({
      serviceId: m.service_id,
      timestamp: m.timestamp,
      responseTime: m.response_time,
      statusCode: m.status_code,
      isOnline: Boolean(m.is_online),
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// ============================================================================
// HEALTH CHECK ROUTES
// ============================================================================

app.post('/api/health-checks', authMiddleware, (req, res) => {
  try {
    const { serviceId, status, responseTime, statusCode, timestamp, error } = req.body;

    const stmt = db.prepare(`
      INSERT INTO health_checks (service_id, status, response_time, status_code, timestamp, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(serviceId, status, responseTime || null, statusCode || null, timestamp, error || null);
    res.json({ message: 'Health check saved' });
  } catch (error) {
    console.error('Save health check error:', error);
    res.status(500).json({ error: 'Failed to save health check' });
  }
});

app.get('/api/health-checks/:serviceId', authMiddleware, (req, res) => {
  try {
    const { serviceId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const stmt = db.prepare(`
      SELECT * FROM health_checks
      WHERE service_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const checks = stmt.all(serviceId, limit);
    res.json(checks);
  } catch (error) {
    console.error('Get health checks error:', error);
    res.status(500).json({ error: 'Failed to fetch health checks' });
  }
});

// ============================================================================
// IMPORT/EXPORT ROUTES
// ============================================================================

app.get('/api/services/export', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM services WHERE user_id = ?');
    const services = stmt.all(req.user.userId);

    const exported = services.map(service => ({
      name: service.name,
      description: service.description,
      url: service.url,
      lanUrl: service.lan_url,
      icon: service.icon,
      color: service.color,
      tags: JSON.parse(service.tags || '[]'),
      isPinned: Boolean(service.is_pinned),
      healthCheckUrl: service.health_check_url,
      healthCheckInterval: service.health_check_interval,
    }));

    res.json(exported);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.post('/api/services/import', authMiddleware, (req, res) => {
  try {
    const { services } = req.body;

    if (!Array.isArray(services)) {
      return res.status(400).json({ error: 'Services must be an array' });
    }

    const stmt = db.prepare(`
      INSERT INTO services (
        id, user_id, name, description, url, lan_url, icon, color,
        tags, is_pinned, health_check_url, health_check_interval,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    const now = Date.now();

    for (const service of services) {
      const id = crypto.randomUUID();
      stmt.run(
        id,
        req.user.userId,
        service.name,
        service.description || '',
        service.url,
        service.lanUrl || null,
        service.icon || 'Server',
        service.color || 'bg-blue-500',
        JSON.stringify(service.tags || []),
        service.isPinned ? 1 : 0,
        service.healthCheckUrl || null,
        service.healthCheckInterval || 60,
        now,
        now
      );
      imported++;
    }

    res.json({ imported });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

// ============================================================================
// SYSTEM METRICS ROUTES (Netdata proxy)
// Node 18+ built-in fetch is used here — no extra dependency needed.
// ============================================================================

const NETDATA_URL = process.env.NETDATA_URL || 'http://netdata:19999';

async function fetchNetdata(path) {
  const res = await fetch(`${NETDATA_URL}${path}`);
  if (!res.ok) throw new Error(`Netdata responded with ${res.status}`);
  return res.json();
}

// Return the numeric value for a named dimension from a Netdata data row.
// labels: ["time", "dim1", "dim2", ...], data: [timestamp, val1, val2, ...]
function netdataValue(labels, data, name) {
  const idx = labels.indexOf(name);
  return idx > 0 && data ? Math.abs(Number(data[idx])) : 0;
}

app.get('/api/system/metrics', authMiddleware, async (req, res) => {
  try {
    const [cpuData, ramData, diskData, netData] = await Promise.all([
      fetchNetdata('/api/v1/data?chart=system.cpu&after=-2&points=1&format=json'),
      fetchNetdata('/api/v1/data?chart=system.ram&after=-2&points=1&format=json'),
      fetchNetdata('/api/v1/data?chart=disk_space./&after=-2&points=1&format=json'),
      fetchNetdata('/api/v1/data?chart=system.net&after=-2&points=1&format=json'),
    ]);

    // CPU: system.cpu shows only non-idle time; sum all dimensions = total usage
    const cpuRow = cpuData.data?.[0];
    const cpu = cpuRow
      ? Math.min(100, cpuRow.slice(1).reduce((sum, v) => sum + Math.abs(Number(v)), 0))
      : 0;

    // RAM (MB)
    const ramRow = ramData.data?.[0];
    const ramUsed     = netdataValue(ramData.labels, ramRow, 'used');
    const ramFree     = netdataValue(ramData.labels, ramRow, 'free');
    const ramCached   = netdataValue(ramData.labels, ramRow, 'cached');
    const ramBuffers  = netdataValue(ramData.labels, ramRow, 'buffers');
    const ramTotal    = ramUsed + ramFree + ramCached + ramBuffers;

    // Disk (GiB) — root partition
    const diskRow      = diskData.data?.[0];
    const diskUsed     = netdataValue(diskData.labels, diskRow, 'used');
    const diskAvail    = netdataValue(diskData.labels, diskRow, 'avail');
    const diskReserved = netdataValue(diskData.labels, diskRow, 'reserved_for_root');
    const diskTotal    = diskUsed + diskAvail + diskReserved;

    // Network (kbits/s) — Netdata uses negative for sent
    const netRow      = netData.data?.[0];
    const netDownload = netdataValue(netData.labels, netRow, 'received');
    const netUpload   = netdataValue(netData.labels, netRow, 'sent');

    res.json({
      cpu: Math.round(cpu * 10) / 10,
      memory: {
        used:    Math.round(ramUsed),
        total:   Math.round(ramTotal),
        percent: ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 1000) / 10 : 0,
      },
      disk: {
        used:    Math.round(diskUsed * 10) / 10,
        total:   Math.round(diskTotal * 10) / 10,
        percent: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 1000) / 10 : 0,
      },
      network: {
        download: Math.round(netDownload * 10) / 10,
        upload:   Math.round(netUpload * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Netdata metrics error:', error.message);
    res.status(503).json({ error: 'System metrics unavailable. Is Netdata running?' });
  }
});

app.get('/api/system/history', authMiddleware, async (req, res) => {
  try {
    const points = Math.min(parseInt(req.query.points) || 60, 300);
    const data = await fetchNetdata(
      `/api/v1/data?chart=system.cpu&after=-${points}&points=${points}&format=json`
    );

    const history = (data.data || []).map(row => ({
      timestamp: row[0] * 1000, // Netdata timestamps are seconds; convert to ms
      cpu: Math.round(
        Math.min(100, row.slice(1).reduce((sum, v) => sum + Math.abs(Number(v)), 0)) * 10
      ) / 10,
    }));

    res.json(history);
  } catch (error) {
    console.error('Netdata history error:', error.message);
    res.status(503).json({ error: 'System history unavailable' });
  }
});

// ============================================================================
// MULTI-SERVER METRICS
// ============================================================================

function parsePromValues(text, metric) {
  const results = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    if (!line.startsWith(metric + '{') && !line.startsWith(metric + ' ')) continue;
    const labelStr = line.match(/\{([^}]*)\}/)?.[1] || '';
    const value = parseFloat(line.split(' ').slice(-1)[0]);
    const labels = {};
    for (const m of (labelStr.match(/(\w+)="([^"]*)"/g) || [])) {
      const eq = m.indexOf('='); labels[m.slice(0, eq)] = m.slice(eq + 2, -1);
    }
    results.push({ labels, value });
  }
  return results;
}

async function fetchServer1() {
  try {
    const res = await fetch('http://192.168.50.10:9182/metrics', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('windows_exporter error');
    const text = await res.text();

    // CPU: use load1-equivalent via processor_utility rate approximation — fall back to WMI load
    const load1 = parsePromValues(text, 'windows_cpu_processor_performance_total')
      .filter(m => m.labels.core !== '_Total' && m.labels.mode === 'privileged').length > 0
      ? null : null;
    // Use idle time approach: sum idle / sum total per core
    const idleVals = parsePromValues(text, 'windows_cpu_time_total').filter(m => m.labels.mode === 'idle');
    const allVals  = parsePromValues(text, 'windows_cpu_time_total');
    const cores    = new Set(idleVals.map(m => m.labels.core)).size || 1;
    const idleSum  = idleVals.reduce((s, m) => s + m.value, 0);
    const totalSum = allVals.reduce((s, m) => s + m.value, 0);
    const cpuPct   = totalSum > 0 ? Math.min(100, Math.round((1 - idleSum / totalSum) * 1000) / 10) : 0;

    // Memory
    const memAvail = parsePromValues(text, 'windows_memory_available_bytes')[0]?.value ?? 0;
    const memLimit = parsePromValues(text, 'windows_memory_commit_limit')[0]?.value ?? 0;
    const memTotal = memLimit;
    const memUsed  = memTotal - memAvail;

    // Disks — dynamic detection, all volumes > 512MB, exclude hidden raw volumes
    const diskSizes = parsePromValues(text, 'windows_logical_disk_size_bytes').filter(m => m.value > 536870912 && isRealMount(m.labels.volume));
    const diskFrees = parsePromValues(text, 'windows_logical_disk_free_bytes');
    const disks = diskSizes.map(s => {
      const freeEntry = diskFrees.find(f => f.labels.volume === s.labels.volume);
      const free = freeEntry?.value ?? 0;
      const used = s.value - free;
      return { drive: s.labels.volume, used: Math.round(used / 1024 / 1024 / 1024 * 10) / 10, total: Math.round(s.value / 1024 / 1024 / 1024 * 10) / 10, percent: Math.round((used / s.value) * 1000) / 10 };
    });

    // CPU + GPU temps from OhmGraphite (port 9101, v0.37.0 running as service)
    const temps = [];
    try {
      const ohmRes = await fetch('http://192.168.50.10:9101/metrics', { signal: AbortSignal.timeout(3000) });
      if (ohmRes.ok) {
        const ohmText = await ohmRes.text();
        const cpuPkg = parsePromValues(ohmText, 'ohm_cpu_celsius').find(m => m.labels.sensor === 'CPU Package');
        if (cpuPkg) temps.push({ type: 'CPU Package', value: Math.round(cpuPkg.value * 10) / 10 });
        const gpuCore = parsePromValues(ohmText, 'ohm_gpunvidia_celsius').find(m => m.labels.sensor === 'GPU Core');
        if (gpuCore) temps.push({ type: 'GPU Core', value: Math.round(gpuCore.value * 10) / 10 });
      }
    } catch {}

    return {
      id: 'server1', name: 'Server 1 (Plex)', host: '192.168.50.10', os: 'Windows 10', online: true, cpu: cpuPct,
      memory: { used: Math.round(memUsed / 1024 / 1024), total: Math.round(memTotal / 1024 / 1024), percent: memTotal > 0 ? Math.round((memUsed / memTotal) * 1000) / 10 : 0 },
      disks,
      disk: disks[0] ?? null,
      temps,
    };
  } catch {
    return { id: 'server1', name: 'Server 1 (Plex)', host: '192.168.50.10', os: 'Windows 10', online: false, temps: [] };
  }
}

async function fetchServer2() {
  try {
    const [cpuData, ramData, diskData] = await Promise.all([
      fetchNetdata('/api/v1/data?chart=system.cpu&after=-2&points=1&format=json'),
      fetchNetdata('/api/v1/data?chart=system.ram&after=-2&points=1&format=json'),
      fetchNetdata('/api/v1/data?chart=disk_space./&after=-2&points=1&format=json'),
    ]);
    const cpuRow = cpuData.data?.[0];
    const cpu = cpuRow ? Math.min(100, Math.round(cpuRow.slice(1).reduce((s, v) => s + Math.abs(Number(v)), 0) * 10) / 10) : 0;
    const ramRow = ramData.data?.[0];
    const ramUsed = netdataValue(ramData.labels, ramRow, 'used');
    const ramFree = netdataValue(ramData.labels, ramRow, 'free');
    const ramCached = netdataValue(ramData.labels, ramRow, 'cached');
    const ramBuffers = netdataValue(ramData.labels, ramRow, 'buffers');
    const ramTotal = ramUsed + ramFree + ramCached + ramBuffers;
    const diskRow = diskData.data?.[0];
    const diskUsed = netdataValue(diskData.labels, diskRow, 'used');
    const diskAvail = netdataValue(diskData.labels, diskRow, 'avail');
    const diskReserved = netdataValue(diskData.labels, diskRow, 'reserved_for_root');
    const diskTotal = diskUsed + diskAvail + diskReserved;
    let temps = [];
    try {
      const zones = await readdir('/sys/class/thermal');
      const thermalZones = zones.filter(z => z.startsWith('thermal_zone'));
      const raw = await Promise.all(thermalZones.map(async z => {
        const [type, temp] = await Promise.all([
          readFile(`/sys/class/thermal/${z}/type`, 'utf8').catch(() => 'unknown'),
          readFile(`/sys/class/thermal/${z}/temp`, 'utf8').catch(() => '0'),
        ]);
        return { type: type.trim(), value: Math.round(parseInt(temp.trim()) / 100) / 10 };
      }));
      temps = raw.filter(t => t.value > 0 && t.value < 120);
    } catch {}
    return {
      id: 'server2', name: 'Server 2 (Docker)', host: '192.168.50.13', os: 'Ubuntu LXC', online: true, cpu,
      memory: { used: Math.round(ramUsed), total: Math.round(ramTotal), percent: ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 1000) / 10 : 0 },
      disk: { used: Math.round(diskUsed * 10) / 10, total: Math.round(diskTotal * 10) / 10, percent: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 1000) / 10 : 0 },
      temps,
    };
  } catch {
    return { id: 'server2', name: 'Server 2 (Docker)', host: '192.168.50.13', os: 'Ubuntu LXC', online: false, temps: [] };
  }
}

async function fetchServer3() {
  try {
    const res = await fetch('http://192.168.50.12:9100/metrics', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('node_exporter error');
    const text = await res.text();
    const load1 = parsePromValues(text, 'node_load1')[0]?.value ?? 0;
    const cpuCores = new Set(parsePromValues(text, 'node_cpu_seconds_total').map(m => m.labels.cpu)).size || 1;
    const cpu = Math.min(100, Math.round((load1 / cpuCores) * 1000) / 10);
    const memTotal = parsePromValues(text, 'node_memory_MemTotal_bytes')[0]?.value ?? 0;
    const memAvail = parsePromValues(text, 'node_memory_MemAvailable_bytes')[0]?.value ?? 0;
    const memUsed = memTotal - memAvail;
    const SKIP_FSTYPES = new Set(['cifs', 'smb3', 'nfs', 'nfs4', 'tmpfs', 'devtmpfs', 'squashfs', 'overlay', 'sysfs', 'proc', 'cgroup', 'cgroup2', 'pstore', 'efivarfs']);
    const diskSizeEntries = parsePromValues(text, 'node_filesystem_size_bytes').filter(m => !SKIP_FSTYPES.has(m.labels.fstype) && m.value > 5368709120 && isRealMount(m.labels.mountpoint));
    const diskAvailEntries = parsePromValues(text, 'node_filesystem_avail_bytes');
    const seenSizes = new Set();
    const disks = diskSizeEntries.filter(m => {
      const key = Math.round(m.value / 1e9);
      if (seenSizes.has(key)) return false;
      seenSizes.add(key);
      return true;
    }).map(m => {
      const avail = diskAvailEntries.find(a => a.labels.mountpoint === m.labels.mountpoint && a.labels.device === m.labels.device)?.value ?? 0;
      const used = m.value - avail;
      return { label: m.labels.mountpoint, used: Math.round(used / 1024 / 1024 / 1024 * 10) / 10, total: Math.round(m.value / 1024 / 1024 / 1024 * 10) / 10, percent: Math.round((used / m.value) * 1000) / 10 };
    });
    const coreTemps = parsePromValues(text, 'node_hwmon_temp_celsius').filter(m => m.labels.chip === 'platform_coretemp_0' && m.value > 0 && m.value < 120);
    const pkgTemp = coreTemps.find(m => m.labels.sensor === 'temp1');
    const temps = pkgTemp ? [{ type: 'x86_pkg_temp', value: pkgTemp.value }] : coreTemps.slice(0, 1).map(t => ({ type: 'cpu', value: t.value }));
    return {
      id: 'server3', name: 'Server 3 (Media)', host: '192.168.50.12', os: 'Ubuntu 24.04', online: true, cpu,
      memory: { used: Math.round(memUsed / 1024 / 1024), total: Math.round(memTotal / 1024 / 1024), percent: memTotal > 0 ? Math.round((memUsed / memTotal) * 1000) / 10 : 0 },
      disks,
      disk: disks[0] ?? null,
      temps,
    };
  } catch {
    return { id: 'server3', name: 'Server 3 (Media)', host: '192.168.50.12', os: 'Ubuntu 24.04', online: false, temps: [] };
  }
}

app.get('/api/system/servers', authMiddleware, async (req, res) => {
  const servers = await Promise.all([fetchServer1(), fetchServer2(), fetchServer3()]);
  res.json(servers);
});

// ============================================================================
// QBITTORRENT PROXY ROUTES — extracted to ./routes/torrents.js (Phase 3 split)
// ============================================================================
app.use(torrentsRoutes);

// ============================================================================
// DOCKER PROXY ROUTES — extracted to ./routes/docker.js (Phase 3 route split)
// ============================================================================
app.use(dockerRoutes);

// ============================================================================
// MEDIA PROXY ROUTES — extracted to ./routes/media.js (Phase 3 route split)
// ============================================================================
app.use(mediaRoutes);

// ============================================================================
// SEED DEFAULT SERVICES
// ============================================================================

const DEFAULT_SERVICES = [
  { name: 'Plex',        description: 'Media server',           url: 'http://192.168.50.10:32400/web', icon: 'Film',     color: 'bg-yellow-500', tags: ['media'] },
  { name: 'Overseerr',   description: 'Media requests',         url: 'https://seerr.jojeco.ca',        icon: 'Film',     color: 'bg-blue-500',   tags: ['media'] },
  { name: 'Sonarr',      description: 'TV show manager',        url: 'http://192.168.50.13:8989',      icon: 'Monitor',  color: 'bg-teal-500',   tags: ['media', 'arr'] },
  { name: 'Radarr',      description: 'Movie manager',          url: 'http://192.168.50.13:7878',      icon: 'Film',     color: 'bg-orange-500', tags: ['media', 'arr'] },
  { name: 'Prowlarr',    description: 'Indexer manager',        url: 'http://192.168.50.13:9696',      icon: 'Radio',    color: 'bg-purple-500', tags: ['media', 'arr'] },
  { name: 'Bazarr',     description: 'Subtitle manager',       url: 'http://192.168.50.13:6767',      icon: 'Subtitles', color: 'bg-violet-500', tags: ['media', 'arr'] },
  { name: 'qBittorrent', description: 'Torrent client',         url: 'http://192.168.50.13:9091',      icon: 'Download', color: 'bg-green-500',  tags: ['download'] },
  { name: 'Navidrome',   description: 'Music streaming',        url: 'https://navidrome.jojeco.ca',    icon: 'Music',    color: 'bg-pink-500',   tags: ['media', 'music'] },
  { name: 'Portainer',   description: 'Docker management',      url: 'http://192.168.50.13:9000',      icon: 'Box',      color: 'bg-cyan-500',   tags: ['infra'] },
  { name: 'Grafana',     description: 'Metrics & monitoring',   url: 'http://192.168.50.13:3002',      icon: 'Activity', color: 'bg-red-500',    tags: ['infra', 'monitoring'] },
  { name: 'LiteLLM',     description: 'AI model gateway',       url: 'http://192.168.50.13:4000/ui',   icon: 'Cpu',      color: 'bg-indigo-500', tags: ['ai'] },
  { name: 'Open WebUI',  description: 'AI chat interface',      url: 'https://ai.jojeco.ca',           icon: 'MessageSquare', color: 'bg-blue-600', tags: ['ai'] },
  { name: 'Proxmox',     description: 'Hypervisor',             url: 'https://192.168.50.11:8006',      icon: 'Server',   color: 'bg-gray-500',   tags: ['infra'] },
];

app.post('/api/services/seed', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT COUNT(*) as count FROM services WHERE user_id = ?').get(req.user.userId);
    if (existing.count > 0 && !req.body.force) {
      return res.json({ skipped: true, message: 'Services already exist. Send force:true to overwrite.' });
    }

    const stmt = db.prepare(`
      INSERT INTO services (id, user_id, name, description, url, lan_url, icon, color, tags, is_pinned, health_check_url, health_check_interval, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    let inserted = 0;
    for (const s of DEFAULT_SERVICES) {
      stmt.run(crypto.randomUUID(), req.user.userId, s.name, s.description, s.url, null, s.icon, s.color, JSON.stringify(s.tags), 0, s.url, 60, now, now);
      inserted++;
    }
    res.json({ inserted });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Seed failed' });
  }
});

// ============================================================================
// CD RIP STATUS ROUTE
// ============================================================================

const RIP_STATUS_URL = process.env.RIP_STATUS_URL || 'http://192.168.50.10:9998';

app.get('/api/rip/status', authMiddleware, async (req, res) => {
  try {
    const r = await fetch(`${RIP_STATUS_URL}/`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const text = await r.text();
    // Strip UTF-8 BOM that PowerShell Set-Content adds
    const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;
    res.json(JSON.parse(clean));
  } catch {
    res.json({ status: 'idle', album: '', track: 0, total: 0, percent: 0, trackName: '', updatedAt: '' });
  }
});

// ============================================================================
// TDARR ROUTE

const TDARR_URL = 'http://192.168.50.13:8265';

app.get('/api/tdarr/status', authMiddleware, async (req, res) => {
  try {
    const [statsRes, nodesRes] = await Promise.allSettled([
      fetch(`${TDARR_URL}/api/v2/cruddb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { collection: 'StatisticsJSONDB', mode: 'getAll', docID: 'statistics' } }),
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${TDARR_URL}/api/v2/get-nodes`, { signal: AbortSignal.timeout(5000) }),
    ]);

    const stats = statsRes.status === 'fulfilled' && statsRes.value.ok
      ? (await statsRes.value.json())[0] : null;

    const nodesRaw = nodesRes.status === 'fulfilled' && nodesRes.value.ok
      ? await nodesRes.value.json() : {};

    const workers = [];
    for (const node of Object.values(nodesRaw)) {
      const n = node;
      for (const w of Object.values(n.workers || {})) {
        if (w.status !== 'No tasks') {
          workers.push({
            node: n.nodeName,
            type: w.workerType,
            status: w.status,
            file: w.file ? w.file.split('/').pop() : '',
            percentage: Math.round(w.percentage || 0),
            fps: w.fps || 0,
          });
        }
      }
    }

    res.json({
      total: stats?.totalFileCount || 0,
      transcoded: stats?.totalTranscodeCount || 0,
      transcodeQueue: stats?.table0Count || 0,
      noAction: stats?.table2Count || 0,       // table2 = no action needed (already correct format)
      transcodeErrors: stats?.table3Count || 0, // table3 = transcode errors
      healthErrors: stats?.table5Count || 0,
      healthOk: stats?.table6Count || 0,
      tdarrScore: parseFloat(stats?.tdarrScore || 0),
      sizeDiffGB: stats ? Math.round((stats.sizeDiff || 0) * 10) / 10 : 0,
      workers,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reach Tdarr' });
  }
});

// ============================================================================
// AI CHAT ROUTE
// ============================================================================

const LITELLM_URL = 'http://192.168.50.13:4000/v1/chat/completions';
const LITELLM_KEY = process.env.LITELLM_KEY;  // required — set in server/.env

app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  const { model = 'local-smart', messages, max_tokens = 2000, temperature = 0.7 } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const upstream = await fetch(LITELLM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_KEY}`,
      },
      body: JSON.stringify({ model, messages, stream: true, max_tokens, temperature }),
      signal: AbortSignal.timeout(180000),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.write(`data: {"error":"LiteLLM ${upstream.status}: ${errText.slice(0,200)}"}\n\n`);
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    res.write(`data: {"error":"${String(err.message).replace(/"/g, "'")}"}\n\n`);
    res.end();
  }
});

// ============================================================================
// LAB OVERVIEW ROUTES
// ============================================================================

const LAB_MACHINES = [
  { id: 'server1', name: 'Server 1', host: '192.168.50.10', role: 'Plex + Games',    os: 'Windows 10',  always_on: true,  gpu_label: 'GTX 1060' },
  { id: 'server3', name: 'Server 3', host: '192.168.50.12', role: 'LLM Node',        os: 'Ubuntu',      always_on: true,  gpu_label: 'GTX 1060 Max-Q' },
  { id: 'server2', name: 'Server 2', host: '192.168.50.13', role: 'Docker Host',     os: 'Debian LXC',  always_on: true,  gpu_label: null },
  { id: 'macmini', name: 'Mac Mini', host: '192.168.50.30', role: 'DNS + Monitor',   os: 'macOS',       always_on: true,  gpu_label: null },
  { id: 'jopc',    name: 'JoPc',     host: '192.168.50.20', role: 'RTX 3080 Ti',     os: 'Windows',     always_on: false, gpu_label: 'RTX 3080 Ti' },
  { id: 'macbook', name: 'MacBook',  host: '192.168.50.40', role: 'M4 (burst)',      os: 'macOS',       always_on: false, gpu_label: null },
];

const SKIP_FS_PATHS = new Set(['/etc/hostname', '/etc/hosts', '/etc/resolv.conf']);
// macOS APFS internal volumes to skip (not user-facing)
const SKIP_FS_PREFIXES = ['/etc/', '/proc/', '/sys/', '/dev/', '/run/', '/System/Volumes/VM', '/System/Volumes/Preboot', '/System/Volumes/Recovery', '/System/Volumes/Hardware', '/System/Volumes/Update', '/private/var/'];
// Windows hidden volume pattern (e.g., HarddiskVolume3)
const WIN_RAW_VOLUME_RE = /^HarddiskVolume\d+$/i;

function isRealMount(path) {
  if (SKIP_FS_PATHS.has(path)) return false;
  if (SKIP_FS_PREFIXES.some(p => path.startsWith(p))) return false;
  if (/\.[a-z]+$/.test(path)) return false; // file path with extension
  if (WIN_RAW_VOLUME_RE.test(path)) return false; // Windows hidden volumes
  return true;
}

function dedupeDisks(fsArray) {
  const seen = new Set();
  return fsArray.filter(d => {
    const key = `${d.size}:${Math.round(d.used / 1e9)}`; // same size+used = same disk shown twice
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchLabGlancesDetailed(host) {
  const base = `http://${host}:61208/api/4`;
  const g = (path) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(4000) })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const [cpu, mem, fs, sensors, gpu] = await Promise.all([g('/cpu'), g('/mem'), g('/fs'), g('/sensors'), g('/gpu')]);
  if (!cpu && !mem) throw new Error('offline');

  const rawDisks = (fs ?? []).filter(d => d.size > 5368709120 && isRealMount(d.mnt_point));
  const disks = dedupeDisks(rawDisks).map(d => ({
    label: d.mnt_point,
    used: d.used,
    size: d.size,
    percent: d.percent,
  }));

  // Prefer discrete GPU (NVIDIA/AMD) over integrated Intel
  const allGpus = Array.isArray(gpu) ? gpu : [];
  const discrete = allGpus.find(g => !g.name?.toLowerCase().includes('intel') && !g.name?.toLowerCase().includes('uhd'));
  const gpuEntry = discrete ?? allGpus[0] ?? null;
  const gpuData = gpuEntry ? {
    name: gpuEntry.name || gpuEntry.gpu_id || 'GPU',
    temp: gpuEntry.temperature ?? null,
    utilization: gpuEntry.proc ?? null,
    mem_percent: gpuEntry.mem ?? null,
    nvenc_util: gpuEntry.encoder_proc ?? null,
  } : null;

  // Only include actual temperature sensors (not battery %, fan speed, etc.)
  const TEMP_TYPES = new Set(['temperature_core', 'temperature', 'temperature_alarm']);
  const allTemps = (sensors ?? [])
    .filter(s => TEMP_TYPES.has(s.type) && s.value > 0 && s.value < 105)
    .map(s => s.value);
  const maxTemp = allTemps.length > 0 ? Math.round(Math.max(...allTemps) * 10) / 10 : null;

  return {
    online: true,
    cpu: cpu?.total != null ? Math.round(cpu.total * 10) / 10 : null,
    mem: mem ? { used: mem.used, total: mem.total, percent: mem.percent } : null,
    disks,
    gpu: gpuData,
    temp: maxTemp,
  };
}

async function fetchLabServer1Detailed() {
  // Always prefer OhmGraphite for CPU/GPU temp on S1 (Glances sensors return unreliable ACPI thermalzone values on Windows)
  try {
    const data = await fetchLabGlancesDetailed('192.168.50.10');
    try {
      const ohmRes = await fetch('http://192.168.50.10:9101/metrics', { signal: AbortSignal.timeout(3000) });
      if (ohmRes.ok) {
        const ohmText = await ohmRes.text();
        const cpuPkg = parsePromValues(ohmText, 'ohm_cpu_celsius').find(m => m.labels.sensor === 'CPU Package');
        if (cpuPkg) data.temp = Math.round(cpuPkg.value * 10) / 10;
        const gpuCore = parsePromValues(ohmText, 'ohm_gpunvidia_celsius').find(m => m.labels.sensor === 'GPU Core');
        if (gpuCore && data.gpu) data.gpu.temp = Math.round(gpuCore.value * 10) / 10;
        const nvencSensor = parsePromValues(ohmText, 'ohm_gpunvidia_load_percent').find(m => m.labels.sensor === 'GPU Video Engine');
        if (nvencSensor && data.gpu) data.gpu.nvenc_util = Math.round(nvencSensor.value * 10) / 10;
      }
    } catch {}
    return data;
  } catch {
    // Fall back to windows_exporter with dynamic drive detection
    try {
      const res = await fetch('http://192.168.50.10:9182/metrics', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('no metrics');
      const text = await res.text();

      const idleVals = parsePromValues(text, 'windows_cpu_time_total').filter(m => m.labels.mode === 'idle');
      const allVals  = parsePromValues(text, 'windows_cpu_time_total');
      const idleSum  = idleVals.reduce((s, m) => s + m.value, 0);
      const totalSum = allVals.reduce((s, m) => s + m.value, 0);
      const cpuPct   = totalSum > 0 ? Math.min(100, Math.round((1 - idleSum / totalSum) * 1000) / 10) : 0;

      const memAvail = parsePromValues(text, 'windows_memory_available_bytes')[0]?.value ?? 0;
      const memLimit = parsePromValues(text, 'windows_memory_commit_limit')[0]?.value ?? 0;
      const memUsed  = memLimit - memAvail;

      // Dynamic drive detection — all volumes > 512MB, exclude hidden raw volumes
      const diskSizes = parsePromValues(text, 'windows_logical_disk_size_bytes')
        .filter(m => m.value > 536870912 && isRealMount(m.labels.volume));
      const diskFrees = parsePromValues(text, 'windows_logical_disk_free_bytes');
      const disks = diskSizes.map(s => {
        const free = diskFrees.find(f => f.labels.volume === s.labels.volume)?.value ?? 0;
        const used = s.value - free;
        return { label: s.labels.volume, used, size: s.value, percent: Math.round((used / s.value) * 1000) / 10 };
      });

      const thermalVals = parsePromValues(text, 'windows_thermalzone_temperature_celsius');
      const temps = thermalVals.map(t => t.value).filter(t => t > 0 && t < 120);
      const maxTemp = temps.length > 0 ? Math.round(Math.max(...temps) * 10) / 10 : null;

      // GPU + CPU temp from OHM (port 9101) — thermalzone temps are ACPI values (~28°C), not real CPU temps
      let gpuTemp = null;
      let cpuTempOhm = null;
      let nvencUtil = null;
      try {
        const ohmRes = await fetch('http://192.168.50.10:9101/metrics', { signal: AbortSignal.timeout(3000) });
        if (ohmRes.ok) {
          const ohmText = await ohmRes.text();
          const gpuCoreSensor = parsePromValues(ohmText, 'ohm_gpunvidia_celsius').find(m => m.labels.sensor === 'GPU Core');
          if (gpuCoreSensor) gpuTemp = Math.round(gpuCoreSensor.value * 10) / 10;
          const cpuPkg = parsePromValues(ohmText, 'ohm_cpu_celsius').find(m => m.labels.sensor === 'CPU Package');
          if (cpuPkg) cpuTempOhm = Math.round(cpuPkg.value * 10) / 10;
          const nvencSensor = parsePromValues(ohmText, 'ohm_gpunvidia_load_percent').find(m => m.labels.sensor === 'GPU Video Engine');
          if (nvencSensor) nvencUtil = Math.round(nvencSensor.value * 10) / 10;
        }
      } catch {}

      const gpu = gpuTemp !== null ? { name: 'GTX 1060 6GB', temp: gpuTemp, utilization: null, mem_percent: null, nvenc_util: nvencUtil ?? null } : null;
      return { online: true, cpu: cpuPct, mem: { used: memUsed, total: memLimit, percent: memLimit > 0 ? Math.round((memUsed / memLimit) * 1000) / 10 : 0 }, disks, gpu, temp: cpuTempOhm ?? maxTemp };
    } catch {
      return { online: false };
    }
  }
}

async function fetchLabBurstMachine(host) {
  // Online = Ollama responds
  try {
    await fetch(`http://${host}:11434`, { signal: AbortSignal.timeout(2500) });
    // Try Glances for full metrics
    try {
      return await fetchLabGlancesDetailed(host);
    } catch {
      return { online: true, cpu: null, mem: null, disks: [], gpu: null, temp: null };
    }
  } catch {
    return { online: false };
  }
}

const CRITICAL_SERVICES = [
  { id: 'plex',       name: 'Plex',       url: 'http://192.168.50.10:32400/identity' },
  { id: 'adguard',    name: 'AdGuard',    url: 'http://192.168.50.30:3000' },
  { id: 'ollama',     name: 'Ollama',     url: 'http://192.168.50.12:11434' },
  { id: 'prometheus', name: 'Prometheus', url: 'http://192.168.50.13:9090/-/healthy' },
];

async function fetchTailscaleStatus() {
  try {
    const { stdout } = await execFileAsync('ssh', [
      '-i', '/root/.ssh/jojeco_lab_key',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=4',
      '-o', 'BatchMode=yes',
      'jj@192.168.50.30',
      '/usr/local/bin/tailscale status --json'
    ], { timeout: 6000 });
    const data = JSON.parse(stdout);
    const self = data.Self ?? {};
    const peers = Object.values(data.Peer ?? {});
    const onlinePeers = peers.filter(p => !p.Offline);
    return {
      online: self.Online !== false,
      ip: (self.TailscaleIPs ?? [])[0] ?? null,
      peers: peers.length,
      onlinePeers: onlinePeers.length,
      peerList: peers.map(p => ({ name: p.HostName, online: !p.Offline, ip: (p.TailscaleIPs??[])[0] })),
    };
  } catch {
    return { online: false, ip: null, peers: 0, onlinePeers: 0, peerList: [] };
  }
}

async function fetchLVMThinPool() {
  try {
    const r = await fetch('http://192.168.50.13:9090/api/v1/query?query=node_lvm_thin_pool_data_percent%7Blv%3D%22data%22%2Cvg%3D%22pve%22%7D', { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    const val = d?.data?.result?.[0]?.value?.[1];
    return val !== undefined ? parseFloat(val) : null;
  } catch { return null; }
}

async function fetchClaudeRunning() {
  try {
    // Use 5-minute average to avoid false positives during brief restarts
    const r = await fetch('http://192.168.50.13:9090/api/v1/query?query=avg_over_time(jojeco_claude_running%5B5m%5D)', { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    const val = d?.data?.result?.[0]?.value?.[1];
    return val !== undefined ? parseInt(val) === 1 : null;
  } catch { return null; }
}

async function fetchLabServer2Detailed() {
  // Glances on S2 (CT100 LXC) can't see host filesystem — use Glances for CPU/RAM/temp
  // Pull real disk info from node_exporter (port 9100) which runs on the host with full fs access
  const glances = await fetchLabGlancesDetailed('192.168.50.13').catch(() => null);
  if (!glances) return { online: false };

  let disks = [];
  try {
    const neRes = await fetch('http://192.168.50.13:9100/metrics', { signal: AbortSignal.timeout(4000) });
    if (neRes.ok) {
      const text = await neRes.text();
      const SKIP_FSTYPES_S2 = new Set(['tmpfs', 'devtmpfs', 'squashfs', 'overlay', 'sysfs', 'proc', 'cgroup', 'cgroup2', 'pstore', 'efivarfs', 'ramfs']);
      const sizeEntries = parsePromValues(text, 'node_filesystem_size_bytes')
        .filter(m => !SKIP_FSTYPES_S2.has(m.labels.fstype) && m.value > 5368709120 && isRealMount(m.labels.mountpoint));
      const availEntries = parsePromValues(text, 'node_filesystem_avail_bytes');
      const seen = new Set();
      disks = sizeEntries.filter(m => {
        const key = Math.round(m.value / 1e9);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(m => {
        const avail = availEntries.find(a => a.labels.mountpoint === m.labels.mountpoint)?.value ?? 0;
        const used = m.value - avail;
        return { label: m.labels.mountpoint, used, size: m.value, percent: Math.round((used / m.value) * 1000) / 10 };
      });
    }
  } catch {}

  return { ...glances, disks };
}

app.get('/api/lab/overview', optionalAuthMiddleware, async (req, res) => {
  const [s1, s2, s3, mini, jopc, macbook, services, tailscale, lvmThinPool, claudeRunning] = await Promise.all([
    fetchLabServer1Detailed(),
    fetchLabServer2Detailed(),
    fetchLabGlancesDetailed('192.168.50.12').catch(() => ({ online: false })),
    fetchLabGlancesDetailed('192.168.50.30').catch(() => ({ online: false })),
    fetchLabBurstMachine('192.168.50.20'),
    fetchLabBurstMachine('192.168.50.40'),
    Promise.all(CRITICAL_SERVICES.map(async s => {
      try {
        const r = await fetch(s.url, { signal: AbortSignal.timeout(3000) });
        return { ...s, online: r.ok || r.status < 500 };
      } catch { return { ...s, online: false }; }
    })),
    fetchTailscaleStatus(),
    fetchLVMThinPool(),
    fetchClaudeRunning(),
  ]);

  const machineData = [s1, s3, s2, mini, jopc, macbook];
  const machines = LAB_MACHINES.map((m, i) => ({ ...m, ...machineData[i] }));

  // Compute health
  const issues = [];
  machines.filter(m => m.always_on).forEach(m => {
    if (!m.online) issues.push({ severity: 'critical', message: `${m.name} is offline` });
  });
  services.forEach(s => {
    if (!s.online) issues.push({ severity: 'critical', message: `${s.name} is down` });
  });
  // Tailscale runs on MacMini, not CT100 — not an alertable condition here (Jordan, 2026-07-06)
  // if (!tailscale.online) issues.push({ severity: 'critical', message: 'Tailscale is down' });
  machines.filter(m => m.online).forEach(m => {
    (m.disks ?? []).forEach(d => {
      const sizeBytes = d.size ?? d.total ?? 0;
      const freeBytes = sizeBytes - (d.used ?? 0);
      const freeGB = freeBytes / 1e9;
      const freePct = sizeBytes > 0 ? (freeBytes / sizeBytes) * 100 : 100;
      const diskName = d.label ?? d.drive ?? 'disk';
      // Large drives (>2TB): alert on absolute free space (<200GB warn, <50GB critical)
      // Smaller drives: alert on percentage (<15% warn, <5% critical)
      const isLarge = sizeBytes > 2e12;
      const warn = isLarge ? freeGB < 200 : freePct < 15;
      const crit = isLarge ? freeGB < 50  : freePct < 5;
      if (sizeBytes > 0 && warn) {
        const detail = isLarge ? `${freeGB.toFixed(0)}GB free` : `${freePct.toFixed(0)}% free`;
        issues.push({ severity: crit ? 'critical' : 'degraded', message: `${m.name} ${diskName} low: ${detail}` });
      }
    });
    if (m.cpu > 90) issues.push({ severity: 'degraded', message: `${m.name} CPU at ${m.cpu.toFixed(0)}%` });
    if (m.gpu?.temp > 80) issues.push({ severity: 'degraded', message: `${m.name} GPU temp ${m.gpu.temp}°C` });
    if (m.temp > 85) issues.push({ severity: 'degraded', message: `${m.name} CPU temp ${m.temp}°C` });
  });
  if (lvmThinPool !== null) {
    if (lvmThinPool > 85) issues.push({ severity: 'critical', message: `LVM thin pool CRITICAL: ${lvmThinPool.toFixed(1)}% — run docker system prune NOW` });
    else if (lvmThinPool > 70) issues.push({ severity: 'degraded', message: `LVM thin pool high: ${lvmThinPool.toFixed(1)}%` });
  }
  if (claudeRunning === false) issues.push({ severity: 'critical', message: 'Claude Code agent is NOT running — check jojeco-agent service' });

  const status = issues.some(i => i.severity === 'critical') ? 'critical'
               : issues.length > 0 ? 'degraded'
               : 'healthy';

  const serviceMap = Object.fromEntries(services.map(s => [s.id, s.online]));
  serviceMap.tailscale = tailscale.online;

  const safeMachines = req.isGuest ? machines.map(({ host, ...rest }) => rest) : machines;
  res.json({ machines: safeMachines, status, issues, services: serviceMap, tailscale, lvmThinPool, claudeRunning });
});

const LAB_PROCESS_HOSTS = {
  server1: { host: '192.168.50.10', os: 'windows' },
  server2: { host: '192.168.50.13', os: 'linux' },
  server3: { host: '192.168.50.12', os: 'linux' },
  macmini: { host: '192.168.50.30', os: 'linux' },
  jopc:    { host: '192.168.50.20', os: 'windows' },
  macbook: { host: '192.168.50.40', os: 'linux' },
};

app.get('/api/lab/processes/:machineId', optionalAuthMiddleware, async (req, res) => {
  const entry = LAB_PROCESS_HOSTS[req.params.machineId];
  if (!entry) return res.status(404).json({ error: 'unknown machine' });

  try {
    const base = `http://${entry.host}:61208/api/4`;
    const r = await fetch(`${base}/processlist`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('glances offline');
    const list = await r.json();
    const processes = (Array.isArray(list) ? list : [])
      .map(p => ({ pid: p.pid, name: p.name, cpu: p.cpu_percent ?? 0, mem: p.memory_percent ?? 0 }))
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 15);
    return res.json({ machine_id: req.params.machineId, processes });
  } catch {
    return res.json({ machine_id: req.params.machineId, processes: [] });
  }
});

// ============================================================================
// OPS DASHBOARD ROUTES
// ============================================================================

const GLANCES_NODES = [
  { id: 'server1', name: 'Server 1', host: '192.168.50.10', role: 'Plex + Games' },
  { id: 'server2', name: 'Server 2', host: '192.168.50.13', role: 'Docker Host' },
  { id: 'server3', name: 'Server 3', host: '192.168.50.12', role: 'LLM Node' },
  { id: 'macmini', name: 'Mac Mini', host: '192.168.50.30', role: 'DNS + Monitor' },
];

const OLLAMA_NODES = [
  { id: 'server3', name: 'Server 3', host: '192.168.50.12', role: 'GTX 1060 Max-Q' },
  { id: 'server1', name: 'Server 1', host: '192.168.50.10', role: 'GTX 1060' },
  { id: 'macbook', name: 'MacBook M4', host: '192.168.50.40', role: 'M4 (burst)' },
  { id: 'jopc',    name: 'JoPc',      host: '192.168.50.20', role: 'RTX 3080 Ti (burst)' },
];

async function fetchGlances(host) {
  const base = `http://${host}:61208/api/4`;
  const g = (path) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()).catch(() => null);
  const [cpu, mem, fs, sensors] = await Promise.all([g('/cpu'), g('/mem'), g('/fs'), g('/sensors')]);
  if (!cpu && !mem) throw new Error('offline');
  return {
    cpu: cpu?.total ?? null,
    mem: mem ? { used: mem.used, total: mem.total, percent: mem.percent } : null,
    fs: (fs ?? []).map(d => ({ mnt_point: d.mnt_point, used: d.used, size: d.size, percent: d.percent })),
    sensors: (sensors ?? []).filter(s => s.value > 0 && s.value < 120).map(s => ({ label: s.label, value: s.value })),
  };
}

app.get('/api/ops/glances', authMiddleware, async (req, res) => {
  const results = await Promise.all(GLANCES_NODES.map(async node => {
    try {
      const data = await fetchGlances(node.host);
      return { ...node, online: true, ...data };
    } catch {
      return { ...node, online: false };
    }
  }));
  res.json(results);
});

app.get('/api/ops/fleet', optionalAuthMiddleware, async (req, res) => {
  const nodes = await Promise.all(OLLAMA_NODES.map(async node => {
    try {
      const r = await fetch(`http://${node.host}:11434/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error('not ok');
      const data = await r.json();
      const models = (data.models || []).map(m => ({ name: m.name, size: m.size }));
      return { ...node, online: true, models };
    } catch {
      return { ...node, online: false, models: [] };
    }
  }));

  let litellm = { online: false, spend: null };
  try {
    const [healthRes, spendRes] = await Promise.all([
      fetch(`http://192.168.50.13:4000/health/readiness`, {
        headers: { Authorization: `Bearer ${LITELLM_KEY}` },
        signal: AbortSignal.timeout(3000),
      }),
      fetch(`http://192.168.50.13:4000/global/spend`, {
        headers: { Authorization: `Bearer ${LITELLM_KEY}` },
        signal: AbortSignal.timeout(3000),
      }),
    ]);
    const health = await healthRes.json().catch(() => ({}));
    const spend = spendRes.ok ? await spendRes.json().catch(() => ({})) : {};
    litellm = { online: health.status === 'connected' || health.status === 'healthy', spend: spend.spend ?? null };
  } catch {}

  res.json({ nodes, litellm });
});

// Public stats for jojeco.ca (no auth)
app.get('/api/public/stats', async (req, res) => {
  try {
    const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    const count = firstUser
      ? db.prepare('SELECT COUNT(*) as n FROM services WHERE user_id = ?').get(firstUser.id)?.n ?? 0
      : 0;
    res.json({ online_services: count });
  } catch { res.json({ online_services: null }); }
});

// Server-side health checks — browser can't reach LAN IPs, API can
const serverHealthCache = new Map(); // serviceId -> {status, responseTime, checkedAt}

app.get('/api/services/health', optionalAuthMiddleware, async (req, res) => {
  let userId = req.user?.userId;
  if (!userId) {
    const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    if (!firstUser) return res.json({});
    userId = firstUser.id;
  }

  const services = db.prepare(
    'SELECT id, url, lan_url, health_check_url, health_check_interval FROM services WHERE user_id = ?'
  ).all(userId);

  const CACHE_TTL = 60_000;
  const results = {};

  await Promise.all(services.map(async svc => {
    const checkUrl = svc.health_check_url || svc.lan_url || svc.url;
    if (!checkUrl) { results[svc.id] = { status: 'unknown' }; return; }

    const cached = serverHealthCache.get(svc.id);
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
      results[svc.id] = cached; return;
    }

    const start = Date.now();
    try {
      const statusCode = await new Promise((resolve, reject) => {
        const parsed = new URL(checkUrl);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : null;
        if (!lib) {
          // HTTP — use fetch
          fetch(checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
            .then(r => resolve(r.status)).catch(reject);
          return;
        }
        const req = https.request({
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: parsed.pathname + (parsed.search || ''),
          method: 'HEAD',
          timeout: 5000,
          rejectUnauthorized: false,
        }, res => { res.resume(); resolve(res.statusCode); });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        req.end();
      });
      // Any HTTP response means the server is reachable — only connection failures = offline
      const result = { status: 'online', responseTime: Date.now() - start, checkedAt: Date.now() };
      serverHealthCache.set(svc.id, result);
      results[svc.id] = result;
    } catch {
      const result = { status: 'offline', checkedAt: Date.now() };
      serverHealthCache.set(svc.id, result);
      results[svc.id] = result;
    }
  }));

  res.json(results);
});

// ============================================================================
// CHAOS PAGE ROUTES — extracted to ./routes/chaos.js (Phase 3 route split)
// ============================================================================
app.use(chaosRoutes);

// ============================================================================
// START SERVER
// ============================================================================

// ============================================================================
// BACKGROUND HEALTH MONITOR — fires ntfy alerts on state changes
// ============================================================================

const NTFY_URL = 'http://192.168.50.13:8080/jojeco-alerts';
const MONITOR_SERVICES = [
  { id: 'plex',       name: 'Plex',       url: 'http://192.168.50.10:32400' },
  { id: 'nextcloud',  name: 'Nextcloud',  url: 'http://192.168.50.13:8880' },
  { id: 'authelia',   name: 'Authelia',   url: 'http://192.168.50.13:9091' },
  { id: 'sonarr',     name: 'Sonarr',     url: 'http://192.168.50.13:8989' },
  { id: 'radarr',     name: 'Radarr',     url: 'http://192.168.50.13:7878' },
  { id: 'bazarr',     name: 'Bazarr',     url: 'http://192.168.50.13:6767' },
  { id: 'litellm',    name: 'LiteLLM',    url: 'http://192.168.50.13:4000' },
  { id: 'ollama',     name: 'Ollama',     url: 'http://192.168.50.12:11434' },
  { id: 'ntfy',       name: 'ntfy',       url: 'http://192.168.50.13:8080' },
];

// Hysteresis to stop alert flapping: a service must fail FAIL_THRESHOLD
// consecutive polls before we declare it DOWN (and alert), and we only send a
// "recovered" alert if we actually alerted the outage. At the 2min poll
// interval, 3 strikes = ~6 min sustained failure before Jordan gets pinged.
// This kills the transient-timeout flap (Plex on the Windows box, Nextcloud
// under load) that produced DOWN/recovered pairs every ~10 min.
const FAIL_THRESHOLD = 3;
const serviceState = {}; // id → { fails, alerted }

async function checkOnce(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.status < 500;
  } catch { return false; }
}

async function runHealthMonitor() {
  for (const svc of MONITOR_SERVICES) {
    // Retry within a single poll (2 extra tries) before counting a failure —
    // kills transient-timeout false positives that were flapping the
    // Nextcloud/Authelia alerts even with the consecutive-poll threshold.
    let online = await checkOnce(svc.url);
    if (!online) { await new Promise(r => setTimeout(r, 2000)); online = await checkOnce(svc.url); }
    if (!online) { await new Promise(r => setTimeout(r, 3000)); online = await checkOnce(svc.url); }

    const s = serviceState[svc.id] || (serviceState[svc.id] = { fails: 0, alerted: false });

    if (!online) {
      s.fails++;
      if (s.fails >= FAIL_THRESHOLD && !s.alerted) {
        s.alerted = true;
        console.log(`[monitor] ${svc.name} DOWN (${s.fails} consecutive)`);
        fetch(NTFY_URL, { method: 'POST', body: `⚠️ ${svc.name} is DOWN`, headers: { Priority: 'high', Tags: 'warning' } }).catch(() => {});
      }
    } else {
      if (s.alerted) {
        console.log(`[monitor] ${svc.name} recovered`);
        fetch(NTFY_URL, { method: 'POST', body: `✅ ${svc.name} recovered`, headers: { Tags: 'white_check_mark' } }).catch(() => {});
      }
      s.fails = 0;
      s.alerted = false;
    }
  }
}

// ============================================================================
// OLLAMA ACTIVE SESSIONS
// ============================================================================

app.get('/api/lab/ollama/ps', optionalAuthMiddleware, async (req, res) => {
  const results = await Promise.all(OLLAMA_NODES.map(async node => {
    try {
      const r = await fetch(`http://${node.host}:11434/api/ps`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return { id: node.id, active: [] };
      const data = await r.json();
      return { id: node.id, active: (data.models || []).map(m => ({ name: m.name, size_vram: m.size_vram })) };
    } catch { return { id: node.id, active: [] }; }
  }));
  res.json(results);
});

// ============================================================================
// TEMP HISTORY
// ============================================================================

app.get('/api/lab/temps/history', optionalAuthMiddleware, (req, res) => {
  const { machine, hours = '24' } = req.query;
  const windowMs = Math.min(parseInt(hours) || 24, 168) * 60 * 60 * 1000;
  const since = Date.now() - windowMs;
  try {
    if (machine) {
      const rows = db.prepare('SELECT timestamp, cpu_temp, gpu_temp FROM temp_history WHERE machine_id = ? AND timestamp > ? ORDER BY timestamp ASC').all(machine, since);
      return res.json(rows);
    }
    const ids = ['server1','server2','server3','macmini','jopc','macbook'];
    const result = {};
    for (const id of ids) {
      result[id] = db.prepare('SELECT timestamp, cpu_temp, gpu_temp FROM temp_history WHERE machine_id = ? AND timestamp > ? ORDER BY timestamp ASC').all(id, since);
    }
    res.json(result);
  } catch { res.status(500).json({ error: 'DB error' }); }
});

async function pollTemps() {
  const now = Date.now();
  const tasks = [
    { id: 'server1', fn: () => fetchLabServer1Detailed() },
    { id: 'server2', fn: () => fetchLabServer2Detailed() },
    { id: 'server3', fn: () => fetchLabGlancesDetailed('192.168.50.12').catch(() => ({ online: false })) },
    { id: 'macmini', fn: () => fetchLabGlancesDetailed('192.168.50.30').catch(() => ({ online: false })) },
    { id: 'jopc',    fn: () => fetchLabBurstMachine('192.168.50.20') },
    { id: 'macbook', fn: () => fetchLabBurstMachine('192.168.50.40') },
  ];
  await Promise.allSettled(tasks.map(async ({ id, fn }) => {
    try {
      const data = await fn();
      if (!data.online) return;
      const cpuTemp = data.temp ?? null;
      const gpuTemp = data.gpu?.temp ?? null;
      if (cpuTemp !== null || gpuTemp !== null) {
        db.prepare('INSERT INTO temp_history (machine_id, timestamp, cpu_temp, gpu_temp) VALUES (?,?,?,?)').run(id, now, cpuTemp, gpuTemp);
      }
    } catch {}
  }));
  db.prepare('DELETE FROM temp_history WHERE timestamp < ?').run(now - 180 * 24 * 60 * 60 * 1000);
}

// ============================================================================
// SERVER CONTROLS — extracted to ./routes/controls.js (Phase 3 route split)
// ============================================================================
app.use(controlsRoutes);

// ============================================================================
// NTFY ALERT FEED
// ============================================================================

const NTFY_BASE = process.env.NTFY_URL || 'http://192.168.50.13:8080';
const NTFY_TOPIC = 'jojeco-alerts';

app.get('/api/alerts/recent', authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const r = await fetch(`${NTFY_BASE}/${NTFY_TOPIC}/json?poll=1&since=48h`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: 'ntfy unreachable' });
    const text = await r.text();
    const messages = text.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(m => m && m.event === 'message').reverse().slice(0, limit).map(m => ({
      id: m.id,
      time: m.time,
      title: m.title || null,
      message: m.message,
      priority: m.priority || 3,
      tags: m.tags || [],
    }));
    res.json(messages);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch alerts', detail: e.message });
  }
});

// ============================================================================
// AUTOMATION STATUS
// ============================================================================

app.get('/api/automation/status', authMiddleware, async (req, res) => {
  const jobs = [
    { id: 'backup',    label: 'GDrive Backup',    logFile: '/host/log/jojeco-gdrive-backup.log',  schedule: 'Daily 2:00 AM',   maxAgeHours: 26 },
    { id: 'depwatch',  label: 'Dependency Watcher', logFile: '/host/log/jojeco-dep-watcher.log',   schedule: 'Every 5 min',     maxAgeHours: 0.2 },
    { id: 'update',    label: 'Weekly Update',     logFile: '/host/log/jojeco-weekly-update.log',  schedule: 'Sunday 3:00 AM',  maxAgeHours: 200 },
  ];

  const results = await Promise.all(jobs.map(async (job) => {
    try {
      const { stdout } = await execFileAsync('tail', ['-n', '30', job.logFile], { timeout: 3000 });
      const lines = stdout.trim().split('\n').filter(Boolean);
      // Find last timestamp anywhere in log
      let lastRunTs = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
        if (m) { lastRunTs = new Date(m[1]).getTime(); break; }
        const m2 = lines[i].match(/(\w{3} \w{3} +\d+ \d{2}:\d{2}:\d{2} \w+ \d{4})/); // "Mon Apr 20 10:08:08 UTC 2026"
        if (m2) { lastRunTs = new Date(m2[1]).getTime(); break; }
      }
      const lastRun = lastRunTs ? new Date(lastRunTs).toISOString() : null;
      const stale = lastRunTs ? (Date.now() - lastRunTs) > job.maxAgeHours * 3600000 : true;
      const hasError = lines.some(l => /error|fail|fatal/i.test(l) && !/0 errors|attempt \d+\/\d+ succeeded/i.test(l));
      const healthy = !stale && !hasError;
      return { ...job, status: hasError ? 'error' : stale ? 'stale' : 'ok', healthy, lastRun, lastRunTs, lastLines: lines.slice(-5) };
    } catch {
      return { ...job, status: 'unknown', healthy: false, lastRun: null, lastRunTs: null, lastLines: [] };
    }
  }));

  res.json(results);
});

// ============================================================================
// UPDATE CHECKER
// ============================================================================

// Cache update check results in memory (expensive to fetch from registry)
let updateCache = { checked: null, results: [] };

async function getRemoteDigest(imageRef) {
  // Parse registry/repo/tag from imageRef
  let registry = 'registry-1.docker.io';
  let repo = imageRef.split('@')[0]; // strip any existing digest
  let tag = 'latest';

  // Split tag
  const lastColon = repo.lastIndexOf(':');
  const lastSlash = repo.lastIndexOf('/');
  if (lastColon > lastSlash) {
    tag = repo.slice(lastColon + 1);
    repo = repo.slice(0, lastColon);
  }

  // Handle non-Docker Hub registries
  if (repo.includes('.') && repo.indexOf('.') < (repo.indexOf('/') > -1 ? repo.indexOf('/') : Infinity)) {
    const slashIdx = repo.indexOf('/');
    registry = repo.slice(0, slashIdx);
    repo = repo.slice(slashIdx + 1);
  } else if (!repo.includes('/')) {
    repo = `library/${repo}`; // Docker Hub official images
  }

  const headers = { Accept: 'application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.list.v2+json' };

  if (registry === 'registry-1.docker.io') {
    try {
      const authRes = await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`, { signal: AbortSignal.timeout(8000) });
      if (authRes.ok) {
        const { token } = await authRes.json();
        headers.Authorization = `Bearer ${token}`;
      }
    } catch { /* proceed without auth */ }
  }

  const manifestRes = await fetch(`https://${registry}/v2/${repo}/manifests/${tag}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!manifestRes.ok) return null;
  return manifestRes.headers.get('docker-content-digest');
}

async function checkContainerUpdates() {
  const r = await dockerRequest('/containers/json?all=0');
  const containers = r.body || [];

  const results = await Promise.allSettled(containers.map(async (c) => {
    const name = c.Names[0]?.replace('/', '') || c.Id.slice(0, 12);
    const image = c.Image;

    // Skip containers without a proper image tag (sha256 refs)
    if (image.startsWith('sha256:') || !image) return null;

    // Get local image digest
    const imgR = await dockerRequest(`/images/${encodeURIComponent(image)}/json`);
    const localDigests = imgR.body?.RepoDigests || [];
    const localDigest = localDigests[0]?.split('@')[1] || null;

    // Get remote digest
    let remoteDigest = null;
    try { remoteDigest = await getRemoteDigest(image); } catch { /* ignore */ }

    const updateAvailable = localDigest && remoteDigest && localDigest !== remoteDigest;

    return {
      id: c.Id.slice(0, 12),
      name,
      image,
      localDigest: localDigest ? localDigest.slice(0, 19) : null,
      remoteDigest: remoteDigest ? remoteDigest.slice(0, 19) : null,
      updateAvailable: updateAvailable || false,
      canCheck: !!(localDigest && remoteDigest),
    };
  }));

  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

app.get('/api/updates/available', authMiddleware, async (req, res) => {
  const force = req.query.force === '1';
  const cacheAgeMs = 30 * 60 * 1000; // 30 min cache
  if (!force && updateCache.checked && (Date.now() - updateCache.checked) < cacheAgeMs) {
    return res.json({ checked: updateCache.checked, results: updateCache.results, cached: true });
  }
  try {
    const results = await checkContainerUpdates();
    updateCache = { checked: Date.now(), results };
    res.json({ checked: updateCache.checked, results, cached: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/updates/apply', authMiddleware, async (req, res) => {
  const { containers: names } = req.body;
  if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: 'containers array required' });

  // Start async job
  const jobId = `update-${Date.now()}`;
  triggerJobs[jobId] = { status: 'running', startedAt: Date.now(), finishedAt: null, output: null, error: null };
  res.json({ jobId, message: 'Update started' });

  (async () => {
    const lines = [];
    for (const name of names) {
      try {
        // Get image for this container
        const cR = await dockerRequest(`/containers/${name}/json`);
        const image = cR.body?.Config?.Image;
        if (!image) { lines.push(`${name}: could not find image`); continue; }

        lines.push(`Pulling ${image}...`);
        // Pull new image
        await new Promise((resolve, reject) => {
          const opts = { socketPath: '/var/run/docker.sock', path: `/images/create?fromImage=${encodeURIComponent(image)}`, method: 'POST' };
          const req2 = http.request(opts, dres => { dres.resume(); dres.on('end', resolve); });
          req2.on('error', reject);
          req2.end();
        });

        // Restart container to pick up new image
        await dockerRequest(`/containers/${name}/restart`, 'POST');
        lines.push(`${name}: updated and restarted`);
      } catch (e) {
        lines.push(`${name}: failed — ${e.message}`);
      }
    }
    updateCache = { checked: null, results: [] }; // invalidate cache
    triggerJobs[jobId] = { status: 'done', startedAt: triggerJobs[jobId].startedAt, finishedAt: Date.now(), output: lines.join('\n'), error: null };
  })().catch(e => {
    triggerJobs[jobId] = { ...triggerJobs[jobId], status: 'error', finishedAt: Date.now(), error: e.message };
  });
});

// ============================================================================
// SERVER-SIDE SERVICE HEALTH POLLER
// ============================================================================

// Cache of latest health result per serviceId
const serviceHealthCache = new Map();

async function runServiceHealthPoller() {
  try {
    // Fetch all services across all users
    const services = db.prepare('SELECT id, name, url, health_check_url, health_check_interval FROM services').all();
    await Promise.allSettled(services.map(async (svc) => {
      const checkUrl = svc.health_check_url || svc.url;
      if (!checkUrl) return;
      const startTime = Date.now();
      let status = 'offline';
      let statusCode = null;
      let responseTime = null;
      let error = null;
      try {
        const isPrivateHttps = checkUrl.startsWith('https://') && /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(checkUrl);
        if (isPrivateHttps) {
          // Use https module with rejectUnauthorized:false for internal self-signed certs
          await new Promise((resolve, reject) => {
            const req = https.request(checkUrl, { method: 'HEAD', rejectUnauthorized: false, timeout: 8000 }, (res) => {
              statusCode = res.statusCode;
              // 401/403/405/501 mean the service IS running but rejected our unauthed HEAD
              status = (res.statusCode < 500 || res.statusCode === 501) ? 'online' : 'offline';
              resolve();
            });
            req.on('error', (e) => { error = e.message?.slice(0, 100); reject(e); });
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.end();
          });
        } else {
          const r = await fetch(checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
          statusCode = r.status;
          // 401/403/405/501 mean the service IS running but rejected our unauthed HEAD
          status = (r.status < 500 || r.status === 501) ? 'online' : 'offline';
        }
        responseTime = Date.now() - startTime;
      } catch (e) {
        responseTime = Date.now() - startTime;
        error = e.message?.slice(0, 100);
        status = 'offline';
      }
      const ts = Date.now();
      serviceHealthCache.set(svc.id, { serviceId: svc.id, name: svc.name, status, statusCode, responseTime, error, checkedAt: ts });
      // Persist to health_checks table (keep last 288 per service = 24h at 5min intervals)
      db.prepare('INSERT INTO health_checks (service_id, status, response_time, status_code, timestamp, error) VALUES (?,?,?,?,?,?)').run(svc.id, status, responseTime, statusCode, ts, error);
      db.prepare('DELETE FROM health_checks WHERE service_id = ? AND timestamp < ?').run(svc.id, Date.now() - 7 * 24 * 3600000);
    }));
  } catch { /* don't crash the server */ }
}

app.get('/api/health/services', authMiddleware, (req, res) => {
  const results = Array.from(serviceHealthCache.values());
  res.json({ checkedAt: Date.now(), services: results });
});

app.get('/api/health/services/:serviceId/history', authMiddleware, (req, res) => {
  const { serviceId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 288, 1000);
  const rows = db.prepare('SELECT status, response_time, status_code, timestamp, error FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?').all(serviceId, limit);
  const total = rows.length;
  const online = rows.filter(r => r.status === 'online').length;
  const uptimePct = total > 0 ? Math.round((online / total) * 1000) / 10 : null;
  const avgResponseTime = rows.filter(r => r.response_time).length > 0
    ? Math.round(rows.filter(r => r.response_time).reduce((s, r) => s + r.response_time, 0) / rows.filter(r => r.response_time).length)
    : null;
  res.json({ serviceId, uptimePct, avgResponseTime, history: rows });
});

// ============================================================================
// FAILOVER / HA ROUTES
// ============================================================================

const S2_HOST = '192.168.50.11';
const S3_HOST = '192.168.50.12';
const SYNC_LOG_PATH = '/var/log/s3-volume-sync.log';
const FAILOVER_ACTIVE_FILE = '/mnt/data/lab/failover/.active';

async function tcpCheck(host, port, timeoutMs = 3000) {
  const net = await import('net');
  return new Promise(resolve => {
    const sock = new net.default.Socket();
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.connect(port, host, () => done(true));
    sock.on('error', () => done(false));
    sock.on('timeout', () => done(false));
  });
}

// GET /api/failover/status
app.get('/api/failover/status', lanOrAuth, async (req, res) => {
  try {
    const [s2_online, s3_online] = await Promise.all([
      tcpCheck(S2_HOST, 22),
      tcpCheck(S3_HOST, 22),
    ]);

    // Check failover active: look for state file on S3 or docker ps grep
    let failover_active = false;
    let watchdog_status = 'unknown';
    let last_sync = null;

    // SSH to S3 for watchdog + failover state (only if S3 is online)
    if (s3_online) {
      try {
        const { stdout: wdOut } = await execFileAsync('ssh', [
          '-i', SSH_KEY, ...SSH_OPTS, `jojeco@${S3_HOST}`,
          'systemctl is-active jojeco-watchdog 2>/dev/null || echo inactive'
        ], { timeout: 10000 });
        watchdog_status = wdOut.trim();
      } catch { watchdog_status = 'unreachable'; }

      try {
        const { stdout: foOut } = await execFileAsync('ssh', [
          '-i', SSH_KEY, ...SSH_OPTS, `jojeco@${S3_HOST}`,
          `test -f ${FAILOVER_ACTIVE_FILE} && echo yes || docker ps 2>/dev/null | grep -q failover && echo yes || echo no`
        ], { timeout: 10000 });
        failover_active = foOut.trim() === 'yes';
      } catch { failover_active = false; }
    }

    // Read last sync log line (local file, mounted into container)
    try {
      const { stdout: logOut } = await execFileAsync('tail', ['-n', '1', SYNC_LOG_PATH], { timeout: 3000 });
      last_sync = logOut.trim() || null;
    } catch { last_sync = null; }

    res.json({ s2_online, s3_online, failover_active, watchdog_status, last_sync });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/failover/activate
app.post('/api/failover/activate', authMiddleware, async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      '/opt/jojeco-agent/scripts/lab-failover.sh', ['activate'],
      { timeout: 120000 }
    );
    res.json({ success: true, output: (stdout + stderr).trim() });
  } catch (e) {
    res.status(500).json({ success: false, output: (e.stdout || '') + (e.stderr || ''), error: e.message });
  }
});

// POST /api/failover/deactivate
app.post('/api/failover/deactivate', authMiddleware, async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      '/opt/jojeco-agent/scripts/lab-failover.sh', ['deactivate'],
      { timeout: 120000 }
    );
    res.json({ success: true, output: (stdout + stderr).trim() });
  } catch (e) {
    res.status(500).json({ success: false, output: (e.stdout || '') + (e.stderr || ''), error: e.message });
  }
});

// POST /api/failover/sync-now — fire and forget
app.post('/api/failover/sync-now', authMiddleware, async (req, res) => {
  const { exec } = await import('child_process');
  exec('/opt/jojeco-agent/scripts/s3-volume-sync.sh >> /var/log/s3-volume-sync.log 2>&1 &');
  res.json({ success: true, message: 'Volume sync started' });
});

// ============================================================================
// BACKUP STATUS ROUTE
// ============================================================================

const BACKUP_LOG_PATH = '/host/log/jojeco-gdrive-backup.log';

app.get('/api/backup-status', lanOrAuth, async (req, res) => {
  try {
    const { stdout } = await execFileAsync('tail', ['-n', '40', BACKUP_LOG_PATH], { timeout: 3000 });
    const lines = stdout.trim().split('\n').filter(Boolean);

    // Find last run timestamp
    let lastRun = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/=== Backup (started|complete) (\d{4}-\d{2}-\d{2})/);
      if (m) { lastRun = m[2]; break; }
    }

    // Find time from last session header
    let lastRunTime = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/\[(\d{2}:\d{2}:\d{2})\] === Backup started/);
      if (m) { lastRunTime = m[1]; break; }
    }

    // Check for errors in last session (lines after last "Backup started")
    let sessionStart = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/=== Backup started/.test(lines[i])) { sessionStart = i; break; }
    }
    const sessionLines = lines.slice(sessionStart);
    const hasError = sessionLines.some(l => /error|fail|FAILED/i.test(l) && !/0 errors/i.test(l));
    const completed = sessionLines.some(l => /=== Backup complete|✅ Backup complete/i.test(l));

    const status = hasError ? 'error' : completed ? 'ok' : lastRun ? 'unknown' : 'never';
    const lastRunFull = lastRun && lastRunTime ? `${lastRun} ${lastRunTime}` : lastRun || null;

    // Get last few meaningful lines
    const message = sessionLines.filter(l => l.trim() && !/^$/.test(l)).slice(-6).join('\n');

    res.json({ lastRun: lastRunFull, status, message });
  } catch (e) {
    res.json({ lastRun: null, status: 'unknown', message: 'Log not found or unreadable' });
  }
});

// ============================================================================
// 7-DAY SPARKLINE DATA
// ============================================================================

app.get('/api/health/sparklines', authMiddleware, (req, res) => {
  try {
    const since7d = Date.now() - 7 * 24 * 3600000;
    const services = db.prepare('SELECT id, name FROM services').all();
    const result = {};
    for (const svc of services) {
      // Get hourly buckets of uptime % over last 7 days
      const rows = db.prepare(
        'SELECT timestamp, status FROM health_checks WHERE service_id = ? AND timestamp > ? ORDER BY timestamp ASC'
      ).all(svc.id, since7d);

      if (rows.length === 0) { result[svc.id] = []; continue; }

      // Group into 24 buckets (one per 7h period = 7 days)
      const bucketMs = 7 * 24 * 3600000 / 24;
      const now = Date.now();
      const buckets = Array.from({ length: 24 }, (_, i) => {
        const bucketEnd = now - (23 - i) * bucketMs;
        const bucketStart = bucketEnd - bucketMs;
        const inBucket = rows.filter(r => r.timestamp >= bucketStart && r.timestamp < bucketEnd);
        if (inBucket.length === 0) return null;
        const online = inBucket.filter(r => r.status === 'online').length;
        return Math.round((online / inBucket.length) * 100);
      });
      result[svc.id] = buckets;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch sparkline data' });
  }
});

// ============================================================================
// ADGUARD STATS PROXY — extracted to ./routes/adguard.js (Phase 3 route split)
// ============================================================================
app.use(adguardRoutes);

// ============================================================================
// JARVIS VOICE API PROXY — extracted to ./routes/jarvis.js (Phase 3 route split)
// ============================================================================
app.use(jarvisRoutes);

// ============================================================================
// MINECRAFT PROXY
// ============================================================================

app.get('/api/minecraft/status', lanOrAuth, async (req, res) => {
  try {
    const r = await fetch('http://192.168.50.10:8765/status', { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'MC API unreachable' });
  }
});

// ============================================================================
// KIOSK API ROUTES — extracted to ./routes/kiosk.js (Phase 3 route split)
// ============================================================================
app.use(kioskRoutes);

// ============================================================================
// ============================================================================
// BAMBU P1S PRINTER — MQTT STATUS POLLER
// ============================================================================
// Background: connects once to the printer's MQTT broker (TLS, self-signed cert)
// every 15 s, fires pushall, waits for the rich status payload, then caches it.
// Requests to /api/printer/p1s serve the last cached value instantly (no blocking).
// READ-ONLY: we only subscribe + publish pushall. No control commands.

import mqtt from 'mqtt';

const P1S_HOST   = '192.168.50.228';
const P1S_PORT   = 8883;
const P1S_USER   = 'bblp';
const P1S_PASS   = '583f2d55';
const P1S_SN     = '01P00C5C1203051';
const P1S_REPORT = `device/${P1S_SN}/report`;
const P1S_REQ    = `device/${P1S_SN}/request`;
const PUSHALL_MSG = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } });

const SPEED_LABELS = { 1: 'Silent', 2: 'Standard', 3: 'Sport', 4: 'Ludicrous' };
const GCODE_STATE_MAP = {
  RUNNING: 'Printing', PAUSE: 'Paused', FINISH: 'Finished',
  FAILED: 'Failed', IDLE: 'Idle', PREPARE: 'Preparing',
  SLICING: 'Slicing', DOWNLOADING: 'Downloading',
};

let printerCache = { online: false, lastFetch: 0 };
let p1sPollTimer = null;

function p1sParsePayload(raw) {
  const d = raw.print ?? raw;
  // Active tray: ams.tray_now is a number (slot index across all AMS units)
  const trayNow  = d.ams?.tray_now ?? null;
  let activeTray = null;
  if (trayNow !== null && trayNow !== 255) {
    const amsIdx  = Math.floor(trayNow / 4);
    const trayIdx = trayNow % 4;
    const amsUnit = (d.ams?.ams ?? [])[amsIdx];
    activeTray = amsUnit?.tray?.[trayIdx] ?? null;
  }

  const hexToRgb = (hex) => {
    if (!hex) return null;
    const h = hex.replace(/FF$/i, '').padStart(6, '0');
    return `#${h.slice(0, 6).toUpperCase()}`;
  };

  const gcodeState = d.gcode_state ?? 'IDLE';
  return {
    online:          true,
    gcode_state:     GCODE_STATE_MAP[gcodeState] ?? gcodeState,
    job:             d.gcode_file ? d.gcode_file.replace(/\.3mf$/i, '').replace(/\.gcode$/i, '') : null,
    pct:             d.mc_percent ?? 0,
    layer:           d.layer_num ?? 0,
    total_layers:    d.total_layer_num ?? 0,
    remaining_min:   d.mc_remaining_time ?? null,
    nozzle_temp:     d.nozzle_temper != null ? Math.round(d.nozzle_temper * 10) / 10 : null,
    nozzle_target:   d.nozzle_target_temper ?? null,
    bed_temp:        d.bed_temper != null ? Math.round(d.bed_temper * 10) / 10 : null,
    bed_target:      d.bed_target_temper ?? null,
    speed_level:     SPEED_LABELS[d.spd_lvl] ?? 'Standard',
    active_tray:     trayNow,
    tray_color:      activeTray ? hexToRgb(activeTray.tray_color) : null,
    tray_type:       activeTray?.tray_type ?? null,
    print_error:     d.print_error ?? 0,
    lastFetch:       Date.now(),
  };
}

async function pollP1S() {
  return new Promise((resolve) => {
    const timeoutMs = 12000;
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { client.end(true); } catch (_) {}
      clearTimeout(tid);
      resolve(result);
    };

    const client = mqtt.connect({
      host: P1S_HOST,
      port: P1S_PORT,
      protocol: 'mqtts',
      username: P1S_USER,
      password: P1S_PASS,
      rejectUnauthorized: false,
      connectTimeout: 8000,
      reconnectPeriod: 0,
    });

    const tid = setTimeout(() => done({ online: false, lastFetch: Date.now() }), timeoutMs);

    client.on('connect', () => {
      client.subscribe(P1S_REPORT, (err) => {
        if (err) return done({ online: false, lastFetch: Date.now() });
        client.publish(P1S_REQ, PUSHALL_MSG);
      });
    });

    client.on('message', (_topic, payload) => {
      try {
        const raw = JSON.parse(payload.toString());
        // Wait for a rich payload (pushall response has many keys)
        if (raw.print && Object.keys(raw.print).length > 5) {
          done(p1sParsePayload(raw));
        }
      } catch (_) {}
    });

    client.on('error', () => done({ online: false, lastFetch: Date.now() }));
  });
}

async function runP1SPoll() {
  try {
    const result = await pollP1S();
    printerCache = result;
    console.log(`[p1s] polled — online:${result.online} state:${result.gcode_state ?? 'n/a'} pct:${result.pct ?? '-'}%`);
  } catch (e) {
    console.error('[p1s] poll error:', e.message);
    printerCache = { online: false, lastFetch: Date.now() };
  }
}

function startP1SPoller() {
  runP1SPoll();
  p1sPollTimer = setInterval(runP1SPoll, 15000);
}

app.get('/api/printer/p1s', optionalAuthMiddleware, (req, res) => {
  res.json(printerCache);
});

// ============================================================================
// Aggregated snapshot + SSE stream — shared data layer for the v3 frontend.
// The snapshot cache is shared between /api/snapshot (polling fallback) and
// /api/stream (SSE push). Internally fans out to existing endpoints so each
// section keeps its own auth/sanitization logic.
// Phase 3 refactor will inline these instead of looping back via HTTP.
// ============================================================================

const snapshotCache = new Map(); // `${section}:${auth|guest}` → { at, data }
const SNAP_SECTIONS = {
  lab:            '/api/lab/overview',
  servicesHealth: '/api/services/health',
  docker:         '/api/docker/containers',
  fleet:          '/api/ops/fleet',
  ollama:         '/api/lab/ollama/ps',
  media:          '/api/media/queue',
  system:         '/api/system/metrics',
  serverStatus:   '/api/controls/server-status',
  alerts:         '/api/alerts/recent',
  minecraft:      '/api/minecraft/status',
  automation:     '/api/automation/status',
  torrents:       '/api/torrents/transfer',
  printer:        '/api/printer/p1s',
};
const SNAP_TTL_MS = { automation: 60000, alerts: 30000, default: 15000 };

/** Fetch all snapshot sections, reusing cache where fresh enough. */
async function buildSnapshotPayload(authHeader) {
  const auth = authHeader || '';
  const scope = auth ? 'auth' : 'guest';
  const out = {};
  await Promise.all(Object.entries(SNAP_SECTIONS).map(async ([s, path]) => {
    const ttl = SNAP_TTL_MS[s] || SNAP_TTL_MS.default;
    const key = `${s}:${scope}`;
    const hit = snapshotCache.get(key);
    if (hit && Date.now() - hit.at < ttl) { out[s] = hit.data; return; }
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
        headers: auth ? { authorization: auth } : {},
        signal: AbortSignal.timeout(8000),
      });
      const data = r.ok ? await r.json() : null;
      out[s] = data;
      if (data !== null) snapshotCache.set(key, { at: Date.now(), data });
    } catch {
      out[s] = hit ? hit.data : null; // serve stale over nothing
    }
  }));
  return { at: Date.now(), sections: out };
}

// ── SSE stream ────────────────────────────────────────────────────────────────
const sseClients = new Set();
const SSE_INTERVAL_MS = 15_000; // configurable — push cadence

async function pushToClient(client) {
  try {
    const payload = await buildSnapshotPayload(client.auth);
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (err) {
    console.error('[SSE] push error:', err.message);
  }
}

// sseAuthMiddleware lives in ./lib/middleware.js (Phase 3 route split)

// GET /api/stream — auth-gated SSE endpoint
app.get('/api/stream', sseAuthMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // prevent nginx from buffering SSE frames
  res.flushHeaders();

  const auth = req.headers.authorization || '';
  const client = { res, auth, timer: null };
  sseClients.add(client);
  console.log(`[SSE] client connected (total: ${sseClients.size})`);

  // Initial snapshot — no wait
  await pushToClient(client);

  // Recurring pushes
  client.timer = setInterval(() => pushToClient(client), SSE_INTERVAL_MS);

  // Proxy-keepalive heartbeat (comment line — not a data event)
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { /* already closed */ }
  }, 30_000);

  req.on('close', () => {
    clearInterval(client.timer);
    clearInterval(heartbeat);
    sseClients.delete(client);
    console.log(`[SSE] client disconnected (total: ${sseClients.size})`);
  });
});

// ── /api/snapshot — polling fallback (unchanged API surface) ──────────────────
app.get('/api/snapshot', optionalAuthMiddleware, async (req, res) => {
  const wanted = (req.query.sections ? String(req.query.sections).split(',') : Object.keys(SNAP_SECTIONS))
    .filter(s => SNAP_SECTIONS[s]);
  const auth = req.headers.authorization || '';
  const scope = auth ? 'auth' : 'guest';
  const out = {};
  await Promise.all(wanted.map(async (s) => {
    const ttl = SNAP_TTL_MS[s] || SNAP_TTL_MS.default;
    const key = `${s}:${scope}`;
    const hit = snapshotCache.get(key);
    if (hit && Date.now() - hit.at < ttl) { out[s] = hit.data; return; }
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${SNAP_SECTIONS[s]}`, {
        headers: auth ? { authorization: auth } : {},
        signal: AbortSignal.timeout(8000),
      });
      const data = r.ok ? await r.json() : null;
      out[s] = data;
      if (data !== null) snapshotCache.set(key, { at: Date.now(), data });
    } catch {
      out[s] = hit ? hit.data : null; // serve stale over nothing
    }
  }));
  res.json({ at: Date.now(), sections: out });
});

// ============================================================================

async function startServer() {
  await db.init();

  // Migrate: ensure temp_history table exists
  db.prepare('CREATE TABLE IF NOT EXISTS temp_history (id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id TEXT NOT NULL, timestamp INTEGER NOT NULL, cpu_temp REAL, gpu_temp REAL)').run();

  // Seed default admin user if users table is empty
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminUserId = process.env.ADMIN_USER_ID;
  if (adminEmail && adminPassword && adminUserId) {
    const existing = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (existing.count === 0) {
      const hash = await hashPassword(adminPassword);
      const now = Date.now();
      db.prepare('INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(adminUserId, adminEmail, hash, 'Jordan', now, now);
      console.log(`✅ Admin user seeded: ${adminEmail} (id: ${adminUserId})`);
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 JojeCo Dashboard API running on port ${PORT}`);
    console.log(`📊 Database: ${db.name}`);
  });

  // Internal ntfy health-monitor DISABLED 2026-06-22 — Uptime Kuma (Mac Mini :3001, 41
  // monitors, ntfy-wired) is now the canonical up/down alerter. Running both = double-alerts.
  // Function kept for reference / dashboard service-health display; just not the alert source.
  // await runHealthMonitor();
  // setInterval(runHealthMonitor, 2 * 60 * 1000);
  console.log('🔍 Internal health monitor disabled — Uptime Kuma is canonical');

  // Service health poller — checks all user-registered services every 5 min
  runServiceHealthPoller().catch(() => {});
  setInterval(() => runServiceHealthPoller().catch(() => {}), 5 * 60 * 1000);
  console.log('🩺 Service health poller started (5min interval)');

  // Start temp polling every 30 seconds
  pollTemps().catch(() => {});
  setInterval(() => pollTemps().catch(() => {}), 30 * 1000);
  console.log('🌡️  Temp poller started (30sec interval)');

  // Start P1S printer MQTT poller (15s interval, serves cached result)
  startP1SPoller();
  console.log('🖨️  P1S printer poller started (15s interval)');
}

startServer().catch(console.error);
