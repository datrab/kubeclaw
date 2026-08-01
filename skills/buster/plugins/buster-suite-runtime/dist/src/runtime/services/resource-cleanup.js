// Buster cleanup authority: only namespace leases are runtime resources.
// Deleting a lease delegates namespace deletion to the trusted controller.
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { buildSubprocessEnv } from '../security.js';
import { readBusterEnvironment } from '../buster-environment.js';
const execFileAsync = promisify(execFile);
const CLEANUP_SCOPE_LABEL = 'kubeclaw.io/cleanup-scope';
function runtimeStateRoot() {
    const repoRoot = String(readBusterEnvironment('REPO_ROOT') ?? '').trim();
    if (!repoRoot)
        throw new Error('REPO_ROOT is required for Buster runtime cleanup state');
    return path.join(repoRoot, '.swarm', 'resource-cleanup');
}
export const CLEANUP_POLICY = Object.freeze({ TASK_SCOPED: 'task-scoped', STARTUP_SWEEP: 'startup-sweep', SHUTDOWN_SWEEP: 'shutdown-sweep', DISABLED: 'disabled' });
function token(value) {
    return String(value ?? 'none').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80);
}
function cleanupWorkId(payload) {
    if (payload.module_id !== undefined && payload.module_id !== null)
        return payload.module_id;
    if (payload.gate_id !== undefined && payload.gate_id !== null)
        return payload.gate_id;
    if (payload.task_id !== undefined && payload.task_id !== null)
        return payload.task_id;
    return null;
}
function scopeKey(payload) {
    return [payload.project, cleanupWorkId(payload), payload.attempt, payload.run_id].map(token).join('--');
}
function buildCleanupScopeLabel(payload = {}) {
    return `oc-${createHash('sha256').update(scopeKey(payload)).digest('hex').slice(0, 20)}`;
}
export function buildCleanupKubernetesLabels(payload = {}) {
    return payload.run_id ? { [CLEANUP_SCOPE_LABEL]: buildCleanupScopeLabel(payload) } : {};
}
export function getCleanupStatePath(payload = {}, options = {}) {
    return path.join(options.stateRoot ?? runtimeStateRoot(), `${scopeKey(payload)}.json`);
}
function readState(statePath) {
    if (!fs.existsSync(statePath))
        return { leases: [] };
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return { leases: Array.isArray(parsed.leases) ? parsed.leases.filter((value) => typeof value === 'string') : [] };
}
export function trackRuntimeResources(payload = {}, resources = {}, options = {}) {
    const statePath = getCleanupStatePath(payload, options);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const state = readState(statePath);
    state.leases = [...new Set([...state.leases, ...(resources.leases ?? [])])];
    const tempPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tempPath, statePath);
    return { statePath, state };
}
async function deleteLease(lease) {
    await execFileAsync('kubectl', ['delete', 'busternamespacelease', lease, '-n', readBusterEnvironment('KUBECLAW_NAMESPACE') ?? 'kubeclaw', '--ignore-not-found=true', '--wait=true'], {
        timeout: 180000,
        encoding: 'utf8',
        env: buildSubprocessEnv(),
    });
}
export async function cleanupRuntimeResources(_stage, payload = null, options = {}) {
    if (options.cleanupPolicy === CLEANUP_POLICY.DISABLED)
        return { ok: true, leases_deleted: [] };
    const root = options.stateRoot ?? runtimeStateRoot();
    const statePaths = payload
        ? [getCleanupStatePath(payload, options)]
        : (fs.existsSync(root) ? fs.readdirSync(root).filter((name) => name.endsWith('.json')).map((name) => path.join(root, name)) : []);
    const deleted = [];
    const errors = [];
    for (const statePath of statePaths) {
        let state;
        try {
            state = readState(statePath);
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            continue;
        }
        for (const lease of state.leases) {
            try {
                await deleteLease(lease);
                deleted.push(lease);
            }
            catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }
        if (errors.length === 0)
            fs.rmSync(statePath, { force: true });
    }
    return { ok: errors.length === 0, leases_deleted: deleted, errors };
}
