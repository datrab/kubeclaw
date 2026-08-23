import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FileResourceLockManager } from '../effects/locks.ts';

const active = new Set<string>();
export async function withRunMutationLock<T>(runRoot: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const key = path.resolve(runRoot); if (active.has(key)) throw new Error(`PIPELINE_RUN_MUTATION_LOCKED:${key}`); active.add(key);
  let locks: FileResourceLockManager | undefined; let owner: string | undefined;
  let lock: ReturnType<FileResourceLockManager['acquire']> | undefined; let renewal: NodeJS.Timeout | undefined;
  let renewalError: unknown; const controller = new AbortController();
  try {
    fs.mkdirSync(path.dirname(key), { recursive: true }); locks = new FileResourceLockManager(path.join(path.dirname(key), '.run-mutation-locks'));
    owner = `mutation:${process.pid}:${crypto.randomUUID()}`; lock = locks.acquire({ type: 'pipeline.run', canonicalId: key }, owner, 60_000);
    renewal = setInterval(() => { try { lock = locks!.renew(lock!.lockId, owner!, 60_000); } catch (error) { renewalError = error; controller.abort(error); } }, 20_000); renewal.unref();
    const result = await operation(controller.signal); if (renewalError) throw renewalError; return result;
  } finally {
    if (renewal) clearInterval(renewal);
    try { if (locks && lock && owner) locks.release(lock.lockId, owner); } finally { active.delete(key); }
  }
}
