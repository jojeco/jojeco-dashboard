// Tdarr status proxy — pulls library statistics + active worker list from the
// Tdarr server and reshapes them for the dashboard. Extracted from server.js
// (Phase 4 route split); handler body byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const TDARR_URL = 'http://192.168.50.13:8265';

router.get('/api/tdarr/status', authMiddleware, async (req, res) => {
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

export default router;
