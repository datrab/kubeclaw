import assert from 'node:assert/strict';

import { reviewClusterId } from '../src/review-cluster-identity.ts';

const base = '1'.repeat(40);
const finding = {
  fingerprint: `sha256:${'2'.repeat(64)}`, category: 'correctness', priority: 'P0',
  message: 'Input is not checked.', recommendedFix: 'Validate the input.',
  changeRelation: 'introduced', scopeRelation: 'inside', evidenceStrength: 'direct',
  repairable: true, verified: true,
  rootCause: {
    category: 'correctness', sharedHint: 'missing-input-validation',
    primaryPath: 'src/input.ts', primarySymbol: 'parseInput', repairClass: 'validate',
  },
};
const singleton = finding;
assert.notEqual(reviewClusterId(base, singleton), reviewClusterId(base, {
  ...singleton, fingerprint: `sha256:${'3'.repeat(64)}`,
}));

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-cluster-identity' }));
