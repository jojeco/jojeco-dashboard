// Automation status — tails each scheduled-job log file (mounted at /host/log)
// and derives ok/stale/error/unknown health from the last timestamp + error
// lines. Extracted from server.js (Phase 4 route split); handler body
// byte-identical. execFileAsync is re-declared locally here (server.js keeps its
// own copy for the routes that remain inline).
import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { authMiddleware } from '../auth.js';

const execFileAsync = promisify(execFile);
const router = express.Router();

router.get('/api/automation/status', authMiddleware, async (req, res) => {
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

export default router;
