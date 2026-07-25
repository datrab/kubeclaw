import fs from 'fs';
import path from 'path';

export function writeJsonAtomic(filePath: string, value: unknown, missingPathMessage: any = 'atomic JSON write requires a file path'): void {
  if (!filePath) throw new Error(missingPathMessage);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temporaryPath, filePath);
  } catch (error: any) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError: any) {
      if (cleanupError?.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
}

export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isProcessAlive(pid: unknown): boolean {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error: any) {
    return error?.code === 'EPERM';
  }
}

export function inspectContendedLock(
  lockPath: string,
  ownerPath: string,
  staleMs: number,
): 'missing' | 'remove' | 'wait' {
  let ageMs: number;
  try {
    ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
  if (ageMs <= staleMs) return 'wait';
  let owner: Record<string, unknown> | null = null;
  try {
    owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  } catch (_error: any) {
    // A missing or malformed stale owner record cannot represent a live lock owner.
    void _error;
  }
  return isProcessAlive(owner?.pid) ? 'wait' : 'remove';
}

export function requireConfiguredNumber(obj: Record<string, any> | null | undefined, field: string, label: string): number {
  const value = obj?.[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}.${field}: required number in swarm.config.json`);
  }
  return value;
}
