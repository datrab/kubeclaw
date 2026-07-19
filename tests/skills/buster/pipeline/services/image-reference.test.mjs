import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImageReference } from '../../../../../skills/buster/pipeline/services/image-reference.ts';

test('image references require explicit registry authority', () => {
  assert.deepEqual(validateImageReference('library/python:3.12'), { ok: false, reason: 'not_fully_qualified' });
  assert.deepEqual(validateImageReference('team/image:tag'), { ok: false, reason: 'not_fully_qualified' });
  assert.deepEqual(validateImageReference('docker.io/library/python:3.12-slim'), { ok: true, value: 'docker.io/library/python:3.12-slim' });
  assert.deepEqual(validateImageReference('localhost/my/image:tag'), { ok: true, value: 'localhost/my/image:tag' });
});
