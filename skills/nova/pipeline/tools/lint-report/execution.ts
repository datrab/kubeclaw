import { execFileSync } from 'child_process';

import { DEFAULT_TOOL_TIMEOUT } from './constants.ts';
import { buildSubprocessEnv } from '../../security.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
function outputText(value) {
  return typeof value === 'string' ? value : '';
}

function commandTimedOut(error) {
  return error?.killed === true;
}

/**
 * Run an external command safely. Returns { ok, stdout, stderr, exitCode }.
 * Never throws — all errors are captured in the return value.
 */
function safeExec(cmd, args, opts = {}) {
  const timeout = selectDefinedValue(() => (opts.timeout), () => (DEFAULT_TOOL_TIMEOUT));
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB — eslint on large projects can be verbose
      cwd: selectDefinedValue(() => (opts.cwd), () => (undefined)),
      env: buildSubprocessEnv(selectDefinedValue(() => (opts.env), () => ({}))),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: outputText(stdout), stderr: '', exitCode: 0 };
  } catch (e) {
    // Many lint tools exit non-zero when they find issues — that's not an error,
    // that's the tool working correctly. We capture stdout/stderr regardless.
    return {
      ok: e.status === 0,
      stdout: outputText(e.stdout),
      stderr: outputText(e.stderr),
    exitCode: lintExecutionExitCode(e),
      timedOut: commandTimedOut(e),
      error: commandTimedOut(e) ? `timeout after ${timeout}ms` : null,
    };
  }
}

function lintExecutionExitCode(e: Record<string, any>): number {
  if (e.status !== undefined && e.status !== null) return e.status;
  return -1;
}

/**
 * Check if a command is available in PATH.
 */
function commandExists(cmd) {
  try {
    execFileSync('which', [cmd], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
      env: buildSubprocessEnv(),
    });
    return true;
  } catch (_error) {
    return false;
  }
}

export { commandExists, safeExec };
