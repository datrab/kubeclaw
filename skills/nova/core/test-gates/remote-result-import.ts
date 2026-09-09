import { validateVerifiedOutput } from './verified-output.ts';
import { bindGateCoverage, coveragePassed } from '@kubeclaw/pipeline-test-gate-contract';
import { GateDeadline, checkGateSignal } from './deadline.ts';
import type { StageResult } from '@kubeclaw/plugin-sdk';
import crypto from 'node:crypto';
import {
  attemptResultDigest,
  nodeResultDigest,
  remotePlanDigest,
  remotePlanResultDigest,
  remotePlanResultReceipt,
  validatePipelineTestGateContract,
  type ArtifactRefV1,
  type RemotePlanJobV1,
  type RemotePlanResultV1,
  type RemotePlanStatusV1,
  type ResolvedPlanNodeV1,
} from '@kubeclaw/pipeline-test-gate-contract';
import {
  FileDurableBlobStore,
  FileDurableRecordStore,
  type DurableRecordLimits,
} from '@kubeclaw/plugin-foundation/observability/durable-records';
import type { RemotePlanEvidenceTransport, RemotePlanResultTransport } from './remote-dispatch.ts';

import { gateDecisionStageResult, type GateDecisionV1, type GateDecisionState, type GateNodeDecisionV1, type GateNodeEffect, type AgentEvidenceReviewRequestV1 } from '@kubeclaw/pipeline-test-gate-contract';
export { gateDecisionStageResult, type GateDecisionV1, type GateDecisionState, type GateNodeDecisionV1, type GateNodeEffect, type AgentEvidenceReviewRequestV1 } from '@kubeclaw/pipeline-test-gate-contract';

type GateImportSource = Pick<RemotePlanJobV1, 'jobId' | 'pipelineStageId' | 'plan'> & { readonly sourceRevision: string };

function importSource(job: RemotePlanJobV1): GateImportSource {
  return { jobId: job.jobId, pipelineStageId: job.pipelineStageId, plan: structuredClone(job.plan), sourceRevision: job.sourceSnapshot.revision };
}

interface StoredGateImportV2 {
  readonly schemaVersion: 'nova-test-gate-import.v2';
  readonly jobId: string;
  readonly source: GateImportSource;
  readonly requestDigest: string;
  readonly remoteResultDigest: string | null;
  readonly remoteResult: RemotePlanResultV1 | null;
  readonly evidenceDigests: string[];
  readonly decision: GateDecisionV1;
  readonly state: 'pending_evidence' | 'complete';
}

function retainedResult(stored: StoredGateImportV2 | undefined, job: RemotePlanJobV1): RemotePlanResultV1 {
  if (!stored || stored.schemaVersion !== 'nova-test-gate-import.v2' || stored.state !== 'complete'
    || !stored.remoteResult || stored.jobId !== job.jobId || !same(stored.source, importSource(job))
    || stored.requestDigest !== job.requestDigest || stored.remoteResultDigest !== stored.remoteResult.resultDigest) {
    throw new Error('NOVA_DISPATCH_RETENTION_IMPORT_REQUIRED');
  }
  return stored.remoteResult;
}

function assertSameImport(existing: StoredGateImportV2, pending: StoredGateImportV2): void {
  if (existing.schemaVersion !== 'nova-test-gate-import.v2' || !same(existing.source, pending.source)
    || existing.requestDigest !== pending.requestDigest || existing.remoteResultDigest !== pending.remoteResultDigest
    || existing.decision.decisionDigest !== pending.decision.decisionDigest || !same(existing.evidenceDigests, pending.evidenceDigests)) {
    throw new Error('NOVA_REMOTE_IMPORT_CONFLICT');
  }
}

