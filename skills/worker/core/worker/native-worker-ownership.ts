import type { NativeJournalSupervisor } from './native-journal-routing.ts';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { NativeProcessLaunches } from './native-process-launches.ts';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { NativeWorkerResourceScope, type NativeWorkerScopeLimits } from './native-resource-scope.ts';
import { observeNativeWorkerResources, type NativeWorkerResourceObservation } from './native-resource-observation.ts';
import type { FileWorkerOwnershipStore, WorkerOwnershipIdentity, WorkerOwnershipRecord } from './ownership-store.ts';
import { canonicalJson } from './digest.ts';
import { NativeWorkerResourcePool, type NativeWorkerPoolLimits } from './native-resource-pool.ts';

export interface NativeWorkerOwnershipOptions {
  readonly cgroupRoot: string;
  readonly store: FileWorkerOwnershipStore;
  readonly nodeIdentity: string;
  readonly drainTimeoutMs: number;
  readonly maximumActiveScopes: number;
  readonly poolLimits: NativeWorkerPoolLimits;
  /** Trusted coordinator persists original boot provenance before any scope
   * creation. Failure leaves the reservation charged and admission fenced.
   * This capability is never accepted from a worker envelope/control message.
   */
  readonly bindOriginalBoot?: (record: WorkerOwnershipRecord) => Promise<void>;
  /** Read-only archive/accounting validation precedes host binding and drain. */
  readonly verifyOriginalBoot?: (records: readonly WorkerOwnershipRecord[]) => Promise<void>;
}

/** Constructed by supervisor policy code, never deserialized from a worker request. */
export interface NativeWorkerLaunchCommand {
  readonly uid: number;
  readonly gid: number;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly resourceLimits?: NativeWorkerScopeLimits;
}

export interface NativeWorkerLaunchAuthority {
  readonly launch: (command: NativeWorkerLaunchCommand) => Promise<ChildProcessWithoutNullStreams>;
}

function terminal(record: WorkerOwnershipRecord): boolean {
  return record.phase === 'disposed' || record.phase === 'abandoned';
}

