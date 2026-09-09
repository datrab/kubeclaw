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

function same(left: unknown, right: unknown): boolean {
  return remotePlanDigest(left) === remotePlanDigest(right);
}

function nodeAuthorityReceipt(planDigest: string, receipt: { receiptId: string; receiptDigest: string }, resultDigest: string): boolean {
  return receipt.receiptDigest === remotePlanDigest({ authorityId: `test-runner:${planDigest}`, receiptId: receipt.receiptId, resultDigest });
}

function artifacts(result: RemotePlanResultV1 | null): ArtifactRefV1[] {
  if (!result) return [];
  const found = result.attempts.flatMap((attempt) => [
    ...attempt.evidence.map((item) => item.artifact),
    ...attempt.outputs.filter((item) => item.kind === 'artifact').map((item) => item.artifact),
    ...attempt.reports.map((item) => item.sourceArtifact),
  ]);
  const byDigest = new Map<string, ArtifactRefV1>();
  for (const artifact of found) {
    const prior = byDigest.get(artifact.contentDigest);
    if (prior && prior.sizeBytes !== artifact.sizeBytes) {
      throw new Error('NOVA_REMOTE_EVIDENCE_IDENTITY_CONFLICT');
    }
    byDigest.set(artifact.contentDigest, artifact);
  }
  return [...byDigest.values()].sort((a, b) => a.contentDigest.localeCompare(b.contentDigest));
}

function verifyCompletedResult(job: RemotePlanJobV1, status: RemotePlanStatusV1, result: RemotePlanResultV1): void {
  validatePipelineTestGateContract('remotePlanStatus', status);
  if (status.jobId !== job.jobId || status.requestDigest !== job.requestDigest || status.state !== 'completed' || !status.result) {
    throw new Error('NOVA_REMOTE_RESULT_STATUS_INVALID');
  }
  validatePipelineTestGateContract('remotePlanResult', result);
  if (status.result.resultDigest !== result.resultDigest) throw new Error('NOVA_REMOTE_RESULT_REFERENCE_MISMATCH');
  verifyResult(job, result);
}

function verifyResult(job: RemotePlanJobV1, result: RemotePlanResultV1): void {
  validatePipelineTestGateContract('remotePlanResult', result);
  if (result.jobId !== job.jobId || result.planId !== job.plan.planId
    || result.planDigest !== job.plan.planDigest || result.runId !== job.plan.runId) {
    throw new Error('NOVA_REMOTE_RESULT_OWNERSHIP_MISMATCH');
  }
  if (remotePlanResultDigest(result) !== result.resultDigest
    || !same(result.receipt, remotePlanResultReceipt(job.jobId, result.resultDigest))) {
    throw new Error('NOVA_REMOTE_RESULT_RECEIPT_INVALID');
  }
  const planNodes = new Map(job.plan.nodes.map((node) => [node.id, node]));
  const resultNodes = new Map(result.nodes.map((node) => [node.nodeId, node]));
  if (planNodes.size !== resultNodes.size || [...planNodes.keys()].some((id) => !resultNodes.has(id))) {
    throw new Error('NOVA_REMOTE_RESULT_NODE_SET_MISMATCH');
  }
  const attemptsByNode = new Map<string, typeof result.attempts>();
  for (const attempt of result.attempts) {
    const planNode = planNodes.get(attempt.nodeId);
    if (!planNode) throw new Error('NOVA_REMOTE_RESULT_ATTEMPT_NODE_UNKNOWN');
    validatePipelineTestGateContract('attemptResult', attempt);
    if (attemptResultDigest(attempt) !== attempt.resultDigest
      || !nodeAuthorityReceipt(job.plan.planDigest, attempt.receipt, attempt.resultDigest)
      || attempt.executionId !== planNode.executionId || attempt.testIdentity !== planNode.testIdentity
      || attempt.nodeKind !== planNode.kind
      || attempt.mode !== planNode.mode || !same(attempt.provider, planNode.provider)
      || attempt.moduleId !== job.plan.scope.moduleId || attempt.gateId !== job.plan.scope.gateId
      || attempt.suiteInstanceId !== planNode.suiteInstanceId) {
      throw new Error(`NOVA_REMOTE_RESULT_ATTEMPT_IDENTITY_MISMATCH:${attempt.attemptId}`);
    }
    const list = attemptsByNode.get(attempt.nodeId) ?? [];
    attemptsByNode.set(attempt.nodeId, [...list, attempt]);
  }
  for (const [nodeId, planNode] of planNodes) {
    const node = resultNodes.get(nodeId)!;
    validatePipelineTestGateContract('nodeResult', node);
    const attempts = [...(attemptsByNode.get(nodeId) ?? [])].sort((a, b) => a.attemptNumber - b.attemptNumber);
    const expectedAttemptIds = attempts.map((item) => item.attemptId);
    const finalAttempt = attempts.at(-1) ?? null;
    const attemptsContiguous = attempts.every((attempt, index) => attempt.attemptNumber === index + 1);
    const terminalMatchesAttempt = node.state === 'skipped'
      ? finalAttempt === null && node.outcome === 'skipped'
      : finalAttempt !== null && node.state === finalAttempt.executionState && node.outcome === finalAttempt.outcome;
    if (nodeResultDigest(node) !== node.resultDigest
      || !nodeAuthorityReceipt(job.plan.planDigest, node.receipt, node.resultDigest)
      || node.executionId !== planNode.executionId || node.testIdentity !== planNode.testIdentity
      || node.nodeKind !== planNode.kind || node.mode !== planNode.mode
      || node.moduleId !== job.plan.scope.moduleId || node.gateId !== job.plan.scope.gateId
      || node.suiteInstanceId !== planNode.suiteInstanceId || !same(node.attemptIds, expectedAttemptIds)
      || node.finalAttemptId !== (expectedAttemptIds.at(-1) ?? null) || !attemptsContiguous
      || attempts.length > planNode.retryCount + 1 || !terminalMatchesAttempt) {
      throw new Error(`NOVA_REMOTE_RESULT_NODE_IDENTITY_MISMATCH:${nodeId}`);
    }
  }
  if (result.cleanupErrors.some((item) => !planNodes.has(item.nodeId))) {
    throw new Error('NOVA_REMOTE_RESULT_CLEANUP_NODE_UNKNOWN');
  }
}

