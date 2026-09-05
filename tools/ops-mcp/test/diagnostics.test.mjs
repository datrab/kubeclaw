import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedUtf8, logObservation } from '../src/diagnostics.mjs';

test('byte limit never splits UTF-8 or expands beyond the advertised budget', () => {
  for (const text of ['€'.repeat(22000), '😀'.repeat(17000), 'plain'.repeat(15000)]) {
    const result = boundedUtf8(text, 65536);
    assert.equal(result.truncated, true);
    assert.ok(Buffer.byteLength(result.text) <= 65536);
    assert.ok(!result.text.includes('\ufffd'));
  }
});
test('content is not redacted and unavailable history is never called complete', () => {
  const raw = '2026-09-05T14:00:00Z token=example diagnostic URL\n';
  const result = logObservation(raw, { sinceTime: '2026-09-05T13:00:00Z' });
  assert.equal(result.text, raw);
  assert.equal(result.historicalCompleteness, 'unknown');
  assert.equal(result.firstReturnedTime, '2026-09-05T14:00:00Z');
  assert.equal(result.byteLimited, false);
});
test('tail saturation remains visible without assuming a full history', () => {
  assert.equal(logObservation('a\nb\n', { tailLines: 2 }).lineLimitReached, true);
});
