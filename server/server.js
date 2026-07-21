import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { readdir, readFile } from 'fs/promises';
import https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
import db from './database.js';
import { dockerRequest } from './lib/docker.js';
import { SSH_KEY, SSH_OPTS } from './lib/ssh.js';
import authRoutes from './routes/auth.js';
import dockerRoutes from './routes/docker.js';
import mediaRoutes from './routes/media.js';
import torrentsRoutes from './routes/torrents.js';
import jarvisRoutes from './routes/jarvis.js';
import chaosRoutes from './routes/chaos.js';
import adguardRoutes from './routes/adguard.js';
import kioskRoutes from './routes/kiosk.js';
import controlsRoutes from './routes/controls.js';
import gamingRoutes from './routes/gaming.js';
import acRoutes from './routes/ac.js';
import servicesRoutes from './routes/services.js';
import ripRoutes from './routes/rip.js';
import tdarrRoutes from './routes/tdarr.js';
import aiRoutes from './routes/ai.js';
import { triggerJobs } from './lib/state.js';

const execFileAsync = promisify(execFile);

import {
  authMiddleware,
  optionalAuthMiddleware,
  hashPassword,
  INTERNAL_TOKEN,
} from './auth.js';
import { lanOrAuth, sseAuthMiddleware } from './lib/middleware.js';

const app = express();
const PORT = process.env.PORT || 3001;

// trust proxy disabled — req.ip now reflects actual socket IP, not XFF header
// This prevents the XFF auth bypass where spoofed X-Forwarded-For: 192.168.50.x bypassed lanOrAuth
// lanOrAuth + sseAuthMiddleware live in ./lib/middleware.js (Phase 3 route split)

// Middleware
// CORS allowlist (Phase A 2026-07-06): same-origin /api is the normal path (nginx proxy);
// list covers direct-origin dev/staging access + the public hostname. No wildcard.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ||
  'https://dash.jojeco.ca,http://192.168.50.13:3005,http://192.168.50.13:3007,http://localhost:3005,http://localhost:5173'
).split(',');
app.use(cors({ origin: (origin, cb) => cb(null, !origin || CORS_ORIGINS.includes(origin)), credentials: true }));
app.use(express.json());

// ============================================================================
// AUTH ROUTES — extracted to ./routes/auth.js (Phase 3 route split)
// ============================================================================
app.use(authRoutes);

// ============================================================================
// SERVICE REGISTRY ROUTES — extracted to ./routes/services.js (Phase 4 route split)
// services CRUD + service_metrics + health_checks + JSON import/export + seed
// ============================================================================
app.use(servicesRoutes);

// ============================================================================
// SYSTEM METRICS ROUTES (Netdata proxy)
// Node 18+ built-in fetch is used here — no extra dependency needed.
// ============================================================================

const NETDATA_URL = process.env.NETDATA_URL || 'http://netdata:19999';
// LITELLM_KEY is also used by the AI chat proxy (routes/ai.js has its own copy);
// retained here for the inline ops/fleet LiteLLM health+spend probe.
const LITELLM_KEY = process.env.LITELLM_KEY;  // required — set in server/.env

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
// QBITTORRENT PROXY ROUTES — extracted to ./routes/torrents.js (Phase 3 split)
// ============================================================================
app.use(torrentsRoutes);

// ============================================================================
// DOCKER PROXY ROUTES — extracted to ./routes/docker.js (Phase 3 route split)
// ============================================================================
app.use(dockerRoutes);

// ============================================================================
// MEDIA PROXY ROUTES — extracted to ./routes/media.js (Phase 3 route split)
// ============================================================================
app.use(mediaRoutes);

