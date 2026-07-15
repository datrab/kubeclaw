// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import os from 'os';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { log } from '../core/logger.ts';
import { appendDurableOperatorAlert } from '../services/telemetry.ts';
import { ensureProjectLogDir } from '../core/paths.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
  const code = (error as AnyRecord)?.code;
  if (code !== undefined && code !== null && String(code).trim()) return String(code);
  return errorMessage(error);
}

function pipelineRunLockPath(config: AnyRecord): string {
  return path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'active-run.lock.json');
}

export const PIPELINE_RUN_CONCURRENCY_LIMIT = 1;
const PIPELINE_RUN_LOCK_SCHEMA_VERSION = 1;
const INVALID_LOCK_JSON_REASON = 'invalid JSON';
const PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST = 'pipeline_run_lock_heartbeat_owner_lost';
const PIPELINE_RUN_LOCK_LOST_REASON_MISSING = 'missing_lock_loss_reason';

function nowMs(): number {
  return Date.now();
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

function requirePipelineRunLockNumber(config: AnyRecord, field: string): number {
  const value = config?.locks?.pipeline_run?.[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value <= 0))) {
    throw new Error(`config.locks.pipeline_run.${field}: required positive number in swarm.config.json`);
  }
  return value;
}

function pipelineRunLockLeaseMs(config: AnyRecord): number {
  return Math.max(2000, requirePipelineRunLockNumber(config, 'lease_ms'));
}

function pipelineRunLockHeartbeatMs(config: AnyRecord, leaseMs = pipelineRunLockLeaseMs(config)): number {
  const configured = requirePipelineRunLockNumber(config, 'heartbeat_ms');
  return Math.max(1000, Math.min(configured, Math.floor(leaseMs / 2)));
}

function pipelineRunLockMutationStaleMs(config: AnyRecord): number {
  return requirePipelineRunLockNumber(config, 'mutation_stale_ms');
}