export interface NovaTestExecutionGraphV1 {
  readonly schemaVersion: 'nova-test-execution-graph.v1';
  readonly runId: string;
  readonly parentStageId: string;
  readonly jobId: string;
  readonly sourceRevision: string;
  readonly planId: string;
  readonly planDigest: string;
  readonly nodes: RemotePlanJobV1['plan']['nodes'];
  readonly links: RemotePlanJobV1['plan']['links'];
  readonly attempts: RemotePlanResultV1['attempts'];
  readonly results: RemotePlanResultV1['nodes'];
  readonly reviews: AgentEvidenceReviewRequestV1[];
  readonly decisionDigest: string;
}

// A graph is derived from the verified import, never a second write authority.
function executionGraph(job: GateImportSource, result: RemotePlanResultV1 | null,
  decision: GateDecisionV1): NovaTestExecutionGraphV1 {
  return {
    schemaVersion: 'nova-test-execution-graph.v1',
    runId: job.plan.runId, parentStageId: job.pipelineStageId, jobId: job.jobId,
    sourceRevision: job.sourceRevision, planId: job.plan.planId,
    planDigest: job.plan.planDigest, nodes: structuredClone(job.plan.nodes),
    links: structuredClone(job.plan.links), attempts: structuredClone(result?.attempts ?? []),
    results: structuredClone(result?.nodes ?? []), reviews: structuredClone(decision.reviews),
    decisionDigest: decision.decisionDigest,
  };
}

import { same, artifacts, verifyCompletedResult, verifyResult, decide, decideResult } from './remote-result-authority.ts';

