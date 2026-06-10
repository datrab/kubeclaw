import assert from 'node:assert/strict';
import test from 'node:test';

import { validateBaseImageRef } from '../../../../../skills/buster/pipeline/services/base-images.ts';

test('validateBaseImageRef rejects implicit registry image references', () => {
  assert.deepEqual(validateBaseImageRef('library/python:3.12'), {
    ok: false,
    reason: 'not_fully_qualified',
  });
  assert.deepEqual(validateBaseImageRef('team/image:tag'), {
    ok: false,
    reason: 'not_fully_qualified',
  });
});

test('validateBaseImageRef accepts explicit registry image references', () => {
  assert.deepEqual(validateBaseImageRef('docker.io/library/python:3.12-slim'), {
    ok: true,
    value: 'docker.io/library/python:3.12-slim',
  });
  assert.deepEqual(validateBaseImageRef('localhost/my/image:tag'), {
    ok: true,
    value: 'localhost/my/image:tag',
  });
});
