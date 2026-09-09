import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenClawAgentObserver } from '../src/index.ts';
import { toJsonValue } from '../src/hook-values.ts';
import { normalizeHookEvent } from '../src/hook-normalizers.ts';

function observer(maxQueuePerStream = 32) {
  const writes: unknown[][] = [];
  const warnings: string[] = [];
  const instance = createOpenClawAgentObserver({
    env: {}, initialConfig: { enabled: true, redisHost: '127.0.0.1', maxEventBytes: 1024 * 1024, redisNetworkIsolation: 'strict', redisCommandTimeoutMs: 100, streamMaxLen: 5000, deadLetterMaxLen: 500, controlWriteMaxAttempts: 1, controlWriteRetryBaseMs: 1, controlWriteRetryMaxMs: 1, hookPriority: 0, hookTimeoutMs: 1000, maxQueuePerStream },
    diagnosticSubscriberFactory: () => () => {},
    logger: { warn: (message) => warnings.push(message), info() {}, error() {}, debug() {} },
    redisClientFactory: () => ({ async xadd(...args) { writes.push(args); return '1-0'; }, async quit() {} }),
  });
  return { instance, writes, warnings };
}

test('actual observer preserves distinct outputs and deduplicates shared call content across hook/runtime', async () => {
  const { instance, writes } = observer();
  try {
    instance.handleHook('llm_output', { runId: 'r', modelCallId: 'a', response: 'first' });
    instance.handleHook('llm_output', { runId: 'r', modelCallId: 'b', response: 'second' });
    instance.handleHook('llm_output', { runId: 'r', modelCallId: 'a', response: 'first' });
    instance.handleAgentEvent({ runId: 'r', stream: 'assistant', seq: 1, data: { modelCallId: 'a', response: 'first' } });
    instance.handleAgentEvent({ runId: 'r', stream: 'assistant', seq: 4, data: { modelCallId: 'a', response: 'first' } });
    instance.handleAgentEvent({ runId: 'r', stream: 'assistant', seq: 2, data: { response: 'same text' } });
    instance.handleAgentEvent({ runId: 'r', stream: 'assistant', seq: 3, data: { response: 'same text' } });
    instance.handleAgentEvent({ runId: 'r', stream: 'assistant', seq: 3, data: { response: 'same text' } });
    await instance.flush();
    assert.equal(writes.length, 5);
    assert.deepEqual(writes.map((args) => JSON.parse(String(args.at(-1))).payload.response), ['first', 'second', 'first', 'same text', 'same text']);
  } finally { await instance.stop(); }
});

test('queue rejection does not poison ingress or runtime dedupe', async () => {
  const { instance, writes } = observer(1);
  const event = { runId: 'r', stream: 'assistant', seq: 1, data: { modelCallId: 'b', response: 'later' } };
  try {
    instance.handleHook('llm_output', { runId: 'occupant', modelCallId: 'a', response: 'first' });
    instance.handleAgentEvent(event);
    assert.equal(instance.getStats().droppedQueueFull, 1);
    await instance.flush();
    instance.handleAgentEvent(event);
    await instance.flush();
    assert.equal(writes.length, 2);
  } finally { await instance.stop(); }
});

test('normalization handles array/record cycles and shared values, rejecting complexity/accessors explicitly', () => {
  const array: unknown[] = []; array.push(array);
  assert.deepEqual(toJsonValue(array), ['[Circular]']);
  const shared = { value: 'complete' };
  assert.equal(JSON.stringify(toJsonValue([shared, shared])), '[{"value":"complete"},{"value":"complete"}]');
  const record: Record<string, unknown> = {}; record.self = record;
  assert.equal(JSON.stringify(toJsonValue(record)), '{"self":"[Circular]"}');
  let deep: unknown = 'leaf'; for (let i = 0; i < 300; i += 1) deep = [deep];
  assert.throws(() => toJsonValue(deep), /OBSERVER_NORMALIZATION_COMPLEXITY_LIMIT/);
  let getterCalls = 0;
  assert.throws(() => toJsonValue({ get unsafe() { getterCalls += 1; return 'value'; } }), /ACCESSOR_DENIED/);
  assert.equal(getterCalls, 0);
  assert.throws(() => toJsonValue(new Proxy({}, { ownKeys() { throw new Error('trap invoked'); } })), /PROXY_DENIED/);
  assert.equal(toJsonValue(123n), '123');
  assert.equal(toJsonValue(new Date('2026-09-09T00:00:00Z')), '2026-09-09T00:00:00.000Z');
  assert.equal((toJsonValue(new Error('cause preserved')) as { message: string }).message, 'cause preserved');
  const normal = normalizeHookEvent('after_tool_call', { runId: 'r', toolCallId: 't', modelCallId: 'm', result: { demoCredential: 'pipeline-generated-demo', text: 'x'.repeat(100000) } });
  assert.equal((normal.payload as { result: { text: string } }).result.text.length, 100000);
});

test('actual hook records cycle marker and reports excessive depth without a RangeError', async () => {
  const { instance, writes, warnings } = observer();
  const array: unknown[] = []; array.push(array);
  try {
    instance.handleHook('llm_output', { runId: 'r', response: array });
    let deep: unknown = null; for (let i = 0; i < 300; i += 1) deep = [deep];
    instance.handleHook('llm_output', { runId: 'r', response: deep });
    await instance.flush();
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(String(writes[0]!.at(-1))).payload.response, ['[Circular]']);
    assert.match(warnings.join('\n'), /OBSERVER_NORMALIZATION_COMPLEXITY_LIMIT/);
  } finally { await instance.stop(); }
});
