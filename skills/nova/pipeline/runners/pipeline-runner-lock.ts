import fs from 'fs';
import os from 'os';
import path from 'path';

import { log } from '../core/logger.ts';
import { appendDurableOperatorAlert } from '../services/telemetry.ts';
import { ensureProjectLogDir } from '../core/paths.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { errorMessage, errorCode, pipelineRunLockPath, nowMs, isoFromMs, requirePipelineRunLockNumber, pipelineRunLockLeaseMs, pipelineRunLockHeartbeatMs, pipelineRunLockMutationStaleMs, readPipelineRunLock, removeFileIfPresent, removeDirectoryBestEffort, pipelineRunLockReclaimRaceLost, pipelineRunLockMutationOwnerPath, pipelineRunLockMutationOwner, generatedPipelineRunLockToken, lockRecord, readPipelineRunLockMutationSnapshot, sameStaleMutationOwner, reclaimStalePipelineRunLockMutation, acquirePipelineRunLockMutation, withPipelineRunLockMutation, normalizeLockTime } from './pipeline-runner-lock-storage.ts';
import {
  PIPELINE_RUN_CONCURRENCY_LIMIT, PIPELINE_RUN_LOCK_SCHEMA_VERSION,
  INVALID_LOCK_JSON_REASON, PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST,
  PIPELINE_RUN_LOCK_LOST_REASON_MISSING,
} from './pipeline-runner-lock-storage.ts';
export { PIPELINE_RUN_CONCURRENCY_LIMIT } from './pipeline-runner-lock-storage.ts';
import { describePipelineRunLock } from './pipeline-runner-lock-description.ts';
type AnyRecord = Record<string, any>;

declare const process: {
  pid: number;
  cwd(): string;
};

declare function setInterval(handler: () => void, timeout: number): any;
declare function clearInterval(timer: any): void;

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

function lockLeaseExpired(lock: AnyRecord | null, atMs: any = nowMs()): boolean {
  const expiresAt = normalizeLockTime(lock?.lease_expires_at);
  const staleAt = normalizeLockTime(lock?.stale_at);
  if (expiresAt == null || staleAt == null) return false;
  return selectTruthyValue(() => (atMs >= expiresAt), () => (atMs >= staleAt));
}

function isPipelineRunLockReclaimable(lock: AnyRecord | null): boolean {
  if (!hasPipelineRunLockLeaseContract(lock)) return false;
  return lockLeaseExpired(lock);
}

