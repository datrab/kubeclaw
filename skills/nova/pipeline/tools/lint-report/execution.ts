import { execFileSync } from 'child_process';

import { DEFAULT_TOOL_TIMEOUT } from './constants.ts';
import { buildSubprocessEnv } from '../../security.ts';

/**
 * Run an external command safely. Returns { ok, stdout, stderr, exitCode }.
 * Never throws — all errors are captured in the return value.
 */
function safeExec(cmd, args, opts = {}) {
  const timeout = opts.timeout || DEFAULT_TOOL_TIMEOUT;
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB — eslint on large projects can be verbose
      cwd: opts.cwd || undefined,
      env: buildSubprocessEnv(opts.env || {}),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout || '', stderr: '', exitCode: 0 };
  } catch (e) {
    // Many lint tools exit non-zero when they find issues — that's not an error,
    // that's the tool working correctly. We capture stdout/stderr regardless.
    return {
      ok: e.status === 0,
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status ?? -1,
      timedOut: e.killed || false,
      error: e.killed ? `timeout after ${timeout}ms` : null,
    };
  }
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