// ============================================================================
// STANDALONE PROXY ROUTES — extracted to ./routes/{rip,tdarr,ai}.js (Phase 4 split)
// CD rip status, Tdarr status, and the LiteLLM AI chat SSE proxy
// ============================================================================
app.use(ripRoutes);
app.use(tdarrRoutes);
app.use(aiRoutes);

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
    nvenc_util: gpuEntry.encoder_proc ?? null,
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
  // Always prefer OhmGraphite for CPU/GPU temp on S1 (Glances sensors return unreliable ACPI thermalzone values on Windows)
  try {
    const data = await fetchLabGlancesDetailed('192.168.50.10');
    try {
      const ohmRes = await fetch('http://192.168.50.10:9101/metrics', { signal: AbortSignal.timeout(3000) });
      if (ohmRes.ok) {
        const ohmText = await ohmRes.text();
        const cpuPkg = parsePromValues(ohmText, 'ohm_cpu_celsius').find(m => m.labels.sensor === 'CPU Package');
        if (cpuPkg) data.temp = Math.round(cpuPkg.value * 10) / 10;
        const gpuCore = parsePromValues(ohmText, 'ohm_gpunvidia_celsius').find(m => m.labels.sensor === 'GPU Core');
        if (gpuCore && data.gpu) data.gpu.temp = Math.round(gpuCore.value * 10) / 10;
        const nvencSensor = parsePromValues(ohmText, 'ohm_gpunvidia_load_percent').find(m => m.labels.sensor === 'GPU Video Engine');
        if (nvencSensor && data.gpu) data.gpu.nvenc_util = Math.round(nvencSensor.value * 10) / 10;
      }
    } catch {}
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

      // GPU + CPU temp from OHM (port 9101) — thermalzone temps are ACPI values (~28°C), not real CPU temps
      let gpuTemp = null;
      let cpuTempOhm = null;
      let nvencUtil = null;
      try {
        const ohmRes = await fetch('http://192.168.50.10:9101/metrics', { signal: AbortSignal.timeout(3000) });
        if (ohmRes.ok) {
          const ohmText = await ohmRes.text();
          const gpuCoreSensor = parsePromValues(ohmText, 'ohm_gpunvidia_celsius').find(m => m.labels.sensor === 'GPU Core');
          if (gpuCoreSensor) gpuTemp = Math.round(gpuCoreSensor.value * 10) / 10;
          const cpuPkg = parsePromValues(ohmText, 'ohm_cpu_celsius').find(m => m.labels.sensor === 'CPU Package');
          if (cpuPkg) cpuTempOhm = Math.round(cpuPkg.value * 10) / 10;
          const nvencSensor = parsePromValues(ohmText, 'ohm_gpunvidia_load_percent').find(m => m.labels.sensor === 'GPU Video Engine');
          if (nvencSensor) nvencUtil = Math.round(nvencSensor.value * 10) / 10;
        }
      } catch {}

      const gpu = gpuTemp !== null ? { name: 'GTX 1060 6GB', temp: gpuTemp, utilization: null, mem_percent: null, nvenc_util: nvencUtil ?? null } : null;
      return { online: true, cpu: cpuPct, mem: { used: memUsed, total: memLimit, percent: memLimit > 0 ? Math.round((memUsed / memLimit) * 1000) / 10 : 0 }, disks, gpu, temp: cpuTempOhm ?? maxTemp };
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

async function fetchLVMThinPool() {
  try {
    const r = await fetch('http://192.168.50.13:9090/api/v1/query?query=node_lvm_thin_pool_data_percent%7Blv%3D%22data%22%2Cvg%3D%22pve%22%7D', { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    const val = d?.data?.result?.[0]?.value?.[1];
    return val !== undefined ? parseFloat(val) : null;
  } catch { return null; }
}

async function fetchClaudeRunning() {
  try {
    // Use 5-minute average to avoid false positives during brief restarts
    const r = await fetch('http://192.168.50.13:9090/api/v1/query?query=avg_over_time(jojeco_claude_running%5B5m%5D)', { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    const val = d?.data?.result?.[0]?.value?.[1];
    return val !== undefined ? parseInt(val) === 1 : null;
  } catch { return null; }
}

async function fetchLabServer2Detailed() {
  // Glances on S2 (CT100 LXC) can't see host filesystem — use Glances for CPU/RAM/temp
  // Pull real disk info from node_exporter (port 9100) which runs on the host with full fs access
  const glances = await fetchLabGlancesDetailed('192.168.50.13').catch(() => null);
  if (!glances) return { online: false };

  let disks = [];
  try {
    const neRes = await fetch('http://192.168.50.13:9100/metrics', { signal: AbortSignal.timeout(4000) });
    if (neRes.ok) {
      const text = await neRes.text();
      const SKIP_FSTYPES_S2 = new Set(['tmpfs', 'devtmpfs', 'squashfs', 'overlay', 'sysfs', 'proc', 'cgroup', 'cgroup2', 'pstore', 'efivarfs', 'ramfs']);
      const sizeEntries = parsePromValues(text, 'node_filesystem_size_bytes')
        .filter(m => !SKIP_FSTYPES_S2.has(m.labels.fstype) && m.value > 5368709120 && isRealMount(m.labels.mountpoint));
      const availEntries = parsePromValues(text, 'node_filesystem_avail_bytes');
      const seen = new Set();
      disks = sizeEntries.filter(m => {
        const key = Math.round(m.value / 1e9);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(m => {
        const avail = availEntries.find(a => a.labels.mountpoint === m.labels.mountpoint)?.value ?? 0;
        const used = m.value - avail;
        return { label: m.labels.mountpoint, used, size: m.value, percent: Math.round((used / m.value) * 1000) / 10 };
      });
    }
  } catch {}

  return { ...glances, disks };
}

app.get('/api/lab/overview', optionalAuthMiddleware, async (req, res) => {
  const [s1, s2, s3, mini, jopc, macbook, services, tailscale, lvmThinPool, claudeRunning] = await Promise.all([
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
    fetchLVMThinPool(),
    fetchClaudeRunning(),
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
  // Tailscale runs on MacMini, not CT100 — not an alertable condition here (Jordan, 2026-07-06)
  // if (!tailscale.online) issues.push({ severity: 'critical', message: 'Tailscale is down' });
  machines.filter(m => m.online).forEach(m => {
    (m.disks ?? []).forEach(d => {
      const sizeBytes = d.size ?? d.total ?? 0;
      const freeBytes = sizeBytes - (d.used ?? 0);
      const freeGB = freeBytes / 1e9;
      const freePct = sizeBytes > 0 ? (freeBytes / sizeBytes) * 100 : 100;
      const diskName = d.label ?? d.drive ?? 'disk';
      // Large drives (>2TB): alert on absolute free space (<200GB warn, <50GB critical)
      // Smaller drives: alert on percentage (<15% warn, <5% critical)
      const isLarge = sizeBytes > 2e12;
      const warn = isLarge ? freeGB < 200 : freePct < 15;
      const crit = isLarge ? freeGB < 50  : freePct < 5;
      if (sizeBytes > 0 && warn) {
        const detail = isLarge ? `${freeGB.toFixed(0)}GB free` : `${freePct.toFixed(0)}% free`;
        issues.push({ severity: crit ? 'critical' : 'degraded', message: `${m.name} ${diskName} low: ${detail}` });
      }
    });
    if (m.cpu > 90) issues.push({ severity: 'degraded', message: `${m.name} CPU at ${m.cpu.toFixed(0)}%` });
    if (m.gpu?.temp > 80) issues.push({ severity: 'degraded', message: `${m.name} GPU temp ${m.gpu.temp}°C` });
    if (m.temp > 85) issues.push({ severity: 'degraded', message: `${m.name} CPU temp ${m.temp}°C` });
  });
  if (lvmThinPool !== null) {
    if (lvmThinPool > 85) issues.push({ severity: 'critical', message: `LVM thin pool CRITICAL: ${lvmThinPool.toFixed(1)}% — run docker system prune NOW` });
    else if (lvmThinPool > 70) issues.push({ severity: 'degraded', message: `LVM thin pool high: ${lvmThinPool.toFixed(1)}%` });
  }
  if (claudeRunning === false) issues.push({ severity: 'critical', message: 'Claude Code agent is NOT running — check jojeco-agent service' });

  const status = issues.some(i => i.severity === 'critical') ? 'critical'
               : issues.length > 0 ? 'degraded'
               : 'healthy';

  const serviceMap = Object.fromEntries(services.map(s => [s.id, s.online]));
  serviceMap.tailscale = tailscale.online;

  const safeMachines = req.isGuest ? machines.map(({ host, ...rest }) => rest) : machines;
  res.json({ machines: safeMachines, status, issues, services: serviceMap, tailscale, lvmThinPool, claudeRunning });
});

const LAB_PROCESS_HOSTS = {
  server1: { host: '192.168.50.10', os: 'windows' },
  server2: { host: '192.168.50.13', os: 'linux' },
  server3: { host: '192.168.50.12', os: 'linux' },
  macmini: { host: '192.168.50.30', os: 'linux' },
  jopc:    { host: '192.168.50.20', os: 'windows' },
  macbook: { host: '192.168.50.40', os: 'linux' },
};

app.get('/api/lab/processes/:machineId', optionalAuthMiddleware, async (req, res) => {
  const entry = LAB_PROCESS_HOSTS[req.params.machineId];
  if (!entry) return res.status(404).json({ error: 'unknown machine' });

  try {
    const base = `http://${entry.host}:61208/api/4`;
    const r = await fetch(`${base}/processlist`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('glances offline');
    const list = await r.json();
    const processes = (Array.isArray(list) ? list : [])
      .map(p => ({ pid: p.pid, name: p.name, cpu: p.cpu_percent ?? 0, mem: p.memory_percent ?? 0 }))
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 15);
    return res.json({ machine_id: req.params.machineId, processes });
  } catch {
    return res.json({ machine_id: req.params.machineId, processes: [] });
  }
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
    litellm = { online: health.status === 'connected' || health.status === 'healthy', spend: spend.spend ?? null };
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
// CHAOS PAGE ROUTES — extracted to ./routes/chaos.js (Phase 3 route split)
// ============================================================================
app.use(chaosRoutes);

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
  { id: 'bazarr',     name: 'Bazarr',     url: 'http://192.168.50.13:6767' },
  { id: 'litellm',    name: 'LiteLLM',    url: 'http://192.168.50.13:4000' },
  { id: 'ollama',     name: 'Ollama',     url: 'http://192.168.50.12:11434' },
  { id: 'ntfy',       name: 'ntfy',       url: 'http://192.168.50.13:8080' },
];

// Hysteresis to stop alert flapping: a service must fail FAIL_THRESHOLD
// consecutive polls before we declare it DOWN (and alert), and we only send a
// "recovered" alert if we actually alerted the outage. At the 2min poll
// interval, 3 strikes = ~6 min sustained failure before Jordan gets pinged.
// This kills the transient-timeout flap (Plex on the Windows box, Nextcloud
// under load) that produced DOWN/recovered pairs every ~10 min.
const FAIL_THRESHOLD = 3;
const serviceState = {}; // id → { fails, alerted }

async function checkOnce(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.status < 500;
  } catch { return false; }
}

async function runHealthMonitor() {
  for (const svc of MONITOR_SERVICES) {
    // Retry within a single poll (2 extra tries) before counting a failure —
    // kills transient-timeout false positives that were flapping the
    // Nextcloud/Authelia alerts even with the consecutive-poll threshold.
    let online = await checkOnce(svc.url);
    if (!online) { await new Promise(r => setTimeout(r, 2000)); online = await checkOnce(svc.url); }
    if (!online) { await new Promise(r => setTimeout(r, 3000)); online = await checkOnce(svc.url); }

    const s = serviceState[svc.id] || (serviceState[svc.id] = { fails: 0, alerted: false });

    if (!online) {
      s.fails++;
      if (s.fails >= FAIL_THRESHOLD && !s.alerted) {
        s.alerted = true;
        console.log(`[monitor] ${svc.name} DOWN (${s.fails} consecutive)`);
        fetch(NTFY_URL, { method: 'POST', body: `⚠️ ${svc.name} is DOWN`, headers: { Priority: 'high', Tags: 'warning' } }).catch(() => {});
      }
    } else {
      if (s.alerted) {
        console.log(`[monitor] ${svc.name} recovered`);
        fetch(NTFY_URL, { method: 'POST', body: `✅ ${svc.name} recovered`, headers: { Tags: 'white_check_mark' } }).catch(() => {});
      }
      s.fails = 0;
      s.alerted = false;
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

// ============================================================================
// SERVER CONTROLS — extracted to ./routes/controls.js (Phase 3 route split)
// ============================================================================
app.use(controlsRoutes);
app.use(gamingRoutes);
app.use(acRoutes);

// ============================================================================
// NTFY ALERT FEED
// ============================================================================

const NTFY_BASE = process.env.NTFY_URL || 'http://192.168.50.13:8080';
const NTFY_TOPIC = 'jojeco-alerts';

app.get('/api/alerts/recent', authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  try {
    const r = await fetch(`${NTFY_BASE}/${NTFY_TOPIC}/json?poll=1&since=48h`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: 'ntfy unreachable' });
    const text = await r.text();
    const messages = text.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(m => m && m.event === 'message').reverse().slice(0, limit).map(m => ({
      id: m.id,
      time: m.time,
      title: m.title || null,
      message: m.message,
      priority: m.priority || 3,
      tags: m.tags || [],
    }));
    res.json(messages);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch alerts', detail: e.message });
  }
});

// GET /api/alerts/history?hours=48 — full ntfy history, newest first, 30s cache
const alertHistoryCache = { at: 0, data: null };
const ALERT_HISTORY_TTL = 30_000;

app.get('/api/alerts/history', authMiddleware, async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours) || 48, 168);
  if (alertHistoryCache.data && Date.now() - alertHistoryCache.at < ALERT_HISTORY_TTL) {
    return res.json(alertHistoryCache.data);
  }
  try {
    const r = await fetch(`${NTFY_BASE}/${NTFY_TOPIC}/json?poll=1&since=${hours}h`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return res.status(502).json({ error: 'ntfy unreachable' });
    const text = await r.text();
    const messages = text.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(m => m && m.event === 'message').reverse().map(m => ({
      id: m.id,
      time: m.time,
      title: m.title || null,
      message: m.message,
      priority: m.priority || 3,
      tags: m.tags || [],
    }));
    alertHistoryCache.data = messages;
    alertHistoryCache.at = Date.now();
    res.json(messages);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch alert history', detail: e.message });
  }
});

// ============================================================================
// LOKI CONTAINER LOG TAIL
// ============================================================================

const LOKI_BASE = process.env.LOKI_URL || 'http://192.168.50.13:3110';
// Per-container in-memory cache: containerName → { at, lines }
const lokiCache = new Map();
const LOKI_TTL = 10_000; // 10s

app.get('/api/logs/container/:name', authMiddleware, async (req, res) => {
  const containerName = req.params.name;
  const lines = Math.min(parseInt(req.query.lines) || 100, 300);

  const cacheKey = `${containerName}:${lines}`;
  const hit = lokiCache.get(cacheKey);
  if (hit && Date.now() - hit.at < LOKI_TTL) {
    return res.json(hit.data);
  }

  try {
    // Query Loki: get last N lines for the container, ordered newest-last
    const now = Date.now();
    const start = (now - 24 * 60 * 60 * 1000) * 1e6; // nanoseconds, 24h window
    const end   = now * 1e6;
    const query = encodeURIComponent(`{container="${containerName}"}`);
    const url   = `${LOKI_BASE}/loki/api/v1/query_range?query=${query}&start=${start}&end=${end}&limit=${lines}&direction=backward`;

    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      if (r.status === 404 || r.status === 400) {
        return res.json({ unavailable: true, reason: `Loki: ${r.status}` });
      }
      return res.status(502).json({ unavailable: true, reason: `Loki ${r.status}: ${errText.slice(0, 200)}` });
    }

    const data = await r.json();
    // Loki streams: data.data.result[].values = [[tsNs, line], ...] sorted newest-first
    const rawEntries = (data?.data?.result ?? []).flatMap(stream =>
      (stream.values ?? []).map(([tsNs, line]) => ({
        ts: Math.floor(parseInt(tsNs) / 1e6), // convert ns → ms
        line,
      }))
    );
    // Sort ascending (oldest first = newest last), cap to N lines
    rawEntries.sort((a, b) => a.ts - b.ts);
    const result = rawEntries.slice(-lines);

    lokiCache.set(cacheKey, { at: Date.now(), data: result });
    res.json(result);
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return res.json({ unavailable: true, reason: 'Loki timeout' });
    }
    console.error('[logs] Loki error:', e.message);
    res.json({ unavailable: true, reason: 'Loki unreachable' });
  }
});

// ============================================================================
// AUTOMATION STATUS
// ============================================================================

app.get('/api/automation/status', authMiddleware, async (req, res) => {
  const jobs = [
    { id: 's3-check',         label: 'S3 Check',            logFile: '/host/log/jojeco-s3-check.log',         schedule: 'Daily 6:00 AM',   maxAgeHours: 28,  emptyIsOk: true },
    { id: 'storage',          label: 'Storage Monitor',     logFile: '/host/log/jojeco-storage.log',           schedule: 'Every 6 h',       maxAgeHours: 7    },
    { id: 'health',           label: 'Daily Health Report', logFile: '/host/log/jojeco-health.log',            schedule: 'Daily 8:00 AM',   maxAgeHours: 26   },
    { id: 'backup',           label: 'GDrive Backup',       logFile: '/host/log/jojeco-gdrive-backup.log',     schedule: 'Daily 4:00 AM',   maxAgeHours: 26   },
    { id: 's3-sync',          label: 'S3 Volume Sync',      logFile: '/host/log/s3-volume-sync.log',           schedule: 'Daily 3:00 AM',   maxAgeHours: 26   },
    { id: 'backup-verify',    label: 'Backup Verify',       logFile: '/host/log/jojeco-backup-verify.log',     schedule: 'Daily 5:30 AM',   maxAgeHours: 26   },
    { id: 'sonarr-maint',     label: 'Sonarr Maintenance',  logFile: '/host/log/jojeco-sonarr-maint.log',      schedule: 'Sunday 4:00 AM',  maxAgeHours: 200  },
    { id: 'depwatch',         label: 'Dependency Watcher',  logFile: '/host/log/jojeco-dep-watcher.log',       schedule: 'Every 5 min',     maxAgeHours: 0.2  },
    { id: 'update',           label: 'Weekly Update',       logFile: '/host/log/jojeco-weekly-update.log',     schedule: 'Sunday 3:00 AM',  maxAgeHours: 200  },
  ];

  const results = await Promise.all(jobs.map(async (job) => {
    try {
      const { stdout } = await execFileAsync('tail', ['-n', '30', job.logFile], { timeout: 3000 });
      const lines = stdout.trim().split('\n').filter(Boolean);
      // s3-check: empty log means every check passed (script only logs failures)
      if (job.emptyIsOk && lines.length === 0) {
        // Failure-only log that's empty = every check passed; an old mtime just means
        // "no failures since then", not stale (a failing check would keep writing)
        const stat = await import('fs/promises').then(m => m.stat(job.logFile)).catch(() => null);
        const mtimeTs = stat ? stat.mtimeMs : null;
        const lastRun = mtimeTs ? new Date(mtimeTs).toISOString() : null;
        return { ...job, status: 'ok', healthy: true, lastRun, lastRunTs: mtimeTs, lastLines: ['(empty — all checks passed)'] };
      }
      // Find last timestamp anywhere in log
      let lastRunTs = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
        if (m) { lastRunTs = new Date(m[1]).getTime(); break; }
        const m2 = lines[i].match(/(\w{3} \w{3} +\d+ \d{2}:\d{2}:\d{2} \w+ \d{4})/); // "Mon Apr 20 10:08:08 UTC 2026"
        if (m2) { lastRunTs = new Date(m2[1]).getTime(); break; }
      }
      // No parseable timestamp in the log lines (e.g. storage-monitor KEY=VALUE output) →
      // fall back to file mtime as the last-run signal
      if (!lastRunTs) {
        const stat = await import('fs/promises').then(m => m.stat(job.logFile)).catch(() => null);
        if (stat) lastRunTs = stat.mtimeMs;
      }
      const lastRun = lastRunTs ? new Date(lastRunTs).toISOString() : null;
      const stale = lastRunTs ? (Date.now() - lastRunTs) > job.maxAgeHours * 3600000 : true;
      const hasError = lines.some(l => /error|fail|fatal/i.test(l) && !/0 errors|no errors?|attempt \d+\/\d+ succeeded/i.test(l));
      // emptyIsOk jobs only log failures — old failure lines mean "no recent failures", not stale
      // (if it were still failing, the log would keep updating and not be stale)
      if (job.emptyIsOk && stale) {
        return { ...job, status: 'ok', healthy: true, lastRun, lastRunTs, lastLines: ['(no recent failures)'] };
      }
      const healthy = !stale && !hasError;
      return { ...job, status: hasError ? 'error' : stale ? 'stale' : 'ok', healthy, lastRun, lastRunTs, lastLines: lines.slice(-5) };
    } catch {
      return { ...job, status: 'unknown', healthy: false, lastRun: null, lastRunTs: null, lastLines: [] };
    }
  }));

  res.json(results);
});

// ============================================================================
// UPDATE CHECKER
// ============================================================================

// ============================================================================
// LAB HOST-SERVICES HEALTH REGISTRY
// Returns health status for all known lab services grouped by host.
// NO API keys — unauthenticated TCP connect or public HTTP HEAD only.
// ============================================================================

// Check via HTTP HEAD (no auth, self-signed OK for LAN HTTPS)
async function httpPing(url, timeoutMs = 4000) {
  const start = Date.now();
  try {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    let statusCode;
    if (isHttps) {
      statusCode = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: parsed.hostname,
          port: parseInt(parsed.port) || 443,
          path: parsed.pathname + (parsed.search || ''),
          method: 'HEAD',
          timeout: timeoutMs,
          rejectUnauthorized: false,
        }, res => { res.resume(); resolve(res.statusCode); });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        req.end();
      });
    } else {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
      statusCode = r.status;
    }
    // Any HTTP response = service is reachable (401/403/405 all mean it's running)
    const online = statusCode < 500 || statusCode === 501;
    return { online, responseTime: Date.now() - start };
  } catch {
    return { online: false, responseTime: Date.now() - start };
  }
}

// Registry of lab services grouped by host — unauthenticated checks only
const LAB_HOST_SERVICES = [
  {
    host: 'CT100',
    hostIp: '192.168.50.13',
    services: [
      { id: 'nextcloud',      label: 'Nextcloud',        port: 8880, checkUrl: 'http://192.168.50.13:8880', quicklink: true, category: 'lab', externalUrl: 'https://cloud.jojeco.ca', icon: 'Cloud' },
      { id: 'files',          label: 'Files',            port: 8085, checkUrl: 'http://192.168.50.13:8085', quicklink: true, category: 'lab', externalUrl: 'https://files.jojeco.ca', icon: 'FolderOpen' },
      { id: 'paperless',      label: 'Paperless',        port: 8010, checkUrl: 'http://192.168.50.13:8010', quicklink: true, category: 'lab', externalUrl: null, icon: 'FileText' },
      { id: 'grafana',        label: 'Grafana',          port: 3002, checkUrl: 'http://192.168.50.13:3002', quicklink: true, category: 'lab', externalUrl: 'https://grafana.jojeco.ca', icon: 'BarChart2' },
      { id: 'portainer',      label: 'Portainer',        port: 9000, checkUrl: 'http://192.168.50.13:9000', quicklink: true, category: 'lab', externalUrl: 'https://portainer.jojeco.ca', icon: 'Box' },
      { id: 'gitea',          label: 'Gitea',            port: 3030, checkUrl: 'http://192.168.50.13:3030', quicklink: true, category: 'lab', externalUrl: null, icon: 'GitBranch' },
      { id: 'n8n',            label: 'n8n',              port: 5678, checkUrl: 'http://192.168.50.13:5678', quicklink: true, category: 'lab', externalUrl: null, icon: 'Workflow' },
      { id: 'odysseus',       label: 'Odysseus',         port: 7000, checkUrl: 'http://192.168.50.13:7000', quicklink: true, category: 'lab', externalUrl: 'https://ai.jojeco.ca', icon: 'Bot' },
      { id: 'homeassistant',  label: 'Home Assistant',   port: 8123, checkUrl: 'http://192.168.50.13:8123', quicklink: true, category: 'lab', externalUrl: null, icon: 'Home' },
      { id: 'actual-budget',  label: 'Actual Budget',    port: 5006, checkUrl: 'https://192.168.50.13:5006', quicklink: true, category: 'lab', externalUrl: null, icon: 'Banknote' },
      { id: 'hoarder',        label: 'Hoarder',          port: 3300, checkUrl: 'http://192.168.50.13:3300', quicklink: true, category: 'lab', externalUrl: null, icon: 'Archive' },
      { id: 'ntfy',           label: 'ntfy',             port: 8080, checkUrl: 'http://192.168.50.13:8080', quicklink: true, category: 'lab', externalUrl: 'https://ntfy.jojeco.ca', icon: 'Bell' },
      { id: 'overseerr',      label: 'Overseerr',        port: 5055, checkUrl: 'http://192.168.50.13:5055', quicklink: true, category: 'media', externalUrl: 'https://seerr.jojeco.ca', icon: 'Eye' },
      { id: 'tautulli',       label: 'Tautulli',         port: 8181, checkUrl: 'http://192.168.50.13:8181', quicklink: true, category: 'media', externalUrl: 'https://tautulli.jojeco.ca', icon: 'Activity' },
      { id: 'navidrome',      label: 'Navidrome',        port: 4533, checkUrl: 'http://192.168.50.13:4533', quicklink: true, category: 'media', externalUrl: 'https://navidrome.jojeco.ca', icon: 'Music' },
      { id: 'sonarr',         label: 'Sonarr',           port: 8989, checkUrl: 'http://192.168.50.13:8989', quicklink: true, category: 'media', externalUrl: null, icon: 'Tv' },
      { id: 'radarr',         label: 'Radarr',           port: 7878, checkUrl: 'http://192.168.50.13:7878', quicklink: true, category: 'media', externalUrl: null, icon: 'Film' },
      { id: 'prowlarr',       label: 'Prowlarr',         port: 9696, checkUrl: 'http://192.168.50.13:9696', quicklink: true, category: 'media', externalUrl: null, icon: 'Search' },
      { id: 'bazarr',         label: 'Bazarr',           port: 6767, checkUrl: 'http://192.168.50.13:6767', quicklink: true, category: 'media', externalUrl: null, icon: 'MessageSquare' },
      { id: 'lidarr',         label: 'Lidarr',           port: 8686, checkUrl: 'http://192.168.50.13:8686', quicklink: true, category: 'media', externalUrl: null, icon: 'Headphones' },
      { id: 'qbittorrent',    label: 'qBittorrent',      port: 9091, checkUrl: 'http://192.168.50.13:9091', quicklink: true, category: 'media', externalUrl: null, icon: 'Download' },
      { id: 'tdarr',          label: 'Tdarr',            port: 8265, checkUrl: 'http://192.168.50.13:8265', quicklink: true, category: 'media', externalUrl: null, icon: 'Video' },
      { id: 'duplicati',      label: 'Duplicati',        port: 8200, checkUrl: 'http://192.168.50.13:8200' },
      { id: 'job-agent',      label: 'Job Agent',        port: 3400, checkUrl: 'http://192.168.50.13:3400' },
      { id: 'jojeco-router',  label: 'jojeco-router',    port: 4001, checkUrl: 'http://192.168.50.13:4001' },
    ],
  },
  {
    host: 'Server 2 (Proxmox)',
    hostIp: '192.168.50.11',
    services: [
      { id: 'proxmox',         label: 'Proxmox',           port: 8006, checkUrl: 'https://192.168.50.11:8006', quicklink: true, category: 'lab', externalUrl: null, icon: 'Server' },
    ],
  },
  {
    host: 'Server 3 (S3)',
    hostIp: '192.168.50.12',
    services: [
      { id: 's3-speedtest',    label: 'Speedtest Tracker', port: 8765, checkUrl: 'http://192.168.50.12:8765' },
      { id: 's3-comfyui',      label: 'ComfyUI',           port: 8188, checkUrl: 'http://192.168.50.12:8188' },
      { id: 's3-whisper',      label: 'faster-whisper',    port: 9000, checkUrl: 'http://192.168.50.12:9000' },
      { id: 's3-piper',        label: 'piper-tts',         port: 8400, checkUrl: 'http://192.168.50.12:8400' },
      { id: 's3-openwebui',    label: 'Open WebUI',        port: 3000, checkUrl: 'http://192.168.50.12:3000' },
      { id: 's3-dozzle',       label: 'Dozzle',            port: 8015, checkUrl: 'http://192.168.50.12:8015' },
    ],
  },
  {
    host: 'Server 1 (S1)',
    hostIp: '192.168.50.10',
    services: [
      { id: 's1-plex',         label: 'Plex',              port: 32400, checkUrl: 'http://192.168.50.10:32400/identity', quicklink: true, category: 'media', externalUrl: 'https://plex.jojeco.ca', icon: 'Play' },
      { id: 's1-vintagestory', label: 'Vintage Story',     port: 42420, checkUrl: null, tcp: true },
      { id: 's1-mcmanager',    label: 'MC Manager',        port: 8765,  checkUrl: 'http://192.168.50.10:8765/status' },
    ],
  },
  {
    host: 'Mac Mini',
    hostIp: '192.168.50.30',
    services: [
      { id: 'macmini-kuma',    label: 'Uptime Kuma',       port: 3001, checkUrl: 'http://192.168.50.30:3001' },
      { id: 'macmini-adguard', label: 'AdGuard',           port: 3000, checkUrl: 'http://192.168.50.30:3000', quicklink: true, category: 'lab', externalUrl: null, icon: 'Shield' },
    ],
  },
];

// In-memory cache for host-services (30s TTL to avoid hammering remote hosts)
let labHostServicesCache = { at: 0, data: null };
const HOST_SERVICES_TTL = 30_000;

async function fetchLabHostServices() {
  const now = Date.now();
  if (labHostServicesCache.data && now - labHostServicesCache.at < HOST_SERVICES_TTL) {
    return labHostServicesCache.data;
  }
  const groups = await Promise.all(LAB_HOST_SERVICES.map(async group => {
    const services = await Promise.all(group.services.map(async svc => {
      let online = false;
      let responseTime = null;
      if (svc.tcp) {
        const ok = await tcpCheck(group.hostIp, svc.port, 3000);
        online = ok;
        responseTime = null;
      } else if (svc.checkUrl) {
        const r = await httpPing(svc.checkUrl, 4000);
        online = r.online;
        responseTime = r.responseTime;
      }
      return { ...svc, online, responseTime, checkedAt: Date.now() };
    }));
    return { host: group.host, hostIp: group.hostIp, services };
  }));
  labHostServicesCache = { at: Date.now(), data: groups };
  return groups;
}

app.get('/api/lab/host-services', authMiddleware, async (req, res) => {
  try {
    const data = await fetchLabHostServices();
    res.json({ checkedAt: Date.now(), groups: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// UPDATE CHECKER
// ============================================================================

// Cache update check results in memory (expensive to fetch from registry)
let updateCache = { checked: null, results: [] };

async function getRemoteDigest(imageRef) {
  // Parse registry/repo/tag from imageRef
  let registry = 'registry-1.docker.io';
  let repo = imageRef.split('@')[0]; // strip any existing digest
  let tag = 'latest';

  // Split tag
  const lastColon = repo.lastIndexOf(':');
  const lastSlash = repo.lastIndexOf('/');
  if (lastColon > lastSlash) {
    tag = repo.slice(lastColon + 1);
    repo = repo.slice(0, lastColon);
  }

  // Handle non-Docker Hub registries
  if (repo.includes('.') && repo.indexOf('.') < (repo.indexOf('/') > -1 ? repo.indexOf('/') : Infinity)) {
    const slashIdx = repo.indexOf('/');
    registry = repo.slice(0, slashIdx);
    repo = repo.slice(slashIdx + 1);
  } else if (!repo.includes('/')) {
    repo = `library/${repo}`; // Docker Hub official images
  }

  const headers = { Accept: 'application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.list.v2+json' };

  if (registry === 'registry-1.docker.io') {
    try {
      const authRes = await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`, { signal: AbortSignal.timeout(8000) });
      if (authRes.ok) {
        const { token } = await authRes.json();
        headers.Authorization = `Bearer ${token}`;
      }
    } catch { /* proceed without auth */ }
  }

  const manifestRes = await fetch(`https://${registry}/v2/${repo}/manifests/${tag}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!manifestRes.ok) return null;
  return manifestRes.headers.get('docker-content-digest');
}

async function checkContainerUpdates() {
  const r = await dockerRequest('/containers/json?all=0');
  const containers = r.body || [];

  const results = await Promise.allSettled(containers.map(async (c) => {
    const name = c.Names[0]?.replace('/', '') || c.Id.slice(0, 12);
    const image = c.Image;

    // Skip containers without a proper image tag (sha256 refs)
    if (image.startsWith('sha256:') || !image) return null;

    // Get local image digest
    const imgR = await dockerRequest(`/images/${encodeURIComponent(image)}/json`);
    const localDigests = imgR.body?.RepoDigests || [];
    const localDigest = localDigests[0]?.split('@')[1] || null;

    // Get remote digest
    let remoteDigest = null;
    try { remoteDigest = await getRemoteDigest(image); } catch { /* ignore */ }

    const updateAvailable = localDigest && remoteDigest && localDigest !== remoteDigest;

    return {
      id: c.Id.slice(0, 12),
      name,
      image,
      localDigest: localDigest ? localDigest.slice(0, 19) : null,
      remoteDigest: remoteDigest ? remoteDigest.slice(0, 19) : null,
      updateAvailable: updateAvailable || false,
      canCheck: !!(localDigest && remoteDigest),
    };
  }));

  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

app.get('/api/updates/available', authMiddleware, async (req, res) => {
  const force = req.query.force === '1';
  const cacheAgeMs = 30 * 60 * 1000; // 30 min cache
  if (!force && updateCache.checked && (Date.now() - updateCache.checked) < cacheAgeMs) {
    return res.json({ checked: updateCache.checked, results: updateCache.results, cached: true });
  }
  try {
    const results = await checkContainerUpdates();
    updateCache = { checked: Date.now(), results };
    res.json({ checked: updateCache.checked, results, cached: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/updates/apply', authMiddleware, async (req, res) => {
  const { containers: names } = req.body;
  if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: 'containers array required' });

  // Start async job
  const jobId = `update-${Date.now()}`;
  triggerJobs[jobId] = { status: 'running', startedAt: Date.now(), finishedAt: null, output: null, error: null };
  res.json({ jobId, message: 'Update started' });

  (async () => {
    const lines = [];
    for (const name of names) {
      try {
        // Get image for this container
        const cR = await dockerRequest(`/containers/${name}/json`);
        const image = cR.body?.Config?.Image;
        if (!image) { lines.push(`${name}: could not find image`); continue; }

        lines.push(`Pulling ${image}...`);
        // Pull new image
        await new Promise((resolve, reject) => {
          const opts = { socketPath: '/var/run/docker.sock', path: `/images/create?fromImage=${encodeURIComponent(image)}`, method: 'POST' };
          const req2 = http.request(opts, dres => { dres.resume(); dres.on('end', resolve); });
          req2.on('error', reject);
          req2.end();
        });

        // Restart container to pick up new image
        await dockerRequest(`/containers/${name}/restart`, 'POST');
        lines.push(`${name}: updated and restarted`);
      } catch (e) {
        lines.push(`${name}: failed — ${e.message}`);
      }
    }
    updateCache = { checked: null, results: [] }; // invalidate cache
    triggerJobs[jobId] = { status: 'done', startedAt: triggerJobs[jobId].startedAt, finishedAt: Date.now(), output: lines.join('\n'), error: null };
  })().catch(e => {
    triggerJobs[jobId] = { ...triggerJobs[jobId], status: 'error', finishedAt: Date.now(), error: e.message };
  });
});

// ============================================================================
// SERVER-SIDE SERVICE HEALTH POLLER
// ============================================================================

// Cache of latest health result per serviceId
const serviceHealthCache = new Map();

async function runServiceHealthPoller() {
  try {
    // Fetch all services across all users
    const services = db.prepare('SELECT id, name, url, health_check_url, health_check_interval FROM services').all();
    await Promise.allSettled(services.map(async (svc) => {
      const checkUrl = svc.health_check_url || svc.url;
      if (!checkUrl) return;
      const startTime = Date.now();
      let status = 'offline';
      let statusCode = null;
      let responseTime = null;
      let error = null;
      try {
        const isPrivateHttps = checkUrl.startsWith('https://') && /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(checkUrl);
        if (isPrivateHttps) {
          // Use https module with rejectUnauthorized:false for internal self-signed certs
          await new Promise((resolve, reject) => {
            const req = https.request(checkUrl, { method: 'HEAD', rejectUnauthorized: false, timeout: 8000 }, (res) => {
              statusCode = res.statusCode;
              // 401/403/405/501 mean the service IS running but rejected our unauthed HEAD
              status = (res.statusCode < 500 || res.statusCode === 501) ? 'online' : 'offline';
              resolve();
            });
            req.on('error', (e) => { error = e.message?.slice(0, 100); reject(e); });
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.end();
          });
        } else {
          const r = await fetch(checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
          statusCode = r.status;
          // 401/403/405/501 mean the service IS running but rejected our unauthed HEAD
          status = (r.status < 500 || r.status === 501) ? 'online' : 'offline';
        }
        responseTime = Date.now() - startTime;
      } catch (e) {
        responseTime = Date.now() - startTime;
        error = e.message?.slice(0, 100);
        status = 'offline';
      }
      const ts = Date.now();
      serviceHealthCache.set(svc.id, { serviceId: svc.id, name: svc.name, status, statusCode, responseTime, error, checkedAt: ts });
      // Persist to health_checks table (keep last 288 per service = 24h at 5min intervals)
      db.prepare('INSERT INTO health_checks (service_id, status, response_time, status_code, timestamp, error) VALUES (?,?,?,?,?,?)').run(svc.id, status, responseTime, statusCode, ts, error);
      db.prepare('DELETE FROM health_checks WHERE service_id = ? AND timestamp < ?').run(svc.id, Date.now() - 7 * 24 * 3600000);
    }));
  } catch { /* don't crash the server */ }
}

app.get('/api/health/services', authMiddleware, (req, res) => {
  const results = Array.from(serviceHealthCache.values());
  res.json({ checkedAt: Date.now(), services: results });
});

app.get('/api/health/services/:serviceId/history', authMiddleware, (req, res) => {
  const { serviceId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 288, 1000);
  const rows = db.prepare('SELECT status, response_time, status_code, timestamp, error FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?').all(serviceId, limit);
  const total = rows.length;
  const online = rows.filter(r => r.status === 'online').length;
  const uptimePct = total > 0 ? Math.round((online / total) * 1000) / 10 : null;
  const avgResponseTime = rows.filter(r => r.response_time).length > 0
    ? Math.round(rows.filter(r => r.response_time).reduce((s, r) => s + r.response_time, 0) / rows.filter(r => r.response_time).length)
    : null;
  res.json({ serviceId, uptimePct, avgResponseTime, history: rows });
});

// ============================================================================
// FAILOVER / HA ROUTES
// ============================================================================

const S2_HOST = '192.168.50.11';
const S3_HOST = '192.168.50.12';
const SYNC_LOG_PATH = '/var/log/s3-volume-sync.log';
const FAILOVER_ACTIVE_FILE = '/mnt/data/lab/failover/.active';

async function tcpCheck(host, port, timeoutMs = 3000) {
  const net = await import('net');
  return new Promise(resolve => {
    const sock = new net.default.Socket();
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.connect(port, host, () => done(true));
    sock.on('error', () => done(false));
    sock.on('timeout', () => done(false));
  });
}

// GET /api/failover/status
app.get('/api/failover/status', lanOrAuth, async (req, res) => {
  try {
    const [s2_online, s3_online] = await Promise.all([
      tcpCheck(S2_HOST, 22),
      tcpCheck(S3_HOST, 22),
    ]);

    // Check failover active: look for state file on S3 or docker ps grep
    let failover_active = false;
    let watchdog_status = 'unknown';
    let last_sync = null;

    // SSH to S3 for watchdog + failover state (only if S3 is online)
    if (s3_online) {
      try {
        const { stdout: wdOut } = await execFileAsync('ssh', [
          '-i', SSH_KEY, ...SSH_OPTS, `jojeco@${S3_HOST}`,
          'systemctl is-active jojeco-watchdog 2>/dev/null || echo inactive'
        ], { timeout: 10000 });
        watchdog_status = wdOut.trim();
      } catch { watchdog_status = 'unreachable'; }

      try {
        const { stdout: foOut } = await execFileAsync('ssh', [
          '-i', SSH_KEY, ...SSH_OPTS, `jojeco@${S3_HOST}`,
          `test -f ${FAILOVER_ACTIVE_FILE} && echo yes || docker ps 2>/dev/null | grep -q failover && echo yes || echo no`
        ], { timeout: 10000 });
        failover_active = foOut.trim() === 'yes';
      } catch { failover_active = false; }
    }

    // Read last sync log line (local file, mounted into container)
    try {
      const { stdout: logOut } = await execFileAsync('tail', ['-n', '1', SYNC_LOG_PATH], { timeout: 3000 });
      last_sync = logOut.trim() || null;
    } catch { last_sync = null; }

    res.json({ s2_online, s3_online, failover_active, watchdog_status, last_sync });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/failover/activate
app.post('/api/failover/activate', authMiddleware, async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      '/opt/jojeco-agent/scripts/lab-failover.sh', ['activate'],
      { timeout: 120000 }
    );
    res.json({ success: true, output: (stdout + stderr).trim() });
  } catch (e) {
    res.status(500).json({ success: false, output: (e.stdout || '') + (e.stderr || ''), error: e.message });
  }
});

// POST /api/failover/deactivate
app.post('/api/failover/deactivate', authMiddleware, async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      '/opt/jojeco-agent/scripts/lab-failover.sh', ['deactivate'],
      { timeout: 120000 }
    );
    res.json({ success: true, output: (stdout + stderr).trim() });
  } catch (e) {
    res.status(500).json({ success: false, output: (e.stdout || '') + (e.stderr || ''), error: e.message });
  }
});

// POST /api/failover/sync-now — fire and forget
app.post('/api/failover/sync-now', authMiddleware, async (req, res) => {
  const { exec } = await import('child_process');
  exec('/opt/jojeco-agent/scripts/s3-volume-sync.sh >> /var/log/s3-volume-sync.log 2>&1 &');
  res.json({ success: true, message: 'Volume sync started' });
});

// ============================================================================
// BACKUP STATUS ROUTE
// ============================================================================

const BACKUP_LOG_PATH = '/host/log/jojeco-gdrive-backup.log';

app.get('/api/backup-status', lanOrAuth, async (req, res) => {
  try {
    const { stdout } = await execFileAsync('tail', ['-n', '40', BACKUP_LOG_PATH], { timeout: 3000 });
    const lines = stdout.trim().split('\n').filter(Boolean);

    // Find last run timestamp
    let lastRun = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/=== Backup (started|complete) (\d{4}-\d{2}-\d{2})/);
      if (m) { lastRun = m[2]; break; }
    }

    // Find time from last session header
    let lastRunTime = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/\[(\d{2}:\d{2}:\d{2})\] === Backup started/);
      if (m) { lastRunTime = m[1]; break; }
    }

    // Check for errors in last session (lines after last "Backup started")
    let sessionStart = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/=== Backup started/.test(lines[i])) { sessionStart = i; break; }
    }
    const sessionLines = lines.slice(sessionStart);
    const hasError = sessionLines.some(l => /error|fail|FAILED/i.test(l) && !/0 errors/i.test(l));
    const completed = sessionLines.some(l => /=== Backup complete|✅ Backup complete/i.test(l));

    const status = hasError ? 'error' : completed ? 'ok' : lastRun ? 'unknown' : 'never';
    const lastRunFull = lastRun && lastRunTime ? `${lastRun} ${lastRunTime}` : lastRun || null;

    // Get last few meaningful lines
    const message = sessionLines.filter(l => l.trim() && !/^$/.test(l)).slice(-6).join('\n');

    res.json({ lastRun: lastRunFull, status, message });
  } catch (e) {
    res.json({ lastRun: null, status: 'unknown', message: 'Log not found or unreadable' });
  }
});

// ============================================================================
// 7-DAY SPARKLINE DATA
// ============================================================================

app.get('/api/health/sparklines', authMiddleware, (req, res) => {
  try {
    const since7d = Date.now() - 7 * 24 * 3600000;
    const services = db.prepare('SELECT id, name FROM services').all();
    const result = {};
    for (const svc of services) {
      // Get hourly buckets of uptime % over last 7 days
      const rows = db.prepare(
        'SELECT timestamp, status FROM health_checks WHERE service_id = ? AND timestamp > ? ORDER BY timestamp ASC'
      ).all(svc.id, since7d);

      if (rows.length === 0) { result[svc.id] = []; continue; }

      // Group into 24 buckets (one per 7h period = 7 days)
      const bucketMs = 7 * 24 * 3600000 / 24;
      const now = Date.now();
      const buckets = Array.from({ length: 24 }, (_, i) => {
        const bucketEnd = now - (23 - i) * bucketMs;
        const bucketStart = bucketEnd - bucketMs;
        const inBucket = rows.filter(r => r.timestamp >= bucketStart && r.timestamp < bucketEnd);
        if (inBucket.length === 0) return null;
        const online = inBucket.filter(r => r.status === 'online').length;
        return Math.round((online / inBucket.length) * 100);
      });
      result[svc.id] = buckets;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch sparkline data' });
  }
});

// ============================================================================
// ADGUARD STATS PROXY — extracted to ./routes/adguard.js (Phase 3 route split)
// ============================================================================
app.use(adguardRoutes);

// ============================================================================
// JARVIS VOICE API PROXY — extracted to ./routes/jarvis.js (Phase 3 route split)
// ============================================================================
app.use(jarvisRoutes);

// ============================================================================
// MINECRAFT PROXY
// ============================================================================

app.get('/api/minecraft/status', lanOrAuth, async (req, res) => {
  try {
    const r = await fetch('http://192.168.50.10:8765/status', { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'MC API unreachable' });
  }
});

// ============================================================================
// KIOSK API ROUTES — extracted to ./routes/kiosk.js (Phase 3 route split)
// ============================================================================
app.use(kioskRoutes);

// ============================================================================
// ============================================================================
// BAMBU P1S PRINTER — MQTT STATUS POLLER
// ============================================================================
// Background: connects once to the printer's MQTT broker (TLS, self-signed cert)
// every 15 s, fires pushall, waits for the rich status payload, then caches it.
// Requests to /api/printer/p1s serve the last cached value instantly (no blocking).
// READ-ONLY: we only subscribe + publish pushall. No control commands.

import mqtt from 'mqtt';

const P1S_HOST   = '192.168.50.228';
const P1S_PORT   = 8883;
const P1S_USER   = 'bblp';
const P1S_PASS   = '583f2d55';
const P1S_SN     = '01P00C5C1203051';
const P1S_REPORT = `device/${P1S_SN}/report`;
const P1S_REQ    = `device/${P1S_SN}/request`;
const PUSHALL_MSG = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } });

