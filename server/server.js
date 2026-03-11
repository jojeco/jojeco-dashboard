import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import db from './database.js';
import {
  generateToken,
  authMiddleware,
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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await hashPassword(password);
    const user = createUser(email, passwordHash, displayName);
    const token = generateToken(user.id, user.email);

    res.json({ user, token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
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

app.get('/api/services', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM services
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);
    const services = stmt.all(req.user.userId);

    // Parse JSON fields
    const parsed = services.map(service => ({
      ...service,
      tags: JSON.parse(service.tags || '[]'),
      isPinned: Boolean(service.is_pinned),
      lanUrl: service.lan_url,
      healthCheckUrl: service.health_check_url,
      healthCheckInterval: service.health_check_interval,
      createdAt: service.created_at,
      updatedAt: service.updated_at,
      userId: service.user_id,
    }));

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
      fetchNetdata('/api/v1/data?chart=disk_space._&after=-2&points=1&format=json'),
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
// START SERVER
// ============================================================================

async function startServer() {
  await db.init();

  app.listen(PORT, () => {
    console.log(`🚀 JojeCo Dashboard API running on port ${PORT}`);
    console.log(`📊 Database: ${db.name}`);
  });
}

startServer().catch(console.error);
