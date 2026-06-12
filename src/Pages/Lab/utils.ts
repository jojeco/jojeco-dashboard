/** Shared formatting helpers for LabPage components */

export function fmtBytes(bytes: number): string {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + 'T';
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1) + 'G';
  if (bytes >= 1e6)  return (bytes / 1e6).toFixed(0) + 'M';
  return bytes + 'B';
}

export function pctColor(pct: number, warn = 65, crit = 85): string {
  if (pct >= crit) return 'var(--err)';
  if (pct >= warn) return 'var(--warn)';
  return 'var(--ok)';
}

export function tempColor(t: number): string {
  if (t > 85) return 'var(--err)';
  if (t > 70) return 'var(--warn)';
  return 'var(--t2)';
}

export const MODEL_SPEED: Record<string, number> = {
  'gemma4:e4b': 125, 'gemma4:26b': 31.7, 'deepseek-r1:14b': 4.9,
  'qwen2.5:7b': 17, 'qwen2.5:14b': 8, 'llava:7b': 14,
};

export function getSpeed(name: string): number | null {
  if (MODEL_SPEED[name] != null) return MODEL_SPEED[name];
  const base = name.split(':')[0];
  return MODEL_SPEED[base] ?? null;
}

export const NODE_SHORT: Record<string, string> = {
  'Server 3': 'S3', 'MacBook M4': 'MBP', 'JoPc': 'JoPc',
};

export function isIntegrated(name: string): boolean {
  return /intel|uhd|iris/i.test(name);
}