const SPEED_LABELS = { 1: 'Silent', 2: 'Standard', 3: 'Sport', 4: 'Ludicrous' };
const GCODE_STATE_MAP = {
  RUNNING: 'Printing', PAUSE: 'Paused', FINISH: 'Finished',
  FAILED: 'Failed', IDLE: 'Idle', PREPARE: 'Preparing',
  SLICING: 'Slicing', DOWNLOADING: 'Downloading',
};

let printerCache = { online: false, lastFetch: 0 };
let p1sPollTimer = null;

function p1sParsePayload(raw) {
  const d = raw.print ?? raw;
  // Active tray: ams.tray_now is a number (slot index across all AMS units)
  const trayNow  = d.ams?.tray_now ?? null;
  let activeTray = null;
  if (trayNow !== null && trayNow !== 255) {
    const amsIdx  = Math.floor(trayNow / 4);
    const trayIdx = trayNow % 4;
    const amsUnit = (d.ams?.ams ?? [])[amsIdx];
    activeTray = amsUnit?.tray?.[trayIdx] ?? null;
  }

  const hexToRgb = (hex) => {
    if (!hex) return null;
    const h = hex.replace(/FF$/i, '').padStart(6, '0');
    return `#${h.slice(0, 6).toUpperCase()}`;
  };

  const gcodeState = d.gcode_state ?? 'IDLE';
  return {
    online:          true,
    gcode_state:     GCODE_STATE_MAP[gcodeState] ?? gcodeState,
    job:             d.gcode_file ? d.gcode_file.replace(/\.3mf$/i, '').replace(/\.gcode$/i, '') : null,
    pct:             d.mc_percent ?? 0,
    layer:           d.layer_num ?? 0,
    total_layers:    d.total_layer_num ?? 0,
    remaining_min:   d.mc_remaining_time ?? null,
    nozzle_temp:     d.nozzle_temper != null ? Math.round(d.nozzle_temper * 10) / 10 : null,
    nozzle_target:   d.nozzle_target_temper ?? null,
    bed_temp:        d.bed_temper != null ? Math.round(d.bed_temper * 10) / 10 : null,
    bed_target:      d.bed_target_temper ?? null,
    speed_level:     SPEED_LABELS[d.spd_lvl] ?? 'Standard',
    active_tray:     trayNow,
    tray_color:      activeTray ? hexToRgb(activeTray.tray_color) : null,
    tray_type:       activeTray?.tray_type ?? null,
    print_error:     d.print_error ?? 0,
    lastFetch:       Date.now(),
  };
}

