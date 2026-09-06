import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(fs.readFileSync(new URL('../schemas/input.schema.json', import.meta.url), 'utf8')));
const input = { gateId: 'quality', task: 'Evaluate.' };
assert.equal(validate(input), false, 'a provider plan is mandatory');
assert.equal(validate({ ...input, suiteEvidence: [{ suite: 'security', passed: true, summary: 'claimed pass' }],
  suitePlan: { repositoryRoot: '/repo', suites: [], testConfig: {}, task: {} } }), false,
'caller-owned success is not gate authority');
const plan = { repositoryRoot: '/repo', repositoryId: 'repo', plan: {}, grants: {}, maximumConcurrency: 1,
  submittedAt: '2026-09-06T00:00:00Z', timeoutMs: 1000, revision: 'a'.repeat(40) };
assert.equal(validate({ ...input, providerPlan: plan }), true);
for (const retired of ['suiteEvidence', 'suitePlan', 'runId', 'attempt']) {
  assert.equal(validate({ ...input, providerPlan: plan, [retired]: null }), false, retired);
}
assert.equal(validate({ ...input, providerPlan: { ...plan, sourceStageId: 'implementation' } }), false);
console.log(JSON.stringify({ ok: true, suite: 'quality-input-authority' }));
