import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsyncDefault = promisify(execFile);

export const DEFAULT_SANDBOX_ROOT = '/sandbox';
export const DEFAULT_WWW_DIR = '/sandbox/www';
export const DEFAULT_RESULTS_DIR = '/sandbox/results';
export const DEFAULT_K8S_NS_FILE = '/sandbox/k8s-test-namespace';
const STATE_DIR_NAME = '.buster-cleanup';
const SAFE_NAMESPACE_RE = /^(buster|test)-/;

function normalizeResourceValue(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function sanitizeStateToken(value, fallback = 'unknown') {
  const normalized = normalizeResourceValue(value) || fallback;
  const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || fallback;
}

function uniqueValues(values = []) {
  return [...new Set((values || []).map(normalizeResourceValue).filter(Boolean))];
}

function mergeState(base = {}, extra = {}) {
  return {
    containers: uniqueValues([...(base.containers || []), ...(extra.containers || [])]),
    images: uniqueValues([...(base.images || []), ...(extra.images || [])]),
    namespaces: uniqueValues([...(base.namespaces || []), ...(extra.namespaces || [])]),
  };
}

function buildEmptyState() {
  return { containers: [], images: [], namespaces: [] };
}

function ensureWithinSandboxRoot(root, targetPath) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`sandbox cleanup path escapes sandbox root: ${targetPath}`);
  }
  return resolvedTarget;
}

function resolveCleanupStateDir(sandboxRoot = DEFAULT_SANDBOX_ROOT) {
  return ensureWithinSandboxRoot(sandboxRoot, path.join(sandboxRoot, STATE_DIR_NAME));
}

export function buildCleanupScopeKey(payload = {}) {
  const project = sanitizeStateToken(payload?.project, 'project');
  const moduleOrGate = sanitizeStateToken(payload?.module_id || payload?.gate_id || payload?.task_type, 'task');
  const attempt = sanitizeStateToken(payload?.attempt, '1');
  const runId = sanitizeStateToken(payload?.run_id || payload?.dispatch_id, 'run');
  return `${project}--${moduleOrGate}--attempt-${attempt}--${runId}`;
}

export function getCleanupStatePath(payload = {}, options = {}) {
  const sandboxRoot = options.sandboxRoot || DEFAULT_SANDBOX_ROOT;
  const scopeKey = buildCleanupScopeKey(payload);
  return path.join(resolveCleanupStateDir(sandboxRoot), `${scopeKey}.json`);
}

function readStateFile(statePath) {
  if (!fs.existsSync(statePath)) return buildEmptyState();
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return mergeState(buildEmptyState(), parsed || {});
  } catch {
    return buildEmptyState();
  }
}

function writeStateFileAtomic(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmpPath, statePath);
}

export function listCleanupStatePaths(options = {}) {
  const sandboxRoot = options.sandboxRoot || DEFAULT_SANDBOX_ROOT;
  const stateDir = resolveCleanupStateDir(sandboxRoot);
  if (!fs.existsSync(stateDir)) return [];
  return fs.readdirSync(stateDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(stateDir, name))
    .sort();
}

export function trackSandboxResources(payload = {}, resources = {}, options = {}) {
  const statePath = getCleanupStatePath(payload, options);
  const nextState = mergeState(readStateFile(statePath), resources || {});
  writeStateFileAtomic(statePath, nextState);
  return { statePath, state: nextState };
}

