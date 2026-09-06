import assert from 'node:assert/strict';
import { execute } from '../src/stage.ts';

const base = {
  runId: 'run-1', taskId: 'task-1', attempt: 1, task: 'Assess.',
  suiteEvidence: [{ suite: 'provider', passed: true, summary: 'passed' }],
  suitePlan: { repositoryRoot: '/repo', suites: [], testConfig: {}, task: {} },
};

{
  const invoked: string[] = [];
  const result = await execute({ ...base, suitePlan: { ...base.suitePlan, suites: ['unit'] } }, {
    contract: { config: { agent: 'buster' }, lease: { attempt: { runId: 'run:core', stageId: 'test', attemptId: 'attempt:core', attemptNumber: 2 } } },
    async invoke(capability: string) { invoked.push(capability); throw new Error('MUST_NOT_INVOKE'); },
  } as never);
  assert.equal(result.outcome, 'blocked');
  assert.match(result.reason?.message ?? '', /LEGACY_TEST_SUITE_RETIRED/u);
  assert.deepEqual(invoked, []);
}

{
  const invoked: string[] = [];
  const result = await execute(base, {
    contract: { config: { agent: 'buster' }, lease: { attempt: { runId: 'run:core', stageId: 'test', attemptId: 'attempt:core', attemptNumber: 2 } } },
    async invoke(capability: string, request: { payload: { identity?: { runId: string; attempt: number } } }) {
      invoked.push(capability);
      if (capability === 'runtime.dispatch') assert.deepEqual({ runId: request.payload.identity?.runId, attempt: request.payload.identity?.attempt }, { runId: 'run:core', attempt: 2 });
      if (capability === 'runtime.dispatch') return { result: {
        verdict: 'PASS', summary: 'Passed.', findings: [], session: {
          sessionId: 'session-1', startedAt: '2026-07-30T00:00:00.000Z',
          completedAt: '2026-07-30T00:00:01.000Z', transcriptDigest: 'b'.repeat(64), termination: 'completed',
        },
      } };
      if (capability === 'artifacts.write') return { artifact: {} };
      throw new Error(`UNEXPECTED_CAPABILITY:${capability}`);
    },
  } as never);
  assert.equal(result.outcome, 'passed');
  assert.deepEqual(invoked, ['runtime.dispatch', 'artifacts.write']);
}

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.test-agent', suite: 'provider-only' }));
