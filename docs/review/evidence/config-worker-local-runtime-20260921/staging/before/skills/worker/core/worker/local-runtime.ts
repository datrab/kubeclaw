import {
  validatePipelineWorkerCoreContract,
  type WorkerAttemptEnvelopeV1,
  type WorkerHealthV1,
  type WorkerLifecycleState,
  type WorkerProfileV1,
  type WorkerProtocolVersion,
  type WorkerRegistrationV1,
} from '@kubeclaw/pipeline-worker-core-contract';

const MAX_TIMER_MS = 2_147_483_647;

export interface LocalWorkerRuntimeOptions {
  readonly workerId: string;
  readonly workerType: string;
  readonly coreVersion: string;
  readonly protocolVersions: readonly WorkerProtocolVersion[];
  readonly profiles: readonly WorkerProfileV1[];
  readonly capacity: number;
  readonly drainTimeoutMs?: number;
  readonly cancellationTimeoutMs?: number;
  readonly replayLimit?: number;
  readonly now?: () => Date;
}

interface ActiveAttempt {
  readonly controller: AbortController;
  readonly completion: Promise<unknown>;
}

interface ResolvedLocalWorkerRuntimeOptions {
  readonly workerId: string;
  readonly workerType: string;
  readonly coreVersion: string;
  readonly capacity: number;
  readonly drainTimeoutMs: number;
  readonly cancellationTimeoutMs: number;
  readonly replayLimit: number;
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function positiveTimer(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMER_MS) throw new Error(code);
  return value;
}