function diagnosis(error: unknown, record: WorkerOwnershipRecord): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, record.workerCore?.settings.runtime.ownership_diagnostic_units ?? 4096).toWellFormed() || 'WORKER_NATIVE_UNKNOWN_FAILURE';
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
  #launcher: string | undefined;
  #childLaunches: Promise<unknown> = Promise.resolve();
  readonly #launchers = new NativeProcessLaunches();

  constructor(scope: NativeWorkerResourceScope, record: WorkerOwnershipRecord, options: NativeWorkerOwnershipOptions,
    settled: (failed: boolean) => void = () => {}) {
    this.#scope = scope;
    this.#record = record;
    this.#options = options;
    this.#settled = settled;
  }

  /** Spawn is inside the launch fence; callers never receive a reusable admission path. */
  launch(command: NativeWorkerLaunchCommand & { readonly launcher: string }, controlPipe = false): Promise<ChildProcessWithoutNullStreams> {
    if (this.#record.topology.kind !== 'aggregate.v1') return Promise.reject(new Error('WORKER_OWNERSHIP_LEGACY_LAUNCH_FORBIDDEN'));
    if (this.#started || this.#closing) return Promise.reject(new Error('WORKER_NATIVE_LAUNCH_FENCED'));
    const input = structuredClone(command);
    this.#launcher = input.launcher;
    this.#started = true;
    this.#launch = this.#options.store.transition(this.#record, 'running').then(async record => {
      this.#record = record;
      if (this.#closing) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
      return this.#startChild('host', input, controlPipe);
    });
    return this.#launch;
  }

  /** Only trusted supervisor callbacks receive this capability. No scope path crosses IPC. */
  launchAuthority(): NativeWorkerLaunchAuthority {
    return Object.freeze({ launch: async (command: NativeWorkerLaunchCommand) => {
      const input = structuredClone(command);
      if (this.#closing || !this.#started || !this.#launch) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
      await this.#launch;
      if (this.#closing || this.#record.phase !== 'running') throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
      const pending = this.#childLaunches.then(() => this.#startChild(`helper-${randomUUID()}`, input, false));
      this.#childLaunches = pending.catch(() => undefined);
      return pending;
    } });
  }

  async #startChild(name: string, command: NativeWorkerLaunchCommand, controlPipe: boolean): Promise<ChildProcessWithoutNullStreams> {
    if (this.#closing || !this.#launcher) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
    this.#scope.verifyChildren(this.#record.topology.children, false);
    const limits = this.#scope.childLimits(command.resourceLimits);
    this.#record = await this.#options.store.reserveChild(this.#record, name, limits);
    if (this.#closing) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
    const reserved = this.#record.topology.children.find(child => child.name === name)!;
    const binding = this.#scope.createChild(reserved);
    this.#record = await this.#options.store.bindChild(this.#record, name, binding);
    if (this.#closing) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
    const child = this.#record.topology.children.find(item => item.name === name)!;
    return this.#launchers.spawn(this.#launcher, [...this.#scope.childLaunchArguments(child), String(command.uid), String(command.gid),
      command.executable, ...command.arguments], { cwd: command.cwd,
      env: { ...command.environment, KUBECLAW_NATIVE_SUPERVISOR_PID: String(process.pid) } }, controlPipe);
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

  async #drainOwnedSubtree(): Promise<NativeWorkerResourceObservation> {
    const errors: unknown[] = [];
    // A pre-entry launcher failure cannot strand already entered descendants.
    try { await this.#launchers.drain(this.#options.drainTimeoutMs); }
    catch (error) { errors.push(error); }
    // Unknown/replaced groups are never adopted, killed or removed as owned work.
    this.#scope.verifyChildren(this.#record.topology.children, this.#record.phase === 'empty');
    try {
      if (this.#record.phase !== 'quiescing' && this.#record.phase !== 'empty') {
        const notLaunched = this.#record.phase === 'allocated' && !this.#started;
        this.#record = await this.#options.store.transition(this.#record, 'quiescing',
          notLaunched ? { diagnosis: 'WORKER_NATIVE_ALLOCATION_NOT_LAUNCHED' } : {});
      }
    } catch (error) { errors.push(error); }
    let observation: NativeWorkerResourceObservation | undefined;
    // Quota/fsync failure must not make identity-checked kernel drain unreachable.
    // Any failure still prevents finalization, deletion and reservation release.
    try { observation = await this.#scope.terminateAndDrain(this.#options.drainTimeoutMs, undefined, this.#record.workerCore?.settings.runtime.drain_poll_ms); }
    catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'WORKER_NATIVE_QUIESCENCE_INCOMPLETE');
    return observation!;
  }

  async #finish(): Promise<NativeWorkerResourceObservation> {
    // A concurrent fsync of the launch fence must settle before the terminal CAS.
    await this.#launch?.catch(() => undefined);
    await this.#childLaunches;
    try {
      const observation = await this.#drainOwnedSubtree();
      if (this.#record.finalObservation !== null && canonicalJson(this.#record.finalObservation) !== canonicalJson(observation)) {
        throw new Error('WORKER_NATIVE_TERMINAL_COUNTERS_CHANGED');
      }
      if (this.#record.phase !== 'empty' || this.#record.finalObservation === null) {
        // Persist the final kernel counters in the same fsynced state as the
        // empty phase. A crash after rmdir must not erase accounting evidence.
        this.#record = await this.#options.store.transition(this.#record, 'empty', { finalObservation: observation });
      }
      this.#scope.disposeChildren(this.#record.topology.children);
      this.#scope.dispose();
      this.#record = await this.#options.store.transition(this.#record, 'disposed');
      return observation;
    } catch (error) {
      try {
        if (!terminal(this.#record) && this.#record.phase !== 'unresolved' && this.#record.phase !== 'empty') {
          this.#record = await this.#options.store.transition(this.#record, 'unresolved', { diagnosis: diagnosis(error, this.#record) });
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
  #routingAuthority: NativeJournalSupervisor | undefined;
  #routingTransition = false;

  async withJournalRoutingFence<T>(operation: (authority: NativeJournalSupervisor) => Promise<T>): Promise<T> {
    if (this.#closed || this.#routingTransition || this.#allocations.size || this.#admitting.size || this.#leases.size || !this.#routingAuthority) throw new Error('WORKER_NATIVE_JOURNAL_ROUTING_CONFLICT');
    this.#routingTransition = true;
    try { return await operation(this.#routingAuthority); } finally {this.#routingTransition = false;}
  }
  readonly #options: NativeWorkerOwnershipOptions;
  readonly #leases = new Set<NativeWorkerOwnershipLease>();
  readonly #admitting = new Set<string>();
  readonly #allocations = new Set<Promise<NativeWorkerOwnershipLease>>();
  readonly #pool: NativeWorkerResourcePool;
  #closed = false;

  private constructor(options: NativeWorkerOwnershipOptions) {
    this.#options = options;
    this.#pool = new NativeWorkerResourcePool(options.cgroupRoot, options.poolLimits, options.maximumActiveScopes);
  }

  isReady(): boolean {
    if (!this.#closed) {
      try { this.#pool.verify(); } catch { this.#closed = true; }
    }
    return !this.#closed;
  }

  fenceAdmission(): void { this.#closed = true; }

  /** Startup-only gate after journal/cleanup recovery, not a readiness alias.
   * The lifetime supervisor lock is still held. No active allocation, retained
   * lease, unknown scope or populated aggregate may authorize a new boot.
   */
  async assertRecoveryQuiescent(): Promise<readonly WorkerOwnershipRecord[]> {
    if (this.#closed || this.#allocations.size || this.#admitting.size || this.#leases.size) {
      throw new Error('WORKER_NATIVE_RECOVERY_NOT_QUIESCENT');
    }
    this.#pool.verify();
    const records = await this.#options.store.records();
    if (records.some(record => !terminal(record)
      || (record.phase === 'disposed' && record.binding !== null && record.finalObservation?.populated !== false))) {
      throw new Error('WORKER_NATIVE_RECOVERY_ACCOUNTING_INCOMPLETE');
    }
    if (NativeWorkerResourceScope.inventory(this.#options.cgroupRoot).length
      || observeNativeWorkerResources(this.#options.cgroupRoot).populated) {
      throw new Error('WORKER_NATIVE_RECOVERY_NOT_QUIESCENT');
    }
    this.#pool.verify();
    if (this.#closed || this.#allocations.size || this.#admitting.size || this.#leases.size) {
      throw new Error('WORKER_NATIVE_RECOVERY_NOT_QUIESCENT');
    }
    return records;
  }

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
    if (!Number.isSafeInteger(options.maximumActiveScopes) || options.maximumActiveScopes < 1) {
      throw new Error('WORKER_NATIVE_CAPACITY_INVALID');
    }
    const captured = { ...options, poolLimits: { ...options.poolLimits }, cgroupRoot: fs.realpathSync(options.cgroupRoot) };
    return captured.store.withSupervisor(async authority => {
      const owner = new NativeWorkerOwnership(captured);
      owner.#routingAuthority = authority;
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
    const releaseCapacity = this.#pool.reserve(requested);
    this.#admitting.add(key);
    let record: WorkerOwnershipRecord | undefined;
    try {
      record = await this.#options.store.reserve(captured);
      if (record.phase !== 'reserved' || record.topology.kind !== 'aggregate.v1') throw new Error('WORKER_NATIVE_IDENTITY_ALREADY_USED');
      await this.#options.bindOriginalBoot?.(record);
      if (this.#closed || this.#routingTransition) throw new Error('WORKER_NATIVE_ADMISSION_FENCED');
      const scope = NativeWorkerResourceScope.createReserved(this.#options.cgroupRoot, record.scopeName, requested);
      record = await this.#options.store.transition(record, 'allocated', { binding: scope.binding() });
      const lease = new NativeWorkerOwnershipLease(scope, record, this.#options, failed => {
        if (failed) this.#closed = true;
        else { this.#leases.delete(lease); releaseCapacity(); }
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
      // Only a confirmed unused identity may return its reservation here. Once
      // allocated, the lease releases it after durable quiescence and disposal.
      if (!record || record.phase !== 'allocated') releaseCapacity();
      throw error;
    } finally { this.#admitting.delete(key); }
  }

  async #recover(): Promise<void> {
    const records = await this.#options.store.records();
    await this.#options.verifyOriginalBoot?.(records);
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
      scope = NativeWorkerResourceScope.recoverEmptyReservation(this.#options.cgroupRoot, record.scopeName, record.topology.kind === 'aggregate.v1');
      record = await this.#options.store.transition(record, 'allocated', { binding: scope.binding() });
    } else {
      if (!record.binding) throw new Error('WORKER_NATIVE_UNBOUND_SCOPE_UNRESOLVED');
      scope = NativeWorkerResourceScope.reopen(this.#options.cgroupRoot, record.binding, record.topology.kind === 'aggregate.v1');
    }
    await new NativeWorkerOwnershipLease(scope, record, this.#options).finish();
  }
}
