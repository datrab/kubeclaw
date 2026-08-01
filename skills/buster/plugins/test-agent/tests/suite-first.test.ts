import assert from 'node:assert/strict';
import { execute } from '../dist/stage.js';

const input = {
  runId: 'run-1',
  taskId: 'task-1',
  attempt: 1,
  task: 'Assess.',
  suiteEvidence: [],
  suitePlan: {
    repositoryRoot: '/repo',
    suites: ['unit'],
    testConfig: {},
    task: {},
  },
};
const receipt = {
  schemaVersion: 'test-suite-receipt.v1',
  provider: 'test-provider',
  jobId: 'job:unit',
  completedAt: '2026-07-30T00:00:00.000Z',
  resultDigest: 'a'.repeat(64),
};

{
  const invoked: string[] = [];
  const result = await execute(input, {
    contract: { config: { agent: 'buster' } },
    async invoke(capability: string) {
      invoked.push(capability);
      if (capability === 'test.suite.execute') {
        return { results: [{ suite: 'unit', status: 'PASS' }] };
      }
      throw new Error('REASONING_MUST_NOT_RUN_WITHOUT_SUITE_RECEIPT');
    },
  } as never);
  assert.equal(result.outcome, 'blocked');
  assert.deepEqual(invoked, ['test.suite.execute']);
}

{
  const invoked: string[] = [];
  const result = await execute(input, {
    contract: { config: { agent: 'buster' } },
    async invoke(capability: string) {
      invoked.push(capability);
      if (capability === 'test.suite.execute') {
        return { receipt, results: [{ suite: 'unit', status: 'PASS' }] };
      }
      if (capability === 'runtime.dispatch') {
        return { result: {
          verdict: 'PASS',
          summary: 'Passed.',
          findings: [],
          session: {
            sessionId: 'session-1',
            startedAt: '2026-07-30T00:00:00.000Z',
            completedAt: '2026-07-30T00:00:01.000Z',
            transcriptDigest: 'b'.repeat(64),
            termination: 'completed',
          },
        } };
      }
      if (capability === 'artifacts.write') return { artifact: {} };
      throw new Error(`UNEXPECTED_CAPABILITY:${capability}`);
    },
  } as never);
  assert.equal(result.outcome, 'passed');
  assert.deepEqual(invoked, [
    'test.suite.execute',
    'runtime.dispatch',
    'artifacts.write',
  ]);
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.test-agent', suite: 'suite-first' }));
