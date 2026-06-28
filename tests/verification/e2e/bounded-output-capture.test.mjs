import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendStreamCapture,
  createChildOutputCapture,
  createStreamCapture,
  streamCaptureSnapshot,
} from './bounded-output-capture.mjs';

test('bounded output capture keeps byte-bounded tail and byte count', () => {
  const capture = createStreamCapture({ tailLimitBytes: 10 });

  appendStreamCapture(capture, '0123456789');
  appendStreamCapture(capture, 'abcdef');

  assert.deepEqual(streamCaptureSnapshot(capture), {
    tail: '6789abcdef',
    bytes: 16,
    truncated: true,
    tail_limit_bytes: 10,
    fatal_line_limit: 20,
    partial_line_limit_bytes: 8192,
    fatal_line_text_limit_bytes: 2048,
    fatal_lines: [],
  });
});

test('bounded output capture records first fatal-looking complete and partial lines', () => {
  const capture = createStreamCapture({ tailLimitBytes: 1024, fatalLineLimit: 2 });

  appendStreamCapture(capture, 'ordinary line\n');
  appendStreamCapture(capture, 'Error: first failure\n');
  appendStreamCapture(capture, 'WARN: ignored\n');
  appendStreamCapture(capture, 'fatal: second failure');
  appendStreamCapture(capture, ' continues\n');
  appendStreamCapture(capture, 'panic: third failure is past the limit\n');

  const snapshot = streamCaptureSnapshot(capture);
  assert.deepEqual(snapshot.fatal_lines, [
    'Error: first failure',
    'fatal: second failure continues',
  ]);
});

test('child output capture uses the same bounded stream schema for both streams', () => {
  const output = createChildOutputCapture({
    label: 'unit-child',
    tailLimitBytes: 5,
    fatalLineLimit: 1,
  });

  appendStreamCapture(output.stdout, 'hello world\n');
  appendStreamCapture(output.stderr, 'ENOENT missing file\nanother failure\n');

  assert.equal(output.label, 'unit-child');
  assert.deepEqual(streamCaptureSnapshot(output.stdout), {
    tail: 'orld\n',
    bytes: 12,
    truncated: true,
    tail_limit_bytes: 5,
    fatal_line_limit: 1,
    partial_line_limit_bytes: 8192,
    fatal_line_text_limit_bytes: 2048,
    fatal_lines: [],
  });
  assert.deepEqual(streamCaptureSnapshot(output.stderr), {
    tail: 'lure\n',
    bytes: 36,
    truncated: true,
    tail_limit_bytes: 5,
    fatal_line_limit: 1,
    partial_line_limit_bytes: 8192,
    fatal_line_text_limit_bytes: 2048,
    fatal_lines: ['ENOENT missing file'],
  });
});

test('bounded output capture does not retain unbounded partial or fatal lines', () => {
  const capture = createStreamCapture({
    tailLimitBytes: 1024,
    partialLineLimitBytes: 12,
    fatalLineTextLimitBytes: 16,
  });

  appendStreamCapture(capture, `${'x'.repeat(1000)}fatal error without newline`);
  assert.equal(capture.partial_line, 'hout newline');

  const fatalCapture = createStreamCapture({
    tailLimitBytes: 1024,
    partialLineLimitBytes: 12,
    fatalLineTextLimitBytes: 16,
  });
  appendStreamCapture(fatalCapture, `fatal error ${'x'.repeat(1000)}\n`);
  const fatalSnapshot = streamCaptureSnapshot(fatalCapture);

  const snapshot = streamCaptureSnapshot(capture);
  assert.equal(snapshot.partial_line_limit_bytes, 12);
  assert.equal(snapshot.fatal_line_text_limit_bytes, 16);
  assert.deepEqual(snapshot.fatal_lines, []);
  assert.deepEqual(fatalSnapshot.fatal_lines, ['fatal error xxxx']);
});
