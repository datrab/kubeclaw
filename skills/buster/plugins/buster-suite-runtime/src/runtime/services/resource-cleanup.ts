// Buster cleanup authority: only namespace leases are runtime resources.
// Deleting a lease delegates namespace deletion to the trusted controller.
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { buildSubprocessEnv } from '../security.ts';
import { readBusterEnvironment } from '../buster-environment.ts';

type Payload = Record<string, any>;
type CleanupState = { leases: string[] };

const execFileAsync = promisify(execFile) as any;
const CLEANUP_SCOPE_LABEL = 'kubeclaw.io/cleanup-scope';

function runtimeStateRoot(): string {
  const repoRoot = String(readBusterEnvironment('REPO_ROOT') ?? '').trim();
  if (!repoRoot) throw new Error('REPO_ROOT is required for Buster runtime cleanup state');
  return path.join(repoRoot, '.swarm', 'resource-cleanup');
}

function token(value: unknown): string {
  return String(value ?? 'none').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80);
}

function cleanupWorkId(payload: Payload): unknown {
  if (payload.module_id !== undefined && payload.module_id !== null) return payload.module_id;
  if (payload.gate_id !== undefined && payload.gate_id !== null) return payload.gate_id;
  if (payload.task_id !== undefined && payload.task_id !== null) return payload.task_id;
  return null;
}

function scopeKey(payload: Payload): string {
  return [payload.project, cleanupWorkId(payload), payload.attempt, payload.run_id].map(token).join('--');
}

function buildCleanupScopeLabel(payload: Payload = {}): string {
  return `oc-${createHash('sha256').update(scopeKey(payload)).digest('hex').slice(0, 20)}`;
}

export function buildCleanupKubernetesLabels(payload: Payload = {}): Record<string, string> {
  return payload.run_id ? { [CLEANUP_SCOPE_LABEL]: buildCleanupScopeLabel(payload) } : {};
}

export function getCleanupStatePath(payload: Payload = {}, options: { stateRoot?: string } = {}): string {
  return path.join(options.stateRoot ?? runtimeStateRoot(), `${scopeKey(payload)}.json`);
}

function readState(statePath: string): CleanupState {
  if (!fs.existsSync(statePath)) return { leases: [] };
  const source = fs.readFileSync(statePath, 'utf8');
  try {
    const legacy = JSON.parse(source) as CleanupState;
    if (Array.isArray(legacy.leases)) return { leases: legacy.leases.filter((value) => typeof value === 'string') };
  } catch { /* Append-only v1 records are parsed below. */ }
  const leases = source.split('\n').filter(Boolean).flatMap((line) => {
    const record = JSON.parse(line) as { lease?: unknown; leases?: unknown };
    if (typeof record.lease === 'string') return [record.lease];
    if (Array.isArray(record.leases)) return record.leases.filter((lease): lease is string => typeof lease === 'string');
    return [];
  });
  return { leases: [...new Set(leases)] };
}

export function trackRuntimeResources(payload: Payload = {}, resources: { leases?: string[] } = {}, options: { stateRoot?: string } = {}): { statePath: string; state: CleanupState } {
  const statePath = getCleanupStatePath(payload, options);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const separator = fs.existsSync(statePath) && fs.statSync(statePath).size > 0
    && !fs.readFileSync(statePath, 'utf8').endsWith('\n') ? '\n' : '';
  let firstRecord = true;
  for (const lease of [...new Set(resources.leases ?? [])]) {
    if (typeof lease !== 'string' || lease.length < 1 || lease.length > 253) throw new Error('BUSTER_RESOURCE_LEASE_INVALID');
    fs.appendFileSync(statePath, `${firstRecord ? separator : ''}${JSON.stringify({ schemaVersion: 'resource-cleanup-entry.v1', lease })}\n`, { mode: 0o600 });
    firstRecord = false;
  }
  return { statePath, state: readState(statePath) };
}

async function deleteLease(lease: string): Promise<void> {
  await execFileAsync('kubectl', ['delete', 'busternamespacelease', lease, '-n', readBusterEnvironment('KUBECLAW_NAMESPACE') ?? 'kubeclaw', '--ignore-not-found=true', '--wait=true'], {
    timeout: 180000,
    encoding: 'utf8',
    env: buildSubprocessEnv(),
  });
}
