import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { activateWithSdk, normalizeAgentEvent } = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts')).href);
assert.equal(normalizeAgentEvent({}), undefined);
assert.deepEqual(normalizeAgentEvent({ run_id: 'run:1', stage_id: 'stage:1', attempt_id: 'attempt:1' })?.identity,
  { runId: 'run:1', stageId: 'stage:1', attemptId: 'attempt:1' });
const projected = normalizeAgentEvent({
  run_id: 'run:1',
  prompt: 'must-not-survive',
  authorization: 'Bearer must-not-survive-either',
  duration_ms: 12,
  success: true,
});
assert.deepEqual(projected.payload, {
  schemaVersion: 'openclaw-agent-event.v2',
  observedFields: ['duration_ms', 'prompt', 'success'],
  metrics: { duration_ms: 12, success: true },
});
const handlers = new Map();
let released = 0;
const sdk = { on(hook, handler) { handlers.set(hook, handler); return () => { handlers.delete(hook); released += 1; }; } };
const events = [];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-agent-events-'));
const journalPath = path.join(temporary, 'events.jsonl');
const journal = new core.FileJournal(journalPath);
const adapter = activateWithSdk({
  registration: {}, config: { hooks: ['agent_end', 'session_end'] },
  async invoke() { throw new Error('unexpected dependency'); },
  async emit(type, identity, payload) {
    events.push({ type, identity, payload });
    journal.append({ type, identity, payload });
  },
}, sdk);
const request = {
  requestId: 'request:status', idempotencyKey: 'status',
  attempt: { runId: 'run:1', stageId: 'stage:1', attemptId: 'attempt:1', attemptNumber: 1 },
  capability: 'agent.events.subscribe', operation: 'status',
  resource: { type: 'agent.events', canonicalId: 'openclaw' }, payload: {},
};
const fenced = { fence: { assertCurrent() {} } };
await adapter.ready();
handlers.get('agent_end')({
  identity: { runId: 'run:1', stageId: 'stage:1' },
  result: 'must-not-survive',
  token: 'must-not-survive-either',
  durationMs: 21,
});
handlers.get('session_end')({ noRun: true });
const status = await adapter.invoke({ ...fenced, request, signal: new AbortController().signal });
assert.equal(status.activeSubscriptions, 2);
assert.equal(status.emitted, 1);
assert.equal(status.failures, 0);
assert.equal(events[0].type, 'plugin.kubeclaw.openclaw-agent-events.agent-end');
assert.doesNotMatch(fs.readFileSync(journalPath, 'utf8'), /must-not-survive/);
await adapter.shutdown(new AbortController().signal);
assert.equal(released, 2);
assert.equal(handlers.size, 0);
assert.throws(() => activateWithSdk({
  registration: {}, config: { hooks: ['unknown'] }, async invoke() {}, async emit() {},
}, sdk), /AGENT_EVENT_HOOK_UNSUPPORTED/);
const partialHandlers = new Map();
let partialReleased = 0;
const partial = activateWithSdk({
  registration: {}, config: { hooks: ['agent_end', 'session_end'] },
  async invoke() { throw new Error('unexpected dependency'); }, async emit() {},
}, {
  on(hook, handler) {
    if (hook === 'session_end') throw new Error('subscription failed');
    partialHandlers.set(hook, handler);
    return () => { partialHandlers.delete(hook); partialReleased += 1; };
  },
});
await assert.rejects(partial.ready(), /subscription failed/);
assert.equal(partialHandlers.size, 0);
assert.equal(partialReleased, 1);
fs.rmSync(temporary, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.openclaw-agent-events', suite: 'live-function' }));
