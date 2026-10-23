/** Successful Job pods terminate; they must not be treated as unready services. */
export function fixturePodIsReady(pod: Record<string, unknown>): boolean {
  const status = pod.status as Record<string, unknown> | undefined;
  if (!status || status.phase === 'Failed') return false;
  if (status.phase === 'Succeeded') {
    const metadata = pod.metadata as Record<string, unknown> | undefined;
    const owners = metadata?.ownerReferences;
    return Array.isArray(owners) && owners.some((owner: Record<string, unknown>) =>
      owner?.apiVersion === 'batch/v1' && owner.kind === 'Job' && owner.controller === true);
  }
  return Array.isArray(status.conditions) && status.conditions.some((condition: Record<string, unknown>) =>
    condition?.type === 'Ready' && condition.status === 'True');
}
