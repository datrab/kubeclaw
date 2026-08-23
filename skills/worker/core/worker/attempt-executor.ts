import crypto from 'node:crypto';
import {
  validatePipelineWorkerCoreContract,
  type AttemptProgressEventV1,
  type JsonValue,
  type WorkerAttemptEnvelopeV1,
  type WorkerAttemptResultV1,
  type WorkerEvidenceRefV1,
  type WorkerLogPartV1,
  type WorkerResourceUseV1,
  type WorkerSpecialistResultV1,
  type WorkerAttemptLimitsV1,
} from '@kubeclaw/pipeline-worker-core-contract';
import { sha256Digest, sha256Text } from './digest.ts';

const MAX_ATTEMPT_ENVELOPE_BYTES = 16 * 1024 * 1024;
const MAX_ATTEMPT_LOG_BYTES = 16 * 1024 * 1024;
const MAX_ATTEMPT_LOG_PARTS = 10_000;
const MAX_ATTEMPT_VALUE_DEPTH = 64;
const MAX_ATTEMPT_VALUE_NODES = 100_000;

export interface WorkerAttemptOperationResult {
  readonly summary: string;
  readonly specialistResult: WorkerSpecialistResultV1;
  readonly evidence: readonly WorkerEvidenceRefV1[];
  readonly exitCode: number | null;
  readonly signal: string | null;
}

export interface WorkerAttemptEvidenceResult {
  readonly evidence: readonly WorkerEvidenceRefV1[];
  readonly error?: string;
}

export interface WorkerAttemptEvidenceContext {
  readonly attempt: WorkerAttemptEnvelopeV1;
  readonly state: WorkerAttemptResultV1['state'];
  readonly signal: AbortSignal;
}

export interface WorkerAttemptResultFinalizationContext {
  readonly attempt: WorkerAttemptEnvelopeV1;
  readonly evidence: readonly WorkerEvidenceRefV1[];
  readonly specialistResult: WorkerSpecialistResultV1;
  readonly signal: AbortSignal;
}

export interface WorkerAttemptOperationResources {
  readonly cpuTimeMs: number;
  readonly maximumMemoryBytes: number;
  readonly maximumProcesses: number;
}

export interface WorkerAttemptContext {
  readonly attempt: WorkerAttemptEnvelopeV1;
  readonly signal: AbortSignal;
  readonly log: (stream: 'stdout' | 'stderr' | 'system', text: string | Uint8Array) => void;
}

export interface WorkerAttemptOperation {
  /** Apply limits synchronously. Do not start specialist work here. */
  prepare(limits: WorkerAttemptLimitsV1): undefined;
  execute(context: WorkerAttemptContext): Promise<WorkerAttemptOperationResult>;
  terminate(): Promise<void>;
  measure(): Promise<WorkerAttemptOperationResources>;
  cleanup?(context: WorkerAttemptContext): Promise<void>;
  collectEvidence?(context: WorkerAttemptEvidenceContext): Promise<WorkerAttemptEvidenceResult>;
  /** Add evidence-derived facts before the terminal result becomes durable. */
  finalizeResult?(context: WorkerAttemptResultFinalizationContext): Promise<WorkerSpecialistResultV1>;
}

export interface WorkerAttemptExecutorOptions {
  readonly envelope: WorkerAttemptEnvelopeV1;
  readonly operation: WorkerAttemptOperation;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: AttemptProgressEventV1) => void | Promise<void>;
  readonly onLogPart?: (part: WorkerLogPartV1) => void | Promise<void>;
  readonly retainLogs?: boolean;
  readonly storeFullLog?: (attemptId: string, content: string) => Promise<WorkerEvidenceRefV1 | null>;
  readonly now?: () => Date;
  readonly id?: () => string;
  /** Local receipt namespace. This is not worker authentication. */
  readonly receiptNamespace?: string;
}

class AttemptFault extends Error {
  readonly state: Exclude<WorkerAttemptResultV1['state'], 'completed'>;
  readonly code: string;

