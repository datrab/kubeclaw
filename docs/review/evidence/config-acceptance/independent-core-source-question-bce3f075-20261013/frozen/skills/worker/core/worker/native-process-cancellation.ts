import type { ChildProcess } from 'node:child_process';

/** Give the admitted host a bounded opportunity to close role-owned effects.
 * Resource violations still terminate the scope immediately in the supervisor.
 */
export function cancelNativeProcess(child: ChildProcess, timeoutMs: number, forceDrain: () => void): () => void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new Error('WORKER_NATIVE_CANCELLATION_DEADLINE_INVALID');
  }
  const timer = setTimeout(forceDrain, timeoutMs);
  const dispose = () => { clearTimeout(timer); child.removeListener('exit', dispose); };
  child.once('exit', dispose);
  try {
    if (!child.kill('SIGTERM')) { dispose(); forceDrain(); }
  } catch (error) { dispose(); throw error; }
  return dispose;
}
