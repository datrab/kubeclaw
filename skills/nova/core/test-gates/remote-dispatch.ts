import crypto from 'node:crypto';
import type {
  RemotePlanJobV1,
  RemotePlanStatusV1,
  ResolvedTestPlanV1,
  RemotePlanResultV1,
  SourceSnapshotV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import {
  remotePlanJobDigest,
  remotePlanJobId,
  repositoryArchive,
  repositoryArchiveBytes,
  validatePipelineTestGateContract,
} from '@kubeclaw/pipeline-test-gate-contract';
import {
  FileDurableBlobStore,
  FileDurableRecordStore,
  type DurableRecordLimits,
} from '@kubeclaw/plugin-foundation/observability/durable-records';

interface StoredRemotePlanJob {
  readonly schemaVersion: 'nova-remote-plan-dispatch.v1';
  readonly job: RemotePlanJobV1;
}

export interface RemotePlanJobInput {
  readonly idempotencyKey: string;
  readonly plan: ResolvedTestPlanV1;
  readonly pipelineStageId: string;
  readonly repositoryArchive: Uint8Array;
  readonly sourceSnapshot: SourceSnapshotV1;
  readonly grants: ReadonlyMap<string, readonly string[]>;
  readonly maximumConcurrency: number;
  readonly submittedAt: string;
}

export function createRemotePlanJob(input: RemotePlanJobInput): RemotePlanJobV1 {
  const grants = Object.fromEntries(input.plan.nodes.map((node) => [
    node.id,
    [...(input.grants.get(node.id) ?? [])].sort(),
  ]));
  const unsigned = {
    schemaVersion: 'buster-plan-job.v1' as const,
    jobId: remotePlanJobId(input.idempotencyKey),
    idempotencyKey: input.idempotencyKey,
    pipelineStageId: input.pipelineStageId,
    plan: structuredClone(input.plan),
    sourceSnapshot: structuredClone(input.sourceSnapshot),
    repositoryArchive: repositoryArchive(input.repositoryArchive),
    grants,
    maximumConcurrency: input.maximumConcurrency,
    submittedAt: input.submittedAt,
  };
  const job: RemotePlanJobV1 = { ...unsigned, requestDigest: remotePlanJobDigest(unsigned) };
  validatePipelineTestGateContract('remotePlanJob', job);
  return Object.freeze(job);
}

export class FileNovaRemotePlanStore {
  readonly #records: FileDurableRecordStore;
  readonly #blobs: FileDurableBlobStore;
  readonly #maximumArchiveBytes: number;

  constructor(root: string, options: {
    readonly recordLimits: DurableRecordLimits;
    readonly maximumArchiveBytes: number;
    readonly maximumArchiveStoreBytes: number;
  }) {
    if (!Number.isSafeInteger(options.maximumArchiveBytes) || options.maximumArchiveBytes < 1) {
      throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_LIMIT_INVALID');
    }
    this.#records = new FileDurableRecordStore(root, options.recordLimits);
    this.#blobs = new FileDurableBlobStore(root, options.maximumArchiveStoreBytes);
    this.#maximumArchiveBytes = options.maximumArchiveBytes;
  }

  async persistBeforeDispatch(job: RemotePlanJobV1): Promise<RemotePlanJobV1> {
    const maximumEncodedBytes = Math.ceil(this.#maximumArchiveBytes / 3) * 4;
    if (
      job.repositoryArchive.sizeBytes > this.#maximumArchiveBytes
      || job.repositoryArchive.data.length > maximumEncodedBytes
    ) throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED');
    validatePipelineTestGateContract('remotePlanJob', job);
    const archive = repositoryArchiveBytes(job.repositoryArchive);
    if (archive.byteLength > this.#maximumArchiveBytes) throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED');
    const payload: StoredRemotePlanJob = {
      schemaVersion: 'nova-remote-plan-dispatch.v1',
      job: structuredClone(job),
    };
    await this.#records.append('remote-plan-jobs', job.idempotencyKey, payload);
    const stored = await this.#blobs.put(archive);
    if (stored.digest !== job.repositoryArchive.contentDigest || stored.sizeBytes !== archive.byteLength) {
      throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_STORE_MISMATCH');
    }
    return this.load(job.jobId);
  }

  async load(jobId: string): Promise<RemotePlanJobV1> {
    const records = await this.#records.read<StoredRemotePlanJob>('remote-plan-jobs');
    const payload = records.find((record) => record.payload.job.jobId === jobId)?.payload;
    if (!payload || payload.schemaVersion !== 'nova-remote-plan-dispatch.v1') {
      throw new Error('NOVA_REMOTE_PLAN_JOB_NOT_FOUND');
    }
    const recordedArchive = repositoryArchiveBytes(payload.job.repositoryArchive);
    await this.#blobs.put(recordedArchive);
    const archive = await this.#blobs.get(payload.job.repositoryArchive.contentDigest);
    if (archive.byteLength > this.#maximumArchiveBytes) throw new Error('NOVA_REMOTE_PLAN_ARCHIVE_SIZE_EXCEEDED');
    const job: RemotePlanJobV1 = {
      ...structuredClone(payload.job),
      repositoryArchive: { ...payload.job.repositoryArchive, data: archive.toString('base64') },
    };
    validatePipelineTestGateContract('remotePlanJob', job);
    return Object.freeze(job);
  }
}

export interface RemotePlanTransport {
  submit(job: RemotePlanJobV1, signal?: AbortSignal): Promise<RemotePlanStatusV1>;
  status(jobId: string, signal?: AbortSignal): Promise<RemotePlanStatusV1>;
  cancel(jobId: string, signal?: AbortSignal): Promise<RemotePlanStatusV1>;
}

export interface RemotePlanEvidenceTransport {
  evidence(jobId: string, contentDigest: string, maximumBytes: number, signal?: AbortSignal): Promise<Buffer>;
}

export interface RemotePlanResultTransport {
  result(jobId: string, contentDigest: string, maximumBytes: number, signal?: AbortSignal): Promise<RemotePlanResultV1>;
}

export class RemotePlanTransportError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'RemotePlanTransportError';
    this.retryable = retryable;
  }
}

async function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('NOVA_REMOTE_PLAN_CANCELLED');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('NOVA_REMOTE_PLAN_CANCELLED'));
    }, { once: true });
  });
}

