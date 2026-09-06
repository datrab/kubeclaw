import { parseGateDecision } from '@kubeclaw/pipeline-test-gate-contract';
import { canonicalJson, sha256Text, resolveSourceRevision, type ArtifactRef, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

export interface GateBinding {
  readonly sourceStageId: string;
  readonly lintStageId: string;
  readonly reviewStageId: string;
  readonly testStageId: string;
}
export interface SummaryInput {
  readonly projectId: string;
  readonly modules: readonly { readonly moduleId: string; readonly sourceStageId: string; readonly testStageId: string }[];
  readonly final: GateBinding;
}

/** Delivery is derived from core-supplied, immutable evidence, never caller-owned counts. */
export async function buildSummary(input: SummaryInput, context: PluginInvocationContext) {
  if (!input.projectId?.trim() || !Array.isArray(input.modules) || input.modules.length < 1
    || input.modules.length > 128 || new Set(input.modules.map(module => module.moduleId)).size !== input.modules.length
    || new Set(input.modules.map(module => module.sourceStageId)).size !== input.modules.length
    || new Set(input.modules.map(module => module.testStageId)).size !== input.modules.length
    || !input.modules.some(module => module.sourceStageId === input.final?.sourceStageId)) {
    throw new Error('DELIVERY_INPUT_INVALID');
  }
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
    const response = await context.invoke('artifacts.read', { operation: 'get_json',
      resource: { type: 'artifact.object', canonicalId: ref.artifactId }, payload: { namespace, digest: ref.digest } });
    const bytes = canonicalJson(response.value);
    if (response.digest !== ref.digest || response.sizeBytes !== ref.sizeBytes || sha256Text(bytes) !== ref.digest
      || Buffer.byteLength(bytes) !== ref.sizeBytes) throw new Error('DELIVERY_EVIDENCE_CORRUPT');
    evidence.push(ref);
    if (!response.value || typeof response.value !== 'object' || Array.isArray(response.value)) throw new Error('DELIVERY_EVIDENCE_INVALID');
    return response.value as Record<string, any>;
  }
  async function verify(binding: { readonly sourceStageId: string; readonly testStageId: string }) {
    const revision = await resolveSourceRevision({ sourceStageId: binding.sourceStageId }, context);
    await read(binding.sourceStageId, 'kubeclaw.implementation-agent', ref => ref.artifactId.startsWith('implementation:'));
    const decision = parseGateDecision(await read(binding.testStageId, 'kubeclaw.buster-quality-gate', ref => ref.artifactId.includes(':decision:')));
    const quality = await read(binding.testStageId, 'kubeclaw.buster-quality-gate', ref => !ref.artifactId.includes(':decision:'));
    if (quality.sourceRevision !== revision) {
      throw new Error(`DELIVERY_CANDIDATE_MISMATCH:${binding.sourceStageId}`);
    }
    if (decision.state !== 'passed' || decision.runId !== runId || quality.verdict?.outcome !== 'passed'
      || quality.decisionDigest !== decision.decisionDigest) throw new Error(`DELIVERY_GATE_NOT_PASSED:${binding.sourceStageId}`);
    const { decisionDigest } = decision;
    return { ...binding, sourceRevision: revision, decisionDigest };
  }
  const modules = [];
  for (const module of input.modules) modules.push({ moduleId: module.moduleId, ...await verify(module) });
  const final = await verify(input.final);
  const lint = await read(input.final.lintStageId, 'kubeclaw.lint');
  const review = await read(input.final.reviewStageId, 'kubeclaw.review', ref => ref.artifactId.startsWith('review-report:'));
  if (lint.sourceRevision !== final.sourceRevision || review.revision?.head !== final.sourceRevision) throw new Error('DELIVERY_FINAL_CANDIDATE_MISMATCH');
  if (lint.summary?.tools_failed !== 0 || lint.summary?.total_blocking !== 0 || review.outcome !== 'passed') throw new Error('DELIVERY_FINAL_GATE_NOT_PASSED');
  const manifest = { schemaVersion: 'delivery-manifest.v1', projectId: input.projectId, runId,
    sourceRevision: final.sourceRevision, modules, final, evidence };
  return { ...manifest, digest: sha256Text(canonicalJson(manifest)) };
}
