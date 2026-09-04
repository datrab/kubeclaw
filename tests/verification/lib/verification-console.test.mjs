import assert from 'node:assert/strict';
import test from 'node:test';

import { installQuietRuntimeConsole } from './verification-console.mjs';

test('restoring the quiet console removes its process failure listeners', () => {
  const uncaughtBefore = process.listenerCount('uncaughtException');
  const rejectionBefore = process.listenerCount('unhandledRejection');
  const installed = installQuietRuntimeConsole({ verbose: false, label: 'listener-test' });
  assert.equal(process.listenerCount('uncaughtException'), uncaughtBefore + 1);
  assert.equal(process.listenerCount('unhandledRejection'), rejectionBefore + 1);
  installed.restore();
  assert.equal(process.listenerCount('uncaughtException'), uncaughtBefore);
  assert.equal(process.listenerCount('unhandledRejection'), rejectionBefore);
});
