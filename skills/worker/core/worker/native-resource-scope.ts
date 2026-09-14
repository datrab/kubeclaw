import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { observeNativeWorkerResources, type NativeWorkerResourceObservation } from './native-resource-observation.ts';
import type { WorkerScopeBinding } from './ownership-store.ts';

export interface NativeWorkerScopeLimits {
  readonly memoryBytes: number;
  readonly tasks: number;
}

const scopeNamePattern = /^worker-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

function delegatedRoot(rootValue: string): string {
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
  return root;
}

function bootId(): string {
  return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
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
    const root = delegatedRoot(rootValue);
    // Existing roots are never chmod/chowned, remounted or reconfigured here.
    const scope = fs.mkdtempSync(path.join(root, 'worker-'));
    return NativeWorkerResourceScope.#configure(scope, limits);
  }

  /** Reservation is persisted before mkdir; no process may enter before binding is durable. */
  static createReserved(rootValue: string, scopeName: string, limits: NativeWorkerScopeLimits): NativeWorkerResourceScope {
    positive(limits.memoryBytes);
    positive(limits.tasks);
    if (!scopeNamePattern.test(scopeName)) throw new Error('WORKER_NATIVE_SCOPE_NAME_INVALID');
    const scope = path.join(delegatedRoot(rootValue), scopeName);
    fs.mkdirSync(scope); // Exclusive. Never adopt a pre-existing directory during admission.
    return NativeWorkerResourceScope.#configure(scope, limits);
  }

  static #configure(scope: string, limits: NativeWorkerScopeLimits): NativeWorkerResourceScope {
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

  static inventory(rootValue: string): readonly string[] {
    return fs.readdirSync(delegatedRoot(rootValue), { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  }

  /** Recovery before the durable launch fence: only an empty reservation can be adopted. */
  static recoverEmptyReservation(rootValue: string, scopeName: string): NativeWorkerResourceScope {
    if (!scopeNamePattern.test(scopeName)) throw new Error('WORKER_NATIVE_SCOPE_NAME_INVALID');
    const scope = path.join(delegatedRoot(rootValue), scopeName);
    if (!fs.lstatSync(scope).isDirectory()) throw new Error('WORKER_NATIVE_SCOPE_BINDING_CHANGED');
    const owner = new NativeWorkerResourceScope(scope);
    if (owner.observe().populated) throw new Error('WORKER_NATIVE_UNBOUND_SCOPE_POPULATED');
    return owner;
  }

  /** An inode alone can be reused across boots. Both identities must match. */
  static reopen(rootValue: string, binding: WorkerScopeBinding): NativeWorkerResourceScope {
    if (!scopeNamePattern.test(binding.scopeName) || binding.bootId !== bootId()) {
      throw new Error('WORKER_NATIVE_SCOPE_BINDING_CHANGED');
    }
    const scope = path.join(delegatedRoot(rootValue), binding.scopeName);
    const stat = fs.lstatSync(scope);
    if (!stat.isDirectory() || stat.dev !== binding.device || stat.ino !== binding.inode) {
      throw new Error('WORKER_NATIVE_SCOPE_BINDING_CHANGED');
    }
    return new NativeWorkerResourceScope(scope);
  }

  binding(): WorkerScopeBinding {
    this.#checkIdentity();
    return { scopeName: path.basename(this.#path), bootId: bootId(), device: this.#device, inode: this.#inode };
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
