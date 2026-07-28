import assert from 'node:assert/strict';
import { buildRequest, parseCompletion } from '../src/protocol.ts';

const input = { runId: 'run-1', moduleId: 'api', attempt: 2, task: 'Implement API.', headBefore: 'a'.repeat(40) };
assert.deepEqual(buildRequest('forge', input).identity, { runId: 'run-1', moduleId: 'api', attempt: 2 });
const valid = {
  status: 'ready_for_testing' as const,
  runId: 'run-1',
  moduleId: 'api',
  attempt: 2,
  summary: 'Done.',
  changedPaths: ['src/api.ts'],
  checks: [{ name: 'unit', passed: true }],
  session: {
    sessionId: 'session-1',
    startedAt: '2026-07-28T00:00:00.000Z',
    completedAt: '2026-07-28T00:00:01.000Z',
    transcriptDigest: 'a'.repeat(64),
    handoffs: 1,
    termination: 'completed' as const,
  },
};
assert.deepEqual(parseCompletion(valid, input), valid);
for (const invalid of [
  { ...valid, runId: 'stale' },
  { ...valid, changedPaths: [] },
  { ...valid, checks: [{ name: 'unit', passed: false }] },
  { ...valid, extra: true },
  { ...valid, changedPaths: ['../escape'] },
  { ...valid, status: 'blocked' },
  { ...valid, session: { ...valid.session, transcriptDigest: 'not-a-digest' } },
  { ...valid, session: { ...valid.session, completedAt: '2025-01-01T00:00:00.000Z' } },
  { ...valid, session: { ...valid.session, termination: 'cancelled' } },
]) assert.throws(() => parseCompletion(invalid, input));
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.implementation-agent', suite: 'protocol' }));
