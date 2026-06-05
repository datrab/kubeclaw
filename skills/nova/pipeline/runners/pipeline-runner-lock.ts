// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import os from 'os';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { log } from '../core/logger.ts';
import { appendDurableOperatorAlert } from '../services/telemetry.ts';
import { ensureProjectLogDir } from '../core/paths.ts';

type AnyRecord = Record<string, any>;

declare const process: {
  pid: number;
  cwd(): string;
};

declare function setInterval(handler: () => void, timeout: number): any;
declare function clearInterval(timer: any): void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string {
  return String((error as AnyRecord)?.code || errorMessage(error));
}

function pipelineRunLockPath(config: AnyRecord): string {
  return path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'active-run.lock.json');
}

export const PIPELINE_RUN_CONCURRENCY_LIMIT = 1;
const PIPELINE_RUN_LOCK_SCHEMA_VERSION = 1;
const DEFAULT_PIPELINE_RUN_LOCK_LEASE_MS = 120000;
const DEFAULT_PIPELINE_RUN_LOCK_HEARTBEAT_MS = 30000;
const PIPELINE_RUN_LOCK_MUTATION_STALE_MS = 5000;

function nowMs(): number {
  return Date.now();
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

function positiveNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function pipelineRunLockLeaseMs(config: AnyRecord): number {
  return Math.max(2000, positiveNumber(config?.pipeline_run_lock_lease_ms, DEFAULT_PIPELINE_RUN_LOCK_LEASE_MS));
}

function pipelineRunLockHeartbeatMs(config: AnyRecord, leaseMs = pipelineRunLockLeaseMs(config)): number {
  const configured = positiveNumber(config?.pipeline_run_lock_heartbeat_ms, DEFAULT_PIPELINE_RUN_LOCK_HEARTBEAT_MS);
  return Math.max(1000, Math.min(configured, Math.floor(leaseMs / 2)));
}

function readPipelineRunLock(lockPath: string): AnyRecord | null {
  if (!lockPath || !fs.existsSync(lockPath)) return null;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    if (!raw.trim()) throw new Error('empty lock file');
    return JSON.parse(raw);
  } catch (err) {
    return {
      malformed: true,
      error: errorMessage(err),
    };
  }
}

function removeFileIfPresent(filePath: string): void {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (err) {
    if ((err as AnyRecord).code !== 'ENOENT') throw err;
  }
}

function pipelineRunLockReclaimRaceLost(): Error {
  const error = new Error('pipeline_run_lock_reclaim_race_lost');
  (error as AnyRecord).code = 'PIPELINE_RUN_LOCK_RECLAIM_RACE_LOST';
  return error;
}

function pipelineRunLockMutationOwnerPath(mutationDir: string): string {
  return path.join(mutationDir, 'owner.json');
}

