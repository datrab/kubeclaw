import type { ResourceLock } from '@kubeclaw/plugin-sdk';
import type { EffectLockManager } from './contracts.ts';

/** Wait only before effect request/acceptance. No adapter mutation is retried. */
export async function acquireResource(
  locks: EffectLockManager, resource: ResourceLock['resource'], owner: string,
  ttlMs: number, signal: AbortSignal,
): Promise<ResourceLock> {
  const deadline = performance.now() + Math.min(ttlMs, 30_000);
  let contention: Error | undefined;
  for (;;) {
    if (signal.aborted) throw new Error('EFFECT_RESOURCE_WAIT_CANCELLED', { cause: signal.reason });
    if (contention && performance.now() >= deadline) throw new Error('EFFECT_RESOURCE_WAIT_TIMEOUT', { cause: contention });
    try { return locks.acquire(resource, owner, ttlMs); }
    catch (error) {
      if (!(error instanceof Error) || !/^RESOURCE_LOCK(?:ED|_PROVISIONING):/u.test(error.message)) throw error;
      contention = error;
    }
    await waitForResource(signal, Math.min(10, Math.max(1, deadline - performance.now())));
  }
}

function waitForResource(signal: AbortSignal, delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): void => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, delayMs);
    const abort = (): void => {
      clearTimeout(timer); signal.removeEventListener('abort', abort);
      reject(new Error('EFFECT_RESOURCE_WAIT_CANCELLED', { cause: signal.reason }));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
