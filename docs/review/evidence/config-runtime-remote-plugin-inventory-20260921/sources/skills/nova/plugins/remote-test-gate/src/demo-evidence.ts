import { assertDemoSourceLinks } from './demo-source-links.ts';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import type { FileNovaGateImportStore } from '@kubeclaw/nova-core';

type Verified = Awaited<ReturnType<FileNovaGateImportStore['readVerifiedResult']>>;
type ObjectValue = Record<string, any>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DEMO_EVIDENCE_INVALID');
  return value as ObjectValue;
}
function terminal(verified: Verified, nodeId: string) {
  const node = verified.source.plan.nodes.find(item => item.id === nodeId);
  const result = verified.result.nodes.find(item => item.nodeId === nodeId);
  const attempt = verified.result.attempts.find(item => item.attemptId === result?.finalAttemptId);
  if (!node || !result || !attempt || result.outcome !== 'passed' || result.state !== 'completed'
    || attempt.nodeId !== nodeId || attempt.executionState !== 'completed' || attempt.outcome !== 'passed'
    || canonicalJson(node.provider) !== canonicalJson(attempt.provider)) throw new Error('DEMO_EVIDENCE_NATIVE_ATTEMPT_REQUIRED');
  return { node, attempt };
}
function output(verified: Verified, nodeId: string, name: string, schema: string) {
  const { node, attempt } = terminal(verified,nodeId);
  const outputs = attempt.outputs.filter(item => item.name === name);
  if (outputs.length !== 1 || outputs[0]?.kind !== 'value' || outputs[0].schemaId !== schema) throw new Error('DEMO_EVIDENCE_OUTPUT_REQUIRED');
  return {node,attempt,value:object(outputs[0].value)};
}

/** Product semantics are projected from the completed native import; none are supplied as value inputs. */
export function projectDemoEvidence(verified: Verified, authNodeId: string) {
  const auth = output(verified,authNodeId,'authentication','kubeclaw.demo-auth-evidence@1');
  if (auth.node.provider.packageId !== 'kubeclaw.demo-auth-smoke' || auth.node.provider.contractId !== 'kubeclaw.demo-auth-smoke@1'
    || auth.node.provider.registrationId !== 'session' || auth.node.configuration.values.protocol !== 'json-session.v1' || auth.node.mode !== 'blocking' || !verified.decision.coverage?.checks.some(check => check.nodeId === authNodeId && check.state === 'passed')) throw new Error('DEMO_EVIDENCE_MANDATORY_AUTH_REQUIRED');
  const linked = (input: string, schema: string, packageId: string) => {
    const links = verified.source.plan.links.filter(link => link.to.nodeId === authNodeId && link.to.input === input);
    if (links.length !== 1 || links[0]?.kind !== 'value' || links[0].schemaId !== schema) throw new Error('DEMO_EVIDENCE_NATIVE_LINK_REQUIRED');
    const result = output(verified,links[0].from.nodeId,links[0].from.output,schema);
    if (result.node.provider.packageId !== packageId || result.node.kind !== 'fixture') throw new Error('DEMO_EVIDENCE_FIXTURE_PRODUCER_INVALID');
    return result;
  };
  const deployment = linked('deployment','kubeclaw.kubernetes-deployment-fixture@1','kubeclaw.kubernetes-fixture');
  const credentials = linked('credentials','kubeclaw.generated-demo-credentials@1','kubeclaw.kubernetes-fixture');
  const exposure = linked('exposure','kubeclaw.public-endpoint-fixture@1','kubeclaw.tailscale-exposure');
  const exposureLinks = verified.source.plan.links.filter(link => link.to.nodeId === exposure.node.id && link.to.input === 'deployment');
  if (exposureLinks.length !== 1 || exposureLinks[0]?.from.nodeId !== deployment.node.id || exposureLinks[0].from.output !== 'deployment') throw new Error('DEMO_EVIDENCE_EXPOSURE_LINK_MISMATCH');
  if (deployment.attempt.attemptId !== credentials.attempt.attemptId) throw new Error('DEMO_EVIDENCE_FIXTURE_ATTEMPT_MISMATCH');
  const value = auth.value, source = object(credentials.value.source), handoff = object(exposure.value.handoff);
  assertDemoSourceLinks(verified,deployment.node.id,credentials.value.immutableImage,credentials.value.manifestDigest);
  const expected = {schemaVersion:'demo-auth-evidence.v1',runId:verified.source.plan.runId,planId:verified.source.plan.planId,nodeId:authNodeId,
    attemptId:auth.attempt.attemptId,attemptNumber:auth.attempt.attemptNumber,protocolDigest:sha256Text(canonicalJson(auth.node.configuration.values)),
    leaseName:credentials.value.leaseName,leaseUID:source.leaseUID,namespace:credentials.value.namespace,immutableImage:credentials.value.immutableImage,
    manifestDigest:credentials.value.manifestDigest,credentialDigest:source.credentialDigest,secretUID:source.secretUID,
    url:exposure.value.url,exposureOwner:handoff.owner,exposureGeneration:handoff.exposureGeneration,expiresAt:exposure.value.expiresAt};
  assertSource(value,expected,source,credentials.value,deployment.value,handoff,auth.attempt.completedAt);
  return {schemaVersion:'verified-demo-evidence.v1',runId:verified.source.plan.runId,sourceRevision:verified.source.sourceRevision,
    jobId:verified.source.jobId,planDigest:verified.source.plan.planDigest,decisionDigest:verified.decision.decisionDigest,
    resultDigest:verified.result.resultDigest,authentication:structuredClone(value),deployment:deployment.value,
    credentials:credentials.value,exposure:exposure.value};
}

function assertSource(value:ObjectValue,expected:ObjectValue,source:ObjectValue,credentials:ObjectValue,deployment:ObjectValue,handoff:ObjectValue,completedAt:string) {
  if (Object.entries(expected).some(([key,item]) => item === undefined || value[key] !== item)
    || source.credentialDigest !== sha256Text(canonicalJson(credentials.values))
    || deployment.manifestDigest !== value.manifestDigest || deployment.immutableImage !== value.immutableImage
    || handoff.leaseUID !== value.leaseUID || handoff.immutableImage !== value.immutableImage || handoff.manifestDigest !== value.manifestDigest
    || !Number.isSafeInteger(handoff.exposureGeneration) || handoff.exposureGeneration < 1
    || handoff.phase !== 'awaiting-readiness' || !Number.isFinite(Date.parse(value.observedAt))
    || Date.parse(value.observedAt) > Date.parse(completedAt)) throw new Error('DEMO_EVIDENCE_SOURCE_MISMATCH');
}