export class FileNovaGateImportStore {
  readonly #records: FileDurableRecordStore;
  readonly #blobs: FileDurableBlobStore;
  constructor(root: string, options: { recordLimits: DurableRecordLimits; maximumEvidenceStoreBytes: number }) {
    this.#records = new FileDurableRecordStore(root, options.recordLimits);
    // The importer enforces the per-job evidence limit; no blob can exceed the
    // store quota, and the third argument enforces that quota across all jobs.
    this.#blobs = new FileDurableBlobStore(root, options.maximumEvidenceStoreBytes, options.maximumEvidenceStoreBytes);
  }
  /** Read only a completed import under an exact caller-independent execution binding. */
  async readVerifiedResult(binding: { readonly jobId: string; readonly runId: string; readonly pipelineStageId: string;
    readonly sourceRevision: string; readonly decisionDigest: string; readonly resultDigest: string }) {
    const record = (await this.#records.read<StoredGateImportV2>('remote-gate-imports'))
      .find(item => item.idempotencyKey === binding.jobId);
    return validateVerifiedOutput(record?.payload, binding);
  }

  /** Retain this original import and every referenced blob under its writer fence.
   * The caller holds the run fence and may acquire only the distinct dispatch
   * store next. It must not reenter this import store from operation. */
  async withRetainedImport<T>(inputJob: RemotePlanJobV1, expectedPayloadDigest: string,
    operation: (authority: { readonly payloadDigest: string; readonly resultDigest: string;
      readonly decisionDigest: string; readonly decision: GateDecisionV1 }) => Promise<T>): Promise<T> {
    const job = structuredClone(inputJob);
    validatePipelineTestGateContract('remotePlanJob', job);
    return this.#records.withRecords<StoredGateImportV2, T>('remote-gate-imports', async records => {
      const record = records.find(item => item.idempotencyKey === job.jobId);
      const stored = record?.payload;
      if (!record || record.payloadDigest !== expectedPayloadDigest || !stored) {
        throw new Error('NOVA_DISPATCH_RETENTION_IMPORT_REQUIRED');
      }
      const result = retainedResult(stored, job);
      verifyResult(job, result);
      const decision = decideResult(job, result);
      if (!same(decision, stored.decision) || decision.state === 'review_required') {
        throw new Error('NOVA_DISPATCH_RETENTION_DECISION_INCOMPLETE');
      }
      const referenced = artifacts(result);
      if (!same(stored.evidenceDigests, referenced.map(item => item.contentDigest).sort())) {
        throw new Error('NOVA_DISPATCH_RETENTION_EVIDENCE_MISMATCH');
      }
      for (const artifact of referenced) {
        const bytes = await this.#blobs.get(artifact.contentDigest);
        if (bytes.byteLength !== artifact.sizeBytes) throw new Error('NOVA_DISPATCH_RETENTION_EVIDENCE_MISMATCH');
      }
      return operation({ payloadDigest: record.payloadDigest, resultDigest: result.resultDigest,
        decisionDigest: decision.decisionDigest, decision: structuredClone(decision) });
    });
  }

  async readExecutionGraphs(): Promise<readonly NovaTestExecutionGraphV1[]> {
    return (await this.#records.read<StoredGateImportV2>('remote-gate-imports'))
      .filter(record => record.payload.state === 'complete')
      .map(({ payload }) => {
        if (payload.schemaVersion !== 'nova-test-gate-import.v2') throw new Error('NOVA_REMOTE_IMPORT_SCHEMA_UNSUPPORTED');
        return executionGraph(payload.source, payload.remoteResult, payload.decision);
      });
  }
  async record(job: RemotePlanJobV1, status: RemotePlanStatusV1, remoteResult: RemotePlanResultV1 | null,
    decision: GateDecisionV1,
    evidence: readonly { artifact: ArtifactRefV1; bytes: Uint8Array }[], signal?: AbortSignal): Promise<GateDecisionV1> {
    checkGateSignal(signal);
    const digests = evidence.map((item) => item.artifact.contentDigest).sort();
    const pending: StoredGateImportV2 = { schemaVersion: 'nova-test-gate-import.v2', jobId: job.jobId, source: importSource(job),
      requestDigest: job.requestDigest, remoteResultDigest: remoteResult?.resultDigest ?? null,
      remoteResult: remoteResult ? structuredClone(remoteResult) : null,
      evidenceDigests: digests, decision, state: 'pending_evidence' };
    let appended;
    try {
      appended = await this.#records.append('remote-gate-imports', job.jobId, pending);
      checkGateSignal(signal);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'DURABLE_RECORD_IDEMPOTENCY_CONFLICT') throw error;
      const record = (await this.#records.read<StoredGateImportV2>('remote-gate-imports'))
        .find((item) => item.idempotencyKey === job.jobId);
      if (!record) throw error;
      checkGateSignal(signal);
      const existing = record.payload;
      assertSameImport(existing, pending);
      if (existing.state === 'complete') {
        return structuredClone(existing.decision);
      }
      appended = { appended: false, record };
    }
    const existing = appended.record.payload as StoredGateImportV2;
    assertSameImport(existing, pending);
    if (existing.state === 'complete') {
      return structuredClone(existing.decision);
    }
    for (const item of evidence) {
      checkGateSignal(signal);
      const stored = await this.#blobs.put(item.bytes);
      if (stored.digest !== item.artifact.contentDigest || stored.sizeBytes !== item.artifact.sizeBytes) {
        throw new Error('NOVA_REMOTE_EVIDENCE_STORE_MISMATCH');
      }
    }
    checkGateSignal(signal);
    const complete: StoredGateImportV2 = { ...pending, state: 'complete' };
    const stored = await this.#records.transition('remote-gate-imports', job.jobId, appended.record.payloadDigest, complete);
    checkGateSignal(signal);
    return structuredClone((stored.payload as StoredGateImportV2).decision);
  }
}

