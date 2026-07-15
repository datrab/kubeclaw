import fs from 'fs';
import path from 'path';

import { ensurePipelineRunLogDir } from '../../core/paths.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
export function ensureRunLogDir(config) {
  const runLogDir = config?._lifecycleReadOnly === true
    ? (selectTruthyValue(() => (config?._lifecycleReadOnlyRunLogDir), () => (null)))
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

function requireNumber(obj, field, label) {
  const value = obj?.[field];
  if (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))) {
    throw new Error(`${label}.${field}: required number in swarm.config.json`);
  }
  return value;
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function removeOwnedLock(lockPath, ownerToken) {
  const owner = readLockOwner(lockPath);
  if (owner?.token === ownerToken) {
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

export function withLifecycleAppendLock(config, fn) {
  const lockPath = lifecycleAppendLockPath(config);
  if (!lockPath) return fn();
  const lockConfig = config?.locks?.lifecycle_append;
  const staleMs = requireNumber(lockConfig, 'stale_ms', 'config.locks.lifecycle_append');
  const timeoutMs = requireNumber(lockConfig, 'timeout_ms', 'config.locks.lifecycle_append');

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const ownerToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();
  const ownerJson = JSON.stringify({
    pid: process.pid,
    token: ownerToken,
    acquired_at: new Date().toISOString(),
  }) + '\n';
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        fs.writeFileSync(fd, ownerJson);
      } finally {
        fs.closeSync(fd);
      }
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
        const owner = readLockOwner(lockPath);
        if (!isProcessAlive(owner?.pid)) {
          fs.rmSync(lockPath, { force: true });
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
    removeOwnedLock(lockPath, ownerToken);
  }
}
