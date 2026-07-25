import { execFileSync } from 'child_process';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_TOOL_TIMEOUT } from './constants.ts';
import { buildSubprocessEnv } from '../../security.ts';

import { selectDefinedValue } from '../../optional-absence.ts';
const LINT_CACHE_ROOT = path.join(os.tmpdir(), 'kubeclaw-lint-cache');
const LINT_TOOL_CACHE_ENV = Object.freeze({
  GOCACHE: path.join(LINT_CACHE_ROOT, 'go-build'),
  GOMODCACHE: path.join(LINT_CACHE_ROOT, 'go-mod'),
  STATICCHECK_CACHE: path.join(LINT_CACHE_ROOT, 'staticcheck'),
  TRIVY_CACHE_DIR: path.join(LINT_CACHE_ROOT, 'trivy'),
  XDG_CACHE_HOME: path.join(LINT_CACHE_ROOT, 'xdg'),
});
function outputText(value: any) {
  return typeof value === 'string' ? value : '';
}

function commandTimedOut(error: any) {
  return error?.killed === true;
}

/**
 * Run an external command safely. Returns { ok, stdout, stderr, exitCode }.
 * Never throws — all errors are captured in the return value.
 */
function safeExec(cmd: any, args: any, opts: any = {}) {
  const timeout = selectDefinedValue(() => (opts.timeout), () => (DEFAULT_TOOL_TIMEOUT));
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB — eslint on large projects can be verbose
      cwd: selectDefinedValue(() => (opts.cwd), () => (undefined)),
      env: buildSubprocessEnv({
        ...LINT_TOOL_CACHE_ENV,
        ...selectDefinedValue(() => opts.env, () => ({})),
      }),
      input: selectDefinedValue(() => (opts.input), () => (undefined)),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: outputText(stdout), stderr: '', exitCode: 0 };
  } catch (e: any) {
    // Many lint tools exit non-zero when they find issues — that's not an error,
    // that's the tool working correctly. We capture stdout/stderr regardless.
    return {
      ok: e.status === 0,
      stdout: outputText(e.stdout),
      stderr: outputText(e.stderr),
    exitCode: lintExecutionExitCode(e),
      timedOut: commandTimedOut(e),
      error: commandTimedOut(e) ? `timeout after ${timeout}ms` : outputText(e.message),
    };
  }
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

function lintExecutionExitCode(e: Record<string, any>): number {
  if (e.status !== undefined && e.status !== null) return e.status;
  return -1;
}

/**
 * Check if a command is available in PATH.
 */
function commandExists(cmd: any) {
  try {
    execFileSync('which', [cmd], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
      env: buildSubprocessEnv(),
    });
    return true;
  } catch (_error: any) {
    return false;
  }
}

export { commandExists, requireToolExecution, safeExec };
