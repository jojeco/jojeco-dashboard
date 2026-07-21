// Resilience / DR routes — failover HA status + activate/deactivate/sync-now for
// the S3 hot-standby, plus GDrive backup status. Extracted from server.js
// (Phase 4 route split); handler bodies byte-identical. execFileAsync is
// re-declared locally (server.js keeps its own copy for the inline routes);
// tcpCheck now comes from the shared lib/net.js.
import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { authMiddleware } from '../auth.js';
import { lanOrAuth } from '../lib/middleware.js';
import { SSH_KEY, SSH_OPTS } from '../lib/ssh.js';
import { tcpCheck } from '../lib/net.js';

const execFileAsync = promisify(execFile);
const router = express.Router();

// ============================================================================
// FAILOVER / HA ROUTES
// ============================================================================

const S2_HOST = '192.168.50.11';
const S3_HOST = '192.168.50.12';
const SYNC_LOG_PATH = '/var/log/s3-volume-sync.log';
const FAILOVER_ACTIVE_FILE = '/mnt/data/lab/failover/.active';

// GET /api/failover/status
router.get('/api/failover/status', lanOrAuth, async (req, res) => {
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
router.post('/api/failover/activate', authMiddleware, async (req, res) => {
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
router.post('/api/failover/deactivate', authMiddleware, async (req, res) => {
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
router.post('/api/failover/sync-now', authMiddleware, async (req, res) => {
  const { exec } = await import('child_process');
  exec('/opt/jojeco-agent/scripts/s3-volume-sync.sh >> /var/log/s3-volume-sync.log 2>&1 &');
  res.json({ success: true, message: 'Volume sync started' });
});

// ============================================================================
// BACKUP STATUS ROUTE
// ============================================================================

const BACKUP_LOG_PATH = '/host/log/jojeco-gdrive-backup.log';

router.get('/api/backup-status', lanOrAuth, async (req, res) => {
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

export default router;
