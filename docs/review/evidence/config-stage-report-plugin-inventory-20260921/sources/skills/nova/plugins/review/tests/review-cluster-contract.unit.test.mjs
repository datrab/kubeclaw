import assert from 'node:assert/strict';

import {
  classifyRepair,
  REVIEW_CLUSTER_SCHEMA_VERSION,
  sharedRootCauseHint,
} from '../src/review-cluster-contract.ts';

assert.equal(REVIEW_CLUSTER_SCHEMA_VERSION, 'review-finding-cluster.v1');
assert.equal(sharedRootCauseHint('missing-input-validation'), 'missing-input-validation');
assert.equal(sharedRootCauseHint('Missing input validation'), undefined);
assert.equal(sharedRootCauseHint('missing_input_validation'), undefined);
assert.equal(sharedRootCauseHint(undefined), undefined);
assert.equal(classifyRepair('Delete the unused branch.'), 'delete');
assert.equal(classifyRepair('Validate the request before dispatch.'), 'validate');
assert.equal(classifyRepair('Serialize access to the shared state.'), 'synchronize');
assert.equal(classifyRepair('Improve the implementation.'), 'other');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-cluster-contract' }));