function readPipelineRunLock(lockPath: string): AnyRecord | null {
  if (selectTruthyValue(() => (!lockPath), () => (!fs.existsSync(lockPath)))) return null;
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

function pipelineRunLockMutationOwner(config: AnyRecord): AnyRecord {
  const acquiredAtMs = nowMs();
  return {
    schema_version: PIPELINE_RUN_LOCK_SCHEMA_VERSION,
    token: `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pid: process.pid,
    hostname: os.hostname(),
    acquired_at: isoFromMs(acquiredAtMs),
    stale_at: isoFromMs(acquiredAtMs + pipelineRunLockMutationStaleMs(config)),
  };
}

function generatedPipelineRunLockToken(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function lockRecord(value: AnyRecord | null): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readPipelineRunLockMutationSnapshot(config: AnyRecord, mutationDir: string, atMs = nowMs()): AnyRecord {
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
      stale: atMs - stat.mtimeMs >= pipelineRunLockMutationStaleMs(config),
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

function reclaimStalePipelineRunLockMutation(config: AnyRecord, mutationDir: string): boolean {
  const before = readPipelineRunLockMutationSnapshot(config, mutationDir);
  if (!before.stale) return false;

  const reclaimDir = path.join(mutationDir, 'reclaiming');
  let claimed = false;
  try {
    fs.mkdirSync(reclaimDir);
    claimed = true;
    const after = readPipelineRunLockMutationSnapshot(config, mutationDir);
    if (!sameStaleMutationOwner(before, after)) return false;
    fs.rmSync(mutationDir, { recursive: true, force: true });
    claimed = false;
    return true;
  } catch (err) {
    if (selectTruthyValue(() => ((err as AnyRecord).code === 'ENOENT'), () => ((err as AnyRecord).code === 'EEXIST'))) return false;
    throw err;
  } finally {
    if (claimed) {
      try { fs.rmSync(reclaimDir, { recursive: true, force: true }); } catch (_err) { /* best effort */ }
    }
  }
}

function acquirePipelineRunLockMutation(config: AnyRecord, lockPath: string): string {
  const mutationDir = `${lockPath}.mutation`;
  while (true) {
    try {
      fs.mkdirSync(mutationDir);
      try {
        fs.writeFileSync(pipelineRunLockMutationOwnerPath(mutationDir), `${JSON.stringify(pipelineRunLockMutationOwner(config), null, 2)}\n`);
      } catch (err) {
        try { fs.rmSync(mutationDir, { recursive: true, force: true }); } catch (_cleanupErr) { /* best effort */ }
        throw err;
      }
      return mutationDir;
    } catch (err) {
      if ((err as AnyRecord).code !== 'EEXIST') throw err;
      if (!reclaimStalePipelineRunLockMutation(config, mutationDir)) throw err;
    }
  }
}

function withPipelineRunLockMutation<T>(config: AnyRecord, lockPath: string, fn: () => T): T {
  const mutationDir = acquirePipelineRunLockMutation(config, lockPath);
  try {
    return fn();
  } finally {
    try { fs.rmSync(mutationDir, { recursive: true, force: true }); } catch (_err) { /* best effort */ }
  }
}

function normalizeLockTime(value: unknown): number | null {
  const ms = Date.parse(selectTruthyValue(() => (typeof value === 'string'), () => (typeof value === 'number')) ? String(value) : '');
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
  if (selectTruthyValue(() => (expiresAt == null), () => (staleAt == null))) return false;
  return selectTruthyValue(() => (atMs >= expiresAt), () => (atMs >= staleAt));
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
      error: selectTruthyValue(() => (existing.error), () => (null)),
    } : {
      schema_version: selectDefinedValue(() => (existing?.schema_version), () => (null)),
      pid: selectDefinedValue(() => (existing?.pid), () => (null)),
      hostname: selectTruthyValue(() => (existing?.hostname), () => (null)),
      project: selectTruthyValue(() => (existing?.project), () => (null)),
      run_id: selectTruthyValue(() => (existing?.run_id), () => (null)),
      module: selectTruthyValue(() => (existing?.module), () => (null)),
      acquired_at: selectTruthyValue(() => (existing?.acquired_at), () => (null)),
      heartbeat_at: selectTruthyValue(() => (existing?.heartbeat_at), () => (null)),
      lease_expires_at: selectTruthyValue(() => (existing?.lease_expires_at), () => (null)),
      stale_at: selectTruthyValue(() => (existing?.stale_at), () => (null)),
      repo_root: selectTruthyValue(() => (existing?.repo_root), () => (null)),
    },
    error: selectTruthyValue(() => (errorMessage(error)), () => (null)),
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
    return `Pipeline runtime lock is malformed and cannot be safely reclaimed (${selectDefinedValue(() => (existing.error), () => (INVALID_LOCK_JSON_REASON))}). Manual cleanup required: verify no pipeline run is active for this swarm_dir, then remove active-run.lock.json and retry.`;
  }

  if (!hasPipelineRunLockLeaseContract(existing)) {
    return `Pipeline runtime lock does not match the required leased-lock contract. Manual cleanup required: verify no pipeline run is active for this swarm_dir, then remove active-run.lock.json and retry.`;
  }

  return `Another pipeline run is already active for this shared runtime/swarm`
    + `${existing?.project ? ` (project ${existing.project}` : ` (requested project ${selectTruthyValue(() => (requestedConfig.project), () => ('missing_project'))}`}`
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
    token: selectDefinedValue(() => (token), () => (generatedPipelineRunLockToken())),
    pid: process.pid,
    hostname: os.hostname(),
    project: config.project,
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (config._runId), () => (config.run_id))), () => (null)),
    module: selectTruthyValue(() => (opts.module), () => (null)),
    resume: opts.resume === true,
    acquired_at: isoFromMs(acquiredAtMs),
    heartbeat_at: isoFromMs(heartbeatAtMs),
    lease_expires_at: isoFromMs(leaseExpiresAtMs),
    stale_at: isoFromMs(leaseExpiresAtMs),
    lease_ms: leaseMs,
    heartbeat_ms: pipelineRunLockHeartbeatMs(config, leaseMs),
    repo_root: pipelineRunLockRepoRoot(config),
  };
}

function pipelineRunLockRepoRoot(config: AnyRecord): string {
  if (typeof config.repo_root === 'string' && config.repo_root.trim()) return config.repo_root;
  return process.cwd();
}

function releaseLockConfigAuthority(lock: AnyRecord): AnyRecord {
  if (lock.config && typeof lock.config === 'object' && !Array.isArray(lock.config)) return lock.config;
  throw new Error('releasePipelineRunLock requires lock.config from acquirePipelineRunLock');
}

function writePipelineRunLock(lockPath: string, owner: AnyRecord): void {
  const tempPath = `${lockPath}.${process.pid}.${owner.token}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(owner, null, 2)}\n`);
  fs.renameSync(tempPath, lockPath);
}

function replacePipelineRunLockIfOwner(config: AnyRecord, lockPath: string, owner: AnyRecord, token: string): AnyRecord {
  return withPipelineRunLockMutation(config, lockPath, () => {
    const current = readPipelineRunLock(lockPath);
    if (selectTruthyValue(() => (!hasPipelineRunLockLeaseContract(current)), () => (current?.token !== token))) {
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
    if (lost) throw new Error(`Pipeline runtime lock lost: ${selectDefinedValue(() => (lossReason), () => (PIPELINE_RUN_LOCK_LOST_REASON_MISSING))}`);
    if (lockLeaseExpired(currentOwner)) {
      appendDurableRunLockAlert(config, currentOwner, 'pipeline_run_lock_lease_expired_self');
      stop('pipeline_run_lock_lease_expired_self');
      throw new Error('Pipeline runtime lock lost: pipeline_run_lock_lease_expired_self');
    }
    const current = readPipelineRunLock(lockPath);
    if (selectTruthyValue(() => (!hasPipelineRunLockLeaseContract(current)), () => (current?.token !== currentOwner.token))) {
      appendDurableRunLockAlert(config, lockRecord(current), PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
      stop(PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
      throw new Error(`Pipeline runtime lock lost: ${PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST}`);
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
    if (selectTruthyValue(() => (!hasPipelineRunLockLeaseContract(current)), () => (current?.token !== currentOwner.token))) {
      appendDurableRunLockAlert(config, lockRecord(current), PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
      stop(PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
      return;
    }

    try {
      const nextOwner = refreshPipelineRunLockOwner(currentOwner, config);
      currentOwner = replacePipelineRunLockIfOwner(config, lockPath, nextOwner, currentOwner.token);
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
    _pipelineRunLockOnLost: selectTruthyValue(() => (selectTruthyValue(() => (opts.onPipelineRunLockLost), () => (config?._pipelineRunLockOnLost))), () => (null)),
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
        withPipelineRunLockMutation(config, lockPath, () => {
          const current = readPipelineRunLock(lockPath);
          if (selectTruthyValue(() => (isPipelineRunLockActive(current)), () => (!isPipelineRunLockReclaimable(current)))) {
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
    const config = releaseLockConfigAuthority(lock);
    if (current == null) return;
    if (!hasPipelineRunLockLeaseContract(current)) {
      appendDurableRunLockAlert(config, lockRecord(current), current?.malformed ? 'pipeline_run_lock_release_malformed' : 'pipeline_run_lock_release_invalid_contract');
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
