import { execFile } from 'child_process';
import { promisify } from 'util';
import { buildSubprocessEnv } from '../security.js';
import {
  type AnyRecord,
  isCallerAbort,
  requireFiniteMs,
  resolveAbortSignal,
  sessionLifecycleLog,
  throwIfCallerAbort,
} from './session-gateway-support.js';

type ExecFileAsync = (command: string, args: string[], options?: Record<string, unknown>) => Promise<unknown>;
const execFileAsync = promisify(execFile) as ExecFileAsync;

export async function acpxCleanup(agentId: unknown, gatewayLabel: unknown, opts: AnyRecord = {}): Promise<void> {
  if (!agentId) return;
  if (!gatewayLabel) return;
  throwIfCallerAbort(opts.signal, opts.budget);
  const abort = resolveAbortSignal(opts.signal, opts.budget?.signal);
  try {
    await execFileAsync('acpx', [String(agentId), 'sessions', 'close', '--name', String(gatewayLabel)], {
      stdio: 'ignore',
      timeout: requireFiniteMs(opts.timeoutMs, 'acpxCleanup.timeoutMs'),
      env: buildSubprocessEnv(),
      signal: abort.signal,
    });
    sessionLifecycleLog('DEBUG', `acpx session closed: ${agentId} / ${gatewayLabel}`);
  } catch (error) {
    if (isCallerAbort(error, opts.signal, opts.budget)) throw error;
    sessionLifecycleLog('DEBUG', `acpx session close failed (non-critical): ${agentId} / ${gatewayLabel}`);
  } finally {
    abort.cleanup();
  }
}
