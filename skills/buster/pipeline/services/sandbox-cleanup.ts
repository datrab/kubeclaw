// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { createHash } from 'crypto';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { buildSubprocessEnv } from '../security.ts';

declare const process: {
  pid: number;
};

interface CleanupPayload {
  project?: unknown;
  module_id?: unknown;
  gate_id?: unknown;
  task_type?: unknown;
  attempt?: unknown;
  run_id?: unknown;
  dispatch_id?: unknown;
  [key: string]: unknown;
}

interface CleanupState {
  containers: string[];
  images: string[];
  namespaces: string[];
}

interface CleanupOptions {
  sandboxRoot?: string;
  execFileAsync?: ExecFileAsync;
  cleanupPolicy?: CleanupPolicyInput;
}

type CleanupPolicyName = 'task_scoped' | 'startup_sweep' | 'shutdown_sweep' | 'disabled';
type TrackedResourceScope = 'none' | 'scoped' | 'all';

type CleanupPolicyInput = CleanupPolicyName | {
  name?: CleanupPolicyName;
  trackedResources?: TrackedResourceScope;
  sandboxOutputs?: boolean;
  processCleanup?: boolean;
};

interface CleanupPolicyProfile {
  name: CleanupPolicyName;
  trackedResources: TrackedResourceScope;
  sandboxOutputs: boolean;
  processCleanup: boolean;
}

interface PublicCleanupPolicy {
  name: CleanupPolicyName;
  tracked_resources: TrackedResourceScope;
  sandbox_outputs: boolean;
  process_cleanup: boolean;
}

interface PolicyDeniedEntry {
  action: string;
  reason: string;
  stage: string;
  command?: string;
}

interface CleanupStateDiagnostic {
  state_file: string;
  status: 'missing' | 'loaded' | 'corrupt';
  reason: string | null;
  detail: string | null;
}

interface RunExecResult {
  ok: boolean;
  ignored?: boolean;
  error?: string;
}

type ExecFileAsync = (command: string, args: string[], options?: Record<string, unknown>) => Promise<{ stdout?: string; stderr?: string }>;

const execFileAsyncDefault = promisify(execFile) as ExecFileAsync;

export const DEFAULT_SANDBOX_ROOT = '/sandbox';
export const DEFAULT_WWW_DIR = '/sandbox/www';
export const DEFAULT_RESULTS_DIR = '/sandbox/results';
const STATE_DIR_NAME = '.buster-cleanup';
const SAFE_NAMESPACE_RE = /^(buster|test)-/;
const STATE_LOCK_TIMEOUT_MS = 5000;
const STATE_LOCK_STALE_MS = 30000;
const STATE_LOCK_RETRY_MS = 10;
export const CLEANUP_SCOPE_LABEL = 'openclaw.io/buster-scope';

export const CLEANUP_POLICY = Object.freeze({
  TASK_SCOPED: 'task_scoped',
  STARTUP_SWEEP: 'startup_sweep',
  SHUTDOWN_SWEEP: 'shutdown_sweep',
  DISABLED: 'disabled',
});

const TRACKED_RESOURCE_SCOPE = Object.freeze({
  NONE: 'none',
  SCOPED: 'scoped',
  ALL: 'all',
});

function normalizeResourceValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function sanitizeStateToken(value: unknown, fallback = 'unknown'): string {
  const normalized = normalizeResourceValue(value) || fallback;
  const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || fallback;
}

function uniqueValues(values: unknown[] = []): string[] {
  return [...new Set((values || []).map(normalizeResourceValue).filter((value): value is string => Boolean(value)))];
}

function mergeState(base: Partial<CleanupState> = {}, extra: Partial<CleanupState> = {}): CleanupState {
  return {
    containers: uniqueValues([...(base.containers || []), ...(extra.containers || [])]),
    images: uniqueValues([...(base.images || []), ...(extra.images || [])]),
    namespaces: uniqueValues([...(base.namespaces || []), ...(extra.namespaces || [])]),
  };
}

