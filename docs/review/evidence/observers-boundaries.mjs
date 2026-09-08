// Original implementation probes; synthetic inputs, no replacement modules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lifecycleNotification } from '../../../skills/common/plugins/notification-observer/src/observer.ts';
import { parsePayload } from '../../../skills/common/plugins/operator-messaging/src/payload.ts';
import { activate } from '../../../skills/common/plugins/telemetry-store/src/adapter.ts';
import { ingressEventDedupeKey } from '../../../skills/common/plugins/openclaw-agent-observer/src/observer-support.ts';
import { toJsonValue } from '../../../skills/common/plugins/openclaw-agent-observer/src/hook-values.ts';

for (const [label, payload, error] of [
  ['newline-summary', { summary: 'first\nsecond' }, /OPERATOR_PAYLOAD_INVALID:summary/],
  ['long-reason', { reasonCode: 'r'.repeat(257) }, /OPERATOR_PAYLOAD_INVALID:reasonCode/],
]) {
  const projected = lifecycleNotification({ event: { eventId: 'event:1', type: 'run.failed', identity: { runId: 'run:1' }, payload } });
  assert.throws(() => parsePayload(projected, 65536), error);
  console.log(JSON.stringify({ probe: label, producerProjected: true, receiverRejected: true }));
}
const one = { type: 'openclaw.llm.output', identity: { run_id: 'run:1', session_key: 's:1', model_call_id: 'm:1' }, payload: { hook: 'llm_output', response: 'first' } };
const two = { ...one, identity: { ...one.identity, model_call_id: 'm:2' }, payload: { hook: 'llm_output', response: 'second' } };
assert.equal(ingressEventDedupeKey(one), ingressEventDedupeKey(two));
console.log(JSON.stringify({ probe: 'distinct-llm-output-dedupe-collision', equalKeys: true }));
const cycle = []; cycle.push(cycle);
assert.throws(() => toJsonValue(cycle), RangeError);
console.log(JSON.stringify({ probe: 'array-cycle-normalizer', error: 'RangeError' }));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-review-'));
const adapter = activate({ config: { root }, registration: {}, async emit() {}, async invoke() {} });
const invoke = (key, payload) => adapter.invoke({ request: { capability: 'telemetry.emit', operation: 'append', idempotencyKey: key, payload }, signal: new AbortController().signal, fence: { assertCurrent() {} } });
try {
  await invoke('key:1', { api_key: 'synthetic-marker', credential: 'synthetic-marker', password: 'synthetic-marker' });
  const record = JSON.parse(fs.readFileSync(path.join(root, 'records/store.json'), 'utf8')).records[0].payload;
  assert.equal(record.api_key, 'synthetic-marker');
  assert.equal(record.credential, 'synthetic-marker');
  assert.equal(record.password, '[REDACTED]');
  console.log(JSON.stringify({ probe: 'telemetry-store-sensitive-fields', apiKeyPersisted: true, credentialPersisted: true, passwordRedacted: true }));
  const cyclic = {}; cyclic.self = cyclic;
  await assert.rejects(invoke('key:2', cyclic), RangeError);
  console.log(JSON.stringify({ probe: 'telemetry-store-cycle', error: 'RangeError' }));
} finally { await adapter.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