function appendDurableRunLockAlert(config: AnyRecord, existing: AnyRecord | null = {}, reason: any = 'pipeline_run_lock_conflict', error: unknown = null): void {
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

function isPipelineRunLockActive(lock: AnyRecord | null): boolean {
  if (!hasPipelineRunLockLeaseContract(lock)) return true;
  return !lockLeaseExpired(lock);
}

function buildPipelineRunLockOwner(config: AnyRecord, opts: AnyRecord = {}, token: string | null = null, acquiredAtMs: any = nowMs()): AnyRecord {
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

function stopLockHeartbeat(state: AnyRecord, reason: string | null = null): void {
  if (reason) {
    const wasLost = state.lost;
    state.lost = true;
    state.lossReason = reason;
    if (!wasLost) {
      try { state.onLost?.(reason); } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): lock loss remains authoritative. */ }
    }
  }
  state.stopped = true;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function lockOwnerMatches(current: AnyRecord | null, owner: AnyRecord): boolean {
  return hasPipelineRunLockLeaseContract(current) && current?.token === owner.token;
}

function assertLockHeartbeatActive(config: AnyRecord, lockPath: string, state: AnyRecord): void {
  if (state.lost) throw new Error(`Pipeline runtime lock lost: ${state.lossReason ?? PIPELINE_RUN_LOCK_LOST_REASON_MISSING}`);
  if (lockLeaseExpired(state.currentOwner)) {
    appendDurableRunLockAlert(config, state.currentOwner, 'pipeline_run_lock_lease_expired_self');
    stopLockHeartbeat(state, 'pipeline_run_lock_lease_expired_self');
    throw new Error('Pipeline runtime lock lost: pipeline_run_lock_lease_expired_self');
  }
  const current = readPipelineRunLock(lockPath);
  if (lockOwnerMatches(current, state.currentOwner)) return;
  appendDurableRunLockAlert(config, lockRecord(current), PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
  stopLockHeartbeat(state, PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
  throw new Error(`Pipeline runtime lock lost: ${PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST}`);
}

function beatPipelineRunLock(config: AnyRecord, lockPath: string, state: AnyRecord): void {
  if (state.stopped) return;
  if (lockLeaseExpired(state.currentOwner)) {
    appendDurableRunLockAlert(config, state.currentOwner, 'pipeline_run_lock_lease_expired_self');
    stopLockHeartbeat(state, 'pipeline_run_lock_lease_expired_self');
    return;
  }
  const current = readPipelineRunLock(lockPath);
  if (!lockOwnerMatches(current, state.currentOwner)) {
    appendDurableRunLockAlert(config, lockRecord(current), PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
    stopLockHeartbeat(state, PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST);
    return;
  }
  try {
    const nextOwner = refreshPipelineRunLockOwner(state.currentOwner, config);
    state.currentOwner = replacePipelineRunLockIfOwner(config, lockPath, nextOwner, state.currentOwner.token);
  } catch (error: any) {
    appendDurableRunLockAlert(config, state.currentOwner, 'pipeline_run_lock_heartbeat_failed', error);
    stopLockHeartbeat(state, 'pipeline_run_lock_heartbeat_failed');
  }
}

function startPipelineRunLockHeartbeat(config: AnyRecord, lockPath: string, owner: AnyRecord): AnyRecord {
  const heartbeatMs = pipelineRunLockHeartbeatMs(config, owner.lease_ms);
  const state: AnyRecord = {
    stopped: false, lost: false, lossReason: null, currentOwner: owner, timer: null,
    onLost: typeof config?._pipelineRunLockOnLost === 'function' ? config._pipelineRunLockOnLost : null,
  };
  state.timer = setInterval(() => beatPipelineRunLock(config, lockPath, state), heartbeatMs) as any;
  if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
  return {
    stop: (reason: string | null = null) => stopLockHeartbeat(state, reason),
    assertActive: () => assertLockHeartbeatActive(config, lockPath, state),
    get stopped() { return state.stopped; },
    get lost() { return state.lost; },
    get lossReason() { return state.lossReason; },
  };
}

function reclaimPipelineRunLock(config: AnyRecord, lockPath: string, existing: AnyRecord | null): boolean {
  appendDurableRunLockAlert(config, existing, 'pipeline_run_lock_stale_reclaimed');
  try {
    withPipelineRunLockMutation(config, lockPath, () => {
      const current = readPipelineRunLock(lockPath);
      if (isPipelineRunLockActive(current) || !isPipelineRunLockReclaimable(current)) throw pipelineRunLockReclaimRaceLost();
      fs.unlinkSync(lockPath);
    });
    return true;
  } catch (error: any) {
    if (errorCode(error) === 'PIPELINE_RUN_LOCK_RECLAIM_RACE_LOST' || error.code === 'EEXIST' || error.code === 'ENOENT') return false;
    appendDurableRunLockAlert(config, existing, 'pipeline_run_lock_reclaim_failed', error);
    throw error;
  }
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
    } catch (err: any) {
      if ((err as AnyRecord).code !== 'EEXIST') throw err;
      const existing = readPipelineRunLock(lockPath);
      if (isPipelineRunLockActive(existing)) {
        appendDurableRunLockAlert(config, existing, existing?.malformed ? 'pipeline_run_lock_malformed' : 'pipeline_run_lock_active_or_invalid_contract');
        throw new Error(describePipelineRunLock(existing, config, hasPipelineRunLockLeaseContract(existing)));
      }
      if (!isPipelineRunLockReclaimable(existing)) {
        appendDurableRunLockAlert(config, existing, 'pipeline_run_lock_unreclaimable');
        throw new Error(describePipelineRunLock(existing, config, hasPipelineRunLockLeaseContract(existing)));
      }
      reclaimPipelineRunLock(config, lockPath, existing);
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
  } catch (err: any) {
    if ((err as AnyRecord).code !== 'ENOENT') throw err;
  }
}