function pipelineRunLockMutationOwner(): AnyRecord {
  const acquiredAtMs = nowMs();
  return {
    schema_version: PIPELINE_RUN_LOCK_SCHEMA_VERSION,
    token: `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pid: process.pid,
    hostname: os.hostname(),
    acquired_at: isoFromMs(acquiredAtMs),
    stale_at: isoFromMs(acquiredAtMs + PIPELINE_RUN_LOCK_MUTATION_STALE_MS),
  };
}

function readPipelineRunLockMutationSnapshot(mutationDir: string, atMs = nowMs()): AnyRecord {
  const ownerPath = pipelineRunLockMutationOwnerPath(mutationDir);
  try {
    const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    const staleAt = normalizeLockTime(owner?.stale_at);
    if (staleAt != null) {
      return {
        hasOwner: true,
        token: typeof owner?.token === 'string' ? owner.token : null,
        stale: atMs >= staleAt,
      };
    }
  } catch (_err) {
    // A crash between mkdir and owner write leaves only the directory. Fall
    // back to directory age so that broken mutation guards are still bounded.
  }

  try {
    const stat = fs.statSync(mutationDir);
    return {
      hasOwner: false,
      token: null,
      stale: atMs - stat.mtimeMs >= PIPELINE_RUN_LOCK_MUTATION_STALE_MS,
    };
  } catch (_err) {
    return { hasOwner: false, token: null, stale: true };
  }
}

function sameStaleMutationOwner(before: AnyRecord, after: AnyRecord): boolean {
  if (!before.stale) return false;
  if (before.hasOwner) return after.hasOwner === true && after.token === before.token;
  return after.hasOwner !== true;
}

function reclaimStalePipelineRunLockMutation(mutationDir: string): boolean {
  const before = readPipelineRunLockMutationSnapshot(mutationDir);
  if (!before.stale) return false;

  const reclaimDir = path.join(mutationDir, 'reclaiming');
  let claimed = false;
  try {
    fs.mkdirSync(reclaimDir);
    claimed = true;
    const after = readPipelineRunLockMutationSnapshot(mutationDir);
    if (!sameStaleMutationOwner(before, after)) return false;
    fs.rmSync(mutationDir, { recursive: true, force: true });
    claimed = false;
    return true;
  } catch (err) {
    if ((err as AnyRecord).code === 'ENOENT' || (err as AnyRecord).code === 'EEXIST') return false;
    throw err;
  } finally {
    if (claimed) {
      try { fs.rmSync(reclaimDir, { recursive: true, force: true }); } catch (_err) { /* best effort */ }
    }
  }
}

function acquirePipelineRunLockMutation(lockPath: string): string {
  const mutationDir = `${lockPath}.mutation`;
  while (true) {
    try {
      fs.mkdirSync(mutationDir);
      try {
        fs.writeFileSync(pipelineRunLockMutationOwnerPath(mutationDir), `${JSON.stringify(pipelineRunLockMutationOwner(), null, 2)}\n`);
      } catch (err) {
        try { fs.rmSync(mutationDir, { recursive: true, force: true }); } catch (_cleanupErr) { /* best effort */ }
        throw err;
      }
      return mutationDir;
    } catch (err) {
      if ((err as AnyRecord).code !== 'EEXIST') throw err;
      if (!reclaimStalePipelineRunLockMutation(mutationDir)) throw err;
    }
  }
}

function withPipelineRunLockMutation<T>(lockPath: string, fn: () => T): T {
  const mutationDir = acquirePipelineRunLockMutation(lockPath);
  try {
    return fn();
  } finally {
    try { fs.rmSync(mutationDir, { recursive: true, force: true }); } catch (_err) { /* best effort */ }
  }
}

function normalizeLockTime(value: unknown): number | null {
  const ms = Date.parse(typeof value === 'string' || typeof value === 'number' ? String(value) : '');
  return Number.isFinite(ms) ? ms : null;
}

function hasPipelineRunLockLeaseContract(lock: AnyRecord | null): boolean {
  return Boolean(lock
    && !lock.malformed
    && lock.schema_version === PIPELINE_RUN_LOCK_SCHEMA_VERSION
    && typeof lock.token === 'string'
    && lock.token.length > 0
    && Number.isInteger(Number(lock.pid))
    && Number(lock.pid) > 0
    && typeof lock.hostname === 'string'
    && lock.hostname.length > 0
    && normalizeLockTime(lock.acquired_at) != null
    && normalizeLockTime(lock.heartbeat_at) != null
    && normalizeLockTime(lock.lease_expires_at) != null
    && normalizeLockTime(lock.stale_at) != null);
}

function lockLeaseExpired(lock: AnyRecord | null, atMs = nowMs()): boolean {
  const expiresAt = normalizeLockTime(lock?.lease_expires_at);
  const staleAt = normalizeLockTime(lock?.stale_at);
  if (expiresAt == null || staleAt == null) return false;
  return atMs >= expiresAt || atMs >= staleAt;
}

function isPipelineRunLockReclaimable(lock: AnyRecord | null): boolean {
  if (!hasPipelineRunLockLeaseContract(lock)) return false;
  return lockLeaseExpired(lock);
}

function appendDurableRunLockAlert(config: AnyRecord, existing: AnyRecord | null = {}, reason = 'pipeline_run_lock_conflict', error: unknown = null): void {
  ensureProjectLogDir(config);
  appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
    reason,
    lock_path: pipelineRunLockPath(config),
    manual_cleanup: 'Verify no pipeline run is active for this swarm_dir, then remove the active-run.lock.json file and retry.',
    existing_lock: existing?.malformed ? {
      malformed: true,
      error: existing.error || null,
    } : {
      schema_version: existing?.schema_version ?? null,
      pid: existing?.pid ?? null,
      hostname: existing?.hostname || null,
      project: existing?.project || null,
      run_id: existing?.run_id || null,
      module: existing?.module || null,
      acquired_at: existing?.acquired_at || null,
      heartbeat_at: existing?.heartbeat_at || null,
      lease_expires_at: existing?.lease_expires_at || null,
      stale_at: existing?.stale_at || null,
      repo_root: existing?.repo_root || null,
    },
    error: errorMessage(error) || null,
  }, {
    severity: 'CRITICAL',
    source: 'pipeline_run_lock',
    emitter: 'nova/pipeline/runners/pipeline-runner-lock',
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: 'Pipeline run lock conflict',
        description: 'Pipeline startup was blocked by an active, malformed, or unreclaimable run lock.',
        fields: [
          { name: 'Lock Path', value: pipelineRunLockPath(config), inline: false },
          { name: 'Reason', value: reason, inline: true },
          { name: 'Manual Cleanup', value: 'Verify no pipeline run is active, remove active-run.lock.json, then retry.', inline: false },
          ...(existing?.pid ? [{ name: 'Existing PID', value: String(existing.pid), inline: true }] : []),
          ...(existing?.hostname ? [{ name: 'Existing Host', value: String(existing.hostname), inline: true }] : []),
        ],
      },
    },
  });
}

function describePipelineRunLock(existing: AnyRecord | null, requestedConfig: AnyRecord): string {
  if (existing?.malformed) {
    return `Pipeline runtime lock is malformed and cannot be safely reclaimed (${existing.error || 'invalid JSON'}). Manual cleanup required: verify no pipeline run is active for this swarm_dir, then remove active-run.lock.json and retry.`;
  }

  if (!hasPipelineRunLockLeaseContract(existing)) {
    return `Pipeline runtime lock does not match the required leased-lock contract. Manual cleanup required: verify no pipeline run is active for this swarm_dir, then remove active-run.lock.json and retry.`;
  }

  return `Another pipeline run is already active for this shared runtime/swarm`
    + `${existing?.project ? ` (project ${existing.project}` : ` (requested project ${requestedConfig.project || 'unknown'}`}`
    + `${existing?.run_id ? `, run ${existing.run_id}` : ''}`
    + `${existing?.module ? `, module ${existing.module}` : ''}`
    + `${existing?.pid ? `, pid ${existing.pid}` : ''}`
    + `${existing?.hostname ? `, host ${existing.hostname}` : ''}`
    + `${existing?.lease_expires_at ? `, lease_expires_at ${existing.lease_expires_at}` : ''}`
    + `). Concurrent pipeline runs are intentionally serialized per swarm_dir.`;
}

function isPipelineRunLockActive(lock: AnyRecord | null): boolean {
  if (!hasPipelineRunLockLeaseContract(lock)) return true;
  return !lockLeaseExpired(lock);
}

function buildPipelineRunLockOwner(config: AnyRecord, opts: AnyRecord = {}, token: string | null = null, acquiredAtMs = nowMs()): AnyRecord {
  const leaseMs = pipelineRunLockLeaseMs(config);
  const heartbeatAtMs = acquiredAtMs;
  const leaseExpiresAtMs = heartbeatAtMs + leaseMs;
  return {
    schema_version: PIPELINE_RUN_LOCK_SCHEMA_VERSION,
    token: token || `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pid: process.pid,
    hostname: os.hostname(),
    project: config.project,
    run_id: config._runId || config.run_id || null,
    module: opts.module || null,
    resume: opts.resume === true,
    acquired_at: isoFromMs(acquiredAtMs),
    heartbeat_at: isoFromMs(heartbeatAtMs),
    lease_expires_at: isoFromMs(leaseExpiresAtMs),
    stale_at: isoFromMs(leaseExpiresAtMs),
    lease_ms: leaseMs,
    heartbeat_ms: pipelineRunLockHeartbeatMs(config, leaseMs),
    repo_root: config.repo_root || process.cwd(),
  };
}