function removeState(base: Partial<CleanupState> = {}, removed: Partial<CleanupState> = {}): CleanupState {
  const removedContainers = new Set(removed.containers || []);
  const removedImages = new Set(removed.images || []);
  const removedNamespaces = new Set(removed.namespaces || []);
  return {
    containers: uniqueValues(base.containers || []).filter((value) => !removedContainers.has(value)),
    images: uniqueValues(base.images || []).filter((value) => !removedImages.has(value)),
    namespaces: uniqueValues(base.namespaces || []).filter((value) => !removedNamespaces.has(value)),
  };
}

function buildEmptyState(): CleanupState {
  return { containers: [], images: [], namespaces: [] };
}

function hasTrackedResources(state: CleanupState): boolean {
  return Boolean(state.containers.length || state.images.length || state.namespaces.length);
}

function hasCleanupScope(payload: CleanupPayload | null | undefined): boolean {
  return Boolean(payload && (payload.run_id || payload.module_id || payload.gate_id || payload.dispatch_id));
}

function ensureWithinSandboxRoot(root: string, targetPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`sandbox cleanup path escapes sandbox root: ${targetPath}`);
  }
  return resolvedTarget;
}

function resolveCleanupStateDir(sandboxRoot = DEFAULT_SANDBOX_ROOT): string {
  return ensureWithinSandboxRoot(sandboxRoot, path.join(sandboxRoot, STATE_DIR_NAME));
}

export function buildCleanupScopeKey(payload: CleanupPayload = {}): string {
  const project = sanitizeStateToken(payload?.project, 'project');
  const moduleOrGate = sanitizeStateToken(payload?.module_id || payload?.gate_id || payload?.task_type, 'task');
  const attempt = sanitizeStateToken(payload?.attempt, '1');
  const runId = sanitizeStateToken(payload?.run_id || payload?.dispatch_id, 'run');
  return `${project}--${moduleOrGate}--attempt-${attempt}--${runId}`;
}

export function buildCleanupScopeLabel(payload: CleanupPayload = {}): string {
  return `oc-${createHash('sha256').update(buildCleanupScopeKey(payload)).digest('hex').slice(0, 20)}`;
}

export function buildCleanupPodmanLabelArgs(payload: CleanupPayload = {}): string[] {
  return ['--label', `${CLEANUP_SCOPE_LABEL}=${buildCleanupScopeLabel(payload)}`];
}

export function buildCleanupKubernetesLabels(payload: CleanupPayload = {}): Record<string, string> {
  return { [CLEANUP_SCOPE_LABEL]: buildCleanupScopeLabel(payload) };
}

export function getCleanupStatePath(payload: CleanupPayload = {}, options: CleanupOptions = {}): string {
  const sandboxRoot = options.sandboxRoot || DEFAULT_SANDBOX_ROOT;
  const scopeKey = buildCleanupScopeKey(payload);
  return path.join(resolveCleanupStateDir(sandboxRoot), `${scopeKey}.json`);
}

function cleanupStateDiagnostic(statePath: string, status: CleanupStateDiagnostic['status'], reason: string | null = null, detail: string | null = null): CleanupStateDiagnostic {
  return { state_file: path.basename(statePath), status, reason, detail };
}

function readStateFile(statePath: string): { state: CleanupState; diagnostic: CleanupStateDiagnostic } {
  if (!fs.existsSync(statePath)) {
    return {
      state: buildEmptyState(),
      diagnostic: cleanupStateDiagnostic(statePath, 'missing', 'cleanup_state_missing'),
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<CleanupState> | null;
    return {
      state: mergeState(buildEmptyState(), parsed || {}),
      diagnostic: cleanupStateDiagnostic(statePath, 'loaded'),
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error || 'unknown');
    return {
      state: buildEmptyState(),
      diagnostic: cleanupStateDiagnostic(statePath, 'corrupt', 'cleanup_state_corrupt', detail),
    };
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireStateFileLock(statePath: string): () => void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const lockPath = `${statePath}.lock`;
  const deadline = Date.now() + STATE_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, 'owner'), `${process.pid} ${Date.now()}\n`);
      return () => {
        fs.rmSync(lockPath, { recursive: true, force: true });
      };
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code !== 'EEXIST') throw error;

      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STATE_LOCK_STALE_MS) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError: unknown) {
        const statCode = statError && typeof statError === 'object' && 'code' in statError ? String((statError as { code?: unknown }).code) : '';
        if (statCode === 'ENOENT') continue;
        throw statError;
      }

      if (Date.now() >= deadline) {
        throw new Error(`timed out acquiring cleanup state lock: ${path.basename(statePath)}`);
      }
      sleepSync(STATE_LOCK_RETRY_MS);
    }
  }
}