async function pollP1S() {
  return new Promise((resolve) => {
    const timeoutMs = 12000;
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { client.end(true); } catch (_) {}
      clearTimeout(tid);
      resolve(result);
    };

    const client = mqtt.connect({
      host: P1S_HOST,
      port: P1S_PORT,
      protocol: 'mqtts',
      username: P1S_USER,
      password: P1S_PASS,
      rejectUnauthorized: false,
      connectTimeout: 8000,
      reconnectPeriod: 0,
    });

    const tid = setTimeout(() => done({ online: false, lastFetch: Date.now() }), timeoutMs);

    client.on('connect', () => {
      client.subscribe(P1S_REPORT, (err) => {
        if (err) return done({ online: false, lastFetch: Date.now() });
        client.publish(P1S_REQ, PUSHALL_MSG);
      });
    });

    client.on('message', (_topic, payload) => {
      try {
        const raw = JSON.parse(payload.toString());
        // Wait for a rich payload (pushall response has many keys)
        if (raw.print && Object.keys(raw.print).length > 5) {
          done(p1sParsePayload(raw));
        }
      } catch (_) {}
    });

    client.on('error', () => done({ online: false, lastFetch: Date.now() }));
  });
}

async function runP1SPoll() {
  try {
    const result = await pollP1S();
    printerCache = result;
    console.log(`[p1s] polled — online:${result.online} state:${result.gcode_state ?? 'n/a'} pct:${result.pct ?? '-'}%`);
  } catch (e) {
    console.error('[p1s] poll error:', e.message);
    printerCache = { online: false, lastFetch: Date.now() };
  }
}