function writePipelineRunLock(lockPath: string, owner: AnyRecord): void {
  const tempPath = `${lockPath}.${process.pid}.${owner.token}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(owner, null, 2)}\n`);
  fs.renameSync(tempPath, lockPath);
}

function replacePipelineRunLockIfOwner(lockPath: string, owner: AnyRecord, token: string): AnyRecord {
  return withPipelineRunLockMutation(lockPath, () => {
    const current = readPipelineRunLock(lockPath);
    if (!hasPipelineRunLockLeaseContract(current) || current?.token !== token) {
      throw new Error('pipeline_run_lock_owner_lost');
    }
    if (lockLeaseExpired(current)) {
      throw new Error('pipeline_run_lock_lease_expired_self');
    }
    writePipelineRunLock(lockPath, owner);
    return owner;
  });
}

function refreshPipelineRunLockOwner(owner: AnyRecord, config: AnyRecord): AnyRecord {
  const heartbeatAtMs = nowMs();
  const leaseMs = pipelineRunLockLeaseMs(config);
  return {
    ...owner,
    pid: process.pid,
    hostname: os.hostname(),
    heartbeat_at: isoFromMs(heartbeatAtMs),
    lease_expires_at: isoFromMs(heartbeatAtMs + leaseMs),
    stale_at: isoFromMs(heartbeatAtMs + leaseMs),
    lease_ms: leaseMs,
    heartbeat_ms: pipelineRunLockHeartbeatMs(config, leaseMs),
  };
}

