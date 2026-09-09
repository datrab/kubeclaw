import {verifiedArtifactJsonText} from '@kubeclaw/plugin-sdk';
import { canonicalJson, sha256Text, type ArtifactRef, type PluginInvocationContext } from '@kubeclaw/plugin-sdk';

const MAXIMUM_ARTIFACTS = 32;
const MAXIMUM_BYTES = 256 * 1024;

/** Only core-issued repair requests may select evidence; never agent-supplied paths. */
export async function repairEvidence(context: PluginInvocationContext): Promise<string | undefined> {
  const request = context.contract.guidance?.repairRequest;
  if (request === undefined) return undefined;
  const value = request as Record<string, any>;
  const attempt = context.contract.lease.attempt;
  if (!value || value.schemaVersion !== 'repair-request.v1' || value.targetStageId !== attempt.stageId
    || typeof value.requesterStageId !== 'string' || !Number.isSafeInteger(value.generation) || value.generation < 1
    || value.requesterResult?.outcome !== 'request_fix' || !Array.isArray(value.requesterResult.artifacts)) {
    throw new Error('REPAIR_EVIDENCE_REQUEST_INVALID');
  }
  const refs = value.requesterResult.artifacts as ArtifactRef[];
  if (refs.length > MAXIMUM_ARTIFACTS) throw new Error('REPAIR_EVIDENCE_LIMIT_EXCEEDED');
  let bytes = Buffer.byteLength(canonicalJson(request));
  const seen = new Set<string>();
  for (const ref of refs) {
    if (ref.producer.runId !== attempt.runId || ref.producer.stageId !== value.requesterStageId
      || ref.mediaType !== 'application/json' || !Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 0
      || !/^sha256:[a-f0-9]{64}$/u.test(ref.digest)) throw new Error('REPAIR_EVIDENCE_REFERENCE_INVALID');
    const key = `${ref.namespace}\0${ref.artifactId}\0${ref.digest}`;
    if (seen.has(key)) throw new Error('REPAIR_EVIDENCE_REFERENCE_DUPLICATE');
    seen.add(key); bytes += ref.sizeBytes;
  }
  if (bytes > MAXIMUM_BYTES) throw new Error('REPAIR_EVIDENCE_LIMIT_EXCEEDED');
  const evidence: { artifact: ArtifactRef; content: unknown }[] = [];
  for (const ref of refs) {
    const response = await context.invoke('artifacts.read', {
      operation: 'get_json_bytes', resource: { type: 'artifact.object', canonicalId: ref.artifactId },
      payload: { namespace: ref.namespace, digest: ref.digest, reference: ref },
    });
    const content = verifiedArtifactJsonText(response, ref);
    if (response.digest !== ref.digest || response.sizeBytes !== ref.sizeBytes
      || Buffer.byteLength(content) !== ref.sizeBytes || sha256Text(content) !== ref.digest) {
      throw new Error('REPAIR_EVIDENCE_CONTENT_INVALID');
    }
    evidence.push({ artifact: ref, content: response.value });
  }
  const serialized = canonicalJson({ request, evidence });
  if (Buffer.byteLength(serialized) > MAXIMUM_BYTES) throw new Error('REPAIR_EVIDENCE_LIMIT_EXCEEDED');
  return serialized;
}
