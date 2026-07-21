// Service registry routes — the user-scoped services CRUD plus its satellite
// tables: service_metrics, health_checks, JSON import/export, and the default
// service seed. All pure better-sqlite3 CRUD (db) gated by auth. Extracted from
// server.js (Phase 4 route split); handler bodies byte-identical.
import express from 'express';
import crypto from 'crypto';
import db from '../database.js';
import { authMiddleware, optionalAuthMiddleware } from '../auth.js';

const router = express.Router();

// ============================================================================
// SERVICE ROUTES
// ============================================================================

router.get('/api/services', optionalAuthMiddleware, (req, res) => {
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

router.post('/api/services', authMiddleware, (req, res) => {
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

router.put('/api/services/:id', authMiddleware, (req, res) => {
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

router.delete('/api/services/:id', authMiddleware, (req, res) => {
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

router.post('/api/metrics', authMiddleware, (req, res) => {
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

router.get('/api/metrics/:serviceId', authMiddleware, (req, res) => {
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

router.post('/api/health-checks', authMiddleware, (req, res) => {
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

router.get('/api/health-checks/:serviceId', authMiddleware, (req, res) => {
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

router.get('/api/services/export', authMiddleware, (req, res) => {
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

router.post('/api/services/import', authMiddleware, (req, res) => {
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

router.post('/api/services/seed', authMiddleware, (req, res) => {
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

export default router;
