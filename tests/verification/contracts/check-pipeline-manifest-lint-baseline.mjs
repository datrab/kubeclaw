import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-manifest-lint-baseline.json', 'utf8'));
assert.equal(baseline.schemaVersion, 'pipeline-test-gate-manifest-lint-baseline.v1');
assert.equal(baseline.decision, 'D-008');
assert.equal(baseline.items.length, baseline.expectedItemCount);
assert.equal(new Set(baseline.items.map((item) => item.id)).size, baseline.expectedItemCount);
assert.equal(baseline.items.every((item) => /^MANIFEST-[A-Z]+-\d{3}$/u.test(item.id)), true);
assert.equal(baseline.items.every((item) => ['implementation-proved', 'parity-pending', 'parity-proved'].includes(item.state)), true);
assert.equal(baseline.items.every((item) => item.state === 'parity-proved'), true, 'completed parity phase must prove every baseline item');

const policy = JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/lint-policy.json', 'utf8'));
for (const id of ['kubernetes-schema', 'kubernetes-policy']) assert.equal(policy.experimental_tools.includes(id), false, `${id} must be authoritative after cutover`);
assert.equal(policy.projects[0].kubernetes.raw_manifests.length > 0, true);
assert.equal(policy.projects[0].kubernetes.helm_charts.length > 0, true);
assert.doesNotMatch(policy.projects[0].kubernetes.schema_location, /^https?:/u);

for (const document of [
  'docs/architecture/pipeline-test-gate-manifest-lint-implementation-plan.md',
  'docs/architecture/pipeline-test-gate-manifest-lint-user-guide.md',
  'docs/architecture/pipeline-test-gate-manifest-lint-operator-guide.md',
  'docs/architecture/pipeline-test-gate-manifest-lint-final-audit.md',
]) assert.equal(fs.existsSync(document), true, `missing document: ${document}`);

console.log(JSON.stringify({ ok: true, decision: 'D-008', baselineItems: baseline.expectedItemCount, replacement: 'authoritative', legacyAuthority: 'deleted' }));
