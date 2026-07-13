// Shared lab-machine client layer — SSH access + the canonical machine registry
// (IPs, users, OS, WoL MACs). Extracted from server.js (Phase 3 backend refactor)
// so every route that SSHes into a lab box uses one implementation and one
// machine table. Behaviour is byte-identical to the original inline helpers.
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const SSH_KEY = '/root/.ssh/jojeco_lab_key';
export const SSH_OPTS = ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=6', '-o', 'BatchMode=yes'];

// Canonical lab machine registry — IP, SSH user, OS family, and WoL MAC.
export const MACHINES = {
  server1:  { ip: '192.168.50.10', user: 'jojeco717', os: 'windows', mac: '50:3d:d1:37:6d:bb', label: 'Server 1' },
  server2:  { ip: '192.168.50.11', user: 'root',      os: 'linux',   mac: '10:5a:95:21:00:82', label: 'Server 2 (Proxmox)' },
  server3:  { ip: '192.168.50.12', user: 'jojeco',    os: 'linux',   mac: '90:20:3a:1a:37:21', label: 'Server 3' },
  macmini:  { ip: '192.168.50.30', user: 'jj',        os: 'macos',   mac: '0c:4d:e9:c7:07:69', label: 'Mac Mini' },
  jopc:     { ip: '192.168.50.20', user: 'sshuser',   os: 'windows', mac: process.env.JOPC_MAC  || 'c8:7f:54:6a:5c:2d', label: 'JoPc' },
  macbook:  { ip: '192.168.50.40', user: 'jojeco',   os: 'macos',   mac: process.env.JOMAC_MAC || '76:86:2B:1E:45:C6', label: 'JoMac' },
  ainspc:   { ip: '192.168.50.220', user: 'ainsl',   os: 'windows', mac: 'a0:02:a5:06:45:a0',                          label: "Ainsley's PC" },
};

export async function sshRun(machine, cmd) {
  const m = MACHINES[machine];
  if (!m) throw new Error(`Unknown machine: ${machine}`);
  const { stdout, stderr } = await execFileAsync('ssh', [
    '-i', SSH_KEY, ...SSH_OPTS, `${m.user}@${m.ip}`, cmd
  ], { timeout: 15000 });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}
