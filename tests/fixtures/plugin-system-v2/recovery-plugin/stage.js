export async function wait(_input, context) {
  if (context.contract.guidance?.approved === true) return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] };
  const reason = { code: 'test.approval_required', message: 'Approval is required.' };
  if (context.contract.config.mode === 'retry') return { schemaVersion: 'stage-result.v2', outcome: 'retry', reason, artifacts: [] };
  return { schemaVersion: 'stage-result.v2', outcome: 'wait', reason, artifacts: [], wait: {
    schemaVersion: 'wait-request.v2', waitId: `wait:explicit:${context.contract.lease.attempt.attemptId}`,
    kind: 'signal', signalType: 'test.recovery.approved', authorizedIssuer: { type: 'operator', id: 'operator' },
    expiresAt: context.contract.config.expiresAt ?? null,
  } };
}

export async function consume(_input, context) {
  const artifact = context.artifact('delivery-lint:api');
  if (!artifact) throw new Error('completed producer artifact missing from context');
  const response = await context.invoke('artifacts.read', { operation: 'get_json',
    resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
    payload: { namespace: artifact.namespace, digest: artifact.digest } });
  if (response.value?.moduleId !== 'api' || response.value?.passed !== true) throw new Error('producer report bytes mismatch');
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [], facts: { 'test.digest': artifact.digest } };
}
