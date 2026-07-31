import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();
const JOB_AGENT_URL = process.env.JOB_AGENT_URL || 'http://192.168.50.13:3400';

async function jobFetch(path, options = {}) {
  return fetch(`${JOB_AGENT_URL}${path}`, options);
}

router.get('/api/jobs', authMiddleware, async (req, res) => {
  try {
    const { filter = 'all', limit = 300 } = req.query;
    const r = await jobFetch(`/api/jobs?filter=${filter}&limit=${limit}`);
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'Job agent unavailable' }); }
});

router.get('/api/jobs/skills', authMiddleware, async (req, res) => {
  try {
    const r = await jobFetch('/api/skills');
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'Job agent unavailable' }); }
});

router.post('/api/jobs/:id/applied', authMiddleware, async (req, res) => {
  try {
    const { applied } = req.body;
    const r = await jobFetch(`/api/jobs/${req.params.id}/applied`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied }),
    });
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'Job agent unavailable' }); }
});

router.post('/api/jobs/trigger', authMiddleware, async (req, res) => {
  try {
    const r = await jobFetch('/api/trigger', { method: 'POST' });
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'Job agent unavailable' }); }
});

export default router;