function clearDirectoryContents(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

async function runExecFile(execFileAsync, command, args, { ignore = null, timeout = 15000 } = {}) {
  try {
    await execFileAsync(command, args, { timeout, encoding: 'utf8' });
    return { ok: true };
  } catch (error) {
    const detail = `${error?.stderr || ''}${error?.stdout || ''}${error?.message || ''}`;
    if (ignore && ignore.test(detail)) {
      return { ok: false, ignored: true };
    }
    return { ok: false, error: detail.trim() || error?.message || `${command} failed` };
  }
}

function getLegacyNamespaceFile(sandboxRoot = DEFAULT_SANDBOX_ROOT) {
  return ensureWithinSandboxRoot(sandboxRoot, path.join(sandboxRoot, path.basename(DEFAULT_K8S_NS_FILE)));
}

function collectLegacyNamespace(sandboxRoot) {
  const legacyPath = getLegacyNamespaceFile(sandboxRoot);
  if (!fs.existsSync(legacyPath)) return { legacyPath, namespaces: [] };
  try {
    const namespace = normalizeResourceValue(fs.readFileSync(legacyPath, 'utf8'));
    if (namespace && SAFE_NAMESPACE_RE.test(namespace)) {
      return { legacyPath, namespaces: [namespace] };
    }
  } catch {}
  return { legacyPath, namespaces: [] };
}

function shouldClearSandboxOutputs(stage) {
  return stage === 'pre' || stage === 'startup' || stage === 'shutdown';
}

async function cleanupStateFile(stage, statePath, options = {}) {
  const execFileAsync = options.execFileAsync || execFileAsyncDefault;
  const state = readStateFile(statePath);
  const remaining = buildEmptyState();
  const cleaned = { containers: [], images: [], namespaces: [] };
  const errors = [];

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

  for (const namespace of state.namespaces) {
    if (!SAFE_NAMESPACE_RE.test(namespace)) {
      errors.push(`namespace:${namespace}: rejected by safety policy`);
      remaining.namespaces.push(namespace);
      continue;
    }
    const nsResult = await runExecFile(execFileAsync, 'kubectl', ['delete', 'namespace', namespace, '--wait=false'], {
      timeout: 15000,
      ignore: /(not found|no resources found)/i,
    });
    if (nsResult.ok || nsResult.ignored) {
      cleaned.namespaces.push(namespace);
      continue;
    }
    errors.push(`namespace:${namespace}: ${nsResult.error}`);
    remaining.namespaces.push(namespace);
  }

  if (remaining.containers.length || remaining.images.length || remaining.namespaces.length) {
    writeStateFileAtomic(statePath, remaining);
  } else if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }

  return {
    cleaned,
    errors,
  };
}

export async function cleanupSandboxResources(stage, payload = null, options = {}) {
  const sandboxRoot = options.sandboxRoot || DEFAULT_SANDBOX_ROOT;
  const start = Date.now();
  const statePaths = payload
    ? [getCleanupStatePath(payload, { sandboxRoot })]
    : listCleanupStatePaths({ sandboxRoot });

  const cleaned = {
    containers: [],
    images: [],
    namespaces: [],
    sandbox_paths: [],
    state_files: [],
    nginx_stopped: false,
  };
  const errors = [];

  for (const statePath of statePaths) {
    if (!fs.existsSync(statePath)) continue;
    const result = await cleanupStateFile(stage, statePath, options);
    cleaned.state_files.push(path.basename(statePath));
    cleaned.containers.push(...result.cleaned.containers);
    cleaned.images.push(...result.cleaned.images);
    cleaned.namespaces.push(...result.cleaned.namespaces);
    errors.push(...result.errors);
  }

  if (shouldClearSandboxOutputs(stage)) {
    for (const relPath of [path.basename(DEFAULT_WWW_DIR), path.basename(DEFAULT_RESULTS_DIR)]) {
      const targetDir = ensureWithinSandboxRoot(sandboxRoot, path.join(sandboxRoot, relPath));
      try {
        clearDirectoryContents(targetDir);
        cleaned.sandbox_paths.push(targetDir);
      } catch (error) {
        errors.push(`sandbox:${targetDir}: ${error.message}`);
      }
    }
  }

  const nginxResult = await runExecFile(options.execFileAsync || execFileAsyncDefault, 'nginx', ['-s', 'stop'], {
    timeout: 5000,
    ignore: /(no such file|invalid pid number|signal process started|open\(\) .* failed|not running)/i,
  });
  if (nginxResult.ok || nginxResult.ignored) {
    cleaned.nginx_stopped = true;
  } else {
    errors.push(`nginx: ${nginxResult.error}`);
  }

  if (!payload) {
    const { legacyPath, namespaces } = collectLegacyNamespace(sandboxRoot);
    for (const namespace of namespaces) {
      const nsResult = await runExecFile(options.execFileAsync || execFileAsyncDefault, 'kubectl', ['delete', 'namespace', namespace, '--wait=false'], {
        timeout: 15000,
        ignore: /(not found|no resources found)/i,
      });
      if (nsResult.ok || nsResult.ignored) {
        cleaned.namespaces.push(namespace);
      } else {
        errors.push(`namespace:${namespace}: ${nsResult.error}`);
      }
    }
    if (fs.existsSync(legacyPath)) {
      try { fs.unlinkSync(legacyPath); } catch (error) { errors.push(`legacy-namespace-file: ${error.message}`); }
    }
  }

  return {
    ok: errors.length === 0,
    duration_seconds: Math.round((Date.now() - start) / 1000),
    cleaned: {
      containers: uniqueValues(cleaned.containers),
      images: uniqueValues(cleaned.images),
      namespaces: uniqueValues(cleaned.namespaces),
      sandbox_paths: uniqueValues(cleaned.sandbox_paths),
      state_files: uniqueValues(cleaned.state_files),
      nginx_stopped: cleaned.nginx_stopped,
    },
    ...(errors.length > 0 && { errors }),
  };
}