function startPipelineRunLockHeartbeat(config: AnyRecord, lockPath: string, owner: AnyRecord): AnyRecord {
  const heartbeatMs = pipelineRunLockHeartbeatMs(config, owner.lease_ms);
  const onLost = typeof config?._pipelineRunLockOnLost === 'function' ? config._pipelineRunLockOnLost : null;
  let stopped = false;
  let lost = false;
  let lossReason: string | null = null;
  let currentOwner = owner;
  let timer: any = null;

  const stop = (reason: string | null = null) => {
    if (reason) {
      const wasLost = lost;
      lost = true;
      lossReason = reason;
      if (!wasLost) {
        try { onLost?.(reason); } catch (_err) { /* best effort */ }
      }
    }
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const assertActive = () => {
    if (lost) throw new Error(`Pipeline runtime lock lost: ${lossReason || 'unknown'}`);
    if (lockLeaseExpired(currentOwner)) {
      appendDurableRunLockAlert(config, currentOwner, 'pipeline_run_lock_lease_expired_self');
      stop('pipeline_run_lock_lease_expired_self');
      throw new Error('Pipeline runtime lock lost: pipeline_run_lock_lease_expired_self');
    }
    const current = readPipelineRunLock(lockPath);
    if (!hasPipelineRunLockLeaseContract(current) || current?.token !== currentOwner.token) {
      appendDurableRunLockAlert(config, current || {}, 'pipeline_run_lock_heartbeat_owner_lost');
      stop('pipeline_run_lock_heartbeat_owner_lost');
      throw new Error('Pipeline runtime lock lost: pipeline_run_lock_heartbeat_owner_lost');
    }
  };

  const beat = () => {
    if (stopped) return;
    if (lockLeaseExpired(currentOwner)) {
      appendDurableRunLockAlert(config, currentOwner, 'pipeline_run_lock_lease_expired_self');
      stop('pipeline_run_lock_lease_expired_self');
      return;
    }

    const current = readPipelineRunLock(lockPath);
    if (!hasPipelineRunLockLeaseContract(current) || current?.token !== currentOwner.token) {
      appendDurableRunLockAlert(config, current || {}, 'pipeline_run_lock_heartbeat_owner_lost');
      stop('pipeline_run_lock_heartbeat_owner_lost');
      return;
    }

    try {
      const nextOwner = refreshPipelineRunLockOwner(currentOwner, config);
      currentOwner = replacePipelineRunLockIfOwner(lockPath, nextOwner, currentOwner.token);
    } catch (error) {
      appendDurableRunLockAlert(config, currentOwner, 'pipeline_run_lock_heartbeat_failed', error);
      stop('pipeline_run_lock_heartbeat_failed');
    }
  };

  timer = setInterval(beat, heartbeatMs) as any;
  if (timer && typeof timer.unref === 'function') timer.unref();
  return {
    stop,
    assertActive,
    get stopped() { return stopped; },
    get lost() { return lost; },
    get lossReason() { return lossReason; },
  };
}

export function acquirePipelineRunLock(config: AnyRecord, opts: AnyRecord = {}): AnyRecord {
  const lockPath = pipelineRunLockPath(config);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const owner = buildPipelineRunLockOwner(config, opts);
  const heartbeatConfig = {
    ...config,
    _pipelineRunLockOnLost: opts.onPipelineRunLockLost || config?._pipelineRunLockOnLost || null,
  };

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(owner, null, 2) + '\n');
      } finally {
        fs.closeSync(fd);
      }
      log('INFO', `Pipeline run lock acquired: ${lockPath}`);
      const heartbeat = startPipelineRunLockHeartbeat(heartbeatConfig, lockPath, owner);
      return { path: lockPath, token: owner.token, heartbeat, config };
    } catch (err) {
      if ((err as AnyRecord).code !== 'EEXIST') throw err;
      const existing = readPipelineRunLock(lockPath);
      if (isPipelineRunLockActive(existing)) {
        appendDurableRunLockAlert(config, existing, existing?.malformed ? 'pipeline_run_lock_malformed' : 'pipeline_run_lock_active_or_invalid_contract');
        throw new Error(describePipelineRunLock(existing, config));
      }
      if (!isPipelineRunLockReclaimable(existing)) {
        appendDurableRunLockAlert(config, existing, 'pipeline_run_lock_unreclaimable');
        throw new Error(describePipelineRunLock(existing, config));
      }
      appendDurableRunLockAlert(config, existing, 'pipeline_run_lock_stale_reclaimed');
      try {
        withPipelineRunLockMutation(lockPath, () => {
          const current = readPipelineRunLock(lockPath);
          if (isPipelineRunLockActive(current) || !isPipelineRunLockReclaimable(current)) {
            throw pipelineRunLockReclaimRaceLost();
          }
          fs.unlinkSync(lockPath);
        });
      } catch (unlinkErr) {
        if (errorCode(unlinkErr) === 'PIPELINE_RUN_LOCK_RECLAIM_RACE_LOST') continue;
        if ((unlinkErr as AnyRecord).code === 'EEXIST') continue;
        if ((unlinkErr as AnyRecord).code !== 'ENOENT') {
          appendDurableRunLockAlert(config, existing, 'pipeline_run_lock_reclaim_failed', unlinkErr);
          throw unlinkErr;
        }
      }
    }
  }
}

