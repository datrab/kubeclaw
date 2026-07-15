import assert from 'node:assert/strict';
import test from 'node:test';

import { startAgentObservabilityIngester } from '../../../../../skills/nova/pipeline/services/agent-observability-runtime.ts';

test('runtime ingester stays inert when disabled in config', async () => {
  const runtime = startAgentObservabilityIngester({}, { requestId: 'ctx-test' });

  assert.equal(runtime.started, false);
  assert.equal(runtime.stats(), null);
  await runtime.stop();
});
