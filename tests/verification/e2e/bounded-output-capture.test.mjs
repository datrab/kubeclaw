import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import {
  appendStreamCapture,
  captureChildOutput,
  createChildOutputCapture,
  createStreamCapture,
  childOutputDiagnostics,
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

test('child output capture writes full logs to files without mirroring output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-output-full-log-'));
  const stdoutLogPath = path.join(root, 'child.stdout.log');
  const stderrLogPath = path.join(root, 'child.stderr.log');
  const child = {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  };

  const output = captureChildOutput(child, {
    label: 'unit-child',
    mirrorOutput: false,
    stdoutLogPath,
    stderrLogPath,
    tailLimitBytes: 8,
  });

  child.stdout.write('stdout full log line\n');
  child.stderr.write('stderr full log line\n');

  assert.equal(fs.readFileSync(stdoutLogPath, 'utf8'), 'stdout full log line\n');
  assert.equal(fs.readFileSync(stderrLogPath, 'utf8'), 'stderr full log line\n');
  assert.deepEqual(childOutputDiagnostics('unit-child', output), {
    label: 'unit-child',
    stdout_log_path: stdoutLogPath,
    stderr_log_path: stderrLogPath,
    stdout: {
      tail: 'og line\n',
      bytes: 21,
      truncated: true,
      tail_limit_bytes: 8,
      fatal_line_limit: 20,
      partial_line_limit_bytes: 8192,
      fatal_line_text_limit_bytes: 2048,
      fatal_lines: [],
    },
    stderr: {
      tail: 'og line\n',
      bytes: 21,
      truncated: true,
      tail_limit_bytes: 8,
      fatal_line_limit: 20,
      partial_line_limit_bytes: 8192,
      fatal_line_text_limit_bytes: 2048,
      fatal_lines: [],
    },
  });
});
