import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRateLimitDetectedPayload, formatRateLimitEmbed } from '../../../../../skills/common/pipeline/services/rate-limit-contract.ts';
import { validateTelemetryEventPayload } from '../../../../../skills/common/pipeline/services/telemetry/payload-schema.ts';

function fieldValue(embed, name) {
  return embed.fields.find((field) => field.name === name)?.value;
}

test('formatRateLimitEmbed formats numeric cooldowns', () => {
  const embed = formatRateLimitEmbed({}, 1, 3, 90 * 60 * 1000);

  assert.equal(fieldValue(embed, 'Cooldown'), '1.5h');
  assert.doesNotThrow(() => new Date(fieldValue(embed, 'Resume at')).toISOString());
});

test('formatRateLimitEmbed formats numeric-string cooldowns', () => {
  const embed = formatRateLimitEmbed({}, 1, 3, '600000');

  assert.equal(fieldValue(embed, 'Cooldown'), '10min');
  assert.doesNotThrow(() => new Date(fieldValue(embed, 'Resume at')).toISOString());
});

test('formatRateLimitEmbed handles missing and malformed cooldowns', () => {
  for (const cooldownMs of [undefined, null, '', 'not-a-number', -1]) {
    const embed = formatRateLimitEmbed({}, 1, 3, cooldownMs);

    assert.equal(fieldValue(embed, 'Cooldown'), 'unknown');
    assert.equal(fieldValue(embed, 'Resume at'), 'unknown');
  }
});

test('buildRateLimitDetectedPayload coerces numeric strings for telemetry schema', () => {
  const payload = buildRateLimitDetectedPayload({ attempt: '1' }, {
    cooldownMs: '600000',
    pauseCount: '2',
    maxPauses: '3',
  });

  assert.deepEqual(validateTelemetryEventPayload('rate_limit.detected', payload), []);
  assert.equal(payload.attempt, 1);
  assert.equal(payload.cooldown_ms, 600000);
  assert.equal(payload.retry_after_seconds, 600);
  assert.equal(payload.pause_count, 2);
  assert.equal(payload.max_pauses, 3);
});
