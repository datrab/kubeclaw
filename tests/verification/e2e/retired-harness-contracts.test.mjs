import assert from 'node:assert/strict';
import test from 'node:test';
import { retiredHarnessContracts, retiredHarnessHits } from './retired-harness-contracts.mjs';

test('retired authorities reject while registered v1 contracts remain valid', () => {
  for (const contract of retiredHarnessContracts) {
    assert.deepEqual(retiredHarnessHits(`import value from '${contract}';`), [contract]);
  }
  assert.deepEqual(retiredHarnessHits(JSON.stringify([
    'buster-plan-health.v1', 'registry-clients.v1', 'pipeline-durable-record-store.v1',
    'gate-coverage.v1', 'kubeclaw.api-flow.v1',
  ])), []);
});