function deadlineSignal(deadline: number, caller?: AbortSignal): AbortSignal {
  const remaining = Math.max(1, deadline - Date.now());
  const timeout = AbortSignal.timeout(remaining);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

export class NovaRemotePlanDispatcher {
  readonly #store: FileNovaRemotePlanStore;
  readonly #transport: RemotePlanTransport;
  readonly #pollMilliseconds: number;

  constructor(options: {
    readonly store: FileNovaRemotePlanStore;
    readonly transport: RemotePlanTransport;
    readonly pollMilliseconds: number;
  }) {
    if (!Number.isSafeInteger(options.pollMilliseconds) || options.pollMilliseconds < 10) {
      throw new Error('NOVA_REMOTE_PLAN_POLL_INVALID');
    }
    this.#store = options.store;
    this.#transport = options.transport;
    this.#pollMilliseconds = options.pollMilliseconds;
  }

  async dispatch(job: RemotePlanJobV1, options: {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<RemotePlanStatusV1> {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new Error('NOVA_REMOTE_PLAN_TIMEOUT_INVALID');
    }
    const stored = await this.#store.persistBeforeDispatch(job);
    const deadline = Date.now() + options.timeoutMs;
    let status: RemotePlanStatusV1 | null = null;
    try { for (;;) {
      if (status === null) {
        try { status = await this.#transport.submit(stored, deadlineSignal(deadline, options.signal)); }
        catch (error) {
          if (!(error instanceof RemotePlanTransportError) || !error.retryable) throw error;
          try { status = await this.#transport.status(stored.jobId, deadlineSignal(deadline, options.signal)); }
          catch (statusError) {
            const absent = statusError instanceof RemotePlanTransportError
              && statusError.message.startsWith('NOVA_REMOTE_PLAN_HTTP_404:');
            if (!absent && (!(statusError instanceof RemotePlanTransportError) || !statusError.retryable)) {
              throw statusError;
            }
          }
          if (status === null) {
            if (Date.now() >= deadline) throw new Error('NOVA_REMOTE_PLAN_TIMEOUT');
            await abortableDelay(Math.min(this.#pollMilliseconds, Math.max(1, deadline - Date.now())), options.signal);
            continue;
          }
        }
      }
      validatePipelineTestGateContract('remotePlanStatus', status);
      if (status.jobId !== stored.jobId || status.requestDigest !== stored.requestDigest) {
        throw new Error('NOVA_REMOTE_PLAN_STATUS_IDENTITY_MISMATCH');
      }
      if (['completed', 'failed', 'cancelled'].includes(status.state)) return status;
      if (options.signal?.aborted) {
        await this.#transport.cancel(stored.jobId, AbortSignal.timeout(10_000)).catch(() => undefined);
        throw new Error('NOVA_REMOTE_PLAN_CANCELLED');
      }
      if (Date.now() >= deadline) {
        await this.#transport.cancel(stored.jobId, AbortSignal.timeout(10_000)).catch(() => undefined);
        throw new Error('NOVA_REMOTE_PLAN_TIMEOUT');
      }
      await abortableDelay(Math.min(this.#pollMilliseconds, Math.max(1, deadline - Date.now())), options.signal);
      try { status = await this.#transport.status(stored.jobId, deadlineSignal(deadline, options.signal)); }
      catch (error) {
        if (!(error instanceof RemotePlanTransportError) || !error.retryable) throw error;
        status = null;
      }
    } } catch (error) {
      if (options.signal?.aborted) {
        await this.#transport.cancel(stored.jobId, AbortSignal.timeout(10_000)).catch(() => undefined);
        throw new Error('NOVA_REMOTE_PLAN_CANCELLED', { cause: error });
      }
      throw error;
    }
  }
}

export class HttpRemotePlanTransport implements RemotePlanTransport {
  readonly #endpoint: string;
  readonly #token: string;
  readonly #maximumResponseBytes: number;
  readonly #maximumResultBytes: number;

  constructor(options: { readonly endpoint: string; readonly token: string; readonly maximumResponseBytes: number;
    readonly maximumResultBytes?: number }) {
    const endpoint = new URL(options.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('NOVA_REMOTE_PLAN_ENDPOINT_INVALID');
    }
    if (options.token.length < 32) throw new Error('NOVA_REMOTE_PLAN_TOKEN_INVALID');
    if (!Number.isSafeInteger(options.maximumResponseBytes) || options.maximumResponseBytes < 1) {
      throw new Error('NOVA_REMOTE_PLAN_RESPONSE_LIMIT_INVALID');
    }
    this.#endpoint = endpoint.href.replace(/\/+$/u, '');
    this.#token = options.token;
    this.#maximumResponseBytes = options.maximumResponseBytes;
    this.#maximumResultBytes = options.maximumResultBytes ?? options.maximumResponseBytes;
    if (!Number.isSafeInteger(this.#maximumResultBytes) || this.#maximumResultBytes < 1) {
      throw new Error('NOVA_REMOTE_RESULT_LIMIT_INVALID');
    }
  }

  async #request(method: string, suffix: string, body?: unknown, signal?: AbortSignal): Promise<RemotePlanStatusV1> {
    let response: Response;
    try {
      response = await fetch(`${this.#endpoint}${suffix}`, {
        method,
        headers: { authorization: `Bearer ${this.#token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      throw new RemotePlanTransportError('NOVA_REMOTE_PLAN_NETWORK_ERROR', true, error);
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > this.#maximumResponseBytes) {
      throw new Error('NOVA_REMOTE_PLAN_RESPONSE_SIZE_EXCEEDED');
    }
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (reader) {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        const bytes = Buffer.from(part.value);
        total += bytes.byteLength;
        if (total > this.#maximumResponseBytes) {
          await reader.cancel();
          throw new RemotePlanTransportError('NOVA_REMOTE_PLAN_RESPONSE_SIZE_EXCEEDED', false);
        }
        chunks.push(bytes);
      }
    }
    const bytes = Buffer.concat(chunks);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')); }
    catch (error) { throw new Error('NOVA_REMOTE_PLAN_RESPONSE_INVALID', { cause: error }); }
    if (!response.ok) {
      const message = parsed && typeof parsed === 'object' && 'error' in parsed ? String(parsed.error) : response.statusText;
      throw new RemotePlanTransportError(
        `NOVA_REMOTE_PLAN_HTTP_${response.status}:${message}`,
        response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      );
    }
    validatePipelineTestGateContract('remotePlanStatus', parsed);
    return parsed as RemotePlanStatusV1;
  }

  submit(job: RemotePlanJobV1, signal?: AbortSignal): Promise<RemotePlanStatusV1> {
    return this.#request('POST', '/v1/plan-jobs', job, signal);
  }

  status(jobId: string, signal?: AbortSignal): Promise<RemotePlanStatusV1> {
    return this.#request('GET', `/v1/plan-jobs/${encodeURIComponent(jobId)}`, undefined, signal);
  }

  cancel(jobId: string, signal?: AbortSignal): Promise<RemotePlanStatusV1> {
    return this.#request('DELETE', `/v1/plan-jobs/${encodeURIComponent(jobId)}`, undefined, signal);
  }

  async evidence(jobId: string, contentDigest: string, maximumBytes: number, signal?: AbortSignal): Promise<Buffer> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(contentDigest)) throw new Error('NOVA_REMOTE_EVIDENCE_DIGEST_INVALID');
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) throw new Error('NOVA_REMOTE_EVIDENCE_LIMIT_INVALID');
    const responseLimit = Math.min(this.#maximumResponseBytes, maximumBytes);
    let response: Response;
    try {
      response = await fetch(`${this.#endpoint}/v1/plan-jobs/${encodeURIComponent(jobId)}/evidence/${encodeURIComponent(contentDigest)}`, {
        headers: { authorization: `Bearer ${this.#token}` }, redirect: 'error', ...(signal ? { signal } : {}),
      });
    } catch (error) { throw new RemotePlanTransportError('NOVA_REMOTE_EVIDENCE_NETWORK_ERROR', true, error); }
    if (!response.ok) throw new RemotePlanTransportError(
      `NOVA_REMOTE_EVIDENCE_HTTP_${response.status}`,
      response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
    );
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > responseLimit) throw new Error('NOVA_REMOTE_EVIDENCE_SIZE_EXCEEDED');
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (reader) for (;;) {
      const part = await reader.read();
      if (part.done) break;
      const bytes = Buffer.from(part.value);
      total += bytes.byteLength;
      if (total > responseLimit) { await reader.cancel(); throw new Error('NOVA_REMOTE_EVIDENCE_SIZE_EXCEEDED'); }
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    if (`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== contentDigest) {
      throw new Error('NOVA_REMOTE_EVIDENCE_DIGEST_MISMATCH');
    }
    return bytes;
  }

  async result(jobId: string, contentDigest: string, maximumBytes: number, signal?: AbortSignal): Promise<RemotePlanResultV1> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(contentDigest)) throw new Error('NOVA_REMOTE_RESULT_DIGEST_INVALID');
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('NOVA_REMOTE_RESULT_LIMIT_INVALID');
    const responseLimit = Math.min(this.#maximumResultBytes, maximumBytes);
    let response: Response;
    try {
      response = await fetch(`${this.#endpoint}/v1/plan-jobs/${encodeURIComponent(jobId)}/results/${encodeURIComponent(contentDigest)}`, {
        headers: { authorization: `Bearer ${this.#token}` }, redirect: 'error', ...(signal ? { signal } : {}),
      });
    } catch (error) { throw new RemotePlanTransportError('NOVA_REMOTE_RESULT_NETWORK_ERROR', true, error); }
    if (!response.ok) throw new RemotePlanTransportError(
      `NOVA_REMOTE_RESULT_HTTP_${response.status}`,
      response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
    );
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > responseLimit) throw new Error('NOVA_REMOTE_RESULT_SIZE_EXCEEDED');
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (reader) for (;;) {
      const part = await reader.read();
      if (part.done) break;
      const bytes = Buffer.from(part.value);
      total += bytes.byteLength;
      if (total > responseLimit) { await reader.cancel(); throw new Error('NOVA_REMOTE_RESULT_SIZE_EXCEEDED'); }
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    const byteDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (byteDigest !== contentDigest) throw new Error('NOVA_REMOTE_RESULT_CONTENT_DIGEST_MISMATCH');
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')); }
    catch (error) { throw new Error('NOVA_REMOTE_RESULT_INVALID', { cause: error }); }
    validatePipelineTestGateContract('remotePlanResult', parsed);
    return parsed as RemotePlanResultV1;
  }
}
