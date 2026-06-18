import fs from 'fs';
import path from 'path';

import { ensurePipelineRunLogDir } from '../../core/paths.ts';

export function ensureRunLogDir(config) {
  const runLogDir = config?._lifecycleReadOnly === true
    ? (config?._lifecycleReadOnlyRunLogDir || null)
    : ensurePipelineRunLogDir(config);
  if (!runLogDir) {
    if (config?._lifecycleReadOnly === true) return null;
    throw new Error('lifecycle storage requires an initialized pipeline run log directory');
  }
  return runLogDir;
}

export function lifecycleDir(config) {
  const runLogDir = ensureRunLogDir(config);
  if (!runLogDir) return null;
  const dir = path.join(runLogDir, 'lifecycle');
  if (config?._lifecycleReadOnly !== true) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function lifecycleEventsPath(config) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, 'canonical-events.jsonl') : null;
}

export function lifecycleReadModelsPath(config) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, 'read-models.json') : null;
}

export function lifecycleAppendLockPath(config) {
  const dir = lifecycleDir(config);
  return dir ? path.join(dir, 'append.lock') : null;
}

export function readJsonIfPresent(filePath, fallback = null) {
  if (!filePath) throw new Error('lifecycle read requires an initialized file path');
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJsonAtomic(filePath, value) {
  if (!filePath) throw new Error('lifecycle write requires an initialized file path');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

export function appendJsonLine(filePath, value) {
  if (!filePath) throw new Error('lifecycle append requires an initialized file path');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(value) + '\n');
}

export function readJsonLines(filePath) {
  if (!filePath) throw new Error('lifecycle read requires an initialized file path');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function withLifecycleAppendLock(config, fn, { staleMs = 300000, timeoutMs = 30000 } = {}) {
  const lockPath = lifecycleAppendLockPath(config);
  if (!lockPath) return fn();

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const ownerToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({
        pid: process.pid,
        token: ownerToken,
        acquired_at: new Date().toISOString(),
      }) + '\n');
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let ageMs = 0;
      try {
        ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
      } catch (statError) {
        if (statError?.code === 'ENOENT') continue;
        throw statError;
      }
      if (ageMs > staleMs) {
        let owner = null;
        try {
          owner = JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
        } catch {
          owner = null;
        }
        if (!isProcessAlive(owner?.pid)) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`timed out waiting for lifecycle append lock: ${lockPath}`);
      }
      sleepSync(25);
    }
  }

  try {
    return fn();
  } finally {
    try {
      const owner = JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
      if (owner?.token === ownerToken) {
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
    } catch {}
  }
}
