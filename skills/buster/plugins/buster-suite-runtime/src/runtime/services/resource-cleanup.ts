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
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as CleanupState;
  return { leases: Array.isArray(parsed.leases) ? parsed.leases.filter((value) => typeof value === 'string') : [] };
}

export function trackRuntimeResources(payload: Payload = {}, resources: { leases?: string[] } = {}, options: { stateRoot?: string } = {}): { statePath: string; state: CleanupState } {
  const statePath = getCleanupStatePath(payload, options);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const state = readState(statePath);
  state.leases = [...new Set([...state.leases, ...(resources.leases ?? [])])];
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tempPath, statePath);
  return { statePath, state };
}

async function deleteLease(lease: string): Promise<void> {
  await execFileAsync('kubectl', ['delete', 'busternamespacelease', lease, '-n', readBusterEnvironment('KUBECLAW_NAMESPACE') ?? 'kubeclaw', '--ignore-not-found=true', '--wait=true'], {
    timeout: 180000,
    encoding: 'utf8',
    env: buildSubprocessEnv(),
  });
}
