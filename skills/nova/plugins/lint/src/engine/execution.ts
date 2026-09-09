import { runProcess } from './process.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_TOOL_TIMEOUT } from './constants.ts';

const SUBPROCESS_ENV_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'CI',
  'GIT_EDITOR',
  'NODE_ENV',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'TF_DATA_DIR',
  'TF_CLI_CONFIG_FILE',
  'SEMGREP_LOG_FILE',
  'GOCACHE',
  'GOMODCACHE',
  'STATICCHECK_CACHE',
  'TRIVY_CACHE_DIR',
  'CONTAINER_HOST',
  'DOCKER_HOST',
  'SSH_AUTH_SOCK',
] as const);

function buildSubprocessEnv(overrides: Record<string, unknown> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SUBPROCESS_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!SUBPROCESS_ENV_KEYS.includes(key as typeof SUBPROCESS_ENV_KEYS[number])) {
      throw new Error(`lint subprocess env key is not allowlisted: ${key}`);
    }
    if (value === undefined || value === null) delete env[key];
    else env[key] = String(value);
  }
  return env;
}
const LINT_CACHE_ROOT = path.join(os.tmpdir(), 'kubeclaw-lint-cache');
// Every value in this map must be a directory. File-valued settings such as
// SEMGREP_LOG_FILE remain invocation-specific and are never created here.
const LINT_TOOL_CACHE_ENV = Object.freeze({
  GOCACHE: path.join(LINT_CACHE_ROOT, 'go-build'),
  GOMODCACHE: path.join(LINT_CACHE_ROOT, 'go-mod'),
  STATICCHECK_CACHE: path.join(LINT_CACHE_ROOT, 'staticcheck'),
  TRIVY_CACHE_DIR: path.join(LINT_CACHE_ROOT, 'trivy'),
  XDG_CACHE_HOME: path.join(LINT_CACHE_ROOT, 'xdg'),
  XDG_CONFIG_HOME: path.join(LINT_CACHE_ROOT, 'xdg-config'),
});

function ensureLintToolRuntimeDirectories(): void {
  for (const directory of Object.values(LINT_TOOL_CACHE_ENV)) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
}
/** Native failures are returned; cancellation rejects the owning invocation. */
async function safeExec(cmd: string, args: string[], opts: any = {}) {
  ensureLintToolRuntimeDirectories();
  return runProcess(cmd, args, {
    timeout: opts.timeout ?? DEFAULT_TOOL_TIMEOUT,
    cwd: opts.cwd, signal: opts.signal, input: opts.input,
    env: buildSubprocessEnv({ ...LINT_TOOL_CACHE_ENV, ...opts.env }),
  });
}

function requireToolExecution(result: any, toolId: any) {
  if (result?.timedOut) {
    throw Object.assign(new Error(`${toolId} timed out: ${result.error}`), { code: `${toolId}-timeout` });
  }
  if (result?.exitCode === -1) {
    throw Object.assign(new Error(`${toolId} could not execute: ${result.error || 'unknown execution error'}`), { code: `${toolId}-execution-failed` });
  }
  return result;
}

/** Resolve availability without blocking the caller's abort timer. */
async function commandExists(cmd: string, signal?: AbortSignal) {
  const result = await runProcess('which', [cmd], { timeout: 5000, env: buildSubprocessEnv(), signal });
  return result.ok;
}

export { commandExists, requireToolExecution, safeExec };
