import { canonicalJson, sha256Text } from './values.ts';
import type { ArtifactRef } from './generated/contracts.ts';
import type { PluginInvocationContext } from './runtime.ts';

function implementationArtifacts(sourceStageId: string, context: PluginInvocationContext): ArtifactRef[] {
  return context.contract.artifacts.filter(artifact => artifact.producer.runId === context.contract.lease.attempt.runId
    && artifact.producer.stageId === sourceStageId && artifact.namespace === 'kubeclaw.implementation-agent'
    && artifact.artifactId.startsWith('implementation:'));
}

function atAttempt(candidates: ArtifactRef[], attemptNumber: number): ArtifactRef {
  const selected = candidates.filter(artifact => artifact.producer.attemptNumber === attemptNumber);
  if (selected.length !== 1) throw new Error('SOURCE_IMPLEMENTATION_ARTIFACT_MISSING_OR_AMBIGUOUS');
  return selected[0]!;
}

async function readImplementation(artifact: ArtifactRef, context: PluginInvocationContext): Promise<{ sourceRevision: string; headBefore: unknown }> {
  const response = await context.invoke('artifacts.read', { operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
    payload: { namespace: artifact.namespace, digest: artifact.digest } });
  const serialized = canonicalJson(response.value);
  if (response.digest !== artifact.digest || response.sizeBytes !== artifact.sizeBytes
    || sha256Text(serialized) !== artifact.digest || Buffer.byteLength(serialized) !== artifact.sizeBytes) throw new Error('SOURCE_IMPLEMENTATION_ARTIFACT_CORRUPT');
  const result = response.value as { sourceRevision?: unknown; headBefore?: unknown; status?: unknown } | null;
  if (!result || result.status !== 'ready_for_testing' || typeof result.sourceRevision !== 'string'
    || !/^[a-f0-9]{40}$/u.test(result.sourceRevision)) throw new Error('SOURCE_IMPLEMENTATION_REVISION_INVALID');
  return { sourceRevision: result.sourceRevision, headBefore: result.headBefore };
}

/** Resolve the actual trusted implementation result, never ambient repository HEAD. */
export async function resolveSourceRevision(input: { readonly revision?: string; readonly sourceStageId?: string }, context: PluginInvocationContext): Promise<string> {
  if ((input.revision !== undefined) === (input.sourceStageId !== undefined)) throw new Error('SOURCE_REVISION_SELECTION_INVALID');
  if (input.revision !== undefined) {
    if (!/^[a-f0-9]{40}$/u.test(input.revision)) throw new Error('SOURCE_REVISION_INVALID');
    return input.revision;
  }
  const candidates = implementationArtifacts(input.sourceStageId!, context);
  return (await readImplementation(atAttempt(candidates, Math.max(...candidates.map(artifact => artifact.producer.attemptNumber))), context)).sourceRevision;
}

/** Keep the original module baseline across repairs, with the latest committed candidate. */
export async function resolveImplementationRevisions(sourceStageId: string, context: PluginInvocationContext): Promise<{ base: string; head: string }> {
  const candidates = implementationArtifacts(sourceStageId, context);
  const initial = atAttempt(candidates, Math.min(...candidates.map(artifact => artifact.producer.attemptNumber)));
  const latest = atAttempt(candidates, Math.max(...candidates.map(artifact => artifact.producer.attemptNumber)));
  const first = await readImplementation(initial, context);
  const last = initial === latest ? first : await readImplementation(latest, context);
  if (typeof first.headBefore !== 'string' || !/^[a-f0-9]{40}$/u.test(first.headBefore)) throw new Error('SOURCE_IMPLEMENTATION_BASE_INVALID');
  return { base: first.headBefore, head: last.sourceRevision };
}
