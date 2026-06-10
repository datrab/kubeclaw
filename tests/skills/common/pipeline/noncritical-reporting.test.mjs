import assert from 'node:assert/strict';
import test from 'node:test';

import { reportClassifiedNonBlockingError } from '../../../../skills/common/pipeline/noncritical-reporting.ts';

test('noncritical reporter falls through when custom log sink throws', () => {
  const fallbackLines = [];

  assert.doesNotThrow(() => {
    const reported = reportClassifiedNonBlockingError({
      reporter: 'test',
      classification: 'sink_failed',
      incidentKey: 'test:sink_failed:falls_through',
      message: 'custom sink failed',
      log() {
        throw new Error('log sink failed');
      },
      fallback(level, line) {
        fallbackLines.push({ level, line });
      },
    });

    assert.equal(reported, true);
  });

  assert.equal(fallbackLines.length, 1);
  assert.equal(fallbackLines[0].level, 'WARN');
  assert.match(fallbackLines[0].line, /\[test\] custom sink failed \(classification=sink_failed\)/);
});

test('noncritical reporter does not mark incident reported when all sinks fail', () => {
  const fallbackLines = [];
  const originalStderrWrite = process.stderr.write;

  let firstReported;
  try {
    process.stderr.write = () => {
      throw new Error('stderr sink failed');
    };

    firstReported = reportClassifiedNonBlockingError({
      reporter: 'test',
      classification: 'sink_retry',
      incidentKey: 'test:sink_retry:retry_after_failure',
      message: 'retry after sink failure',
      log() {
        throw new Error('log sink failed');
      },
      fallback() {
        throw new Error('fallback sink failed');
      },
    });
  } finally {
    process.stderr.write = originalStderrWrite;
  }

  const secondReported = reportClassifiedNonBlockingError({
    reporter: 'test',
    classification: 'sink_retry',
    incidentKey: 'test:sink_retry:retry_after_failure',
    message: 'retry after sink failure',
    log() {
      throw new Error('log sink failed');
    },
    fallback(level, line) {
      fallbackLines.push({ level, line });
    },
  });

  assert.equal(firstReported, false);
  assert.equal(secondReported, true);
  assert.equal(fallbackLines.length, 1);
});
