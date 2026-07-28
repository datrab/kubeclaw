import assert from 'node:assert/strict';
import { buildRequest, parseVerdict } from '../src/protocol.ts';

const input = { runId: 'run-1', taskId: 'task-1', attempt: 1, task: 'Assess.', suiteEvidence: [{ suite: 'unit', passed: true, summary: 'ok' }] };
assert.equal(buildRequest('buster', input).protocol, 'kubeclaw.buster-test-judgment.v2');
const valid = {
  verdict: 'PASS' as const,
  runId: 'run-1',
  taskId: 'task-1',
  attempt: 1,
  summary: 'Good.',
  findings: [],
  session: {
    sessionId: 'session-1',
    startedAt: '2026-07-28T00:00:00.000Z',
    completedAt: '2026-07-28T00:00:01.000Z',
    transcriptDigest: 'a'.repeat(64),
    termination: 'completed' as const,
  },
};
assert.deepEqual(parseVerdict(valid, input), valid);
for (const bad of [
  { ...valid, taskId: 'stale' },
  { ...valid, findings: ['bad'] },
  { ...valid, extra: true },
  { ...valid, verdict: 'FAIL' },
  { ...valid, session: { ...valid.session, transcriptDigest: 'bad' } },
  { ...valid, session: { ...valid.session, termination: 'cancelled' } },
]) assert.throws(() => parseVerdict(bad, input));
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.test-agent', suite: 'protocol' }));