function startP1SPoller() {
  runP1SPoll();
  p1sPollTimer = setInterval(runP1SPoll, 15000);
}

app.get('/api/printer/p1s', optionalAuthMiddleware, (req, res) => {
  res.json(printerCache);
});

// ============================================================================
// FILAMENT INVENTORY & 3D PRINTER WEBHOOKS
// ============================================================================

app.get('/api/filament', optionalAuthMiddleware, (req, res) => {
  try {
    const spools = db.prepare('SELECT * FROM filament_spools ORDER BY status ASC, created_at DESC').all();
    res.json(spools);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/filament/:id/update', authMiddleware, express.json(), (req, res) => {
  const { id } = req.params;
  const { weight_remaining_g, status, color_name, sku } = req.body;
  const now = Date.now();
  try {
    db.prepare(`
      UPDATE filament_spools 
      SET weight_remaining_g = ?, status = ?, color_name = COALESCE(?, color_name), sku = COALESCE(?, sku), updated_at = ?
      WHERE id = ?
    `).run(weight_remaining_g, status, color_name, sku, now, id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook for Home Assistant to call on print completion
// HA automation payload: { "rfid": "...", "weight_used_g": 12.5, "tray_id_name": "A00-Y4", "color_hex": "E4BD68FF" }
app.post('/api/printer/webhook/print-finished', express.json(), (req, res) => {
  const { rfid, weight_used_g, color_hex, tray_id_name } = req.body;
  
  if (!weight_used_g || weight_used_g <= 0) {
    return res.json({ success: false, reason: 'invalid_weight' });
  }

  try {
    const now = Date.now();
    // Try to find the exact spool. If no RFID, match by color_hex/tray_id_name and status='active'
    let spool = null;
    
    // We don't have RFID saved initially from the baseline, so we match on sku/color
    // The tray_id_name in AMS matches our sku prefix, e.g. "A00-Y4"
    if (tray_id_name) {
      const activeSpools = db.prepare(`SELECT * FROM filament_spools WHERE status = 'active'`).all();
      spool = activeSpools.find(s => s.sku && s.sku.includes(tray_id_name));
    }
    
    if (spool) {
      const newWeight = Math.max(0, spool.weight_remaining_g - weight_used_g);
      const newStatus = newWeight <= 0 ? 'empty' : 'active';
      db.prepare(`UPDATE filament_spools SET weight_remaining_g = ?, status = ?, updated_at = ? WHERE id = ?`)
        .run(newWeight, newStatus, now, spool.id);
        
      console.log(`[filament] Deducted ${weight_used_g}g from spool ${spool.id} (${spool.color_name}). Remaining: ${newWeight}g`);
      return res.json({ success: true, spool_id: spool.id, new_weight: newWeight });
    } else {
      console.log(`[filament] Could not find active spool matching tray_id_name: ${tray_id_name}`);
      return res.status(404).json({ success: false, reason: 'spool_not_found' });
    }
  } catch (error) {
    console.error('[filament] Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Aggregated snapshot + SSE stream — shared data layer for the v3/v4 frontend.
//
// PERF (2026-07-11): Zero-wait paint architecture.
//
// The root cause of the 4.2 s /api/snapshot latency was building the snapshot
// on-request: every cold hit fired 14 upstream fetches in parallel, each up to
// 8 s, and the response blocked until all resolved.
//
// New approach:
//   • A background loop (snapshotTick) assembles the full snapshot every 15 s
//     and stores it in lastSnapshot[scope].  Sections with a longer TTL
//     (automation=60s, alerts=30s) are only refreshed when stale.
//   • /api/snapshot returns lastSnapshot immediately (<1 ms).  On first boot,
//     before the first tick finishes, it returns whatever sections are already
//     in snapshotCache (partial) — never blocks.
//   • /api/stream pushes lastSnapshot synchronously on connect, then sets up
//     the 15 s recurring tick.  No more "wait up to 15 s for first event".
//   • The section-level cache (snapshotCache) is still used by snapshotTick so
//     slow upstream calls (lab overview, host-services) are not re-fetched more
//     often than their TTL.
// ============================================================================

const snapshotCache = new Map(); // `${section}:${auth|guest}` → { at, data }
const SNAP_SECTIONS = {
  lab:              '/api/lab/overview',
  servicesHealth:   '/api/services/health',
  docker:           '/api/docker/containers',
  fleet:            '/api/ops/fleet',
  ollama:           '/api/lab/ollama/ps',
  media:            '/api/media/queue',
  system:           '/api/system/metrics',
  serverStatus:     '/api/controls/server-status',
  alerts:           '/api/alerts/recent',
  minecraft:        '/api/minecraft/status',
  gaming:           '/api/gaming/status',
  automation:       '/api/automation/status',
  torrents:         '/api/torrents/transfer',
  printer:          '/api/printer/p1s',
  labHostServices:  '/api/lab/host-services',
};
const SNAP_TTL_MS = { automation: 60000, alerts: 30000, labHostServices: 30000, gaming: 20000, default: 15000 };

// In-memory last-assembled snapshot per auth scope.
// null until the first background tick completes.
const lastSnapshot = { auth: null, guest: null };

/** Fetch all snapshot sections, reusing cache where fresh enough.
 *  This is called by the background tick — NOT on-request. */
async function buildSnapshotPayload(authHeader) {
  const auth = authHeader || '';
  const scope = auth ? 'auth' : 'guest';
  const out = {};
  await Promise.all(Object.entries(SNAP_SECTIONS).map(async ([s, path]) => {
    const ttl = SNAP_TTL_MS[s] || SNAP_TTL_MS.default;
    const key = `${s}:${scope}`;
    const hit = snapshotCache.get(key);
    if (hit && Date.now() - hit.at < ttl) { out[s] = hit.data; return; }
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
        headers: auth ? { authorization: auth } : {},
        signal: AbortSignal.timeout(8000),
      });
      const data = r.ok ? await r.json() : null;
      out[s] = data;
      if (data !== null) snapshotCache.set(key, { at: Date.now(), data });
    } catch {
      out[s] = hit ? hit.data : null; // serve stale over nothing
    }
  }));
  return { at: Date.now(), sections: out };
}

/** Return the last assembled snapshot immediately, falling back to whatever
 *  snapshotCache sections exist if no full tick has completed yet. */
function getInstantSnapshot(scope) {
  if (lastSnapshot[scope]) return lastSnapshot[scope];
  // Pre-tick fallback: assemble from whatever is already cached (partial/empty)
  const out = {};
  for (const s of Object.keys(SNAP_SECTIONS)) {
    const hit = snapshotCache.get(`${s}:${scope}`);
    out[s] = hit ? hit.data : null;
  }
  return { at: Date.now(), sections: out };
}

// ── Background snapshot tick ──────────────────────────────────────────────────
const SSE_INTERVAL_MS = 15_000;

async function snapshotTick() {
  try {
    // Build both scopes in parallel so auth and guest caches stay warm
    const [authSnap, guestSnap] = await Promise.all([
      buildSnapshotPayload(`Bearer ${INTERNAL_TOKEN}`), // loopback-only internal token — auth-gated sections resolve
      buildSnapshotPayload(''),
    ]);
    // Auth scope background build uses a placeholder token; the section data
    // (lab, docker, etc.) is host-internal and identical — share the result.
    // Guest sections strip host IPs server-side in the individual routes.
    lastSnapshot.auth  = authSnap;
    lastSnapshot.guest = guestSnap;
    console.log(`[snapshot] tick complete — ${Object.keys(authSnap.sections).length} sections, auth ${JSON.stringify(authSnap).length} B`);
  } catch (err) {
    console.error('[snapshot] tick error:', err.message);
  }
}

// ── SSE stream ────────────────────────────────────────────────────────────────
const sseClients = new Set();

/** Push the last cached snapshot to a client — synchronous JSON stringify,
 *  no upstream fetches, no waiting. */
function pushInstantToClient(client) {
  try {
    const scope = client.auth ? 'auth' : 'guest';
    const payload = getInstantSnapshot(scope);
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (err) {
    console.error('[SSE] instant push error:', err.message);
  }
}

/** Full push — called by the recurring tick interval (builds fresh if stale). */
async function pushToClient(client) {
  try {
    const payload = await buildSnapshotPayload(client.auth);
    const scope = client.auth ? 'auth' : 'guest';
    lastSnapshot[scope] = payload;
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (err) {
    console.error('[SSE] push error:', err.message);
  }
}

// sseAuthMiddleware lives in ./lib/middleware.js (Phase 3 route split)

// GET /api/stream — auth-gated SSE endpoint
app.get('/api/stream', sseAuthMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // prevent nginx from buffering SSE frames
  res.flushHeaders();

  const auth = req.headers.authorization || '';
  const client = { res, auth, timer: null };
  sseClients.add(client);
  console.log(`[SSE] client connected (total: ${sseClients.size})`);

  // Push last snapshot immediately — synchronous, <1 ms, no upstream fetches.
  pushInstantToClient(client);

  // Recurring pushes aligned to the background tick cadence
  client.timer = setInterval(() => pushToClient(client), SSE_INTERVAL_MS);

  // Proxy-keepalive heartbeat (comment line — not a data event)
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { /* already closed */ }
  }, 30_000);

  req.on('close', () => {
    clearInterval(client.timer);
    clearInterval(heartbeat);
    sseClients.delete(client);
    console.log(`[SSE] client disconnected (total: ${sseClients.size})`);
  });
});

// ── /api/snapshot — polling fallback, now instant (<1 ms) ────────────────────
app.get('/api/snapshot', optionalAuthMiddleware, (req, res) => {
  const auth = req.headers.authorization || '';
  const scope = auth ? 'auth' : 'guest';
  const snap = getInstantSnapshot(scope);

  // Filter to requested sections if ?sections=... is provided
  if (req.query.sections) {
    const wanted = new Set(String(req.query.sections).split(',').filter(s => SNAP_SECTIONS[s]));
    const filtered = {};
    for (const s of wanted) filtered[s] = snap.sections[s] ?? null;
    return res.json({ at: snap.at, sections: filtered });
  }

  res.json(snap);
});

// ============================================================================

async function startServer() {
  await db.init();

  // Migrate: ensure temp_history table exists
  db.prepare('CREATE TABLE IF NOT EXISTS temp_history (id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id TEXT NOT NULL, timestamp INTEGER NOT NULL, cpu_temp REAL, gpu_temp REAL)').run();

  // Seed default admin user if users table is empty
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminUserId = process.env.ADMIN_USER_ID;
  if (adminEmail && adminPassword && adminUserId) {
    const existing = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (existing.count === 0) {
      const hash = await hashPassword(adminPassword);
      const now = Date.now();
      db.prepare('INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(adminUserId, adminEmail, hash, 'Jordan', now, now);
      console.log(`✅ Admin user seeded: ${adminEmail} (id: ${adminUserId})`);
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 JojeCo Dashboard API running on port ${PORT}`);
    console.log(`📊 Database: ${db.name}`);
  });

  // Internal ntfy health-monitor DISABLED 2026-06-22 — Uptime Kuma (Mac Mini :3001, 41
  // monitors, ntfy-wired) is now the canonical up/down alerter. Running both = double-alerts.
  // Function kept for reference / dashboard service-health display; just not the alert source.
  // await runHealthMonitor();
  // setInterval(runHealthMonitor, 2 * 60 * 1000);
  console.log('🔍 Internal health monitor disabled — Uptime Kuma is canonical');

  // Service health poller — checks all user-registered services every 5 min
  runServiceHealthPoller().catch(() => {});
  setInterval(() => runServiceHealthPoller().catch(() => {}), 5 * 60 * 1000);
  console.log('🩺 Service health poller started (5min interval)');

  // Start temp polling every 30 seconds
  pollTemps().catch(() => {});
  setInterval(() => pollTemps().catch(() => {}), 30 * 1000);
  console.log('🌡️  Temp poller started (30sec interval)');

  // Start P1S printer MQTT poller (15s interval, serves cached result)
  startP1SPoller();
  console.log('🖨️  P1S printer poller started (15s interval)');

  // Background snapshot tick — warms lastSnapshot so /api/snapshot and SSE
  // connect return data instantly on every subsequent request.
  // First tick fires immediately; subsequent ticks every 15 s.
  snapshotTick().catch(() => {}); // fire-and-forget; errors logged inside
  setInterval(() => snapshotTick().catch(() => {}), SSE_INTERVAL_MS);
  console.log('⚡ Snapshot background tick started (15 s interval)');
}

startServer().catch(console.error);
