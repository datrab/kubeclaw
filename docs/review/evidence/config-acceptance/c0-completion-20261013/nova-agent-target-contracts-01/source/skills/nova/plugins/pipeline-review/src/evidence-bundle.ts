import { canonicalJson, sha256Text, type ArtifactRef } from '@kubeclaw/plugin-sdk';
import { parseGateDecision } from '@kubeclaw/pipeline-test-gate-contract';
import type { RunEvidenceProjection, RunEvidenceSelection } from '@kubeclaw/nova-core';

export interface EvidenceSelection extends RunEvidenceSelection {
  readonly sourceStageId: string;
  readonly sourceRevision: string;
  readonly artifacts: readonly ArtifactRef[];
}
export function assertEvidenceSelection(value: EvidenceSelection): void {
  if (!value || Object.keys(value).sort().join(',') !== 'artifacts,journalHead,runId,snapshotDigest,sourceRevision,sourceStageId'
    || typeof value.runId !== 'string' || !value.runId || typeof value.sourceStageId !== 'string' || !value.sourceStageId
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.sourceRevision)
    || !Array.isArray(value.artifacts) || !value.artifacts.length || value.artifacts.length > 128
    || new Set(value.artifacts.map(ref => canonicalJson(ref))).size !== value.artifacts.length) throw new Error('REPORT_SOURCE_SELECTION_INVALID');
}
export function verifySelectedArtifacts(projection: RunEvidenceProjection, selection: EvidenceSelection): void {
  for (const ref of selection.artifacts) {
    if (!projection.artifacts.some(candidate => canonicalJson(candidate) === canonicalJson(ref))) throw new Error('REPORT_ARTIFACT_NOT_IN_RUN');
    const stage = projection.stages.find(stage => stage.stageId === ref.producer.stageId);
    if (!stage || ref.producer.attemptNumber !== stage.attempts) throw new Error('REPORT_ARTIFACT_STALE_ATTEMPT');
  }
}
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('REPORT_SOURCE_CONTENT_INVALID');
  return value as Record<string, any>;
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('REPORT_SOURCE_COUNT_INVALID');
  return Number(value);
}
function testFact(ref: ArtifactRef, value: Record<string, any>, selection: EvidenceSelection, evidenceId: string) {
    const decision = parseGateDecision(value);
    if (decision.runId !== selection.runId || decision.coverage?.sourceRevision !== `git:${selection.sourceRevision}`
      || decision.coverage.pipelineStageId !== ref.producer.stageId) throw new Error('REPORT_GATE_SOURCE_MISMATCH');
    return { evidenceId, kind: 'tests', sourceRevision: selection.sourceRevision, state: decision.state,
      nodes: decision.nodes.map(node => ({ nodeId: node.nodeId, effect: node.effect })),
      coverage: decision.coverage.checks.map(check => ({ checkId: check.checkId, state: check.state })) };
}
export function sourceFact(ref: ArtifactRef, raw: unknown, selection: EvidenceSelection, projection: RunEvidenceProjection) {
  const value = record(raw); const evidenceId = sha256Text(canonicalJson(ref));
  const stage = projection.stages.find(stage => stage.stageId === ref.producer.stageId)!;
  if (ref.namespace === 'kubeclaw.implementation-agent' && ref.producer.stageId === selection.sourceStageId
    && stage.stageType === 'kubeclaw.agent.implementation') {
    if (value.sourceRevision !== selection.sourceRevision || value.status !== 'ready_for_testing') throw new Error('REPORT_SOURCE_REVISION_MISMATCH');
    return { evidenceId, kind: 'source', sourceRevision: selection.sourceRevision };
  }
  if (ref.namespace === 'kubeclaw.lint' && stage.stageType.startsWith('kubeclaw.lint.')) {
    if (value.sourceRevision !== selection.sourceRevision) throw new Error('REPORT_SOURCE_REVISION_MISMATCH');
    const summary = record(value.summary);
    return { evidenceId, kind: 'lint', sourceRevision: selection.sourceRevision, toolsFailed: count(summary.tools_failed), blocking: count(summary.total_blocking) };
  }
  if (ref.namespace === 'kubeclaw.buster-quality-gate' && stage.stageType === 'kubeclaw.test.quality-evaluation' && ref.artifactId.includes(':decision:')) {
    return testFact(ref, value, selection, evidenceId);
  }
  throw new Error('REPORT_SOURCE_KIND_UNSUPPORTED');
}
export function buildEvidenceBundle(projection: RunEvidenceProjection, selection: EvidenceSelection, facts: readonly ReturnType<typeof sourceFact>[]) {
  if (facts.filter(fact => fact.kind === 'source').length !== 1) throw new Error('REPORT_SOURCE_ARTIFACT_REQUIRED');
  const value = { schemaVersion: 'report-source-bundle.v1', target: { runId: selection.runId, journalHead: selection.journalHead,
    snapshotDigest: selection.snapshotDigest, sourceStageId: selection.sourceStageId, sourceRevision: selection.sourceRevision },
    pipelineId: projection.pipelineId, terminal: projection.terminal, eventCount: projection.eventCount, effectsHead:projection.effectsHead,
    stages: projection.stages, attempts: projection.attempts, evidence: selection.artifacts.map(ref => ({ evidenceId: sha256Text(canonicalJson(ref)), artifact: ref })), facts,
    coverage: { selectedArtifacts: selection.artifacts.length, totalCompletedArtifacts: projection.artifacts.length,
      omittedArtifacts: projection.artifacts.filter(ref => !selection.artifacts.some(selected => canonicalJson(selected) === canonicalJson(ref)))
        .map(ref => ({ artifact: ref, reason: 'not-selected' })),
      omittedContentClasses: ['raw-logs', 'checkpoint-only-artifacts', 'prompts', 'registry-configuration', 'effect-payloads', 'credentials', 'unstructured-agent-claims'],
      omissionEffect: 'not-exported-in-this-bundle; original-records-retained' }, narrativeStatus: 'draft-not-entailment-verified' };
  return { ...value, digest: sha256Text(canonicalJson(value)) };
}
