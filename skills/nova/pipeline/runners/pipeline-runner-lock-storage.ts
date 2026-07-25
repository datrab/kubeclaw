import fs from 'fs';
import os from 'os';
import path from 'path';
import { selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
declare const process: { pid: number; cwd(): string };
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorCode(error: unknown): string {
  const code = (error as AnyRecord)?.code;
  if (code !== undefined && code !== null && String(code).trim()) return String(code);
  return errorMessage(error);
}

export function pipelineRunLockPath(config: AnyRecord): string {
  return path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'active-run.lock.json');
}

export const PIPELINE_RUN_CONCURRENCY_LIMIT = 1;
export const PIPELINE_RUN_LOCK_SCHEMA_VERSION = 1;
export const INVALID_LOCK_JSON_REASON = 'invalid JSON';
export const PIPELINE_RUN_LOCK_HEARTBEAT_OWNER_LOST = 'pipeline_run_lock_heartbeat_owner_lost';
export const PIPELINE_RUN_LOCK_LOST_REASON_MISSING = 'missing_lock_loss_reason';

export function nowMs(): number {
  return Date.now();
}

export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function requirePipelineRunLockNumber(config: AnyRecord, field: string): number {
  const value = config?.locks?.pipeline_run?.[field];
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value <= 0))) {
    throw new Error(`config.locks.pipeline_run.${field}: required positive number in swarm.config.json`);
  }
  return value;
}

export function pipelineRunLockLeaseMs(config: AnyRecord): number {
  return Math.max(2000, requirePipelineRunLockNumber(config, 'lease_ms'));
}

export function pipelineRunLockHeartbeatMs(config: AnyRecord, leaseMs: any = pipelineRunLockLeaseMs(config)): number {
  const configured = requirePipelineRunLockNumber(config, 'heartbeat_ms');
  return Math.max(1000, Math.min(configured, Math.floor(leaseMs / 2)));
}

export function pipelineRunLockMutationStaleMs(config: AnyRecord): number {
  return requirePipelineRunLockNumber(config, 'mutation_stale_ms');
}

export function readPipelineRunLock(lockPath: string): AnyRecord | null {
  if (selectTruthyValue(() => (!lockPath), () => (!fs.existsSync(lockPath)))) return null;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    if (!raw.trim()) throw new Error('empty lock file');
    return JSON.parse(raw);
  } catch (err: any) {
    return {
      malformed: true,
      error: errorMessage(err),
    };
  }
}

export function removeFileIfPresent(filePath: string): void {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (err: any) {
    if ((err as AnyRecord).code !== 'ENOENT') throw err;
  }
}

export function removeDirectoryBestEffort(directory: string): void {
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): a primary lock failure remains authoritative. */ }
}

export function pipelineRunLockReclaimRaceLost(): Error {
  const error = new Error('pipeline_run_lock_reclaim_race_lost');
  (error as AnyRecord).code = 'PIPELINE_RUN_LOCK_RECLAIM_RACE_LOST';
  return error;
}

export function pipelineRunLockMutationOwnerPath(mutationDir: string): string {
  return path.join(mutationDir, 'owner.json');
}

export function pipelineRunLockMutationOwner(config: AnyRecord): AnyRecord {
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

export function generatedPipelineRunLockToken(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function lockRecord(value: AnyRecord | null): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function readPipelineRunLockMutationSnapshot(config: AnyRecord, mutationDir: string, atMs: any = nowMs()): AnyRecord {
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
  } catch (_err: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */
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
  } catch (_err: any) {
    return { hasOwner: false, token: null, stale: true };
  }
}

export function sameStaleMutationOwner(before: AnyRecord, after: AnyRecord): boolean {
  if (!before.stale) return false;
  if (before.hasOwner) return after.hasOwner === true && after.token === before.token;
  return after.hasOwner !== true;
}

export function reclaimStalePipelineRunLockMutation(config: AnyRecord, mutationDir: string): boolean {
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
  } catch (err: any) {
    if (selectTruthyValue(() => ((err as AnyRecord).code === 'ENOENT'), () => ((err as AnyRecord).code === 'EEXIST'))) return false;
    throw err;
  } finally {
    if (claimed) {
      try { fs.rmSync(reclaimDir, { recursive: true, force: true }); } catch (_err: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */ /* best effort */ }
    }
  }
}

export function acquirePipelineRunLockMutation(config: AnyRecord, lockPath: string): string {
  const mutationDir = `${lockPath}.mutation`;
  while (true) {
    try {
      fs.mkdirSync(mutationDir);
      try {
        fs.writeFileSync(pipelineRunLockMutationOwnerPath(mutationDir), `${JSON.stringify(pipelineRunLockMutationOwner(config), null, 2)}\n`);
      } catch (err: any) {
        removeDirectoryBestEffort(mutationDir);
        throw err;
      }
      return mutationDir;
    } catch (err: any) {
      if ((err as AnyRecord).code !== 'EEXIST') throw err;
      if (!reclaimStalePipelineRunLockMutation(config, mutationDir)) throw err;
    }
  }
}

export function withPipelineRunLockMutation<T>(config: AnyRecord, lockPath: string, fn: () => T): T {
  const mutationDir = acquirePipelineRunLockMutation(config, lockPath);
  try {
    return fn();
  } finally {
    try { fs.rmSync(mutationDir, { recursive: true, force: true }); } catch (_err: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */ /* best effort */ }
  }
}

export function normalizeLockTime(value: unknown): number | null {
  const ms = Date.parse(selectTruthyValue(() => (typeof value === 'string'), () => (typeof value === 'number')) ? String(value) : '');
  return Number.isFinite(ms) ? ms : null;
}
