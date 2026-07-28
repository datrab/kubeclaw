import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildReviewDispatchRequest,
  buildReviewTask,
} from '../dist/protocol.js';

const evidence = JSON.parse(fs.readFileSync(
  new URL('./fixtures/pass.json', import.meta.url),
  'utf8',
));

const first = buildReviewTask(
  { task: 'Review the adapter boundary.', evidence: { zeta: 2, alpha: evidence } },
  'Inspect the capability grant.',
);
const second = buildReviewTask(
  { task: 'Review the adapter boundary.', evidence: { alpha: evidence, zeta: 2 } },
  'Inspect the capability grant.',
);

assert.equal(first, second, 'task construction must be deterministic');
assert.match(first, /KubeClaw review protocol v2/);
assert.match(first, /Review the adapter boundary/);
assert.match(first, /Inspect the capability grant/);
assert.match(first, /unknown fields are forbidden/);
assert.match(first, /PASS requires no critical issues/);

const request = buildReviewDispatchRequest(
  'reviewer:primary',
  { task: 'Review the adapter boundary.', evidence },
  null,
);
assert.equal(request.protocol, 'kubeclaw.review.v2');
assert.equal(request.agent, 'reviewer:primary');
assert.equal(request.review.subject, 'Review the adapter boundary.');
assert.deepEqual(request.review.allowedStatuses, ['PASS', 'FAIL']);
assert.deepEqual(request.review.evidence, evidence);
assert.match(request.task, /No additional reviewer guidance was supplied/);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.review',
  suite: 'protocol-unit',
}));
