// CD rip status proxy — reads the ripper's JSON status file served over HTTP on
// Server 1 (strips the UTF-8 BOM PowerShell Set-Content prepends). Falls back to
// an idle payload when unreachable. Extracted from server.js (Phase 4 route
// split); handler body byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const RIP_STATUS_URL = process.env.RIP_STATUS_URL || 'http://192.168.50.10:9998';

router.get('/api/rip/status', authMiddleware, async (req, res) => {
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

export default router;
