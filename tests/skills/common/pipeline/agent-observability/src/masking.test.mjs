import assert from 'node:assert/strict';
import test from 'node:test';

import { AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN } from '../../../../../../skills/common/pipeline/agent-observability/src/constants.ts';
import { applyMinimalApiKeyMask } from '../../../../../../skills/common/pipeline/agent-observability/src/masking.ts';

test('applyMinimalApiKeyMask redacts object-field api keys', () => {
  const result = applyMinimalApiKeyMask({
    api_key: '1234567890123456',
    prompt: 'keep this',
  });

  assert.equal(result.value.api_key, '[REDACTED_API_KEY]');
  assert.equal(result.value.prompt, 'keep this');
  assert.deepEqual(result.masking.masked, [AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN]);
});

test('applyMinimalApiKeyMask redacts authorization header object values', () => {
  const result = applyMinimalApiKeyMask({
    headers: {
      Authorization: 'Bearer 1234567890123456',
    },
  });

  assert.equal(result.value.headers.Authorization, '[REDACTED_API_KEY]');
  assert.deepEqual(result.masking.masked, [AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN]);
});

test('applyMinimalApiKeyMask preserves token counters while redacting token secrets', () => {
  const result = applyMinimalApiKeyMask({
    usage: {
      input_tokens: 123,
      output_tokens: 45,
    },
    accessToken: '1234567890123456',
  });

  assert.equal(result.value.usage.input_tokens, 123);
  assert.equal(result.value.usage.output_tokens, 45);
  assert.equal(result.value.accessToken, '[REDACTED_API_KEY]');
  assert.deepEqual(result.masking.masked, [AGENT_OBSERVABILITY_MASK_BASIC_API_KEY_PATTERN]);
});
