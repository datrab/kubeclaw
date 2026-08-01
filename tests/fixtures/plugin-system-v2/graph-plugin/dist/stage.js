export async function execute(input, context) {
  if (input.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, input.delayMs));
  }
  const attempt = context.contract.lease.attempt.attemptNumber;
  const reason = {
    code: input.reasonCode || `test.${input.mode}`,
    details: input.scenario ? { scenario: input.scenario } : {},
  };
  if (input.mode === 'throw') {
    throw new Error(input.reasonCode || 'test.throw');
  }
  if (input.mode === 'malformed') {
    return { scenario: input.scenario, reason };
  }
  if (input.mode === 'failed') {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'failed',
      reason,
      artifacts: [],
    };
  }
  if (input.mode === 'blocked') {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'blocked',
      reason,
      artifacts: [],
    };
  }
  if (input.mode === 'retry_always') {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'retry',
      reason,
      artifacts: [],
    };
  }
  if (input.mode === 'retry_then_pass' && attempt === 1) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'retry',
      reason,
      artifacts: [],
    };
  }
  if (input.mode === 'request_fix_then_pass' && attempt === 1) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'request_fix',
      reason,
      artifacts: [],
    };
  }
  if (input.mode === 'blocked_then_pass' && attempt === 1) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'blocked',
      reason: { code: 'test.administrative_review_required' },
      artifacts: [],
    };
  }
  return {
    schemaVersion: 'stage-result.v2',
    outcome: 'passed',
    artifacts: [],
    ...(input.facts ? { facts: input.facts } : {}),
  };
}