function withStateFileLock<T>(statePath: string, fn: () => T): T {
  const release = acquireStateFileLock(statePath);
  try {
    return fn();
  } finally {
    release();
  }
}

function writeStateFileAtomic(statePath: string, state: CleanupState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n');
    fs.renameSync(tmpPath, statePath);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

export function listCleanupStatePaths(options: CleanupOptions = {}): string[] {
  const sandboxRoot = options.sandboxRoot || DEFAULT_SANDBOX_ROOT;
  const stateDir = resolveCleanupStateDir(sandboxRoot);
  if (!fs.existsSync(stateDir)) return [];
  return fs.readdirSync(stateDir)
    .filter((name: string) => name.endsWith('.json'))
    .map((name: string) => path.join(stateDir, name))
    .sort();
}

export function trackSandboxResources(payload: CleanupPayload = {}, resources: Partial<CleanupState> = {}, options: CleanupOptions = {}): { statePath: string; state: CleanupState; cleanup_state_diagnostics: CleanupStateDiagnostic[] } {
  const statePath = getCleanupStatePath(payload, options);
  return withStateFileLock(statePath, () => {
    const current = readStateFile(statePath);
    const nextState = mergeState(current.state, resources || {});
    writeStateFileAtomic(statePath, nextState);
    return { statePath, state: nextState, cleanup_state_diagnostics: [current.diagnostic] };
  });
}

function clearDirectoryContents(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

async function runExecFile(execFileAsync: ExecFileAsync, command: string, args: string[], { ignore = null, timeout = 15000 }: { ignore?: RegExp | null; timeout?: number } = {}): Promise<RunExecResult> {
  try {
    await execFileAsync(command, args, { timeout, encoding: 'utf8', env: buildSubprocessEnv() });
    return { ok: true };
  } catch (error: unknown) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    const detail = `${err?.stderr || ''}${err?.stdout || ''}${err?.message || ''}`;
    if (ignore && ignore.test(detail)) {
      return { ok: false, ignored: true };
    }
    return { ok: false, error: detail.trim() || err?.message || `${command} failed` };
  }
}

function splitLines(output: unknown): string[] {
  return String(output || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function discoverLabeledResources(payload: CleanupPayload = {}, options: CleanupOptions = {}): Promise<CleanupState> {
  if (!hasCleanupScope(payload)) return buildEmptyState();
  const execFileAsync = options.execFileAsync || execFileAsyncDefault;
  const label = `${CLEANUP_SCOPE_LABEL}=${buildCleanupScopeLabel(payload)}`;
  const discovered = buildEmptyState();

  try {
    const { stdout } = await execFileAsync('podman', ['ps', '-a', '--filter', `label=${label}`, '--format', '{{.Names}}'], {
      timeout: 10000,
      encoding: 'utf8',
      env: buildSubprocessEnv(),
    });
    discovered.containers.push(...splitLines(stdout));
  } catch (_error: unknown) {
    // KEEP_TYPED_POLICY: discovery supplements persisted state but is not authority.
  }

  try {
    const { stdout } = await execFileAsync('podman', ['images', '--filter', `label=${label}`, '--format', '{{.Repository}}:{{.Tag}}'], {
      timeout: 10000,
      encoding: 'utf8',
      env: buildSubprocessEnv(),
    });
    discovered.images.push(...splitLines(stdout).filter((entry) => !entry.endsWith(':<none>')));
  } catch (_error: unknown) {
    // KEEP_TYPED_POLICY: discovery supplements persisted state but is not authority.
  }

  try {
    const { stdout } = await execFileAsync('kubectl', ['get', 'namespace', '-l', label, '-o', 'jsonpath={range .items[*]}{.metadata.name}{"\\n"}{end}'], {
      timeout: 10000,
      encoding: 'utf8',
      env: buildSubprocessEnv(),
    });
    discovered.namespaces.push(...splitLines(stdout));
  } catch (_error: unknown) {
    // KEEP_TYPED_POLICY: discovery supplements persisted state but is not authority.
  }

  return mergeState(buildEmptyState(), discovered);
}

function shouldClearSandboxOutputs(stage: string): boolean {
  return stage === 'pre' || stage === 'startup' || stage === 'shutdown';
}

function inferCleanupPolicyName(stage: string, payload: CleanupPayload | null | undefined): CleanupPolicyName {
  if (hasCleanupScope(payload)) return CLEANUP_POLICY.TASK_SCOPED;
  if (stage === 'startup') return CLEANUP_POLICY.STARTUP_SWEEP;
  if (stage === 'shutdown') return CLEANUP_POLICY.SHUTDOWN_SWEEP;
  return CLEANUP_POLICY.DISABLED;
}

function cleanupPolicyProfile(name: unknown): CleanupPolicyProfile {
  switch (name) {
    case CLEANUP_POLICY.TASK_SCOPED:
      return {
        name,
        trackedResources: TRACKED_RESOURCE_SCOPE.SCOPED,
        sandboxOutputs: false,
        processCleanup: false,
      };
    case CLEANUP_POLICY.STARTUP_SWEEP:
    case CLEANUP_POLICY.SHUTDOWN_SWEEP:
      return {
        name,
        trackedResources: TRACKED_RESOURCE_SCOPE.ALL,
        sandboxOutputs: true,
        processCleanup: true,
      };
    case CLEANUP_POLICY.DISABLED:
    default:
      return {
        name: CLEANUP_POLICY.DISABLED,
        trackedResources: TRACKED_RESOURCE_SCOPE.NONE,
        sandboxOutputs: false,
        processCleanup: false,
      };
  }
}

function isTrackedResourceScope(value: unknown): value is TrackedResourceScope {
  return Object.values(TRACKED_RESOURCE_SCOPE).includes(value as TrackedResourceScope);
}

function normalizeCleanupPolicy(stage: string, payload: CleanupPayload | null | undefined, options: CleanupOptions = {}): CleanupPolicyProfile {
  const requested = options.cleanupPolicy || inferCleanupPolicyName(stage, payload);
  if (typeof requested === 'string') return cleanupPolicyProfile(requested);
  if (requested && typeof requested === 'object' && !Array.isArray(requested)) {
    const base = cleanupPolicyProfile(requested.name || inferCleanupPolicyName(stage, payload));
    const trackedResources = requested.trackedResources || base.trackedResources;
    return {
      name: requested.name || base.name,
      trackedResources: isTrackedResourceScope(trackedResources) ? trackedResources : base.trackedResources,
      sandboxOutputs: requested.sandboxOutputs ?? base.sandboxOutputs,
      processCleanup: requested.processCleanup ?? base.processCleanup,
    };
  }
  return cleanupPolicyProfile(inferCleanupPolicyName(stage, payload));
}

function publicCleanupPolicy(policy: CleanupPolicyProfile): PublicCleanupPolicy {
  return {
    name: policy.name,
    tracked_resources: policy.trackedResources,
    sandbox_outputs: policy.sandboxOutputs,
    process_cleanup: policy.processCleanup,
  };
}

function resolveCleanupStatePaths(stage: string, payload: CleanupPayload | null | undefined, sandboxRoot: string, policy: CleanupPolicyProfile, policyDenied: PolicyDeniedEntry[]): string[] {
  if (policy.trackedResources === TRACKED_RESOURCE_SCOPE.SCOPED) {
    if (hasCleanupScope(payload)) return [getCleanupStatePath(payload || {}, { sandboxRoot })];
    policyDenied.push({ action: 'tracked_resources', reason: 'missing_scoped_payload', stage });
    return [];
  }
  if (policy.trackedResources === TRACKED_RESOURCE_SCOPE.ALL) {
    return listCleanupStatePaths({ sandboxRoot });
  }
  if (hasCleanupScope(payload) || stage === 'startup' || stage === 'shutdown') {
    policyDenied.push({ action: 'tracked_resources', reason: 'policy_disallows_tracked_resources', stage });
  }
  return [];
}

async function cleanupStateFile(stage: string, statePath: string, options: CleanupOptions = {}): Promise<{ cleaned: CleanupState; errors: string[]; diagnostics: CleanupStateDiagnostic[] }> {
  const execFileAsync = options.execFileAsync || execFileAsyncDefault;
  const stateRead = readStateFile(statePath);
  const state = stateRead.state;
  const remaining = buildEmptyState();
  const cleaned = buildEmptyState();
  const errors: string[] = [];
  const diagnostics = [stateRead.diagnostic];

  if (stateRead.diagnostic.status === 'missing') {
    return { cleaned, errors, diagnostics };
  }
  if (stateRead.diagnostic.status === 'corrupt') {
    errors.push(`state:${path.basename(statePath)}: corrupt_cleanup_state: ${stateRead.diagnostic.detail || 'invalid json'}`);
    return { cleaned, errors, diagnostics };
  }

  for (const containerName of state.containers) {
    const stopResult = await runExecFile(execFileAsync, 'podman', ['stop', containerName], {
      timeout: 30000,
      ignore: /(no such container|no container with name or id|not found)/i,
    });
    if (stopResult.ok || stopResult.ignored) {
      const rmResult = await runExecFile(execFileAsync, 'podman', ['rm', '-f', containerName], {
        timeout: 30000,
        ignore: /(no such container|no container with name or id|not found)/i,
      });
      if (rmResult.ok || rmResult.ignored) {
        cleaned.containers.push(containerName);
        continue;
      }
      errors.push(`container:${containerName}: ${rmResult.error}`);
    } else {
      errors.push(`container:${containerName}: ${stopResult.error}`);
    }
    remaining.containers.push(containerName);
  }

  for (const imageTag of state.images) {
    const imageResult = await runExecFile(execFileAsync, 'podman', ['image', 'rm', '-f', imageTag], {
      timeout: 30000,
      ignore: /(image not known|no such image|image .* not known|not found)/i,
    });
    if (imageResult.ok || imageResult.ignored) {
      cleaned.images.push(imageTag);
      continue;
    }
    errors.push(`image:${imageTag}: ${imageResult.error}`);
    remaining.images.push(imageTag);
  }

  for (const namespaceName of state.namespaces) {
    if (!SAFE_NAMESPACE_RE.test(namespaceName)) {
      errors.push(`namespace:${namespaceName}: rejected by safety policy`);
      remaining.namespaces.push(namespaceName);
      continue;
    }
    const nsResult = await runExecFile(execFileAsync, 'kubectl', ['delete', 'namespace', namespaceName, '--wait=false'], {
      timeout: 15000,
      ignore: /(not found|no resources found)/i,
    });
    if (nsResult.ok || nsResult.ignored) {
      cleaned.namespaces.push(namespaceName);
      continue;
    }
    errors.push(`namespace:${namespaceName}: ${nsResult.error}`);
    remaining.namespaces.push(namespaceName);
  }

  withStateFileLock(statePath, () => {
    const latest = readStateFile(statePath);
    const uncleanedLatest = latest.diagnostic.status === 'corrupt' ? buildEmptyState() : removeState(latest.state, cleaned);
    const nextState = mergeState(remaining, uncleanedLatest);
    if (hasTrackedResources(nextState)) {
      writeStateFileAtomic(statePath, nextState);
    } else if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
  });

  return {
    cleaned,
    errors,
    diagnostics,
  };
}

export async function cleanupSandboxResources(stage: string, payload: CleanupPayload | null = null, options: CleanupOptions = {}): Promise<Record<string, unknown>> {
  const sandboxRoot = options.sandboxRoot || DEFAULT_SANDBOX_ROOT;
  const start = Date.now();
  const policy = normalizeCleanupPolicy(stage, payload, options);
  const policyDenied: PolicyDeniedEntry[] = [];
  const statePaths = resolveCleanupStatePaths(stage, payload, sandboxRoot, policy, policyDenied);
  const cleanupStateDiagnostics: CleanupStateDiagnostic[] = [];

  const cleaned = {
    containers: [] as string[],
    images: [] as string[],
    namespaces: [] as string[],
    sandbox_paths: [] as string[],
    state_files: [] as string[],
    nginx_stopped: false,
  };
  const errors: string[] = [];

  if (policy.trackedResources !== TRACKED_RESOURCE_SCOPE.NONE && hasCleanupScope(payload)) {
    const discovered = await discoverLabeledResources(payload || {}, options);
    if (discovered.containers.length || discovered.images.length || discovered.namespaces.length) {
      const statePath = getCleanupStatePath(payload || {}, { sandboxRoot });
      const current = readStateFile(statePath);
      cleanupStateDiagnostics.push(current.diagnostic);
      if (current.diagnostic.status === 'corrupt') {
        errors.push(`state:${path.basename(statePath)}: corrupt_cleanup_state: ${current.diagnostic.detail || 'invalid json'}`);
      } else {
        withStateFileLock(statePath, () => {
          const lockedCurrent = readStateFile(statePath);
          if (lockedCurrent.diagnostic.status !== 'corrupt') {
            writeStateFileAtomic(statePath, mergeState(lockedCurrent.state, discovered));
          }
        });
        if (!statePaths.includes(statePath)) statePaths.push(statePath);
      }
    }
  }

  for (const statePath of statePaths) {
    const result = await cleanupStateFile(stage, statePath, options);
    cleanupStateDiagnostics.push(...result.diagnostics);
    if (result.diagnostics.some((diagnostic) => diagnostic.status === 'missing')) continue;
    cleaned.state_files.push(path.basename(statePath));
    cleaned.containers.push(...result.cleaned.containers);
    cleaned.images.push(...result.cleaned.images);
    cleaned.namespaces.push(...result.cleaned.namespaces);
    errors.push(...result.errors);
  }

  if (shouldClearSandboxOutputs(stage) && policy.sandboxOutputs) {
    for (const relPath of [path.basename(DEFAULT_WWW_DIR), path.basename(DEFAULT_RESULTS_DIR)]) {
      const targetDir = ensureWithinSandboxRoot(sandboxRoot, path.join(sandboxRoot, relPath));
      try {
        clearDirectoryContents(targetDir);
        cleaned.sandbox_paths.push(targetDir);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error || 'unknown');
        errors.push(`sandbox:${targetDir}: ${detail}`);
      }
    }
  } else if (shouldClearSandboxOutputs(stage) && policy.name !== CLEANUP_POLICY.TASK_SCOPED) {
    policyDenied.push({ action: 'sandbox_outputs', reason: 'policy_disallows_sandbox_outputs', stage });
  }

  if (policy.processCleanup) {
    const nginxResult = await runExecFile(options.execFileAsync || execFileAsyncDefault, 'nginx', ['-s', 'stop'], {
      timeout: 5000,
      ignore: /(no such file|invalid pid number|signal process started|open\(\) .* failed|not running)/i,
    });
    if (nginxResult.ok || nginxResult.ignored) {
      cleaned.nginx_stopped = true;
    } else {
      errors.push(`nginx: ${nginxResult.error}`);
    }
  } else if (policy.name !== CLEANUP_POLICY.TASK_SCOPED) {
    policyDenied.push({ action: 'process_cleanup', command: 'nginx', reason: 'policy_disallows_process_cleanup', stage });
  }

  return {
    ok: errors.length === 0 && policyDenied.length === 0,
    duration_seconds: Math.round((Date.now() - start) / 1000),
    cleanup_policy: publicCleanupPolicy(policy),
    cleaned: {
      containers: uniqueValues(cleaned.containers),
      images: uniqueValues(cleaned.images),
      namespaces: uniqueValues(cleaned.namespaces),
      sandbox_paths: uniqueValues(cleaned.sandbox_paths),
      state_files: uniqueValues(cleaned.state_files),
      nginx_stopped: cleaned.nginx_stopped,
    },
    cleanup_state_diagnostics: cleanupStateDiagnostics,
    ...(errors.length > 0 && { errors }),
    ...(policyDenied.length > 0 && { policy_denied: policyDenied }),
  };
}
