import fs from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { NativeWorkerResourceScope, type NativeWorkerScopeLimits } from './native-resource-scope.ts';
import type { NativeWorkerResourceObservation } from './native-resource-observation.ts';
import type { FileWorkerOwnershipStore, WorkerOwnershipIdentity, WorkerOwnershipRecord } from './ownership-store.ts';
import { canonicalJson } from './digest.ts';

export interface NativeWorkerOwnershipOptions {
  readonly cgroupRoot: string;
  readonly store: FileWorkerOwnershipStore;
  readonly nodeIdentity: string;
  readonly drainTimeoutMs: number;
  readonly maximumActiveScopes?: number;
}

function terminal(record: WorkerOwnershipRecord): boolean {
  return record.phase === 'disposed' || record.phase === 'abandoned';
}

function diagnosis(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4096).toWellFormed() || 'WORKER_NATIVE_UNKNOWN_FAILURE';
}

/** A lease is available only after its reservation and native identity are durable. */
export class NativeWorkerOwnershipLease {
  readonly #scope: NativeWorkerResourceScope;
  readonly #options: NativeWorkerOwnershipOptions;
  readonly #settled: (failed: boolean) => void;
  #record: WorkerOwnershipRecord;
  #started = false;
  #closing = false;
  #launch: Promise<ChildProcessWithoutNullStreams> | undefined;
  #completion: Promise<NativeWorkerResourceObservation> | undefined;

  constructor(scope: NativeWorkerResourceScope, record: WorkerOwnershipRecord, options: NativeWorkerOwnershipOptions,
    settled: (failed: boolean) => void = () => {}) {
    this.#scope = scope;
    this.#record = record;
    this.#options = options;
    this.#settled = settled;
  }

  /** Spawn is inside the launch fence; callers never receive a reusable admission path. */
  launch(command: { launcher: string; uid: number; gid: number; executable: string; arguments: readonly string[];
    cwd: string; environment: NodeJS.ProcessEnv }): Promise<ChildProcessWithoutNullStreams> {
    if (this.#started || this.#closing) return Promise.reject(new Error('WORKER_NATIVE_LAUNCH_FENCED'));
    const input = structuredClone(command);
    this.#started = true;
    this.#launch = this.#options.store.transition(this.#record, 'running').then(record => {
      this.#record = record;
      if (this.#closing) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
      return spawn(input.launcher, [this.#scope.launcherPath(), String(input.uid), String(input.gid),
        input.executable, ...input.arguments], { cwd: input.cwd, env: input.environment, stdio: 'pipe' });
    });
    return this.#launch;
  }

  observe(): NativeWorkerResourceObservation { return this.#scope.observe(); }

  finish(): Promise<NativeWorkerResourceObservation> {
    this.#closing = true;
    this.#completion ??= this.#finish().then(observation => {
      this.#settled(false);
      return observation;
    }, (error: unknown) => {
      this.#settled(true);
      throw error;
    });
    return this.#completion;
  }

  async #finish(): Promise<NativeWorkerResourceObservation> {
    // A concurrent fsync of the launch fence must settle before the terminal CAS.
    await this.#launch?.catch(() => undefined);
    try {
      if (this.#record.phase !== 'quiescing' && this.#record.phase !== 'empty') {
        const notLaunched = this.#record.phase === 'allocated' && !this.#started;
        this.#record = await this.#options.store.transition(this.#record, 'quiescing',
          notLaunched ? { diagnosis: 'WORKER_NATIVE_ALLOCATION_NOT_LAUNCHED' } : {});
      }
      const observation = await this.#scope.terminateAndDrain(this.#options.drainTimeoutMs);
      if (this.#record.finalObservation !== null && canonicalJson(this.#record.finalObservation) !== canonicalJson(observation)) {
        throw new Error('WORKER_NATIVE_TERMINAL_COUNTERS_CHANGED');
      }
      if (this.#record.phase !== 'empty' || this.#record.finalObservation === null) {
        // Persist the final kernel counters in the same fsynced state as the
        // empty phase. A crash after rmdir must not erase accounting evidence.
        this.#record = await this.#options.store.transition(this.#record, 'empty', { finalObservation: observation });
      }
      this.#scope.dispose();
      this.#record = await this.#options.store.transition(this.#record, 'disposed');
      return observation;
    } catch (error) {
      try {
        if (!terminal(this.#record) && this.#record.phase !== 'unresolved' && this.#record.phase !== 'empty') {
          this.#record = await this.#options.store.transition(this.#record, 'unresolved', { diagnosis: diagnosis(error) });
        }
      } catch (persistenceError) {
        throw new AggregateError([error, persistenceError], 'WORKER_NATIVE_RECONCILIATION_RECORD_FAILED');
      }
      throw error;
    }
  }
}

/** No admission is exposed until every previous durable owner has been reconciled. */
export class NativeWorkerOwnership {
  readonly #options: NativeWorkerOwnershipOptions;
  readonly #leases = new Set<NativeWorkerOwnershipLease>();
  readonly #admitting = new Set<string>();
  readonly #allocations = new Set<Promise<NativeWorkerOwnershipLease>>();
  #closed = false;

