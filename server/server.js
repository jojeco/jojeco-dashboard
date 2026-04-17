import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { readdir, readFile } from 'fs/promises';
import https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
import db from './database.js';

const execFileAsync = promisify(execFile);

import {
  generateToken,
  authMiddleware,
  optionalAuthMiddleware,
  hashPassword,
  comparePassword,
  createUser,
  getUserByEmail,
  getUserById,
} from './auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// AUTH ROUTES
// ============================================================================

app.post('/api/auth/register', (req, res) => {
  res.status(403).json({ error: 'Registration is disabled' });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.email);
    const userInfo = { id: user.id, email: user.email, displayName: user.display_name };

    res.json({ user: userInfo, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = getUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await comparePassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');
    stmt.run(newPasswordHash, Date.now(), user.id);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

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
// QBITTORRENT PROXY ROUTES
// ============================================================================

const QBT_URL = process.env.QBT_URL || 'http://192.168.50.13:9091';
const QBT_USER = process.env.QBT_USER || 'admin';
const QBT_PASS = process.env.QBT_PASS || 'jojeco2026';
let qbtSid = null;

async function qbtLogin() {
  const res = await fetch(`${QBT_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': QBT_URL },
    body: `username=${QBT_USER}&password=${QBT_PASS}`,
  });
  const cookies = res.headers.get('set-cookie') || '';
  const match = cookies.match(/SID=([^;]+)/);
  if (match) { qbtSid = match[1]; return true; }
  return false;
}

async function qbtFetch(path, options = {}) {
  // Try direct call first (subnet whitelist bypasses auth)
  const headers = { 'Referer': QBT_URL, ...(options.headers || {}) };
  if (qbtSid) headers['Cookie'] = `SID=${qbtSid}`;
  const res = await fetch(`${QBT_URL}${path}`, { ...options, headers });
  if (res.status === 403) {
    // Auth required - login and retry
    await qbtLogin();
    const retryHeaders = { 'Cookie': `SID=${qbtSid}`, 'Referer': QBT_URL, ...(options.headers || {}) };
    return fetch(`${QBT_URL}${path}`, { ...options, headers: retryHeaders });
  }
  return res;
}

app.get('/api/torrents/list', authMiddleware, async (req, res) => {
  try {
    const r = await qbtFetch('/api/v2/torrents/info?sort=added_on&reverse=true');
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'qBittorrent unavailable' }); }
});

app.get('/api/torrents/transfer', authMiddleware, async (req, res) => {
  try {
    const r = await qbtFetch('/api/v2/transfer/info');
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'qBittorrent unavailable' }); }
});

app.post('/api/torrents/add', authMiddleware, async (req, res) => {
  try {
    const { urls, savepath } = req.body;
    const body = new URLSearchParams({ urls, savepath: savepath || '/media/Downloads' });
    const r = await qbtFetch('/api/v2/torrents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    res.json({ result: await r.text() });
  } catch (e) { res.status(503).json({ error: 'qBittorrent unavailable' }); }
});

app.post('/api/torrents/:action', authMiddleware, async (req, res) => {
  const { action } = req.params;
  if (!['pause', 'resume', 'delete', 'recheck'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    const { hashes, deleteFiles } = req.body;
    const params = new URLSearchParams({ hashes: Array.isArray(hashes) ? hashes.join('|') : hashes });
    if (action === 'delete') params.append('deleteFiles', deleteFiles ? 'true' : 'false');
    const r = await qbtFetch(`/api/v2/torrents/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    res.json({ result: await r.text() });
  } catch (e) { res.status(503).json({ error: 'qBittorrent unavailable' }); }
});

// ============================================================================
// DOCKER PROXY ROUTES (via Docker socket)
// ============================================================================

import http from 'http';

function dockerRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = { socketPath: '/var/run/docker.sock', path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(options, dres => {
      let data = '';
      dres.on('data', chunk => data += chunk);
      dres.on('end', () => {
        try { resolve({ status: dres.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: dres.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

app.get('/api/docker/containers', optionalAuthMiddleware, async (req, res) => {
  try {
    const showAll = req.query.all === '1';
    const r = await dockerRequest(`/containers/json?all=${showAll ? '1' : '0'}`);
    const containers = r.body.map(c => ({
      id: c.Id.slice(0, 12),
      name: c.Names[0]?.replace('/', '') || c.Id.slice(0, 12),
      image: c.Image,
      status: c.Status,
      state: c.State,
      health: c.Status?.includes('(healthy)') ? 'healthy'
            : c.Status?.includes('(unhealthy)') ? 'unhealthy'
            : c.Status?.includes('(health: starting)') ? 'starting'
            : 'none',
      ports: c.Ports.filter(p => p.PublicPort).map(p => `${p.PublicPort}`),
      created: c.Created,
      compose_project: c.Labels?.['com.docker.compose.project'] || null,
    }));
    res.json(containers.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e) { res.status(503).json({ error: 'Docker socket unavailable' }); }
});

app.post('/api/docker/containers/:id/:action', authMiddleware, async (req, res) => {
  const { id, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    const r = await dockerRequest(`/containers/${id}/${action}`, 'POST');
    res.json({ result: r.status === 204 ? 'ok' : r.body });
  } catch (e) { res.status(503).json({ error: 'Docker socket unavailable' }); }
});

app.get('/api/docker/containers/:id/logs', authMiddleware, async (req, res) => {
  try {
    const lines = Math.min(parseInt(req.query.lines) || 100, 500);
    const options = { socketPath: '/var/run/docker.sock', path: `/containers/${req.params.id}/logs?stdout=1&stderr=1&tail=${lines}`, method: 'GET' };
    const dreq = http.request(options, dres => {
      let raw = Buffer.alloc(0);
      dres.on('data', chunk => { raw = Buffer.concat([raw, chunk]); });
      dres.on('end', () => {
        const logLines = [];
        let i = 0;
        while (i + 8 <= raw.length) {
          const size = raw.readUInt32BE(i + 4);
          if (i + 8 + size > raw.length) break;
          logLines.push(raw.slice(i + 8, i + 8 + size).toString('utf8').trimEnd());
          i += 8 + size;
        }
        res.json({ logs: logLines.join('\n') });
      });
    });
    dreq.on('error', () => res.status(503).json({ error: 'Docker socket unavailable' }));
    dreq.end();
  } catch (e) { res.status(503).json({ error: 'Docker socket unavailable' }); }
});

// ============================================================================
// MEDIA PROXY ROUTES (Sonarr + Radarr)
// ============================================================================

const SONARR_URL = process.env.SONARR_URL || 'http://192.168.50.13:8989';
const SONARR_KEY = process.env.SONARR_KEY || 'ec7a0e9ece5a4cca9ca0047b4a4ec57b';
const RADARR_URL = process.env.RADARR_URL || 'http://192.168.50.13:7878';
const RADARR_KEY = process.env.RADARR_KEY || 'bb4d373c02874e19982410059dd56c28';

async function arrFetch(baseUrl, apiKey, path) {
  const r = await fetch(`${baseUrl}/api/v3${path}`, { headers: { 'X-Api-Key': apiKey } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

app.get('/api/media/queue', authMiddleware, async (req, res) => {
  try {
    const [sq, rq] = await Promise.allSettled([
      arrFetch(SONARR_URL, SONARR_KEY, '/queue?pageSize=50&includeUnknownSeriesItems=false'),
      arrFetch(RADARR_URL, RADARR_KEY, '/queue?pageSize=50&includeUnknownMovieItems=false'),
    ]);
    res.json({
      sonarr: sq.status === 'fulfilled' ? sq.value.records || [] : [],
      radarr: rq.status === 'fulfilled' ? rq.value.records || [] : [],
    });
  } catch (e) { res.status(503).json({ error: 'Media services unavailable' }); }
});

app.get('/api/media/stats', authMiddleware, async (req, res) => {
  try {
    const [ss, rs, sq, rq] = await Promise.allSettled([
      arrFetch(SONARR_URL, SONARR_KEY, '/wanted/missing?pageSize=1'),
      arrFetch(RADARR_URL, RADARR_KEY, '/wanted/missing?pageSize=1'),
      arrFetch(SONARR_URL, SONARR_KEY, '/queue?pageSize=1'),
      arrFetch(RADARR_URL, RADARR_KEY, '/queue?pageSize=1'),
    ]);
    res.json({
      sonarr: { missing: ss.status === 'fulfilled' ? ss.value.totalRecords || 0 : null, queued: sq.status === 'fulfilled' ? sq.value.totalRecords || 0 : null },
      radarr: { missing: rs.status === 'fulfilled' ? rs.value.totalRecords || 0 : null, queued: rq.status === 'fulfilled' ? rq.value.totalRecords || 0 : null },
    });
  } catch (e) { res.status(503).json({ error: 'Media services unavailable' }); }
});

app.get('/api/media/upcoming', optionalAuthMiddleware, async (req, res) => {
  try {
    const today = new Date();
    const end = new Date(today); end.setDate(today.getDate() + 45);
    const startStr = today.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const [cal, movies] = await Promise.allSettled([
      arrFetch(SONARR_URL, SONARR_KEY, `/calendar?start=${startStr}&end=${endStr}&includeSeries=true`),
      arrFetch(RADARR_URL, RADARR_KEY, '/movie?monitored=true'),
    ]);
    const episodes = (cal.status === 'fulfilled' && Array.isArray(cal.value) ? cal.value : []).map(ep => ({
      type: 'episode',
      id: ep.id,
      title: ep.series?.title || 'Unknown',
      episode: `S${String(ep.seasonNumber).padStart(2,'0')}E${String(ep.episodeNumber).padStart(2,'0')}`,
      episodeTitle: ep.title || '',
      airDate: ep.airDateUtc || ep.airDate || '',
      hasFile: ep.hasFile || false,
      network: ep.series?.network || '',
    }));
    const upcomingMovies = (movies.status === 'fulfilled' && Array.isArray(movies.value) ? movies.value : [])
      .filter(m => {
        const release = m.digitalRelease || m.physicalRelease || m.inCinemas;
        if (!release) return false;
        const d = new Date(release);
        return d >= today && d <= end;
      })
      .map(m => ({
        type: 'movie',
        id: m.id,
        title: m.title,
        year: m.year,
        digitalRelease: m.digitalRelease || null,
        physicalRelease: m.physicalRelease || null,
        inCinemas: m.inCinemas || null,
        studio: m.studio || '',
      }));
    res.json({ episodes, movies: upcomingMovies });
  } catch (e) { res.status(503).json({ error: 'Media services unavailable' }); }
});

// ============================================================================
// SEED DEFAULT SERVICES
// ============================================================================

const DEFAULT_SERVICES = [
  { name: 'Plex',        description: 'Media server',           url: 'http://192.168.50.10:32400/web', icon: 'Film',     color: 'bg-yellow-500', tags: ['media'] },
  { name: 'Overseerr',   description: 'Media requests',         url: 'https://seerr.jojeco.ca',        icon: 'Film',     color: 'bg-blue-500',   tags: ['media'] },
  { name: 'Sonarr',      description: 'TV show manager',        url: 'http://192.168.50.13:8989',      icon: 'Monitor',  color: 'bg-teal-500',   tags: ['media', 'arr'] },
  { name: 'Radarr',      description: 'Movie manager',          url: 'http://192.168.50.13:7878',      icon: 'Film',     color: 'bg-orange-500', tags: ['media', 'arr'] },
  { name: 'Prowlarr',    description: 'Indexer manager',        url: 'http://192.168.50.13:9696',      icon: 'Radio',    color: 'bg-purple-500', tags: ['media', 'arr'] },
  { name: 'qBittorrent', description: 'Torrent client',         url: 'http://192.168.50.13:9091',      icon: 'Download', color: 'bg-green-500',  tags: ['download'] },
  { name: 'Navidrome',   description: 'Music streaming',        url: 'https://navidrome.jojeco.ca',    icon: 'Music',    color: 'bg-pink-500',   tags: ['media', 'music'] },
  { name: 'Portainer',   description: 'Docker management',      url: 'http://192.168.50.13:9000',      icon: 'Box',      color: 'bg-cyan-500',   tags: ['infra'] },
  { name: 'Grafana',     description: 'Metrics & monitoring',   url: 'http://192.168.50.13:3002',      icon: 'Activity', color: 'bg-red-500',    tags: ['infra', 'monitoring'] },
  { name: 'LiteLLM',     description: 'AI model gateway',       url: 'http://192.168.50.13:4000/ui',   icon: 'Cpu',      color: 'bg-indigo-500', tags: ['ai'] },
  { name: 'Open WebUI',  description: 'AI chat interface',      url: 'https://ai.jojeco.ca',           icon: 'MessageSquare', color: 'bg-blue-600', tags: ['ai'] },
  { name: 'Proxmox',     description: 'Hypervisor',             url: 'https://192.168.50.1:8006',      icon: 'Server',   color: 'bg-gray-500',   tags: ['infra'] },
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
// AI CHAT ROUTE
// ============================================================================

const LITELLM_URL = 'http://192.168.50.13:4000/v1/chat/completions';
const LITELLM_KEY = 'cafe9800069dd9fe49e4337a3a062fc8e10a747e9d12739cbdff0f8b44ce74e9';

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
  // Try Glances first, then supplement with OhmGraphite for CPU temp (Glances sensors empty on Windows)
  try {
    const data = await fetchLabGlancesDetailed('192.168.50.10');
    if (data.temp == null) {
      try {
        const ohmRes = await fetch('http://192.168.50.10:9101/metrics', { signal: AbortSignal.timeout(3000) });
        if (ohmRes.ok) {
          const ohmText = await ohmRes.text();
          const cpuPkg = parsePromValues(ohmText, 'ohm_cpu_celsius').find(m => m.labels.sensor === 'CPU Package');
          if (cpuPkg) data.temp = Math.round(cpuPkg.value * 10) / 10;
        }
      } catch {}
    }
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

      // GPU temp from OHM (port 9101)
      let gpuTemp = null;
      try {
        const ohmRes = await fetch('http://192.168.50.10:9101/metrics', { signal: AbortSignal.timeout(3000) });
        if (ohmRes.ok) {
          const ohmText = await ohmRes.text();
          const gpuCoreSensor = parsePromValues(ohmText, 'ohm_gpunvidia_celsius').find(m => m.labels.sensor === 'GPU Core');
          if (gpuCoreSensor) gpuTemp = Math.round(gpuCoreSensor.value * 10) / 10;
        }
      } catch {}

      const gpu = gpuTemp !== null ? { name: 'GTX 1060 6GB', temp: gpuTemp, utilization: null, mem_percent: null } : null;
      return { online: true, cpu: cpuPct, mem: { used: memUsed, total: memLimit, percent: memLimit > 0 ? Math.round((memUsed / memLimit) * 1000) / 10 : 0 }, disks, gpu, temp: maxTemp };
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

async function fetchLabServer2Detailed() {
  // Glances on S2 runs in Docker and can't see host filesystem — use Glances for CPU/RAM/GPU/temp
  // then supplement disk from Netdata (which has host access)
  const glances = await fetchLabGlancesDetailed('192.168.50.13').catch(() => null);
  if (!glances) return { online: false };

  // Glances gives 0 disks on this host — pull root disk from Netdata
  let disks = glances.disks ?? [];
  if (disks.length === 0) {
    try {
      const nd = await fetchNetdata('/api/v1/data?chart=disk_space./&after=-2&points=1&format=json');
      const row = nd.data?.[0];
      if (row) {
        const used    = netdataValue(nd.labels, row, 'used');
        const avail   = netdataValue(nd.labels, row, 'avail');
        const reserved= netdataValue(nd.labels, row, 'reserved_for_root');
        const total   = used + avail + reserved;
        if (total > 0) disks = [{ label: '/', used: used * 1024 * 1024 * 1024, size: total * 1024 * 1024 * 1024, percent: Math.round((used / total) * 1000) / 10 }];
      }
    } catch {}
  }

  return { ...glances, disks };
}

app.get('/api/lab/overview', optionalAuthMiddleware, async (req, res) => {
  const [s1, s2, s3, mini, jopc, macbook, services, tailscale] = await Promise.all([
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
  if (!tailscale.online) issues.push({ severity: 'critical', message: 'Tailscale is down' });
  machines.filter(m => m.online).forEach(m => {
    (m.disks ?? []).forEach(d => {
      const freeGB = (d.total ?? 0) - (d.used ?? 0);
      const diskName = d.label ?? d.drive ?? 'disk';
      if (freeGB < 50 && (d.total ?? 0) > 0) issues.push({ severity: 'degraded', message: `${m.name} ${diskName} low: ${freeGB.toFixed(0)}GB free` });
    });
    if (m.cpu > 90) issues.push({ severity: 'degraded', message: `${m.name} CPU at ${m.cpu.toFixed(0)}%` });
    if (m.gpu?.temp > 80) issues.push({ severity: 'degraded', message: `${m.name} GPU temp ${m.gpu.temp}°C` });
    if (m.temp > 85) issues.push({ severity: 'degraded', message: `${m.name} CPU temp ${m.temp}°C` });
  });

  const status = issues.some(i => i.severity === 'critical') ? 'critical'
               : issues.length > 0 ? 'degraded'
               : 'healthy';

  const serviceMap = Object.fromEntries(services.map(s => [s.id, s.online]));
  serviceMap.tailscale = tailscale.online;

  const safeMachines = req.isGuest ? machines.map(({ host, ...rest }) => rest) : machines;
  res.json({ machines: safeMachines, status, issues, services: serviceMap, tailscale });
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
    litellm = { online: health.status === 'connected', spend: spend.spend ?? null };
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
// CHAOS PAGE — REAL LAB SERVICE HEALTH
// ============================================================================

const CHAOS_SERVICES = [
  // Core infrastructure
  { id: 'dashboard-api',  name: 'Dashboard API',  category: 'Core',    url: 'http://192.168.50.13:3001', dependsOn: [] },
  { id: 'authelia',       name: 'Authelia SSO',   category: 'Core',    url: 'http://192.168.50.13:9091', dependsOn: ['authelia-redis'] },
  { id: 'authelia-redis', name: 'Auth Redis',     category: 'Core',    url: 'http://192.168.50.13:6380', dependsOn: [] },
  { id: 'adguard',        name: 'AdGuard DNS',    category: 'Core',    url: 'http://192.168.50.13:3100', dependsOn: [] },
  // Media
  { id: 'plex',           name: 'Plex',           category: 'Media',   url: 'http://192.168.50.10:32400', dependsOn: [] },
  { id: 'sonarr',         name: 'Sonarr',         category: 'Media',   url: 'http://192.168.50.13:8989', dependsOn: [] },
  { id: 'radarr',         name: 'Radarr',         category: 'Media',   url: 'http://192.168.50.13:7878', dependsOn: [] },
  { id: 'tdarr',          name: 'Tdarr',          category: 'Media',   url: 'http://192.168.50.13:8265', dependsOn: [] },
  // Storage & cloud
  { id: 'nextcloud',      name: 'Nextcloud',      category: 'Storage', url: 'http://192.168.50.13:8880', dependsOn: ['nextcloud-redis', 'nextcloud-db'] },
  { id: 'nextcloud-redis',name: 'NC Redis',       category: 'Storage', url: 'http://192.168.50.13:6379', dependsOn: [] },
  { id: 'nextcloud-db',   name: 'NC MariaDB',     category: 'Storage', url: 'http://192.168.50.13:3306', dependsOn: [] },
  // AI
  { id: 'litellm',        name: 'LiteLLM',        category: 'AI',      url: 'http://192.168.50.13:4000', dependsOn: ['litellm-db'] },
  { id: 'litellm-db',     name: 'LiteLLM DB',     category: 'AI',      url: 'http://192.168.50.13:5432', dependsOn: [] },
  { id: 'ollama',         name: 'Ollama',         category: 'AI',      url: 'http://192.168.50.13:11434', dependsOn: [] },
  // Monitoring
  { id: 'prometheus',     name: 'Prometheus',     category: 'Monitoring', url: 'http://192.168.50.13:9090', dependsOn: [] },
  { id: 'grafana',        name: 'Grafana',        category: 'Monitoring', url: 'http://192.168.50.13:3000', dependsOn: ['prometheus'] },
  { id: 'netdata',        name: 'Netdata',        category: 'Monitoring', url: 'http://192.168.50.13:19999', dependsOn: [] },
  // Notifications & comms
  { id: 'ntfy',           name: 'ntfy',           category: 'Comms',   url: 'http://192.168.50.13:8080', dependsOn: [] },
];

app.get('/api/chaos/services', optionalAuthMiddleware, async (req, res) => {
  const results = await Promise.all(CHAOS_SERVICES.map(async svc => {
    const start = Date.now();
    try {
      const r = await fetch(svc.url, { signal: AbortSignal.timeout(4000) });
      const latency = Date.now() - start;
      const online = r.status < 500;
      return { ...svc, online, latency, status: online ? 'healthy' : 'degraded' };
    } catch {
      return { ...svc, online: false, latency: null, status: 'down' };
    }
  }));
  res.json(results);
});

// ── Chaos Agent proxy ────────────────────────────────────────────────────────

const CHAOS_AGENT_URL    = 'http://jojeco-chaos-agent:9999';
const CHAOS_AGENT_SECRET = process.env.CHAOS_SECRET || '';

async function chaosProxy(path, options = {}) {
  const res = await fetch(`${CHAOS_AGENT_URL}${path}`, {
    ...options,
    headers: { 'X-Chaos-Token': CHAOS_AGENT_SECRET, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || 'agent error'), { status: res.status, detail: err.detail });
  }
  return res.json();
}

app.get('/api/chaos/agent/status', authMiddleware, async (req, res) => {
  try { res.json(await chaosProxy('/status')); }
  catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

app.post('/api/chaos/agent/run/:module', authMiddleware, async (req, res) => {
  try {
    const result = await chaosProxy(`/run/${req.params.module}`, { method: 'POST', body: JSON.stringify(req.body) });
    res.json(result);
  } catch (e) { res.status(e.status || 503).json({ error: e.message, detail: e.detail }); }
});

app.post('/api/chaos/agent/abort', authMiddleware, async (req, res) => {
  try { res.json(await chaosProxy('/abort', { method: 'POST' })); }
  catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});

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
  { id: 'litellm',    name: 'LiteLLM',    url: 'http://192.168.50.13:4000' },
  { id: 'ollama',     name: 'Ollama',     url: 'http://192.168.50.13:11434' },
  { id: 'ntfy',       name: 'ntfy',       url: 'http://192.168.50.13:8080' },
];

const serviceState = {};

async function runHealthMonitor() {
  for (const svc of MONITOR_SERVICES) {
    let online = false;
    try {
      const r = await fetch(svc.url, { signal: AbortSignal.timeout(4000) });
      online = r.status < 500;
    } catch { online = false; }

    const prev = serviceState[svc.id];
    serviceState[svc.id] = online;

    if (prev === undefined) continue; // skip first run (no prior state)

    if (prev && !online) {
      console.log(`[monitor] ${svc.name} went DOWN`);
      fetch(NTFY_URL, { method: 'POST', body: `⚠️ ${svc.name} is DOWN`, headers: { Priority: 'high', Tags: 'warning' } }).catch(() => {});
    } else if (!prev && online) {
      console.log(`[monitor] ${svc.name} recovered`);
      fetch(NTFY_URL, { method: 'POST', body: `✅ ${svc.name} recovered`, headers: { Tags: 'white_check_mark' } }).catch(() => {});
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

async function startServer() {
  await db.init();

  // Migrate: ensure temp_history table exists
  db.prepare('CREATE TABLE IF NOT EXISTS temp_history (id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id TEXT NOT NULL, timestamp INTEGER NOT NULL, cpu_temp REAL, gpu_temp REAL)').run();

  app.listen(PORT, () => {
    console.log(`🚀 JojeCo Dashboard API running on port ${PORT}`);
    console.log(`📊 Database: ${db.name}`);
  });

  // Prime initial state, then poll every 2 minutes
  await runHealthMonitor();
  setInterval(runHealthMonitor, 2 * 60 * 1000);
  console.log('🔍 Health monitor started (2min interval)');

  // Start temp polling every 5 minutes
  pollTemps().catch(() => {});
  setInterval(() => pollTemps().catch(() => {}), 5 * 60 * 1000);
  console.log('🌡️  Temp poller started (5min interval)');
}

startServer().catch(console.error);