export function releasePipelineRunLock(lock: AnyRecord): void {
  if (!lock?.path) return;
  if (lock.heartbeat && typeof lock.heartbeat.stop === 'function') lock.heartbeat.stop();
  try {
    const current = readPipelineRunLock(lock.path);
    const config = lock.config || { paths: { swarm_dir: path.dirname(path.dirname(path.dirname(lock.path))) } };
    if (current == null) return;
    if (!hasPipelineRunLockLeaseContract(current)) {
      appendDurableRunLockAlert(config, current || {}, current?.malformed ? 'pipeline_run_lock_release_malformed' : 'pipeline_run_lock_release_invalid_contract');
      throw new Error(`Pipeline runtime lock cannot be released because it is malformed or violates the leased-lock contract. Manual cleanup required: verify no pipeline run is active, then remove active-run.lock.json and retry.`);
    }
    if (current.token !== lock.token) {
      appendDurableRunLockAlert(config, current, 'pipeline_run_lock_release_token_mismatch');
      if (lock.heartbeat?.lost === true) return;
      throw new Error(`Pipeline runtime lock release refused: token mismatch. Manual cleanup required only after verifying no pipeline run is active.`);
    }
    fs.unlinkSync(lock.path);
    log('INFO', `Pipeline run lock released: ${lock.path}`);
  } catch (err) {
    if ((err as AnyRecord).code !== 'ENOENT') throw err;
  }
}
