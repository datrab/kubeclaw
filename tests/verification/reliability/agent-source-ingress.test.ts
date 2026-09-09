import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activateWithSdk } from '../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts';
import { FileJournal } from '../../../skills/nova/core/src/index.ts';

const request = { capability: 'agent.events.subscribe', operation: 'status', payload: {} };
const invocation = (payload = {}, signal = new AbortController().signal) => ({ request: { ...request, payload }, signal, fence: { assertCurrent() {} } });

function fixture(config = {}, fail = false) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-ingress-'));
  const journal = new FileJournal(path.join(temporary, 'events.jsonl'));
  const handlers = new Map();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const adapter = activateWithSdk({ config: { hooks: ['agent_end'], maxQueueEvents: 3, maxQueueBytes: 4096, drainTimeoutMs: 50, ...config }, registration: {},
    async emit(type, identity, payload) { await blocked; if (fail) throw new Error('real downstream write cause'); journal.append({ type, identity, payload }); },
  }, { on(hook, handler) { handlers.set(hook, handler); return () => { handlers.delete(hook); }; } });
  return { adapter, handlers, release, journal, temporary };
}

test('actual source bounds accepted burst and drains accepted events into original durable journal after abort', async () => {
  const f = fixture();
  try {
    await f.adapter.ready();
    let rejected = 0;
    for (let i = 0; i < 100; i += 1) {
      try { f.handlers.get('agent_end')({ runId: `run:${i}`, durationMs: i }); }
      catch (error) { assert.match(error.message, /AGENT_EVENT_INGRESS_CAPACITY/); rejected += 1; }
    }
    assert.equal(rejected, 97);
    const status = await f.adapter.invoke(invocation({ waitForDrain: false }));
    assert.equal(status.queued, 3); assert.equal(status.rejected, 97); assert(status.queuedBytes <= 4096);
    const statusAbort = new AbortController();
    const waiting = f.adapter.invoke(invocation({}, statusAbort.signal));
    statusAbort.abort(new Error('status caller left'));
    await assert.rejects(waiting, /ADAPTER_CANCELLED/);
    const abort = new AbortController();
    const shutdown = f.adapter.shutdown(abort.signal);
    abort.abort(new Error('lease expired'));
    await assert.rejects(shutdown, /ADAPTER_CANCELLED/);
    assert.equal(f.handlers.size, 0);
    f.release();
    await f.adapter.shutdown(new AbortController().signal);
    const rows = fs.readFileSync(path.join(f.temporary, 'events.jsonl'), 'utf8').trim().split('\n');
    assert.equal(rows.length, 3);
    const final = await f.adapter.invoke(invocation({ waitForDrain: false }));
    assert.equal(final.emitted, 3); assert.equal(final.queued, 0); assert.equal(final.queuedBytes, 0);
  } finally { f.release(); await f.adapter.shutdown(new AbortController().signal); fs.rmSync(f.temporary, { recursive: true, force: true }); }
});

test('byte admission and shutdown deadline are explicit and do not erase queued events', async () => {
  const f = fixture({ maxQueueBytes: 300 });
  try {
    await f.adapter.ready();
    assert.throws(() => f.handlers.get('agent_end')({ runId: 'x'.repeat(512) }), /INGRESS_CAPACITY/);
    f.handlers.get('agent_end')({ runId: 'r' });
    await assert.rejects(f.adapter.shutdown(new AbortController().signal), /AGENT_EVENT_DRAIN_TIMEOUT:pending=1/);
    f.release();
    await f.adapter.shutdown(new AbortController().signal);
    assert.equal((await f.adapter.invoke(invocation({ waitForDrain: false }))).emitted, 1);
  } finally { f.release(); await f.adapter.shutdown(new AbortController().signal); fs.rmSync(f.temporary, { recursive: true, force: true }); }
});

test('emit failure keeps original cause and a visible failed-event count', async () => {
  const f = fixture({}, true);
  try {
    await f.adapter.ready(); f.handlers.get('agent_end')({ runId: 'r' }); f.release();
    const status = await f.adapter.invoke(invocation());
    assert.equal(status.failures, 1); assert.equal(status.emitted, 0);
    assert.match(status.lastError, /real downstream write cause/);
  } finally { f.release(); await f.adapter.shutdown(new AbortController().signal); fs.rmSync(f.temporary, { recursive: true, force: true }); }
});