export class NovaRemoteGateImporter {
  readonly #store: FileNovaGateImportStore;
  readonly #evidence: RemotePlanEvidenceTransport;
  readonly #results: RemotePlanResultTransport;
  readonly #maximumEvidenceBytes: number;
  readonly #maximumResultBytes: number;
  constructor(options: { store: FileNovaGateImportStore; evidence: RemotePlanEvidenceTransport;
    results: RemotePlanResultTransport; maximumEvidenceBytes: number; maximumResultBytes: number }) {
    if (!Number.isSafeInteger(options.maximumEvidenceBytes) || options.maximumEvidenceBytes < 1) throw new Error('NOVA_REMOTE_EVIDENCE_LIMIT_INVALID');
    if (!Number.isSafeInteger(options.maximumResultBytes) || options.maximumResultBytes < 1) throw new Error('NOVA_REMOTE_RESULT_LIMIT_INVALID');
    this.#store = options.store; this.#evidence = options.evidence; this.#results = options.results;
    this.#maximumEvidenceBytes = options.maximumEvidenceBytes; this.#maximumResultBytes = options.maximumResultBytes;
  }
  async import(job: RemotePlanJobV1, status: RemotePlanStatusV1, signal?: AbortSignal): Promise<GateDecisionV1> {
    checkGateSignal(signal);
    validatePipelineTestGateContract('remotePlanJob', job);
    validatePipelineTestGateContract('remotePlanStatus', status);
    if (status.jobId !== job.jobId || status.requestDigest !== job.requestDigest
      || !['completed', 'failed', 'cancelled'].includes(status.state)) throw new Error('NOVA_REMOTE_IMPORT_STATUS_INVALID');
    const result = status.state === 'completed' && status.result
      ? await this.#results.result(job.jobId, status.result.contentDigest,
        Math.min(status.result.sizeBytes, this.#maximumResultBytes), signal)
      : null;
    checkGateSignal(signal);
    if (status.state === 'completed') {
      if (!result) throw new Error('NOVA_REMOTE_RESULT_MISSING');
      verifyCompletedResult(job, status, result);
    }
    const decision = decide(job, status, result);
    const source = artifacts(result);
    let total = 0;
    const evidence: Array<{ artifact: ArtifactRefV1; bytes: Buffer }> = [];
    for (const artifact of source) {
      checkGateSignal(signal);
      total += artifact.sizeBytes;
      if (!Number.isSafeInteger(total) || total > this.#maximumEvidenceBytes) throw new Error('NOVA_REMOTE_EVIDENCE_TOTAL_EXCEEDED');
      const bytes = await this.#evidence.evidence(
        job.jobId, artifact.contentDigest, Math.min(artifact.sizeBytes, this.#maximumEvidenceBytes - (total - artifact.sizeBytes)), signal,
      );
      if (bytes.byteLength !== artifact.sizeBytes
        || `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` !== artifact.contentDigest) {
        throw new Error('NOVA_REMOTE_EVIDENCE_INVALID');
      }
      checkGateSignal(signal);
      evidence.push({ artifact, bytes });
    }
    checkGateSignal(signal);
    return this.#store.record(job, status, result, decision, evidence, signal);
  }
}

export interface RemotePlanTerminalDispatcher {
  dispatch(job: RemotePlanJobV1, options: { timeoutMs: number; signal?: AbortSignal }): Promise<RemotePlanStatusV1>;
}

export class NovaRemoteTestGate {
  readonly #dispatcher: RemotePlanTerminalDispatcher;
  readonly #importer: NovaRemoteGateImporter;
  constructor(options: { dispatcher: RemotePlanTerminalDispatcher; importer: NovaRemoteGateImporter }) {
    this.#dispatcher = options.dispatcher;
    this.#importer = options.importer;
  }
  async execute(job: RemotePlanJobV1, options: { timeoutMs: number; signal?: AbortSignal }): Promise<{
    status: RemotePlanStatusV1; decision: GateDecisionV1; stageResult: StageResult;
  }> {
    const deadline = new GateDeadline(options.timeoutMs, options.signal);
    try {
      deadline.check();
      const status = await this.#dispatcher.dispatch(job, { timeoutMs: deadline.remaining(), signal: deadline.signal });
      deadline.check();
      const decision = await this.#importer.import(job, status, deadline.signal).catch((error: unknown) => {
        deadline.check(); throw error;
      });
      deadline.check();
      return { status, decision, stageResult: gateDecisionStageResult(decision) };
    } finally { deadline.dispose(); }
  }
}
