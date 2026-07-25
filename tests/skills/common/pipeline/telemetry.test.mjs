import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeTelemetryPayload } from '../../../../skills/common/pipeline/egress.ts';
import { validateTelemetryEventPayload } from '../../../../skills/common/pipeline/services/telemetry/payload-schema.ts';
import { getTelemetrySeqKey, getTelemetryStreamKey } from '../../../../skills/common/pipeline/telemetry.ts';

test('telemetry stream keys do not collide when identity parts contain separators', () => {
  assert.notEqual(
    getTelemetryStreamKey('a:b', 'c'),
    getTelemetryStreamKey('a', 'b:c'),
  );
});

test('telemetry sequence keys do not collide when identity parts contain separators', () => {
  assert.notEqual(
    getTelemetrySeqKey('a:b', 'c'),
    getTelemetrySeqKey('a', 'b:c'),
  );
});

test('telemetry payload preserves arrays under secret-like keys', () => {
  assert.deepEqual(
    sanitizeTelemetryPayload({
      token: ['plain-secret'],
      api_keys: ['another-secret'],
      nested: {
        oauth: [['nested-secret']],
      },
    }),
    {
      token: ['plain-secret'],
      api_keys: ['another-secret'],
      nested: {
        oauth: [['nested-secret']],
      },
    },
  );
});

test('telemetry payload handling does not recurse indefinitely on circular arrays', () => {
  const items = ['safe'];
  items.push(items);

  const sanitized = sanitizeTelemetryPayload({
    plugin_id: 'plugin',
    plugin_event: 'event',
    details: { items },
  });

  assert.equal(sanitized.details.items[0], 'safe');
  assert.equal(sanitized.details.items[1].type, 'circular');
  assert.equal(sanitized.details.items[1].label, 'items');
  assert.equal(
    validateTelemetryEventPayload('plugin.event', {
      plugin_id: 'plugin',
      plugin_event: 'event',
      details: { items },
    }).includes('details has invalid type or value'),
    true,
  );
});

test('artifact completeness uses canonical reference_only spelling',()=>{
  const base={artifact_id:'artifact-1',logical_id:'logical-1',kind:'result',media_type:'application/json',byte_length:1,sha256:'a'.repeat(64),content_class:'artifact',reference:`blobs/sha256/${'a'.repeat(2)}/${'a'.repeat(62)}`};
  assert.deepEqual(validateTelemetryEventPayload('artifact.published',{...base,completeness:'reference_only'}),[]);
  assert.equal(validateTelemetryEventPayload('artifact.published',{...base,completeness:'reference-only'}).length>0,true);
});