  constructor(state: Exclude<WorkerAttemptResultV1['state'], 'completed'>, code: string, message = code) {
    super(message);
    this.name = 'AttemptFault';
    this.state = state;
    this.code = code;
  }
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function boundedText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' && value.length > 0 ? value : fallback;
  return text.slice(0, 4096).toWellFormed();
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function jsonStringBytes(value: string): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 0x22 || unit === 0x5c || unit === 0x08 || unit === 0x09 || unit === 0x0a
      || unit === 0x0c || unit === 0x0d) {
      bytes += 2;
    } else if (unit <= 0x1f) {
      bytes += 6;
    } else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else if (unit >= 0xd800 && unit <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += Buffer.byteLength(value[index]!);
    }
  }
  return bytes;
}

function preflightJson(value: unknown, byteLimit: number, prefix: string): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let bytes = 0;
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > MAX_ATTEMPT_VALUE_NODES) throw new Error(`${prefix}_NODE_LIMIT`);
    if (current.depth > MAX_ATTEMPT_VALUE_DEPTH) throw new Error(`${prefix}_DEPTH_LIMIT`);
    if (typeof current.value === 'string') bytes += jsonStringBytes(current.value);
    else if (current.value === null) bytes += 4;
    else if (typeof current.value === 'number' || typeof current.value === 'boolean') {
      const encoded = JSON.stringify(current.value);
      if (encoded === undefined) throw new Error(`${prefix}_TYPE_INVALID`);
      bytes += Buffer.byteLength(encoded);
    }
    else if (typeof current.value === 'object') {
      if (seen.has(current.value)) throw new Error(`${prefix}_CYCLE`);
      seen.add(current.value);
      if (Array.isArray(current.value)) {
        bytes += 2 + Math.max(0, current.value.length - 1);
        for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
      } else {
        const prototype = Object.getPrototypeOf(current.value);
        if (prototype !== Object.prototype && prototype !== null) throw new Error(`${prefix}_TYPE_INVALID`);
        const keys = Reflect.ownKeys(current.value);
        bytes += 2 + Math.max(0, keys.length - 1);
        for (const key of keys) {
          if (typeof key !== 'string') throw new Error(`${prefix}_TYPE_INVALID`);
          const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
          if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error(`${prefix}_TYPE_INVALID`);
          bytes += jsonStringBytes(key) + 1;
          pending.push({ value: descriptor.value, depth: current.depth + 1 });
        }
      }
    } else {
      throw new Error(`${prefix}_TYPE_INVALID`);
    }
    if (bytes > byteLimit) throw new Error(`${prefix}_BYTE_LIMIT`);
  }
}

function validateEnvelopeDigests(envelope: WorkerAttemptEnvelopeV1): void {
  validatePipelineWorkerCoreContract('workerAttemptEnvelope', envelope);
}

function receipt(namespace: string, nonce: string, resultDigest: string) {
  const receiptId = `receipt:${crypto.createHash('sha256').update(`${namespace}:${nonce}:${resultDigest}`).digest('hex')}`;
  return { receiptId, receiptDigest: sha256Digest({ namespace, receiptId, resultDigest }) };
}

function checkEvidence(evidence: readonly WorkerEvidenceRefV1[], envelope: WorkerAttemptEnvelopeV1): void {
  if (evidence.length > envelope.limits.evidenceFiles) throw new AttemptFault('errored', 'WORKER_EVIDENCE_FILE_LIMIT');
  const ids = new Set<string>();
  let total = 0;
  for (const item of evidence) {
    validatePipelineWorkerCoreContract('workerEvidenceRef', item);
    if (ids.has(item.evidenceId)) throw new AttemptFault('errored', 'WORKER_EVIDENCE_ID_DUPLICATE');
    ids.add(item.evidenceId);
    total += item.artifact.sizeBytes;
    if (total > envelope.limits.evidenceBytes) throw new AttemptFault('errored', 'WORKER_EVIDENCE_BYTE_LIMIT');
  }
}

export class WorkerAttemptExecutor {
  readonly #options: WorkerAttemptExecutorOptions;
  readonly #now: () => Date;
  readonly #id: () => string;
  #progressSequence = 0;
  #logSequence = 0;
  #execution: Promise<WorkerAttemptResultV1> | null = null;