function failedReport(nodeId: string, result: RemotePlanResultV1): boolean {
  return result.attempts
    .filter((attempt) => attempt.nodeId === nodeId && attempt.attemptId === result.nodes.find((node) => node.nodeId === nodeId)?.finalAttemptId)
    .some((attempt) => attempt.reports.some((report) => report.counts.failed > 0 || report.counts.errored > 0));
}

function coveredDecision(job: RemotePlanJobV1, decision: Omit<GateDecisionV1, 'decisionDigest'>): GateDecisionV1 {
  const coverage = bindGateCoverage(job, decision.nodes);
  const unsigned = coverage ? { ...decision, schemaVersion: 'test-gate-decision.v2' as const, coverage,
    state: decision.state === 'passed' && !coveragePassed(coverage) ? 'failed' as const : decision.state } : decision;
  return { ...unsigned, decisionDigest: remotePlanDigest(unsigned) };
}

function decide(job: RemotePlanJobV1, status: RemotePlanStatusV1, result: RemotePlanResultV1 | null): GateDecisionV1 {
  if (status.state !== 'completed' || !result) {
    const state: GateDecisionState = status.state === 'cancelled' ? 'cancelled' : 'execution_error';
    const unsigned = { schemaVersion: 'test-gate-decision.v1' as const, jobId: job.jobId,
      planId: job.plan.planId, runId: job.plan.runId, state, nodes: [], reviews: [], resultDigest: null };
    return coveredDecision(job, unsigned);
  }
  return decideResult(job, result);
}

