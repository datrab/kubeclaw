import assert from 'node:assert/strict';
import { buildRequest, parseCompletion } from '../dist/protocol.js';
const input = { runId: 'run-1', moduleId: 'api', attempt: 2, task: 'Implement API.', headBefore: 'a'.repeat(40) };
assert.deepEqual(buildRequest('forge', input).identity, { runId: 'run-1', moduleId: 'api', attempt: 2 });
const valid = { status: 'ready_for_testing', runId: 'run-1', moduleId: 'api', attempt: 2, summary: 'Done.',
  changedPaths: ['src/api.ts'], checks: [{ name: 'unit', passed: true }] };
assert.deepEqual(parseCompletion(valid, input), valid);
for (const invalid of [
  { ...valid, runId: 'stale' }, { ...valid, changedPaths: [] },
  { ...valid, checks: [{ name: 'unit', passed: false }] }, { ...valid, extra: true },
  { ...valid, changedPaths: ['../escape'] }, { ...valid, status: 'blocked' },
]) assert.throws(() => parseCompletion(invalid, input));
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.implementation-agent', suite: 'protocol' }));
