import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { observeNativeWorkerResources, type NativeWorkerResourceObservation } from './native-resource-observation.ts';

export interface NativeWorkerScopeLimits {
  readonly memoryBytes: number;
  readonly tasks: number;
}

function positive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('WORKER_NATIVE_LIMIT_INVALID');
}

function writeLimit(scope: string, name: string, value: number): void {
  const file = path.join(scope, name);
  fs.writeFileSync(file, String(value));
  const effective = Number(fs.readFileSync(file, 'utf8').trim());
  if (!Number.isSafeInteger(effective) || effective !== value) {
    throw new Error(`WORKER_NATIVE_LIMIT_MISMATCH:${name}`);
  }
}

/** A kernel scope, not an attempt/fixture registry or a process launcher. */
export class NativeWorkerResourceScope {
  readonly #path: string;
  readonly #device: number;
  readonly #inode: number;
  #disposed = false;
  #quiescing = false;

  private constructor(scope: string) {
    this.#path = scope;
    const stat = fs.statSync(scope);
    this.#device = stat.dev;
    this.#inode = stat.ino;
  }

  /** The root is chosen by deployment, never by an attempt envelope. */
  static create(rootValue: string, limits: NativeWorkerScopeLimits): NativeWorkerResourceScope {
    positive(limits.memoryBytes);
    positive(limits.tasks);
    if (!path.isAbsolute(rootValue)) throw new Error('WORKER_NATIVE_ROOT_INVALID');
    const root = fs.realpathSync(rootValue);
    if (root === '/' || root === '/sys/fs/cgroup' || fs.statfsSync(root).type !== 0x63677270) {
      throw new Error('WORKER_NATIVE_ROOT_INVALID');
    }
    if (fs.readFileSync(path.join(root, 'cgroup.procs'), 'utf8').trim()) {
      throw new Error('WORKER_NATIVE_ROOT_POPULATED');
    }
    const controllers = fs.readFileSync(path.join(root, 'cgroup.subtree_control'), 'utf8').trim().split(/\s+/u);
    if (!['cpu', 'memory', 'pids'].every(controller => controllers.includes(controller))) {
      throw new Error('WORKER_NATIVE_ROOT_NOT_DELEGATED');
    }
    // Existing roots are never chmod/chowned, remounted or reconfigured here.
    const scope = fs.mkdtempSync(path.join(root, 'worker-'));
    try {
      writeLimit(scope, 'memory.max', limits.memoryBytes);
      writeLimit(scope, 'memory.swap.max', 0);
      writeLimit(scope, 'memory.oom.group', 1);
      writeLimit(scope, 'pids.max', limits.tasks);
      fs.accessSync(path.join(scope, 'cgroup.kill'), fs.constants.W_OK);
      const owner = new NativeWorkerResourceScope(scope);
      if (owner.observe().populated) throw new Error('WORKER_NATIVE_SCOPE_NOT_EMPTY');
      return owner;
    } catch (cause) {
      try { fs.rmdirSync(scope); }
      catch (cleanup) { throw new AggregateError([cause, cleanup], 'WORKER_NATIVE_SETUP_CLEANUP_FAILED'); }
      throw cause;
    }
  }

  /** Only the trusted pre-exec launcher may use this path. */
  launcherPath(): string {
    this.#checkIdentity();
    if (this.#quiescing) throw new Error('WORKER_NATIVE_SCOPE_QUIESCING');
    return this.#path;
  }

  observe(): NativeWorkerResourceObservation {
    this.#checkIdentity();
    return observeNativeWorkerResources(this.#path);
  }

  /** Keep cumulative counters available until the caller seals its result. */
  async terminateAndDrain(timeoutMs: number, signal?: AbortSignal): Promise<NativeWorkerResourceObservation> {
    positive(timeoutMs);
    signal?.throwIfAborted();
    this.#checkIdentity();
    this.#quiescing = true;
    fs.writeFileSync(path.join(this.#path, 'cgroup.kill'), '1');
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      signal?.throwIfAborted();
      const observation = this.observe();
      if (!observation.populated) return observation;
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error('WORKER_NATIVE_DRAIN_TIMEOUT');
      await delay(Math.min(10, remaining), undefined, signal ? { signal } : undefined);
    }
  }

  /** Disposal cannot stand in for confirmed termination or erase a live scope. */
  dispose(): void {
    if (this.#disposed) return;
    if (!this.#quiescing || this.observe().populated) throw new Error('WORKER_NATIVE_SCOPE_NOT_QUIESCENT');
    fs.rmdirSync(this.#path);
    this.#disposed = true;
  }

  #checkIdentity(): void {
    if (this.#disposed) throw new Error('WORKER_NATIVE_SCOPE_DISPOSED');
    const stat = fs.lstatSync(this.#path);
    if (!stat.isDirectory() || stat.dev !== this.#device || stat.ino !== this.#inode) {
      throw new Error('WORKER_NATIVE_SCOPE_IDENTITY_CHANGED');
    }
  }
}
