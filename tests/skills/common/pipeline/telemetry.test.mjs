import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeTelemetryPayload } from '../../../../skills/common/pipeline/redaction.ts';
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

test('telemetry payload redacts arrays under secret keys', () => {
  assert.deepEqual(
    sanitizeTelemetryPayload({
      token: ['plain-secret'],
      api_keys: ['another-secret'],
      nested: {
        oauth: [['nested-secret']],
      },
    }),
    {
      token: '[redacted-secret]',
      api_keys: '[redacted-secret]',
      nested: {
        oauth: '[redacted-secret]',
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
  assert.equal(sanitized.details.items[1].redacted, true);
  assert.equal(sanitized.details.items[1].label, 'payload');
  assert.equal(
    validateTelemetryEventPayload('plugin.event', {
      plugin_id: 'plugin',
      plugin_event: 'event',
      details: { items },
    }).includes('details has invalid type or value'),
    true,
  );
});