async function settleWithin(attempts: readonly Promise<unknown>[], timeoutMs: number): Promise<boolean> {
  if (attempts.length === 0) return true;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.allSettled(attempts).then(() => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function armClaimExpiry(deadline: number, controller: AbortController, now: () => Date): () => void {
  let timer: NodeJS.Timeout | undefined;
  const schedule = (): void => {
    const remaining = deadline - now().getTime();
    if (remaining <= 0) { controller.abort(new Error('WORKER_LOCAL_CLAIM_EXPIRED')); return; }
    timer = setTimeout(schedule, Math.min(remaining, MAX_TIMER_MS));
  };
  schedule();
  return () => { if (timer) clearTimeout(timer); };
}

export class LocalWorkerRuntime {
  readonly #options: Readonly<ResolvedLocalWorkerRuntimeOptions>;
  readonly #profiles: readonly WorkerProfileV1[];
  readonly #protocolVersions: readonly WorkerProtocolVersion[];
  readonly #profileDigests: ReadonlySet<string>;
  readonly #now: () => Date;
  readonly #startedAt: string;
  readonly #active = new Map<string, ActiveAttempt>();
  readonly #acceptedAttemptIds = new Map<string, number>();
  #state: WorkerLifecycleState = 'starting';
  #healthSequence = 0;
  #draining: Promise<void> | null = null;

  constructor(options: LocalWorkerRuntimeOptions) {
    if (!Number.isSafeInteger(options.capacity) || options.capacity < 1 || options.capacity > 4096) {
      throw new Error('WORKER_LOCAL_CAPACITY_INVALID');
    }
    const drainTimeoutMs = positiveTimer(options.drainTimeoutMs ?? 300_000, 'WORKER_LOCAL_DRAIN_TIMEOUT_INVALID');
    const cancellationTimeoutMs = positiveTimer(options.cancellationTimeoutMs ?? 30_000,
      'WORKER_LOCAL_CANCELLATION_TIMEOUT_INVALID');
    const replayLimit = options.replayLimit ?? 65_536;
    if (!Number.isSafeInteger(replayLimit) || replayLimit < 1 || replayLimit > 1_000_000) {
      throw new Error('WORKER_LOCAL_REPLAY_LIMIT_INVALID');
    }
    this.#profiles = freeze(structuredClone([...options.profiles]));
    this.#protocolVersions = freeze([...new Set(options.protocolVersions)].sort());
    this.#profileDigests = new Set(this.#profiles.map((profile) => profile.profileDigest));
    this.#now = options.now ?? (() => new Date());
    this.#startedAt = this.#now().toISOString();
    this.#options = freeze({ workerId: options.workerId, workerType: options.workerType,
      coreVersion: options.coreVersion, capacity: options.capacity, drainTimeoutMs, cancellationTimeoutMs, replayLimit });
    validatePipelineWorkerCoreContract('workerRegistration', this.registration());
  }

  get state(): WorkerLifecycleState { return this.#state; }

  markReady(): WorkerRegistrationV1 {
    if (this.#state !== 'starting') throw new Error(`WORKER_LOCAL_TRANSITION_INVALID:${this.#state}:ready`);
    this.#state = 'ready';
    return this.registration();
  }

  markUnhealthy(): WorkerHealthV1 {
    if (this.#state === 'stopped') throw new Error('WORKER_LOCAL_TRANSITION_INVALID:stopped:unhealthy');
    this.#state = 'unhealthy';
    return this.health();
  }

  registration(): WorkerRegistrationV1 {
    const registration = freeze({
      schemaVersion: 'worker-registration.v1' as const,
      workerId: this.#options.workerId,
      workerType: this.#options.workerType,
      coreVersion: this.#options.coreVersion,
      protocolVersions: [...this.#protocolVersions],
      profiles: structuredClone(this.#profiles) as WorkerProfileV1[],
      capacity: this.#capacity(),
      lifecycleState: this.#state,
      startedAt: this.#startedAt,
      sentAt: this.#now().toISOString(),
    });
    validatePipelineWorkerCoreContract('workerRegistration', registration);
    return registration;
  }

  health(): WorkerHealthV1 {
    const health = freeze({
      schemaVersion: 'worker-health.v1' as const,
      workerId: this.#options.workerId,
      sequence: this.#healthSequence++,
      lifecycleState: this.#state,
      capacity: this.#capacity(),
      activeAttemptIds: [...this.#active.keys()].sort(),
      sentAt: this.#now().toISOString(),
    });
    validatePipelineWorkerCoreContract('workerHealth', health);
    return health;
  }

  runAttempt<T>(envelope: WorkerAttemptEnvelopeV1, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.#state !== 'ready') throw new Error(`WORKER_LOCAL_NOT_READY:${this.#state}`);
    if (this.#active.size >= this.#options.capacity) throw new Error('WORKER_LOCAL_CAPACITY_EXHAUSTED');
    validatePipelineWorkerCoreContract('workerAttemptEnvelope', envelope);
    if (envelope.claim.workerId !== this.#options.workerId) throw new Error('WORKER_LOCAL_CLAIM_WORKER_MISMATCH');
    const now = this.#now().getTime();
    if (now >= Date.parse(envelope.queueDeadline)) throw new Error('WORKER_LOCAL_QUEUE_DEADLINE_EXPIRED');
    if (now < Date.parse(envelope.claim.claimedAt)) throw new Error('WORKER_LOCAL_CLAIM_NOT_ACTIVE');
    if (now >= Date.parse(envelope.claim.expiresAt)) throw new Error('WORKER_LOCAL_CLAIM_EXPIRED');
    if (!this.#protocolVersions.includes(envelope.protocolVersion)) throw new Error('WORKER_LOCAL_PROTOCOL_UNSUPPORTED');
    if (!this.#profileDigests.has(envelope.profile.profileDigest)) throw new Error('WORKER_LOCAL_PROFILE_UNSUPPORTED');
    for (const [attemptId, expiresAt] of this.#acceptedAttemptIds) {
      if (expiresAt <= now && !this.#active.has(attemptId)) this.#acceptedAttemptIds.delete(attemptId);
    }
    if (this.#acceptedAttemptIds.has(envelope.attemptId)) throw new Error('WORKER_LOCAL_ATTEMPT_DUPLICATE');
    if (this.#acceptedAttemptIds.size >= this.#options.replayLimit) {
      throw new Error('WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED');
    }
    this.#acceptedAttemptIds.set(envelope.attemptId, Date.parse(envelope.claim.expiresAt));
    const controller = new AbortController();
    const claimExpiresAt = Date.parse(envelope.claim.expiresAt);
    const queueDeadline = Date.parse(envelope.queueDeadline);
    const clearClaimExpiry = armClaimExpiry(claimExpiresAt, controller, this.#now);
    let resolveOperation!: (value: T | PromiseLike<T>) => void;
    let rejectOperation!: (reason?: unknown) => void;
    const operation = new Promise<T>((resolve, reject) => {
      resolveOperation = resolve;
      rejectOperation = reject;
    });
    const completion = operation.then((value) => {
      if (this.#now().getTime() >= claimExpiresAt) throw new Error('WORKER_LOCAL_CLAIM_EXPIRED');
      return value;
    }).finally(clearClaimExpiry);
    this.#active.set(envelope.attemptId, { controller, completion });
    try {
      // Use one authoritative start timestamp immediately before the callback.
      // The synchronous start also pins verified provider bytes before the
      // caller can replace installed package content.
      const startNow = this.#now().getTime();
      if (startNow >= queueDeadline) throw new Error('WORKER_LOCAL_QUEUE_DEADLINE_EXPIRED');
      if (startNow >= claimExpiresAt) throw new Error('WORKER_LOCAL_CLAIM_EXPIRED');
      resolveOperation(execute(controller.signal));
    } catch (error) {
      rejectOperation(error);
    }
    void completion.then(
      () => { this.#active.delete(envelope.attemptId); },
      () => { this.#active.delete(envelope.attemptId); },
    );
    return completion;
  }

  drain(): Promise<void> {
    this.#draining ??= this.#drainOnce();
    return this.#draining;
  }

  stop(): WorkerHealthV1 {
    if (this.#active.size > 0) throw new Error('WORKER_LOCAL_ACTIVE_ATTEMPTS');
    this.#state = 'stopped';
    return this.health();
  }

  #capacity() {
    return { total: this.#options.capacity, available: this.#options.capacity - this.#active.size,
      active: this.#active.size };
  }

  async #drainOnce(): Promise<void> {
    if (this.#state === 'stopped') return;
    this.#state = 'draining';
    const initial = [...this.#active.values()].map((attempt) => attempt.completion);
    if (!(await settleWithin(initial, this.#options.drainTimeoutMs))) {
      for (const attempt of this.#active.values()) attempt.controller.abort(new Error('WORKER_LOCAL_DRAIN_CANCELLED'));
      const cancelled = [...this.#active.values()].map((attempt) => attempt.completion);
      if (!(await settleWithin(cancelled, this.#options.cancellationTimeoutMs))) {
        this.#state = 'unhealthy';
        throw new Error('WORKER_LOCAL_DRAIN_TIMEOUT');
      }
    }
    this.#state = 'stopped';
  }
}
