import assert from 'node:assert/strict';
import { execute } from '../src/stage.ts';

const input = {
  runId: 'run-1',
  gateId: 'quality',
  attempt: 1,
  task: 'Evaluate.',
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
          outcome: 'passed',
          summary: 'Passed.',
          failureClass: 'none',
          findings: [],
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

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.buster-quality-gate',
  suite: 'suite-first',
}));
