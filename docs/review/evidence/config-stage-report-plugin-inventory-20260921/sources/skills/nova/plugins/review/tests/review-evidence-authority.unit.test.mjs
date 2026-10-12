import assert from 'node:assert/strict';
import { sha256Text } from '@kubeclaw/plugin-sdk';
import { offeredReviewEvidence, offeredReviewEvidenceKeys } from '../src/review-evidence-authority.ts';

const content = 'export const changed = true;\n';
const digest = sha256Text(content);
const bundle = {
  evidence: [{ kind: 'contract', digest: sha256Text('contract'), content: 'contract' }],
  context: [{ path: 'src/index.ts', digest, content, reasons: [{ kind: 'changed' }] }],
};
assert.deepEqual(offeredReviewEvidence(bundle).at(-1), { kind: 'reviewed-source', digest });
assert.equal(offeredReviewEvidenceKeys(bundle).has(`reviewed-source\0${digest}`), true);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-evidence-authority' }));
