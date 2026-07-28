export async function execute(input, context) {
  if (input.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, input.delayMs));
  }
  const attempt = context.contract.lease.attempt.attemptNumber;
  if (input.mode === 'retry_then_pass' && attempt === 1) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'retry',
      reason: { code: 'test.retry_once' },
      artifacts: [],
    };
  }
  if (input.mode === 'request_fix_then_pass' && attempt === 1) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'request_fix',
      reason: { code: 'test.fix_once' },
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
  };
}