  constructor(options: WorkerAttemptExecutorOptions) {
    preflightJson(options.envelope, MAX_ATTEMPT_ENVELOPE_BYTES, 'WORKER_ATTEMPT_INPUT');
    const envelope = freeze(structuredClone(options.envelope));
    validateEnvelopeDigests(envelope);
    if (envelope.limits.logBytes > MAX_ATTEMPT_LOG_BYTES) throw new Error('WORKER_LOG_LIMIT_INVALID');
    if (options.receiptNamespace !== undefined
      && (options.receiptNamespace.length === 0 || options.receiptNamespace.length > 4096
        || options.receiptNamespace !== options.receiptNamespace.toWellFormed())) {
      throw new Error('WORKER_RECEIPT_NAMESPACE_INVALID');
    }
    this.#options = { ...options, envelope };
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => crypto.randomUUID());
  }

  async execute(): Promise<WorkerAttemptResultV1> {
    this.#execution ??= this.#executeOnce();
    return this.#execution;
  }

  async #executeOnce(): Promise<WorkerAttemptResultV1> {
    const { envelope, operation } = this.#options;
    const started = this.#now();
    if (started.getTime() >= Date.parse(envelope.queueDeadline)) {
      // No operation is prepared or started after queue expiry. Zero resource
      // use is authoritative here; calling the adapter would violate that rule.
      return this.#result(started, started, new AttemptFault('interrupted', 'WORKER_QUEUE_DEADLINE_EXPIRED'), null, [], {
        logBytes: 0, resultBytes: 0, evidenceBytes: 0,
      }, { state: 'not_required', summary: null });
    }
    if (started.getTime() >= Date.parse(envelope.claim.expiresAt)) {
      // An expired claim owns no work. Do not touch the operation adapter.
      return this.#result(started, started, new AttemptFault('interrupted', 'WORKER_CLAIM_EXPIRED'), null, [], {
        logBytes: 0, resultBytes: 0, evidenceBytes: 0,
      }, { state: 'not_required', summary: null });
    }
    if (started.getTime() < Date.parse(envelope.claim.claimedAt)) {
      return this.#result(started, started, new AttemptFault('interrupted', 'WORKER_CLAIM_NOT_ACTIVE'), null, [], {
        logBytes: 0, resultBytes: 0, evidenceBytes: 0,
      }, { state: 'not_required', summary: null });
    }
    const requiredClaimWindow = envelope.limits.timeoutMs + (4 * envelope.limits.cleanupTimeoutMs);
    if (Date.parse(envelope.claim.expiresAt) - started.getTime() < requiredClaimWindow) {
      // The local executor cannot renew a claim. It starts only when the claim
      // covers execution, termination, cleanup, measurement, and log storage.
      return this.#result(started, started, new AttemptFault('interrupted', 'WORKER_CLAIM_WINDOW_INSUFFICIENT'), null, [], {
        logBytes: 0, resultBytes: 0, evidenceBytes: 0,
      }, { state: 'not_required', summary: null });
    }

    const controller = new AbortController();
    const logParts: WorkerLogPartV1[] = [];
    let logPartCount = 0;
    let logBytes = 0;
    let logClosed = false;
    let logFault: AttemptFault | null = null;
    let timedOut = false;
    let claimExpired = false;
    let timer: NodeJS.Timeout | undefined;
    let termination: Promise<string | null> | null = null;
    const terminate = (): Promise<string | null> => {
      termination ??= this.#terminate(operation, envelope.limits.cleanupTimeoutMs);
      return termination;
    };
    const abort = (): void => {
      controller.abort(this.#options.signal?.reason ?? new Error('WORKER_ATTEMPT_CANCELLED'));
      void terminate();
    };
    this.#options.signal?.addEventListener('abort', abort, { once: true });
    if (this.#options.signal?.aborted) abort();
    const log: WorkerAttemptContext['log'] = (stream, value) => {
      if (logClosed || logFault) return;
      const text = (typeof value === 'string' ? value : Buffer.from(value).toString('utf8')).toWellFormed();
      let offset = 0;
      do {
        if (logPartCount >= MAX_ATTEMPT_LOG_PARTS) {
          logFault = new AttemptFault('errored', 'WORKER_LOG_LIMIT');
          controller.abort(logFault);
          void terminate();
          return;
        }
        logPartCount += 1;
        let end = Math.min(offset + 65_536, text.length);
        if (end < text.length && end > offset && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end -= 1;
        const chunk = text.slice(offset, end);
        const rendered = `[${stream}] ${chunk}`;
        logBytes += Buffer.byteLength(rendered);
        if (logBytes > envelope.limits.logBytes) {
          logFault = new AttemptFault('errored', 'WORKER_LOG_LIMIT');
          controller.abort(logFault);
          void terminate();
          return;
        }
        if (this.#options.retainLogs === false) {
          offset = end;
          continue;
        }
        const part = freeze({
          schemaVersion: 'worker-log-part.v1' as const,
          protocolVersion: envelope.protocolVersion,
          attemptId: envelope.attemptId,
          claimId: envelope.claim.claimId,
          claimGeneration: envelope.claim.generation,
          workerId: envelope.claim.workerId,
          sequence: this.#logSequence++,
          stream,
          text: chunk,
          contentDigest: sha256Text(chunk),
          final: false,
          sentAt: this.#now().toISOString(),
        });
        validatePipelineWorkerCoreContract('workerLogPart', part);
        logParts.push(part);
        try {
          void Promise.resolve(this.#options.onLogPart?.(part)).catch(() => undefined);
        } catch {
          // Live delivery is best effort. The full log is stored before completion.
        }
        offset = end;
      } while (offset < text.length);
    };

    let operationResult: WorkerAttemptOperationResult | null = null;
    let fault: AttemptFault | null = null;
    let cleanup: WorkerAttemptResultV1['cleanup'] = { state: 'not_required', summary: null };
    const timeoutAt = started.getTime() + envelope.limits.timeoutMs;
    const claimExpiresAt = Date.parse(envelope.claim.expiresAt);
    const deadlineAt = Math.min(timeoutAt, claimExpiresAt);
    timer = setTimeout(() => {
      claimExpired = claimExpiresAt <= timeoutAt;
      timedOut = !claimExpired;
      controller.abort(new Error(claimExpired ? 'WORKER_CLAIM_EXPIRED' : 'WORKER_ATTEMPT_TIMEOUT'));
      void terminate();
    }, Math.max(1, deadlineAt - started.getTime()));
    const cancellation = new Promise<never>((_resolve, reject) => {
      const rejectCancellation = (): void => {
        if (logFault) reject(logFault);
        else if (claimExpired) reject(new AttemptFault('interrupted', 'WORKER_CLAIM_EXPIRED'));
        else if (timedOut) reject(new AttemptFault('timed_out', 'WORKER_ATTEMPT_TIMEOUT'));
        else reject(new AttemptFault('cancelled', 'WORKER_ATTEMPT_CANCELLED'));
      };
      controller.signal.addEventListener('abort', rejectCancellation, { once: true });
    });
    try {
      if (controller.signal.aborted) throw new AttemptFault('cancelled', 'WORKER_ATTEMPT_CANCELLED');
      this.#progress('accepted', 'Attempt accepted.');
      this.#progress('started', 'Attempt started.');
      const preparationResult = operation.prepare(envelope.limits) as unknown;
      if (preparationResult !== undefined) {
        if ((typeof preparationResult === 'object' && preparationResult !== null)
          || typeof preparationResult === 'function') {
          try {
            const then = Reflect.get(preparationResult, 'then');
            if (typeof then === 'function') void Promise.resolve(preparationResult).catch(() => undefined);
          } catch {
            // The invalid return is rejected below. A hostile then getter cannot escape.
          }
        }
        throw new AttemptFault('errored', 'WORKER_PREPARATION_INVALID');
      }
      const preparedAt = this.#now().getTime();
      const queueDeadlineAt = Date.parse(envelope.queueDeadline);
      const firstDeadlineAt = Math.min(queueDeadlineAt, timeoutAt, claimExpiresAt);
      if (preparedAt >= firstDeadlineAt) {
        if (queueDeadlineAt === firstDeadlineAt) {
          throw new AttemptFault('interrupted', 'WORKER_QUEUE_DEADLINE_EXPIRED');
        }
        claimExpired = claimExpiresAt === firstDeadlineAt;
        timedOut = timeoutAt === firstDeadlineAt && !claimExpired;
        controller.abort(new Error(claimExpired ? 'WORKER_CLAIM_EXPIRED' : 'WORKER_ATTEMPT_TIMEOUT'));
        await cancellation;
      }
      const remainingExecutionMs = timeoutAt - preparedAt;
      if (claimExpiresAt - preparedAt < remainingExecutionMs + (4 * envelope.limits.cleanupTimeoutMs)) {
        throw new AttemptFault('interrupted', 'WORKER_CLAIM_WINDOW_INSUFFICIENT');
      }
      if (controller.signal.aborted) await cancellation;
      operationResult = await Promise.race([operation.execute({ attempt: envelope, signal: controller.signal, log }), cancellation]);
      const operationCompletedAt = this.#now().getTime();
      if (operationCompletedAt >= claimExpiresAt && claimExpiresAt <= timeoutAt) {
        throw new AttemptFault('interrupted', 'WORKER_CLAIM_EXPIRED');
      }
      if (operationCompletedAt >= timeoutAt) throw new AttemptFault('timed_out', 'WORKER_ATTEMPT_TIMEOUT');
      if (logFault) throw logFault;
      preflightJson(operationResult.specialistResult, envelope.limits.resultBytes, 'WORKER_RESULT');
      const resultBytes = Buffer.byteLength(JSON.stringify(operationResult.specialistResult));
      if (resultBytes > envelope.limits.resultBytes) throw new AttemptFault('errored', 'WORKER_RESULT_LIMIT');
      checkEvidence(operationResult.evidence, envelope);
      operationResult = freeze(structuredClone(operationResult));
      this.#progress('running', 'Attempt operation completed.');
    } catch (error) {
      operationResult = null;
      fault = error instanceof AttemptFault
        ? error
        : error instanceof Error && /^WORKER_[A-Z0-9_]+$/.test(error.message)
          ? new AttemptFault('errored', error.message)
        : new AttemptFault(controller.signal.aborted ? (timedOut ? 'timed_out' : 'cancelled') : 'errored',
          controller.signal.aborted ? (timedOut ? 'WORKER_ATTEMPT_TIMEOUT' : 'WORKER_ATTEMPT_CANCELLED') : 'WORKER_ATTEMPT_ERROR', detail(error));
      const terminationError = await terminate();
      if (terminationError) fault = new AttemptFault('errored', 'WORKER_TERMINATION_FAILED', terminationError);
    } finally {
      if (timer) clearTimeout(timer);
    }

    let measured: WorkerAttemptOperationResources = { cpuTimeMs: 0, maximumMemoryBytes: 0, maximumProcesses: 0 };
    let measurementsValid = false;
    let measurementTimer: NodeJS.Timeout | undefined;
    try {
      measured = await Promise.race([
        Promise.resolve().then(() => operation.measure()),
        new Promise<never>((_resolve, reject) => {
          measurementTimer = setTimeout(() => reject(new Error('WORKER_RESOURCE_MEASUREMENT_TIMEOUT')),
            envelope.limits.cleanupTimeoutMs);
        }),
      ]);
      measurementsValid = measured !== null && typeof measured === 'object'
        && Number.isSafeInteger(measured.cpuTimeMs) && Number.isSafeInteger(measured.maximumMemoryBytes)
        && Number.isSafeInteger(measured.maximumProcesses) && measured.cpuTimeMs >= 0
        && measured.maximumMemoryBytes >= 0 && measured.maximumProcesses >= 0;
    } catch {
      measurementsValid = false;
    } finally {
      if (measurementTimer) clearTimeout(measurementTimer);
    }
    if (!measurementsValid) {
      fault = new AttemptFault('errored', 'WORKER_RESOURCE_MEASUREMENT_INVALID');
    } else {
      measured = freeze(structuredClone(measured));
    }
    if (!fault && measured.cpuTimeMs > envelope.limits.cpuMillis) {
      fault = new AttemptFault('errored', 'WORKER_CPU_LIMIT');
    }
    if (!fault && measured.maximumMemoryBytes > envelope.limits.memoryBytes) {
      fault = new AttemptFault('errored', 'WORKER_MEMORY_LIMIT');
    }
    if (!fault && measured.maximumProcesses > envelope.limits.processes) {
      fault = new AttemptFault('errored', 'WORKER_PROCESS_LIMIT');
    }

    if (operation.cleanup) {
      this.#progress('cleanup_started', 'Attempt cleanup started.');
      const cleanupController = new AbortController();
      const abortCleanup = (): void => cleanupController.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', abortCleanup, { once: true });
      if (controller.signal.aborted) abortCleanup();
      let cleanupTimer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          operation.cleanup({ attempt: envelope, signal: cleanupController.signal, log }),
          new Promise<never>((_resolve, reject) => {
            cleanupTimer = setTimeout(() => {
              cleanupController.abort(new Error('WORKER_CLEANUP_TIMEOUT'));
              reject(new AttemptFault('errored', 'WORKER_CLEANUP_TIMEOUT'));
            }, envelope.limits.cleanupTimeoutMs);
          }),
        ]);
        cleanup = { state: 'completed', summary: null };
        this.#progress('cleanup_completed', 'Attempt cleanup completed.');
      } catch (error) {
        const terminationError = await terminate();
        const message = detail(error);
        cleanup = { state: 'failed', summary: message };
        fault = new AttemptFault('errored', terminationError ? 'WORKER_TERMINATION_FAILED' : 'WORKER_CLEANUP_FAILED',
          terminationError ?? message);
      } finally {
        if (cleanupTimer) clearTimeout(cleanupTimer);
        controller.signal.removeEventListener('abort', abortCleanup);
        cleanupController.abort(new Error('WORKER_CLEANUP_COMPLETE'));
      }
    }

    if (logFault) fault = logFault;

    // The terminal log snapshot is authoritative. Ignore delayed stream
    // callbacks after this point so live delivery and durable evidence agree.
    logClosed = true;
    if (this.#options.retainLogs !== false && this.#options.onLogPart) {
      const finalPart = freeze({
        schemaVersion: 'worker-log-part.v1' as const,
        protocolVersion: envelope.protocolVersion,
        attemptId: envelope.attemptId,
        claimId: envelope.claim.claimId,
        claimGeneration: envelope.claim.generation,
        workerId: envelope.claim.workerId,
        sequence: this.#logSequence++,
        stream: 'system' as const,
        text: '',
        contentDigest: sha256Text(''),
        final: true,
        sentAt: this.#now().toISOString(),
      });
      validatePipelineWorkerCoreContract('workerLogPart', finalPart);
      try {
        void Promise.resolve(this.#options.onLogPart(finalPart)).catch(() => undefined);
      } catch {
        // The terminal result remains authoritative when live delivery fails.
      }
    }
    const fullLog = logParts.map((part) => `[${part.stream}] ${part.text}`).join('');
    let evidence = [...(operationResult?.evidence ?? [])];
    if (operation.collectEvidence) {
      const evidenceController = new AbortController();
      let evidenceTimer: NodeJS.Timeout | undefined;
      try {
        const collected = await Promise.race([
          operation.collectEvidence({
            attempt: envelope,
            state: fault?.state ?? 'completed',
            signal: evidenceController.signal,
          }),
          new Promise<never>((_resolve, reject) => {
            evidenceTimer = setTimeout(() => {
              evidenceController.abort(new Error('WORKER_EVIDENCE_COLLECTION_TIMEOUT'));
              reject(new Error('WORKER_EVIDENCE_COLLECTION_TIMEOUT'));
            }, envelope.limits.cleanupTimeoutMs);
          }),
        ]);
        const candidateEvidence = [...evidence, ...collected.evidence];
        checkEvidence(candidateEvidence, envelope);
        evidence = candidateEvidence;
        if (collected.error) {
          fault = new AttemptFault('errored', 'WORKER_EVIDENCE_COLLECTION_FAILED', collected.error);
        }
      } catch (error) {
        fault = error instanceof AttemptFault
          ? error
          : new AttemptFault('errored', 'WORKER_EVIDENCE_COLLECTION_FAILED', detail(error));
      } finally {
        if (evidenceTimer) clearTimeout(evidenceTimer);
        evidenceController.abort(new Error('WORKER_EVIDENCE_COLLECTION_COMPLETE'));
      }
    }
    if (fullLog) {
      try {
        if (!this.#options.storeFullLog) throw new Error('WORKER_FULL_LOG_STORE_REQUIRED');
        const fullLogBytes = Buffer.byteLength(fullLog);
        const existingEvidenceBytes = evidence.reduce((sum, item) => sum + item.artifact.sizeBytes, 0);
        if (evidence.length + 1 > envelope.limits.evidenceFiles) throw new Error('WORKER_EVIDENCE_FILE_LIMIT');
        if (existingEvidenceBytes + fullLogBytes > envelope.limits.evidenceBytes) {
          throw new Error('WORKER_EVIDENCE_BYTE_LIMIT');
        }
        let storageTimer: NodeJS.Timeout | undefined;
        const stored = await Promise.race([
          this.#options.storeFullLog(envelope.attemptId, fullLog),
          new Promise<never>((_resolve, reject) => {
            storageTimer = setTimeout(() => reject(new Error('WORKER_LOG_STORE_TIMEOUT')),
              envelope.limits.cleanupTimeoutMs);
          }),
        ]).finally(() => { if (storageTimer) clearTimeout(storageTimer); });
        if (!stored) throw new Error('WORKER_FULL_LOG_STORE_REQUIRED');
        if (stored.artifact.contentDigest !== sha256Text(fullLog)
          || stored.artifact.sizeBytes !== fullLogBytes) {
          throw new Error('WORKER_FULL_LOG_INTEGRITY_MISMATCH');
        }
        const candidateEvidence = [...evidence, stored];
        checkEvidence(candidateEvidence, envelope);
        evidence = candidateEvidence;
      } catch (error) {
        fault ??= new AttemptFault('errored', 'WORKER_LOG_STORE_FAILED', detail(error));
      }
    }
    if (!fault && operationResult && operation.finalizeResult) {
      const finalizationController = new AbortController();
      const abortFinalization = (): void => finalizationController.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', abortFinalization, { once: true });
      if (controller.signal.aborted) abortFinalization();
      let finalizationTimer: NodeJS.Timeout | undefined;
      try {
        const specialistResult = await Promise.race([
          operation.finalizeResult({
            attempt: envelope,
            evidence: freeze(structuredClone(evidence)),
            specialistResult: operationResult.specialistResult,
            signal: finalizationController.signal,
          }),
          new Promise<never>((_resolve, reject) => {
            finalizationTimer = setTimeout(() => {
              finalizationController.abort(new Error('WORKER_RESULT_FINALIZATION_TIMEOUT'));
              reject(new Error('WORKER_RESULT_FINALIZATION_TIMEOUT'));
            }, envelope.limits.cleanupTimeoutMs);
          }),
        ]);
        preflightJson(specialistResult, envelope.limits.resultBytes, 'WORKER_RESULT');
        const finalizedBytes = Buffer.byteLength(JSON.stringify(specialistResult));
        if (finalizedBytes > envelope.limits.resultBytes) throw new Error('WORKER_RESULT_LIMIT');
        operationResult = freeze({ ...operationResult, specialistResult: structuredClone(specialistResult) });
      } catch (error) {
        fault = new AttemptFault('errored', 'WORKER_RESULT_FINALIZATION_FAILED', detail(error));
      } finally {
        if (finalizationTimer) clearTimeout(finalizationTimer);
        controller.signal.removeEventListener('abort', abortFinalization);
        finalizationController.abort(new Error('WORKER_RESULT_FINALIZATION_COMPLETE'));
      }
    }
    this.#options.signal?.removeEventListener('abort', abort);
    if (this.#options.signal?.aborted) {
      const terminationError = await terminate();
      if (terminationError) {
        fault = new AttemptFault('errored', 'WORKER_TERMINATION_FAILED', terminationError);
      } else {
        fault ??= new AttemptFault('cancelled', 'WORKER_ATTEMPT_CANCELLED');
      }
    } else if (!fault && controller.signal.aborted) {
      fault = new AttemptFault('cancelled', 'WORKER_ATTEMPT_CANCELLED');
    }
    const completed = this.#now();
    const resultBytes = operationResult ? Buffer.byteLength(JSON.stringify(operationResult.specialistResult)) : 0;
    return this.#result(started, completed, fault, operationResult, evidence, {
      ...(measurementsValid ? measured : {}),
      logBytes,
      resultBytes,
      evidenceBytes: evidence.reduce((sum, item) => sum + item.artifact.sizeBytes, 0),
    }, cleanup);
  }

  #progress(state: AttemptProgressEventV1['state'], message: string): void {
    if (!this.#options.onProgress) return;
    const { envelope } = this.#options;
    const event = freeze({
      schemaVersion: 'attempt-progress-event.v1' as const,
      protocolVersion: envelope.protocolVersion,
      attemptId: envelope.attemptId,
      claimId: envelope.claim.claimId,
      claimGeneration: envelope.claim.generation,
      workerId: envelope.claim.workerId,
      sequence: this.#progressSequence++,
      state,
      message,
      progressPercent: null,
      details: {} as Record<string, JsonValue>,
      sentAt: this.#now().toISOString(),
    });
    validatePipelineWorkerCoreContract('attemptProgressEvent', event);
    try {
      void Promise.resolve(this.#options.onProgress(event)).catch(() => undefined);
    } catch {
      // Progress is best effort. The terminal result is authoritative.
    }
  }

  async #terminate(operation: WorkerAttemptOperation, timeoutMs: number): Promise<string | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => operation.terminate()).then(() => null, (error: unknown) => detail(error)),
        new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve('WORKER_TERMINATION_TIMEOUT'), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #result(started: Date, completed: Date, fault: AttemptFault | null, operationResult: WorkerAttemptOperationResult | null,
    evidence: readonly WorkerEvidenceRefV1[], resources: WorkerResourceUseV1,
    cleanup: WorkerAttemptResultV1['cleanup']): WorkerAttemptResultV1 {
    const { envelope } = this.#options;
    const finalCompleted = completed.getTime() < started.getTime() ? started : completed;
    const unsigned = {
      schemaVersion: 'worker-attempt-result.v1' as const,
      protocolVersion: envelope.protocolVersion,
      attemptId: envelope.attemptId,
      claimId: envelope.claim.claimId,
      claimGeneration: envelope.claim.generation,
      workerId: envelope.claim.workerId,
      state: fault?.state ?? 'completed' as const,
      startedAt: started.toISOString(),
      completedAt: finalCompleted.toISOString(),
      durationMs: Math.max(0, finalCompleted.getTime() - started.getTime()),
      summary: boundedText(fault?.message ?? operationResult?.summary, 'Attempt completed.'),
      specialistResult: fault ? null : operationResult?.specialistResult ?? null,
      error: fault ? { code: fault.code, message: boundedText(fault.message, fault.code) } : null,
      evidence: [...evidence],
      resources,
      cleanup: {
        state: cleanup.state,
        summary: cleanup.summary === null ? null : boundedText(cleanup.summary, 'Cleanup failed.'),
      },
      exitCode: fault ? null : operationResult?.exitCode ?? null,
      signal: fault ? null : (typeof operationResult?.signal === 'string' && operationResult.signal.length > 0
        ? operationResult.signal.slice(0, 4096).toWellFormed() : null),
    };
    let resultDigest: string;
    try {
      resultDigest = sha256Digest(unsigned);
    } catch {
      if (fault?.code === 'WORKER_OPERATION_RESULT_INVALID') throw new Error('WORKER_TERMINAL_RESULT_INVALID');
      return this.#result(started, completed,
        new AttemptFault('errored', 'WORKER_OPERATION_RESULT_INVALID',
          'Specialist operation returned a result that cannot be canonically hashed.'),
        null, [], {
          logBytes: resources.logBytes,
          resultBytes: 0,
          evidenceBytes: 0,
        }, cleanup);
    }
    // This local receipt detects accidental duplication or mutation. The
    // authenticated Nova-worker transport required by D-103 binds identity.
    const namespace = this.#options.receiptNamespace ?? `worker:${envelope.claim.workerId}`;
    const result: WorkerAttemptResultV1 = {
      ...unsigned,
      resultDigest,
      receipt: receipt(namespace, this.#id(), resultDigest),
    };
    try {
      validatePipelineWorkerCoreContract('workerAttemptResult', result);
      return freeze(result);
    } catch (error) {
      if (fault?.code === 'WORKER_OPERATION_RESULT_INVALID') throw error;
      return this.#result(started, completed,
        new AttemptFault('errored', 'WORKER_OPERATION_RESULT_INVALID', 'Specialist operation returned an invalid result.'),
        null, [], {
          logBytes: resources.logBytes,
          resultBytes: 0,
          evidenceBytes: 0,
        }, cleanup.state === 'failed'
          ? { state: 'failed', summary: boundedText(cleanup.summary, 'Cleanup failed.') }
          : cleanup);
    }
  }
}
