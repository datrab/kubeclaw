export async function execute(_input, context) {
  if (context.contract.guidance?.approved === true) {
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] };
  }
  return {
    schemaVersion: 'stage-result.v2',
    outcome: 'orchestrator_required',
    reason: { code: 'test.review_required', message: 'Review is required.' },
    artifacts: [],
    wait: {
      schemaVersion: 'wait-request.v2',
      waitId: 'wait:test-resume',
      kind: 'orchestrator',
      signalType: 'test.resume.approved',
      authorizedIssuer: { type: 'orchestrator', id: 'nova' },
      expiresAt: null
    }
  };
}
