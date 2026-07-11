// Gaming server routes — aggregates the Server 1 (Windows) game-server managers
// into one dashboard-friendly snapshot, and proxies control actions.
//
// Backends (both on Server 1, 192.168.50.10):
//   • Minecraft manager (mc_manager.py) — http://192.168.50.10:8765
//       GET  /status        → { <id>: {id,name,public_port,backend_port,status}, ... }
//                             status ∈ "running" | "sleeping" | "starting" | "stopped"
//       POST /<id>/start | /<id>/stop | /<id>/restart   (CORS: GET, POST, OPTIONS)
//       lazymc fronts each server: "sleeping" = wakes automatically on player join.
//   • Vintage Story keeper (vs-keeper.ps1) — http://192.168.50.10:8767
//       GET  /status        → { state, players, uptime_s }
//       POST /start | /stop  (POST requires a Content-Length / body)
//       No /restart on the VS keeper → implemented here as stop-then-start.
//
// Everything is best-effort: when S1 is off (game rigs powered down), /status
// returns { s1Online:false } and control actions surface a clear error.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const MC_BASE = 'http://192.168.50.10:8765';
const VS_BASE = 'http://192.168.50.10:8767';

// Valid Minecraft server ids come from the manager's /status keys; we still keep
// a static allow-list of known ids as a guard for the control endpoints.
const MC_IDS = new Set(['main', 'bmc4', 'ftb']);
const ACTIONS = new Set(['start', 'stop', 'restart']);

// ── Status aggregation ────────────────────────────────────────────────────────
// GET /api/gaming/status — one payload for the whole Gaming tab.
// Shape: { s1Online, minecraft: [ {id,name,status,port,players?} ], vintageStory: {status,players?,uptime_s?} }
router.get('/api/gaming/status', authMiddleware, async (req, res) => {
  const out = { s1Online: false, minecraft: [], vintageStory: null };

  // Minecraft manager
  let mcOk = false;
  try {
    const r = await fetch(`${MC_BASE}/status`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const data = await r.json();
      out.minecraft = Object.values(data).map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,                 // running | sleeping | starting | stopped
        port: s.public_port ?? null,
        // mc_manager /status does not report player counts; leave undefined.
        players: typeof s.players === 'number' ? s.players : undefined,
      }));
      mcOk = true;
    }
  } catch { /* S1 or MC manager unreachable */ }

  // Vintage Story keeper
  let vsOk = false;
  try {
    const r = await fetch(`${VS_BASE}/status`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      out.vintageStory = {
        status: d.state ?? 'unknown',     // running | sleeping | stopped
        players: typeof d.players === 'number' ? d.players : undefined,
        uptime_s: typeof d.uptime_s === 'number' ? d.uptime_s : undefined,
        port: 42420,                       // VS default game port (informational)
      };
      vsOk = true;
    }
  } catch { /* VS keeper unreachable */ }

  // If either manager answered, S1 is up enough to run game servers.
  out.s1Online = mcOk || vsOk;
  res.json(out);
});

// ── Control ────────────────────────────────────────────────────────────────────
// POST /api/gaming/:server/:action  where server ∈ MC ids ∪ {'vs'}, action ∈ start|stop|restart
router.post('/api/gaming/:server/:action', authMiddleware, async (req, res) => {
  const { server, action } = req.params;
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action' });

  try {
    if (server === 'vs') {
      // VS keeper exposes only /start and /stop (POST needs a body). Restart = stop→start.
      if (action === 'restart') {
        await vsPost('/stop');
        // brief pause so the graceful /stop begins its save before we relaunch
        await new Promise((r) => setTimeout(r, 1500));
        await vsPost('/start');
        return res.json({ ok: true, message: 'Vintage Story restarting (stop → start)' });
      }
      await vsPost(`/${action}`);
      return res.json({ ok: true, message: `Vintage Story ${action} sent` });
    }

    if (MC_IDS.has(server)) {
      // mc_manager pattern: POST /<id>/<action>. lazymc still owns auto sleep/wake;
      // these are the manual overrides the dashboard drives.
      const r = await fetch(`${MC_BASE}/${server}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: body.error || `MC manager ${r.status}` });
      return res.json({ ok: true, message: body.message || `${server} ${action} sent` });
    }

    return res.status(400).json({ error: 'Unknown game server' });
  } catch (e) {
    // Timeout / connection refused → S1 or the manager is down.
    return res.status(502).json({ error: `Game server unreachable — ${e.message}` });
  }
});

async function vsPost(path) {
  const r = await fetch(`${VS_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}', // VS keeper POST requires a Content-Length / body
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`VS keeper ${r.status}`);
  return r.json().catch(() => ({}));
}

export default router;
