import assert from 'node:assert/strict';

import {
  REVIEW_BUNDLE_SCHEMA_VERSION,
  REVIEW_CHANGE_STATUSES,
  REVIEW_CONTEXT_REASON_KINDS,
  REVIEW_CONTEXT_SELECTION_VERSION,
  reviewBundleSchema,
} from '../src/review-bundle-contract.ts';
import { assertReviewBundleResourceBounds } from '../src/review-bundle-bounds.ts';
import { REVIEW_HARD_LIMITS } from '../src/review-hard-limits.ts';

assert.equal(REVIEW_BUNDLE_SCHEMA_VERSION, 'review-bundle.v1');
assert.equal(REVIEW_CONTEXT_SELECTION_VERSION, 'focused-context.v1');
assert.deepEqual(reviewBundleSchema.properties.scope.properties.changedPaths.items.properties.status.enum, REVIEW_CHANGE_STATUSES);
assert.deepEqual(reviewBundleSchema.properties.context.items.properties.reasons.items.properties.kind.enum, REVIEW_CONTEXT_REASON_KINDS);
assert.equal(reviewBundleSchema.properties.context.maxItems, REVIEW_HARD_LIMITS.contextFiles);
assert.equal(reviewBundleSchema.properties.context.items.properties.content.maxLength, REVIEW_HARD_LIMITS.contextFileBytes);
assert.equal(reviewBundleSchema.properties.selection.properties.expansionRound.enum.length, 2);

const bounded = {
  evidence: [{ kind: 'test', digest: `sha256:${'0'.repeat(64)}`, content: '{"ok":true}' }],
  context: [{ path: 'src/index.ts', digest: `sha256:${'1'.repeat(64)}`, content: 'ok', reasons: [{ kind: 'changed' }] }],
};
assert.doesNotThrow(() => assertReviewBundleResourceBounds(bounded));
assert.throws(
  () => assertReviewBundleResourceBounds({
    ...bounded,
    evidence: [{ ...bounded.evidence[0], content: '{ "ok": true }' }],
  }),
  /canonical JSON/u,
);
assert.throws(
  () => assertReviewBundleResourceBounds({
    ...bounded,
    context: [{ ...bounded.context[0], content: '😀'.repeat(Math.floor(REVIEW_HARD_LIMITS.contextFileBytes / 4) + 1) }],
  }),
  /UTF-8 bytes/u,
);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-bundle-contract' }));
