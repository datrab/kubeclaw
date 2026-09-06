import { canonicalJson, sha256Text } from './values.ts';
import type { PluginInvocationContext } from './runtime.ts';

/** Resolve the actual trusted implementation result, never ambient repository HEAD. */
export async function resolveSourceRevision(input: { readonly revision?: string; readonly sourceStageId?: string }, context: PluginInvocationContext): Promise<string> {
  if ((input.revision !== undefined) === (input.sourceStageId !== undefined)) throw new Error('SOURCE_REVISION_SELECTION_INVALID');
  if (input.revision !== undefined) {
    if (!/^[a-f0-9]{40}$/u.test(input.revision)) throw new Error('SOURCE_REVISION_INVALID');
    return input.revision;
  }
  const candidates = context.contract.artifacts.filter((artifact) => artifact.producer.runId === context.contract.lease.attempt.runId
    && artifact.producer.stageId === input.sourceStageId && artifact.namespace === 'kubeclaw.implementation-agent'
    && artifact.artifactId.startsWith('implementation:'));
  const latest = Math.max(...candidates.map((artifact) => artifact.producer.attemptNumber));
  const selected = candidates.filter((artifact) => artifact.producer.attemptNumber === latest);
  if (selected.length !== 1) throw new Error('SOURCE_IMPLEMENTATION_ARTIFACT_MISSING_OR_AMBIGUOUS');
  const artifact = selected[0]!;
  const response = await context.invoke('artifacts.read', { operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
    payload: { namespace: artifact.namespace, digest: artifact.digest } });
  const serialized = canonicalJson(response.value);
  if (response.digest !== artifact.digest || response.sizeBytes !== artifact.sizeBytes
    || sha256Text(serialized) !== artifact.digest || Buffer.byteLength(serialized) !== artifact.sizeBytes) throw new Error('SOURCE_IMPLEMENTATION_ARTIFACT_CORRUPT');
  const result = response.value as { sourceRevision?: unknown; status?: unknown };
  if (result.status !== 'ready_for_testing' || typeof result.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/u.test(result.sourceRevision)) throw new Error('SOURCE_IMPLEMENTATION_REVISION_INVALID');
  return result.sourceRevision;
}
