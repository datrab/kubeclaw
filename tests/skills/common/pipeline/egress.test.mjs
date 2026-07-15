import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeAcpTranscriptEvidence, sanitizeDiscordMessage, sanitizeTelemetryPayload } from '../../../../skills/common/pipeline/egress.ts';

test('discord embed sanitizer preserves values and drops unsupported embed extras', () => {
  const sanitized = sanitizeDiscordMessage({
    content: 'deploy notice',
    embeds: [{
      title: 'Build',
      url: 'https://example.test/build?token=plain-url-secret',
      unsafe_extra: 'Bearer unsanitized-extra-secret',
      author: {
        name: 'bot',
        url: 'https://example.test/author?api_key=plain-author-secret',
      },
      image: {
        url: 'https://example.test/image?password=plain-image-secret',
      },
      thumbnail: {
        url: 'https://example.test/thumb?secret=plain-thumbnail-secret',
      },
      footer: {
        text: 'footer token=plain-footer-text-secret',
        icon_url: 'https://example.test/icon?token=plain-footer-icon-secret',
      },
      fields: [
        { name: 'token', value: 'plain-field-secret', inline: true },
      ],
    }],
  });

  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes('plain-url-secret'), true);
  assert.equal(serialized.includes('plain-author-secret'), true);
  assert.equal(serialized.includes('plain-image-secret'), true);
  assert.equal(serialized.includes('plain-thumbnail-secret'), true);
  assert.equal(serialized.includes('plain-footer-text-secret'), true);
  assert.equal(serialized.includes('plain-footer-icon-secret'), true);
  assert.equal(serialized.includes('plain-field-secret'), true);
  assert.equal(serialized.includes('unsanitized-extra-secret'), false);
  assert.equal(sanitized.embeds[0].fields[0].value, 'plain-field-secret');
});

test('telemetry sanitizer preserves token counters and token values', () => {
  const sanitized = sanitizeTelemetryPayload({
    input_tokens: 123,
    output_tokens: 45,
    auth_token: 'plain-secret-token',
    accessToken: 'plain-camel-secret',
  });

  assert.equal(sanitized.input_tokens, 123);
  assert.equal(sanitized.output_tokens, 45);
  assert.equal(sanitized.auth_token, 'plain-secret-token');
  assert.equal(sanitized.accessToken, 'plain-camel-secret');
});

test('transcript evidence sanitizer preserves diagnostic content', () => {
  const sanitized = sanitizeAcpTranscriptEvidence({
    eventCount: 1,
    lastActivityPoll: 0,
    lastDetail: 'adapter command missing token=UnsafeTranscriptToken1234567890',
    partialLine: 'raw partial line token=UnsafePartialToken1234567890',
  });

  assert.equal(sanitized.lastDetail, 'adapter command missing token=UnsafeTranscriptToken1234567890');
  assert.equal(sanitized.partialLine, 'raw partial line token=UnsafePartialToken1234567890');
});