function decideResult(job: RemotePlanJobV1, result: RemotePlanResultV1): GateDecisionV1 {
  const resultNodes = new Map(result.nodes.map((node) => [node.nodeId, node]));
  const attempts = new Map(result.attempts.map((attempt) => [attempt.attemptId, attempt]));
  const nodes: GateNodeDecisionV1[] = [];
  const reviews: AgentEvidenceReviewRequestV1[] = [];
  for (const planNode of job.plan.nodes) {
    const node = resultNodes.get(planNode.id)!;
    const finalAttempt = node.finalAttemptId ? attempts.get(node.finalAttemptId) : undefined;
    let effect: GateNodeEffect;
    let reason: string;
    if (node.state === 'skipped') { effect = 'skipped'; reason = node.skipReason ?? 'condition skipped'; }
    else if (node.state !== 'completed' || result.cleanupErrors.some((item) => item.nodeId === node.nodeId)) {
      effect = 'execution_error';
      reason = node.state !== 'completed' ? `execution ${node.state}` : 'cleanup failed';
    } else {
      const failed = node.outcome === 'failed' || failedReport(node.nodeId, result);
      const missingExecution = planNode.mode === 'blocking'
        && planNode.provider.contractId === 'kubeclaw.direct-command@1'
        && planNode.configuration.values.resultMode === 'junit-required'
        && !(finalAttempt?.reports.some((report) => report.adapter.format === 'junit'
          && report.counts.passed + report.counts.failed + report.counts.errored > 0));
      if (missingExecution) {
        effect = 'failed'; reason = 'TEST_REPORT_NO_EXECUTED_CASES: blocking JUnit requires at least one executed case';
      } else if (!failed) { effect = 'passed'; reason = 'all declared checks passed'; }
      else if (planNode.mode === 'advisory') { effect = 'advisory_failure'; reason = 'advisory checks failed'; }
      else if (planNode.reviewAgent && node.outcome === 'failed' && !failedReport(node.nodeId, result) && finalAttempt) {
        effect = 'review_required'; reason = `evidence review by ${planNode.reviewAgent}`;
        reviews.push({ schemaVersion: 'agent-evidence-review-request.v1', agent: planNode.reviewAgent,
          planId: job.plan.planId, runId: job.plan.runId, nodeId: node.nodeId, attemptId: finalAttempt.attemptId,
          evidenceDigests: finalAttempt.evidence.map((item) => item.artifact.contentDigest).sort() });
      } else { effect = 'failed'; reason = 'blocking checks failed'; }
    }
    nodes.push({ nodeId: planNode.id, kind: planNode.kind, mode: planNode.mode, effect, reason });
  }
  const state: GateDecisionState = nodes.some((node) => node.effect === 'execution_error') ? 'execution_error'
    : nodes.some((node) => node.effect === 'review_required') ? 'review_required'
      : nodes.some((node) => node.effect === 'failed') ? 'failed' : 'passed';
  const unsigned = { schemaVersion: 'test-gate-decision.v1' as const, jobId: job.jobId,
    planId: job.plan.planId, runId: job.plan.runId, state, nodes, reviews,
    resultDigest: result.resultDigest };
  return coveredDecision(job, unsigned);
}

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
      readonly decisionDigest: string }) => Promise<T>): Promise<T> {
    const job = structuredClone(inputJob);
    validatePipelineTestGateContract('remotePlanJob', job);
    return this.#records.withRecords<StoredGateImportV2, T>('remote-gate-imports', async records => {
      const record = records.find(item => item.idempotencyKey === job.jobId);
      const stored = record?.payload;
      if (!record || record.payloadDigest !== expectedPayloadDigest || !stored
        || stored.schemaVersion !== 'nova-test-gate-import.v2' || stored.state !== 'complete'
        || !stored.remoteResult || stored.jobId !== job.jobId
        || !same(stored.source, importSource(job)) || stored.requestDigest !== job.requestDigest
        || stored.remoteResultDigest !== stored.remoteResult.resultDigest) {
        throw new Error('NOVA_DISPATCH_RETENTION_IMPORT_REQUIRED');
      }
      verifyResult(job, stored.remoteResult);
      const decision = decideResult(job, stored.remoteResult);
      if (!same(decision, stored.decision) || decision.state === 'review_required') {
        throw new Error('NOVA_DISPATCH_RETENTION_DECISION_INCOMPLETE');
      }
      const referenced = artifacts(stored.remoteResult);
      if (!same(stored.evidenceDigests, referenced.map(item => item.contentDigest).sort())) {
        throw new Error('NOVA_DISPATCH_RETENTION_EVIDENCE_MISMATCH');
      }
      for (const artifact of referenced) {
        const bytes = await this.#blobs.get(artifact.contentDigest);
        if (bytes.byteLength !== artifact.sizeBytes) throw new Error('NOVA_DISPATCH_RETENTION_EVIDENCE_MISMATCH');
      }
      return operation({ payloadDigest: record.payloadDigest, resultDigest: stored.remoteResult.resultDigest,
        decisionDigest: decision.decisionDigest });
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
      if (existing.schemaVersion !== 'nova-test-gate-import.v2' || !same(existing.source, pending.source) || existing.requestDigest !== pending.requestDigest || existing.remoteResultDigest !== pending.remoteResultDigest
        || existing.decision.decisionDigest !== decision.decisionDigest || !same(existing.evidenceDigests, evidence.map((item) => item.artifact.contentDigest).sort())) {
        throw new Error('NOVA_REMOTE_IMPORT_CONFLICT');
      }
      if (existing.state === 'complete') {
        return structuredClone(existing.decision);
      }
      appended = { appended: false, record };
    }
    const existing = appended.record.payload as StoredGateImportV2;
    if (existing.schemaVersion !== 'nova-test-gate-import.v2' || !same(existing.source, pending.source) || existing.requestDigest !== pending.requestDigest || existing.remoteResultDigest !== pending.remoteResultDigest
      || existing.decision.decisionDigest !== decision.decisionDigest || !same(existing.evidenceDigests, digests)) {
      throw new Error('NOVA_REMOTE_IMPORT_CONFLICT');
    }
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
