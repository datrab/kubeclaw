import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FileMutex } from '../../skills/nova/core/state/file-mutex.ts';

export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function optionalJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (cause) {
    if (cause.code === 'ENOENT') return undefined;
    throw new Error(`REVIEW_SUPERVISOR_JSON_READ_FAILED:${file}`, { cause });
  }
}

export function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

export function acquireLease(file, runId) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return leaseMutex(file).withLock(() => replaceLease(file, runId));
}

// Keep this inode permanently: unlinking it would permit two independent locks.
function leaseMutex(file) {
  return new FileMutex(`${file}.lock`, 1000, 'REVIEW_SUPERVISOR_LEASE_BUSY');
}

function replaceLease(file, runId) {
  const existing = optionalJson(file);
  if (existing !== undefined && (existing?.schemaVersion !== 'repository-review-supervisor-lease.v1'
    || typeof existing.instanceId !== 'string' || !existing.instanceId
    || typeof existing.runId !== 'string' || !existing.runId
    || !Number.isSafeInteger(existing.supervisorPid) || existing.supervisorPid < 1)) {
    throw new Error(`REVIEW_SUPERVISOR_LEASE_INVALID:${file}`);
  }
  if (existing && processAlive(existing.supervisorPid)) {
    throw new Error(`REVIEW_SUPERVISOR_ALREADY_ACTIVE:${existing.supervisorPid}`);
  }
  const instanceId = crypto.randomUUID();
  atomicJson(file, { schemaVersion: 'repository-review-supervisor-lease.v1',
    instanceId, runId, supervisorPid: process.pid, acquiredAt: new Date().toISOString() });
  return { file, instanceId };
}

export function releaseLease(lease) {
  leaseMutex(lease.file).withLock(() => {
    const current = optionalJson(lease.file);
    if (current?.instanceId === lease.instanceId) fs.unlinkSync(lease.file);
  });
}
