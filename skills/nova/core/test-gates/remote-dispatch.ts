import crypto from 'node:crypto';
import { dispatchOperation } from './dispatch-operation.ts';
import { remoteBytes, retryableStatus } from './http-response.ts';
import { RemotePlanTransportError } from './transport-error.ts';
export { RemotePlanTransportError } from './transport-error.ts';
import { isSpiffeProxyLoopback } from './secure-endpoint.ts';
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
  validatePipelineTestGateContract,
} from '@kubeclaw/pipeline-test-gate-contract';
import { FileNovaRemotePlanStore } from './remote-dispatch-store.ts';
export { FileNovaRemotePlanStore } from './remote-dispatch-store.ts';

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

export class NovaRemotePlanDispatcher {
  readonly #store: FileNovaRemotePlanStore;
  readonly #transport: RemotePlanTransport;
  readonly #pollMilliseconds: number;
  readonly #cleanupMilliseconds: number;

  constructor(options: {
    readonly store: FileNovaRemotePlanStore;
    readonly transport: RemotePlanTransport;
    readonly pollMilliseconds: number;
    readonly cleanupMilliseconds?: number;
  }) {
    if (!Number.isSafeInteger(options.pollMilliseconds) || options.pollMilliseconds < 10) {
      throw new Error('NOVA_REMOTE_PLAN_POLL_INVALID');
    }
    this.#store = options.store;
    this.#transport = options.transport;
    this.#pollMilliseconds = options.pollMilliseconds;
    this.#cleanupMilliseconds = options.cleanupMilliseconds ?? 10_000;
    if (!Number.isSafeInteger(this.#cleanupMilliseconds) || this.#cleanupMilliseconds < 1) throw new Error('NOVA_REMOTE_CLEANUP_TIMEOUT_INVALID');
  }

  async dispatch(job: RemotePlanJobV1, options: {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<RemotePlanStatusV1> {
    return dispatchOperation({ store: this.#store, transport: this.#transport, pollMilliseconds: this.#pollMilliseconds,
      cleanupMilliseconds: this.#cleanupMilliseconds }, job, options);
  }
}

export class HttpRemotePlanTransport implements RemotePlanTransport {
  readonly #endpoint: string;
  readonly #token: string | undefined;
  readonly #maximumResponseBytes: number;
  readonly #maximumResultBytes: number;

  constructor(options: { readonly endpoint: string; readonly token?: string; readonly authentication?: 'bearer' | 'spiffe-proxy'; readonly maximumResponseBytes: number;
    readonly maximumResultBytes?: number }) {
    const endpoint = new URL(options.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('NOVA_REMOTE_PLAN_ENDPOINT_INVALID');
    }
    const authentication = options.authentication ?? 'bearer';
    if (authentication === 'bearer' && (!options.token || options.token.length < 32)) {
      throw new Error('NOVA_REMOTE_PLAN_TOKEN_INVALID');
    }
    if (authentication === 'spiffe-proxy'
      && !isSpiffeProxyLoopback(endpoint)) {
      throw new Error('NOVA_REMOTE_PLAN_SPIFFE_PROXY_NOT_LOOPBACK');
    }
    if (!Number.isSafeInteger(options.maximumResponseBytes) || options.maximumResponseBytes < 1) {
      throw new Error('NOVA_REMOTE_PLAN_RESPONSE_LIMIT_INVALID');
    }
    this.#endpoint = endpoint.href.replace(/\/+$/u, '');
    this.#token = authentication === 'bearer' ? options.token : undefined;
    this.#maximumResponseBytes = options.maximumResponseBytes;
    this.#maximumResultBytes = options.maximumResultBytes ?? options.maximumResponseBytes;
    if (!Number.isSafeInteger(this.#maximumResultBytes) || this.#maximumResultBytes < 1) {
      throw new Error('NOVA_REMOTE_RESULT_LIMIT_INVALID');
    }
  }

  async #request(method: string, suffix: string, body?: unknown, signal?: AbortSignal): Promise<RemotePlanStatusV1> {
    const { response, bytes } = await remoteBytes(`${this.#endpoint}${suffix}`, {
      method, headers: { ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', ...(signal ? { signal } : {}),
    }, this.#maximumResponseBytes, 'NOVA_REMOTE_PLAN_RESPONSE', true);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')); }
    catch (error) { throw new Error('NOVA_REMOTE_PLAN_RESPONSE_INVALID', { cause: error }); }
    if (!response.ok) {
      const message = parsed && typeof parsed === 'object' && 'error' in parsed ? String(parsed.error) : response.statusText;
      throw new RemotePlanTransportError(
        `NOVA_REMOTE_PLAN_HTTP_${response.status}:${message}`,
        retryableStatus(response.status),
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
    const { bytes } = await remoteBytes(`${this.#endpoint}/v1/plan-jobs/${encodeURIComponent(jobId)}/evidence/${encodeURIComponent(contentDigest)}`, {
      headers: this.#token ? { authorization: `Bearer ${this.#token}` } : {}, redirect: 'error', ...(signal ? { signal } : {}),
    }, responseLimit, 'NOVA_REMOTE_EVIDENCE');
    if (`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== contentDigest) {
      throw new Error('NOVA_REMOTE_EVIDENCE_DIGEST_MISMATCH');
    }
    return bytes;
  }

  async result(jobId: string, contentDigest: string, maximumBytes: number, signal?: AbortSignal): Promise<RemotePlanResultV1> {
    if (!/^sha256:[a-f0-9]{64}$/u.test(contentDigest)) throw new Error('NOVA_REMOTE_RESULT_DIGEST_INVALID');
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('NOVA_REMOTE_RESULT_LIMIT_INVALID');
    const responseLimit = Math.min(this.#maximumResultBytes, maximumBytes);
    const { bytes } = await remoteBytes(`${this.#endpoint}/v1/plan-jobs/${encodeURIComponent(jobId)}/results/${encodeURIComponent(contentDigest)}`, {
      headers: this.#token ? { authorization: `Bearer ${this.#token}` } : {}, redirect: 'error', ...(signal ? { signal } : {}),
    }, responseLimit, 'NOVA_REMOTE_RESULT');
    const byteDigest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (byteDigest !== contentDigest) throw new Error('NOVA_REMOTE_RESULT_CONTENT_DIGEST_MISMATCH');
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')); }
    catch (error) { throw new Error('NOVA_REMOTE_RESULT_INVALID', { cause: error }); }
    validatePipelineTestGateContract('remotePlanResult', parsed);
    return parsed as RemotePlanResultV1;
  }
}
