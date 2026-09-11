// SABnzbd proxy routes — queue + history + speed stats.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const SAB_URL = process.env.SAB_URL || 'http://192.168.50.13:8086';
const SAB_KEY = process.env.SAB_KEY;

async function sabApi(mode, extra = '') {
  if (!SAB_KEY) throw new Error('SAB_KEY not configured');
  const url = `${SAB_URL}/api?apikey=${SAB_KEY}&output=json&mode=${mode}${extra}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`SABnzbd ${mode} HTTP ${r.status}`);
  return r.json();
}

// Active download queue
router.get('/api/sabnzbd/queue', authMiddleware, async (req, res) => {
  try {
    const data = await sabApi('queue', '&start=0&limit=50');
    const q = data.queue;
    const slots = (q.slots || []).map(s => ({
      nzo_id: s.nzo_id,
      filename: s.filename,
      status: s.status,
      percentage: parseFloat(s.percentage) || 0,
      mb: parseFloat(s.mb) || 0,
      mbleft: parseFloat(s.mbleft) || 0,
      timeleft: s.timeleft,
      avg_age: s.avg_age,
      cat: s.cat,
    }));
    res.json({
      status: q.status,
      speed: q.speed,        // e.g. "13.5 MB/s"
      kbpersec: parseFloat(q.kbpersec) || 0,
      sizeleft: q.sizeleft,
      timeleft: q.timeleft,
      paused: q.paused,
      slots,
    });
  } catch (e) {
    res.status(503).json({ error: 'SABnzbd unavailable', detail: e.message });
  }
});

// Recent completed downloads (last 20)
router.get('/api/sabnzbd/history', authMiddleware, async (req, res) => {
  try {
    const data = await sabApi('history', '&start=0&limit=20');
    const slots = (data.history?.slots || []).map(s => ({
      nzo_id: s.nzo_id,
      name: s.name,
      status: s.status,
      size: s.size,
      completed: s.completed,
      cat: s.category,
      fail_message: s.fail_message || '',
    }));
    res.json({ slots });
  } catch (e) {
    res.status(503).json({ error: 'SABnzbd unavailable', detail: e.message });
  }
});

export default router;
