// Docker proxy routes — container list, start/stop/restart, prune, logs.
// Talks to the host Docker daemon via the shared dockerRequest() client and the
// mounted /var/run/docker.sock. Extracted from server.js (Phase 3 route split);
// behaviour byte-identical.
import express from 'express';
import http from 'http';
import { authMiddleware, optionalAuthMiddleware } from '../auth.js';
import { dockerRequest } from '../lib/docker.js';

const router = express.Router();

router.get('/api/docker/containers', optionalAuthMiddleware, async (req, res) => {
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

router.post('/api/docker/containers/:id/:action', authMiddleware, async (req, res) => {
  const { id, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    const r = await dockerRequest(`/containers/${id}/${action}`, 'POST');
    res.json({ result: r.status === 204 ? 'ok' : r.body });
  } catch (e) { res.status(503).json({ error: 'Docker socket unavailable' }); }
});

// Prune: stopped containers + dangling images + unused networks + build cache (like
// `docker system prune -f`), then fstrim to release space back to the LVM thin pool.
router.post('/api/docker/prune', authMiddleware, async (req, res) => {
  try {
    let reclaimed = 0;
    const calls = [
      '/containers/prune',
      `/images/prune?filters=${encodeURIComponent('{"dangling":["true"]}')}`,
      '/networks/prune',
      '/build/prune',
    ];
    for (const p of calls) {
      try { const r = await dockerRequest(p, 'POST'); reclaimed += (r.body && r.body.SpaceReclaimed) || 0; } catch (e) { /* skip */ }
    }
    try { require('child_process').execSync('fstrim / 2>/dev/null', { timeout: 60000 }); } catch (e) { /* fstrim needs host caps; ignore if unavailable */ }
    res.json({ message: `Pruned — reclaimed ${(reclaimed / 1e9).toFixed(2)} GB`, reclaimed });
  } catch (e) { res.status(503).json({ error: 'Docker socket unavailable' }); }
});

router.get('/api/docker/containers/:id/logs', authMiddleware, async (req, res) => {
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

export default router;
