// Server/container/Claude control routes — power (restart/shutdown/WoL),
// container start/stop/restart, Tdarr node toggle, script triggers (+ abort),
// Claude process control, server/container status. The trigger job tracker is
// shared with the updates routes via ./lib/state.js. Extracted from server.js
// (Phase 3 route split); byte-identical.
import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { authMiddleware } from '../auth.js';
import { MACHINES, sshRun } from '../lib/ssh.js';
import { triggerJobs, triggerProcesses } from '../lib/state.js';

const execFileAsync = promisify(execFile);
const router = express.Router();

// POST /api/controls/server/:machine/restart
router.post('/api/controls/server/:machine/restart', authMiddleware, async (req, res) => {
  const { machine } = req.params;
  const m = MACHINES[machine];
  if (!m) return res.status(400).json({ error: 'Unknown machine' });
  try {
    const cmd = m.os === 'windows' ? 'shutdown /r /t 5' :
                m.os === 'macos'   ? 'sudo shutdown -r +0' :
                                     'reboot';
    await sshRun(machine, cmd);
    res.json({ ok: true, message: `Restart command sent to ${m.label}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/server/:machine/shutdown
router.post('/api/controls/server/:machine/shutdown', authMiddleware, async (req, res) => {
  const { machine } = req.params;
  const m = MACHINES[machine];
  if (!m) return res.status(400).json({ error: 'Unknown machine' });
  try {
    const cmd = m.os === 'windows' ? 'shutdown /s /t 5' :
                m.os === 'macos'   ? 'sudo shutdown -h +0' :
                                     'shutdown -h now';
    await sshRun(machine, cmd);
    res.json({ ok: true, message: `Shutdown command sent to ${m.label}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/server/:machine/wake
router.post('/api/controls/server/:machine/wake', authMiddleware, async (req, res) => {
  const { machine } = req.params;
  const m = MACHINES[machine];
  if (!m || !m.mac) return res.status(400).json({ error: 'Unknown machine or no MAC address' });
  try {
    await execFileAsync('wakeonlan', [m.mac], { timeout: 5000 });
    res.json({ ok: true, message: `Wake-on-LAN packet sent to ${m.label} (${m.mac})` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/container/:name/restart
router.post('/api/controls/container/:name/restart', authMiddleware, async (req, res) => {
  const { name } = req.params;
  // Whitelist: don't allow restarting nginx-proxy-manager or portainer from here (too risky)
  const blocked = ['nginx-proxy-manager', 'portainer', 'cloudflared'];
  if (blocked.includes(name)) return res.status(403).json({ error: 'This container cannot be restarted from the dashboard' });
  try {
    const { stdout } = await execFileAsync('docker', ['restart', name], { timeout: 30000 });
    res.json({ ok: true, message: `Restarted ${name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/container/:name/stop
router.post('/api/controls/container/:name/stop', authMiddleware, async (req, res) => {
  const { name } = req.params;
  const blocked = ['nginx-proxy-manager', 'portainer', 'cloudflared', 'jojeco-dashboard-api'];
  if (blocked.includes(name)) return res.status(403).json({ error: 'This container cannot be stopped from the dashboard' });
  try {
    await execFileAsync('docker', ['stop', name], { timeout: 30000 });
    res.json({ ok: true, message: `Stopped ${name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/container/:name/start
router.post('/api/controls/container/:name/start', authMiddleware, async (req, res) => {
  const { name } = req.params;
  try {
    await execFileAsync('docker', ['start', name], { timeout: 30000 });
    res.json({ ok: true, message: `Started ${name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/tdarr/:node/enable|disable — toggle Tdarr node via SSH schtasks
router.post('/api/controls/tdarr/:node/:action', authMiddleware, async (req, res) => {
  const { node, action } = req.params;
  if (!['enable', 'disable'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const nodeMap = {
    jopc:   'jopc',
    ainspc: 'ainspc',
  };
  const machine = nodeMap[node];
  if (!machine) return res.status(400).json({ error: 'Unknown Tdarr node' });
  const flag = action === 'enable' ? '/ENABLE' : '/DISABLE';
  try {
    await sshRun(machine, `schtasks /Change /TN TdarrNode ${flag}`);
    res.json({ ok: true, message: `Tdarr node ${action}d on ${MACHINES[machine].label}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/trigger/:action
// Scripts run ON THE CT100 HOST via SSH (2026-07-11 fix): the API container has no
// git/rclone/cron env, so in-container exec broke sync-context ("git: command not
// found") and would break backup. jobot has passwordless sudo for the root-cron
// scripts. Aborting kills the SSH session; the host script MAY continue — abort is
// best-effort for host triggers.
router.post('/api/controls/trigger/:action', authMiddleware, async (req, res) => {
  const { action } = req.params;
  const HOST_SSH = `ssh -i /root/.ssh/jojeco_lab_key -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=8 jobot@192.168.50.13`;
  const scripts = {
    'health':        { cmd: `${HOST_SSH} "sudo -n /opt/jojeco-agent/scripts/dep-watcher.sh"`,           timeout: 300000 },
    'backup':        { cmd: `${HOST_SSH} "sudo -n /opt/jojeco-agent/scripts/gdrive-backup.sh"`,          timeout: 2 * 3600000 },
    'snapshot':      { cmd: `${HOST_SSH} "sudo -n /opt/jojeco-agent/scripts/weekly-update.sh"`,          timeout: 2 * 3600000 },
    'claude-server3': { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/start-claude-fallback.sh server3"`, timeout: 300000 },
    'claude-server1': { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/start-claude-fallback.sh server1"`, timeout: 300000 },
    'sync-context':  { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/sync-context.sh"`,                   timeout: 300000 },
    // ── Runbooks: one-button fixes for known failure modes (run with --fix) ──
    'rb-sshuser-lockout': { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/runbooks/fix-sshuser-lockout.sh --fix"`, timeout: 25 * 60000 },
    'rb-mcmanager':       { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/runbooks/fix-mcmanager.sh --fix"`,        timeout: 120000 },
    'rb-qbit-iface':      { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/runbooks/fix-qbit-iface.sh --fix"`,       timeout: 120000 },
    'rb-restart-plex':    { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/runbooks/restart-plex.sh --fix"`,         timeout: 180000 },
    'rb-remount-media':   { cmd: `${HOST_SSH} "/opt/jojeco-agent/scripts/runbooks/remount-s1-media.sh --fix"`,     timeout: 180000 },
  };
  if (!scripts[action]) return res.status(400).json({ error: 'Unknown action' });

  // Kill any already-running instance of this action
  if (triggerProcesses[action]) {
    try { triggerProcesses[action].kill('SIGTERM'); } catch (_) {}
    delete triggerProcesses[action];
  }

  const startedAt = Date.now();
  triggerJobs[action] = { status: 'running', startedAt, finishedAt: null, output: null, error: null };

  const { exec } = await import('child_process');
  const child = exec(scripts[action].cmd, { timeout: scripts[action].timeout }, (err, stdout, stderr) => {
    delete triggerProcesses[action];
    const out = (stdout || '').trim().split('\n').slice(-8).join('\n');
    if (err && err.signal === 'SIGTERM') {
      triggerJobs[action] = { status: 'aborted', startedAt, finishedAt: Date.now(), output: 'Aborted by user', error: null };
    } else if (err) {
      triggerJobs[action] = { status: 'error', startedAt, finishedAt: Date.now(), output: out || stderr?.trim() || err.message, error: err.message };
    } else {
      triggerJobs[action] = { status: 'done', startedAt, finishedAt: Date.now(), output: out, error: null };
    }
  });
  triggerProcesses[action] = child;

  res.json({ ok: true, message: `Triggered: ${action}` });
});

// POST /api/controls/trigger/:action/abort — kill a running trigger
router.post('/api/controls/trigger/:action/abort', authMiddleware, (req, res) => {
  const { action } = req.params;
  const child = triggerProcesses[action];
  if (!child) return res.status(404).json({ error: 'No running job for this action' });
  try {
    child.kill('SIGTERM');
    delete triggerProcesses[action];
    triggerJobs[action] = { ...triggerJobs[action], status: 'aborted', finishedAt: Date.now(), output: 'Aborted by user' };
    res.json({ ok: true, message: `Aborted: ${action}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/claude/ct100/restart — restart Claude on this machine (CT100)
// SSHes to the host to send SIGTERM — wrapper catches it and relaunches
router.post('/api/controls/claude/ct100/restart', authMiddleware, async (req, res) => {
  const { execFile } = await import('child_process');
  execFile('ssh', [
    '-i', '/root/.ssh/jojeco_lab_key',
    '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes',
    'jobot@192.168.50.13',
    'pkill -SIGTERM -f "claude --dangerously" 2>/dev/null; true'
  ], { timeout: 10000 }, (err) => {
    res.json({ ok: true, message: 'Restart signal sent to Claude (CT100) — will resume in ~5s' });
  });
});

// POST /api/controls/claude/ct100/stop — stop Claude on CT100 entirely
router.post('/api/controls/claude/ct100/stop', authMiddleware, async (req, res) => {
  const { execFile } = await import('child_process');
  execFile('ssh', [
    '-i', '/root/.ssh/jojeco_lab_key',
    '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes',
    'jobot@192.168.50.13',
    'pkill -SIGTERM -f "claude-wrapper.sh" 2>/dev/null; pkill -9 -f "claude --dangerously" 2>/dev/null; true'
  ], { timeout: 10000 }, (err) => {
    res.json({ ok: true, message: 'Claude stopped on CT100' });
  });
});

// POST /api/controls/claude/:machine/stop — kill Claude on a remote machine
router.post('/api/controls/claude/:machine/stop', authMiddleware, async (req, res) => {
  const { machine } = req.params;
  const m = MACHINES[machine];
  if (!m) return res.status(400).json({ error: 'Unknown machine' });
  try {
    const cmd = m.os === 'windows'
      ? 'powershell -Command \"Stop-Process -Name claude -Force -ErrorAction SilentlyContinue; Write-Output done\"'
      : 'pkill -f claude 2>/dev/null; pkill -f claude-code 2>/dev/null; echo done';
    await sshRun(machine, cmd);
    res.json({ ok: true, message: `Claude stopped on ${m.label}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/controls/claude/:machine/restart — restart Claude on a remote machine
router.post('/api/controls/claude/:machine/restart', authMiddleware, async (req, res) => {
  const { machine } = req.params;
  const m = MACHINES[machine];
  if (!m) return res.status(400).json({ error: 'Unknown machine' });
  try {
    await sshRun(machine, 'pkill -f claude 2>/dev/null; sleep 2; nohup /opt/jojeco-agent/scripts/start-claude-fallback.sh > /tmp/claude-restart.log 2>&1 &');
    res.json({ ok: true, message: `Claude restarting on ${m.label}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claude/terminal — read-only scrollback of the Claude tmux session on CT100.
// SSHes to jobot@192.168.50.13 (same key/opts as the trigger route) and captures the
// last 100 lines of the first tmux session's pane. Returns { lines } on success, or
// { unavailable:true } when there's no tmux session or the capture fails.
router.get('/api/claude/terminal', authMiddleware, async (req, res) => {
  const HOST_SSH = ['-i', '/root/.ssh/jojeco_lab_key',
    '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    'jobot@192.168.50.13'];
  // Capture the newest tmux session's pane; sentinel when no session/tmux.
  const remote = 'tmux capture-pane -pt $(tmux ls -F "#{session_name}" 2>/dev/null | head -1) -S -100 2>/dev/null || echo "__NO_TMUX__"';
  try {
    const { stdout } = await execFileAsync('ssh', [...HOST_SSH, remote], { timeout: 12000, maxBuffer: 1024 * 1024 });
    const text = (stdout || '').replace(/\r/g, '');
    if (!text.trim() || text.includes('__NO_TMUX__')) {
      return res.json({ unavailable: true });
    }
    // Trim trailing blank lines tmux pads the pane with.
    const lines = text.split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    res.json({ lines });
  } catch {
    res.json({ unavailable: true });
  }
});

// GET /api/controls/trigger-status — returns status of all tracked trigger jobs
router.get('/api/controls/trigger-status', authMiddleware, (req, res) => {
  const result = {};
  for (const [k, v] of Object.entries(triggerJobs)) {
    result[k] = { ...v, canAbort: !!triggerProcesses[k] };
  }
  res.json(result);
});

// GET /api/controls/server-status — pings all machines via TCP
router.get('/api/controls/server-status', authMiddleware, async (req, res) => {
  const net = await import('net');
  const targets = [
    { id: 'server1', host: '192.168.50.10', port: 22 },
    { id: 'server2', host: '192.168.50.11', port: 22 },
    { id: 'server3', host: '192.168.50.12', port: 22 },
    { id: 'macmini', host: '192.168.50.30', port: 22 },
    { id: 'jopc',    host: '192.168.50.20', port: 22 },
  ];
  const results = await Promise.all(targets.map(t => new Promise(resolve => {
    const sock = new net.default.Socket();
    const done = (online) => { sock.destroy(); resolve({ id: t.id, online }); };
    sock.setTimeout(1500);
    sock.connect(t.port, t.host, () => done(true));
    sock.on('error', () => done(false));
    sock.on('timeout', () => done(false));
  })));
  const status = {};
  results.forEach(r => { status[r.id] = r.online; });
  res.json(status);
});

// GET /api/controls/containers - list all containers with status for controls UI
router.get('/api/controls/containers', authMiddleware, async (req, res) => {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps', '-a', '--format', '{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Label "com.docker.compose.project"}}'
    ], { timeout: 10000 });
    const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
      const [name, status, image, composeProject] = line.split('\t');
      const running = status?.startsWith('Up');
      const healthy = status?.includes('healthy') ? 'healthy' : status?.includes('unhealthy') ? 'unhealthy' : null;
      return { name, status, running, healthy, image, compose_project: composeProject || null };
    }).sort((a, b) => a.name.localeCompare(b.name));
    res.json(containers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
