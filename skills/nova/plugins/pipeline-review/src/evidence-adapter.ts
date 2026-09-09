import {verifiedArtifactJsonText} from '@kubeclaw/plugin-sdk';
import { readRunEvidence } from '@kubeclaw/nova-core';
import { canonicalJson, sha256Text, type AdapterActivationContext, type AdapterInstance, type AdapterInvocation, type ArtifactRef } from '@kubeclaw/plugin-sdk';
import { assertEvidenceSelection, verifySelectedArtifacts, sourceFact, buildEvidenceBundle, type EvidenceSelection } from './evidence-bundle.ts';

async function readArtifact(context: AdapterActivationContext, invocation: AdapterInvocation, ref: ArtifactRef) {
  const response = await context.invoke('artifacts.read', { operation: 'get_json_bytes', resource: { type: 'artifact.object', canonicalId: ref.artifactId }, payload: { namespace: ref.namespace, digest: ref.digest, reference: ref } }, { signal: invocation.signal });
  const bytes = verifiedArtifactJsonText(response, ref);
  if (canonicalJson(response.artifact) !== canonicalJson(ref) || response.digest !== ref.digest || sha256Text(bytes) !== ref.digest
    || response.sizeBytes !== ref.sizeBytes || Buffer.byteLength(bytes) !== ref.sizeBytes) throw new Error('REPORT_ARTIFACT_INTEGRITY_INVALID');
  return response.value;
}
function artifactBudget(ref: ArtifactRef, total: number, maximum: number): void {
  if (ref.mediaType !== 'application/json' || !Number.isSafeInteger(total) || total > maximum) throw new Error('REPORT_ARTIFACT_BUDGET_EXCEEDED');
}
export function activate(context: AdapterActivationContext): AdapterInstance {
  const storageRoot = context.config.storageRoot;
  const orchestratorIssuerId = context.config.orchestratorIssuerId;
  const maximumJournalBytes = context.config.maximumJournalBytes;
  const maximumArtifactBytes = context.config.maximumArtifactBytes;
  const maximumBundleBytes = context.config.maximumBundleBytes;
  if (typeof storageRoot !== 'string' || typeof orchestratorIssuerId !== 'string' || !orchestratorIssuerId
    || [maximumJournalBytes, maximumArtifactBytes, maximumBundleBytes].some(value => !Number.isSafeInteger(value) || Number(value) < 1)) throw new Error('REPORT_READER_CONFIG_INVALID');
  let stopped = false;
  async function invoke(invocation: AdapterInvocation) {
    if (!invocation.confidential) invocation.fence.assertCurrent();
    if (stopped || invocation.signal.aborted) throw new Error('REPORT_READER_CANCELLED');
    const request = invocation.request;
    if (request.capability !== 'report.evidence.read' || request.operation !== 'snapshot' || request.resource.type !== 'pipeline.run') throw new Error('REPORT_READER_OPERATION_INVALID');
    const selection = structuredClone(request.payload) as unknown as EvidenceSelection;
    assertEvidenceSelection(selection);
    if (request.resource.canonicalId !== selection.runId) throw new Error('REPORT_READER_RUN_MISMATCH');
    const options = { storageRoot: storageRoot as string, orchestratorIssuerId: orchestratorIssuerId as string, maximumBytes: Number(maximumJournalBytes) };
    const projection = readRunEvidence(selection, options);
    verifySelectedArtifacts(projection, selection);
    let total = 0; const facts = [];
    for (const ref of selection.artifacts) {
      total += ref.sizeBytes;
      artifactBudget(ref,total,Number(maximumArtifactBytes));
      facts.push(sourceFact(ref, await readArtifact(context,invocation,ref), selection, projection));
    }
    if(canonicalJson(readRunEvidence(selection, options))!==canonicalJson(projection))throw new Error('REPORT_SOURCE_CHANGED');
    if (invocation.signal.aborted || stopped) throw new Error('REPORT_READER_CANCELLED');
    const bundle = buildEvidenceBundle(projection, selection, facts);
    if (Buffer.byteLength(canonicalJson(bundle)) > Number(maximumBundleBytes)) throw new Error('REPORT_BUNDLE_BUDGET_EXCEEDED');
    return { bundle };
  }
  return { async ready() {}, invoke, async shutdown() { stopped = true; } };
}