  private constructor(options: NativeWorkerOwnershipOptions) { this.#options = options; }

  isReady(): boolean { return !this.#closed; }

  fenceAdmission(): void { this.#closed = true; }

  async record(identity: WorkerOwnershipIdentity): Promise<WorkerOwnershipRecord | null> {
    const expected = structuredClone(identity);
    const record = (await this.#options.store.records()).find(record => record.identity.workerId === expected.workerId
      && record.identity.attemptId === expected.attemptId && record.identity.generation === expected.generation);
    if (record && canonicalJson(record.identity) !== canonicalJson(expected)) throw new Error('WORKER_NATIVE_RECOVERY_IDENTITY_CONFLICT');
    return record ?? null;
  }

  static async supervise<T>(options: NativeWorkerOwnershipOptions,
    operation: (owner: NativeWorkerOwnership) => Promise<T>): Promise<T> {
    if (!Number.isSafeInteger(options.drainTimeoutMs) || options.drainTimeoutMs < 1) {
      throw new Error('WORKER_NATIVE_DRAIN_LIMIT_INVALID');
    }
    if (options.maximumActiveScopes !== undefined && (!Number.isSafeInteger(options.maximumActiveScopes) || options.maximumActiveScopes < 1)) {
      throw new Error('WORKER_NATIVE_CAPACITY_INVALID');
    }
    const captured = { ...options, cgroupRoot: fs.realpathSync(options.cgroupRoot) };
    return captured.store.withSupervisor(async () => {
      const owner = new NativeWorkerOwnership(captured);
      await owner.#recover();
      let result: T | undefined;
      const errors: unknown[] = [];
      try { result = await operation(owner); } catch (error) { errors.push(error); }
      owner.#closed = true;
      await Promise.allSettled(owner.#allocations);
      const closed = await Promise.allSettled([...owner.#leases].map(lease => lease.finish()));
      for (const close of closed) if (close.status === 'rejected') errors.push(close.reason);
      if (errors.length) throw new AggregateError(errors, 'WORKER_NATIVE_SUPERVISOR_UNRESOLVED');
      return result as T;
    });
  }

  allocate(identity: WorkerOwnershipIdentity, limits: NativeWorkerScopeLimits): Promise<NativeWorkerOwnershipLease> {
    const operation = this.#allocate(identity, limits);
    this.#allocations.add(operation);
    void operation.then(() => this.#allocations.delete(operation), () => this.#allocations.delete(operation));
    return operation;
  }

  async #allocate(identity: WorkerOwnershipIdentity, limits: NativeWorkerScopeLimits): Promise<NativeWorkerOwnershipLease> {
    const captured = structuredClone(identity);
    const requested = { ...limits };
    const key = JSON.stringify([captured.workerId, captured.attemptId]);
    if (this.#closed || this.#admitting.has(key)) throw new Error('WORKER_NATIVE_ADMISSION_FENCED');
    if (this.#leases.size + this.#admitting.size >= (this.#options.maximumActiveScopes ?? 128)) throw new Error('WORKER_NATIVE_CAPACITY_EXCEEDED');
    this.#admitting.add(key);
    let record: WorkerOwnershipRecord | undefined;
    try {
      record = await this.#options.store.reserve(captured);
      if (record.phase !== 'reserved') throw new Error('WORKER_NATIVE_IDENTITY_ALREADY_USED');
      const scope = NativeWorkerResourceScope.createReserved(this.#options.cgroupRoot, record.scopeName, requested);
      record = await this.#options.store.transition(record, 'allocated', { binding: scope.binding() });
      const lease = new NativeWorkerOwnershipLease(scope, record, this.#options, failed => {
        if (failed) this.#closed = true;
        else this.#leases.delete(lease);
      });
      this.#leases.add(lease);
      if (this.#closed) {
        await lease.finish();
        throw new Error('WORKER_NATIVE_ADMISSION_FENCED');
      }
      return lease;
    } catch (error) {
      // A reservation without a committed binding can never have launched work.
      // Keep it recoverable; never reuse its name or infer completion from failure.
      if (record?.phase === 'reserved') this.#closed = true;
      throw error;
    } finally { this.#admitting.delete(key); }
  }

  async #recover(): Promise<void> {
    const records = await this.#options.store.records();
    const names = new Set(NativeWorkerResourceScope.inventory(this.#options.cgroupRoot));
    const registered = new Set(records.map(record => record.scopeName));
    if ([...names].some(name => !registered.has(name))) throw new Error('WORKER_NATIVE_UNKNOWN_SCOPE');
    const currentBoot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    // A PVC can move between machines. A different boot ID alone cannot prove
    // that processes on the previous machine have stopped.
    await this.#options.store.bindHostIdentity(this.#options.nodeIdentity, currentBoot);
    for (const record of records) await this.#recoverRecord(record, names, currentBoot);
  }

  async #recoverRecord(record: WorkerOwnershipRecord, names: ReadonlySet<string>, currentBoot: string): Promise<void> {
    const exists = names.has(record.scopeName);
    if (terminal(record)) {
      if (exists) throw new Error('WORKER_NATIVE_RETIRED_SCOPE_REAPPEARED');
      return;
    }
    if (!exists && record.phase === 'empty') {
      await this.#options.store.transition(record, 'disposed');
      return;
    }
    if (!exists && (!record.binding || record.binding.bootId !== currentBoot)) {
      await this.#options.store.transition(record, 'abandoned', {
        diagnosis: record.binding ? 'WORKER_NATIVE_BOOT_CHANGED_RESULT_UNAVAILABLE' : 'WORKER_NATIVE_RESERVATION_NOT_LAUNCHED',
      });
      return;
    }
    if (!exists) throw new Error('WORKER_NATIVE_OWNED_SCOPE_MISSING');
    let scope: NativeWorkerResourceScope;
    if (record.phase === 'reserved') {
      scope = NativeWorkerResourceScope.recoverEmptyReservation(this.#options.cgroupRoot, record.scopeName);
      record = await this.#options.store.transition(record, 'allocated', { binding: scope.binding() });
    } else {
      if (!record.binding) throw new Error('WORKER_NATIVE_UNBOUND_SCOPE_UNRESOLVED');
      scope = NativeWorkerResourceScope.reopen(this.#options.cgroupRoot, record.binding);
    }
    await new NativeWorkerOwnershipLease(scope, record, this.#options).finish();
  }
}
