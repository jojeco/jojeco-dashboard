// qBittorrent proxy routes — list, transfer info, add, and pause/resume/delete/
// recheck actions. Holds its own session cookie state (module-scoped, single
// instance). Extracted from server.js (Phase 3 route split); byte-identical.
import express from 'express';
import { authMiddleware } from '../auth.js';

const router = express.Router();

const QBT_URL = process.env.QBT_URL || 'http://192.168.50.13:9091';
const QBT_USER = process.env.QBT_USER || 'admin';
const QBT_PASS = process.env.QBT_PASS || 'REDACTED';
let qbtSid = null;
let qbtCookieName = 'SID';

async function qbtLogin() {
  const res = await fetch(`${QBT_URL}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': QBT_URL },
    body: `username=${QBT_USER}&password=${QBT_PASS}`,
  });
  const cookies = res.headers.get('set-cookie') || '';
  // qBittorrent changed cookie name to QBT_SID_{PORT} in newer versions
  const match = cookies.match(/([A-Z_]*SID[^=]*)=([^;]+)/);
  if (match) { qbtCookieName = match[1]; qbtSid = match[2]; return true; }
  return false;
}

async function qbtFetch(path, options = {}) {
  const headers = { 'Referer': QBT_URL, ...(options.headers || {}) };
  if (qbtSid) headers['Cookie'] = `${qbtCookieName}=${qbtSid}`;
  const res = await fetch(`${QBT_URL}${path}`, { ...options, headers });
  if (res.status === 403) {
    await qbtLogin();
    const retryHeaders = { 'Cookie': `${qbtCookieName}=${qbtSid}`, 'Referer': QBT_URL, ...(options.headers || {}) };
    return fetch(`${QBT_URL}${path}`, { ...options, headers: retryHeaders });
  }
  return res;
}

router.get('/api/torrents/list', authMiddleware, async (req, res) => {
  try {
    const r = await qbtFetch('/api/v2/torrents/info?sort=added_on&reverse=true');
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'qBittorrent unavailable' }); }
});

router.get('/api/torrents/transfer', authMiddleware, async (req, res) => {
  try {
    const r = await qbtFetch('/api/v2/transfer/info');
    res.json(await r.json());
  } catch (e) { res.status(503).json({ error: 'qBittorrent unavailable' }); }
});

router.post('/api/torrents/add', authMiddleware, async (req, res) => {
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

router.post('/api/torrents/:action', authMiddleware, async (req, res) => {
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

export default router;
