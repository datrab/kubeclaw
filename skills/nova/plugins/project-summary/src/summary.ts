import {verifiedArtifactJsonText} from '@kubeclaw/plugin-sdk';
import { assertCoverageDecision, coveragePassed, coverageReviewPrefixes, coverageReviewRequirements, validatePipelineTestGateContract, type GateCoverageV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { parseGateDecision } from '@kubeclaw/pipeline-test-gate-contract/gate-decision';
import { canonicalJson, sha256Text, resolveSourceRevision, type ArtifactRef, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

export interface GateBinding {
  readonly sourceStageId: string;
  readonly lintStageId: string;
  readonly reviewStageId?: string;
  readonly expectedCoverage: GateCoverageV1;
  readonly testStageId: string;
}
export interface SummaryInput {
  readonly projectId: string;
  readonly modules: readonly { readonly moduleId: string; readonly sourceStageId: string; readonly testStageId: string; readonly expectedCoverage: GateCoverageV1 }[];
  readonly final: GateBinding;
}

function validateCoverageInput(input: SummaryInput): void {
  if (!input.projectId?.trim() || !Array.isArray(input.modules) || input.modules.length < 1
    || input.modules.length > 128 || new Set(input.modules.map(module => module.moduleId)).size !== input.modules.length
    || new Set(input.modules.map(module => module.sourceStageId)).size !== input.modules.length
    || new Set(input.modules.map(module => module.testStageId)).size !== input.modules.length
    || !input.modules.some(module => module.sourceStageId === input.final?.sourceStageId)) {
    throw new Error('DELIVERY_INPUT_INVALID');
  }
  validatePipelineTestGateContract('gateCoverage', input.final.expectedCoverage);
  if (input.final.expectedCoverage.kind !== 'cumulative' || input.final.expectedCoverage.projectId !== input.projectId) throw new Error('DELIVERY_CUMULATIVE_COVERAGE_REQUIRED');
  const expectedModules = input.modules.map(module => {
    validatePipelineTestGateContract('gateCoverage', module.expectedCoverage);
    if (module.expectedCoverage.kind !== 'module' || module.expectedCoverage.modules[0]?.moduleId !== module.moduleId
      || module.expectedCoverage.projectId !== input.projectId) throw new Error('DELIVERY_MODULE_COVERAGE_MISMATCH');
    return module.expectedCoverage.modules[0]!;
  }).sort((left, right) => left.moduleId < right.moduleId ? -1 : left.moduleId > right.moduleId ? 1 : 0);
  if (canonicalJson(expectedModules) !== canonicalJson(input.final.expectedCoverage.modules)) throw new Error('DELIVERY_CUMULATIVE_MODULES_MISMATCH');
}

type ReadEvidence = (stageId: string, namespace: string, select?: (ref: ArtifactRef) => boolean) => Promise<Record<string, any>>;

async function verifyFinalReview(input: SummaryInput, sourceRevision: string, read: ReadEvidence): Promise<void> {
  if (input.final.reviewStageId) {
    const review = await read(input.final.reviewStageId, 'kubeclaw.review', ref => ref.artifactId.startsWith('review-report:'));
    const bundle = await read(input.final.reviewStageId, 'kubeclaw.review', ref => ref.artifactId.startsWith('review-bundle:'));
    const policy = input.final.expectedCoverage;
    const coverageEvidence = Array.isArray(bundle.evidence) ? bundle.evidence.filter((item: any) => item.kind === 'gate-coverage') : [];
    if (review.revision?.head !== sourceRevision || review.revision?.base !== policy.baseRevision
      || canonicalJson(review.revision) !== canonicalJson(bundle.revisions)
      || review.outcome !== 'passed' || review.bundleDigest !== sha256Text(canonicalJson(bundle))
      || coverageEvidence.length !== 1 || coverageEvidence[0].content !== canonicalJson(policy)
      || canonicalJson(bundle.requirements) !== canonicalJson(coverageReviewRequirements(policy))
      || canonicalJson(bundle.scope?.allowedPrefixes) !== canonicalJson(coverageReviewPrefixes(policy))) throw new Error('DELIVERY_FINAL_REVIEW_COVERAGE_MISMATCH');
  }
}

/** Delivery is derived from core-supplied, immutable evidence, never caller-owned counts. */
export async function buildSummary(input: SummaryInput, context: PluginInvocationContext) {
  validateCoverageInput(input);
  const runId = context.contract.lease.attempt.runId;
  let totalBytes = 0;
  const evidence: ArtifactRef[] = [];
  async function read(stageId: string, namespace: string, select: (ref: ArtifactRef) => boolean = () => true) {
    const candidates = context.contract.artifacts.filter(ref => ref.producer.runId === runId
      && ref.producer.stageId === stageId && ref.namespace === namespace);
    const attempt = Math.max(...candidates.map(ref => ref.producer.attemptNumber));
    const latest = candidates.filter(ref => ref.producer.attemptNumber === attempt && select(ref));
    if (latest.length !== 1) throw new Error(`DELIVERY_EVIDENCE_MISSING_OR_AMBIGUOUS:${stageId}`);
    const ref = latest[0]!;
    if (ref.mediaType !== 'application/json' || !Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 1
      || (totalBytes += ref.sizeBytes) > 8 * 1024 * 1024) throw new Error('DELIVERY_EVIDENCE_LIMIT_EXCEEDED');
    const response = await context.invoke('artifacts.read', { operation: 'get_json_bytes',
      resource: { type: 'artifact.object', canonicalId: ref.artifactId }, payload: { namespace, digest: ref.digest, reference: ref } });
    const bytes = verifiedArtifactJsonText(response, ref);
    if (response.digest !== ref.digest || response.sizeBytes !== ref.sizeBytes || sha256Text(bytes) !== ref.digest
      || Buffer.byteLength(bytes) !== ref.sizeBytes) throw new Error('DELIVERY_EVIDENCE_CORRUPT');
    evidence.push(ref);
    if (!response.value || typeof response.value !== 'object' || Array.isArray(response.value)) throw new Error('DELIVERY_EVIDENCE_INVALID');
    return response.value as Record<string, any>;
  }
  async function verify(binding: { readonly sourceStageId: string; readonly testStageId: string; readonly expectedCoverage: GateCoverageV1 }) {
    const revision = await resolveSourceRevision({ sourceStageId: binding.sourceStageId }, context);
    await read(binding.sourceStageId, 'kubeclaw.implementation-agent', ref => ref.artifactId.startsWith('implementation:'));
    const decision = parseGateDecision(await read(binding.testStageId, 'kubeclaw.buster-quality-gate', ref => ref.artifactId.includes(':decision:')));
    const quality = await read(binding.testStageId, 'kubeclaw.buster-quality-gate', ref => !ref.artifactId.includes(':decision:'));
    if (quality.sourceRevision !== revision) {
      throw new Error(`DELIVERY_CANDIDATE_MISMATCH:${binding.sourceStageId}`);
    }
    assertCoverageDecision(decision, binding.expectedCoverage, revision, binding.testStageId);
    const qualityPassed = quality.testAgent?.enabled === false ? quality.nativeOutcome === 'passed' : quality.verdict?.outcome === 'passed';
    if (decision.state !== 'passed' || !coveragePassed(decision.coverage!) || decision.runId !== runId || !qualityPassed
      || quality.decisionDigest !== decision.decisionDigest) throw new Error(`DELIVERY_GATE_NOT_PASSED:${binding.sourceStageId}`);
    const { decisionDigest } = decision;
    return { ...binding, sourceRevision: revision, decisionDigest, resultDigest: decision.resultDigest, coverage: decision.coverage };
  }
  const modules = [];
  for (const module of input.modules) modules.push({ moduleId: module.moduleId, ...await verify(module) });
  const final = await verify(input.final);
  const lint = await read(input.final.lintStageId, 'kubeclaw.lint');
  if (lint.sourceRevision !== final.sourceRevision) throw new Error('DELIVERY_FINAL_CANDIDATE_MISMATCH');
  if (lint.summary?.tools_failed !== 0 || lint.summary?.total_blocking !== 0) throw new Error('DELIVERY_FINAL_GATE_NOT_PASSED');
  await verifyFinalReview(input, final.sourceRevision, read);
  const manifest = { schemaVersion: 'delivery-manifest.v2', projectId: input.projectId, runId,
    sourceRevision: final.sourceRevision, modules, final, evidence };
  return { ...manifest, digest: sha256Text(canonicalJson(manifest)) };
}
