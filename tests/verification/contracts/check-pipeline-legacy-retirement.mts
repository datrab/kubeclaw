import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const retired of [
  'contracts/pipeline-test-gate/v1/legacy-suite-bridge.json',
  'skills/nova/core/test-gates/legacy-bridge.ts',
  'skills/buster/plugins/buster-suite-runtime',
]) assert.equal(fs.existsSync(retired), false, `retired compatibility surface remains: ${retired}`);

const schema = JSON.parse(fs.readFileSync(
  'skills/nova/plugins/remote-test-gate/schemas/config.schema.json', 'utf8'));
assert.equal(schema.additionalProperties, false);
assert.equal(Object.hasOwn(schema.properties, 'legacyLedgerPath'), false);

for (const file of [
  'skills/nova/core/test-gates/production.ts',
  'skills/nova/core/test-gates/remote-result-import.ts',
  'skills/nova/core/test-gates/runtime-config.ts',
  'skills/nova/plugins/remote-test-gate/src/adapter.ts',
]) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /legacy(?:Ledger|Suites)|LegacySuite|legacy-bridge/u,
    `legacy compatibility API remains: ${file}`);
}

const prism = await import('../../../skills/prism/pipeline-adapter/index.ts');
const plan = prism.toBusterPlan({ baselineDigest: `sha256:${'a'.repeat(64)}`, projectId: 'retirement',
  targets: [{ id: 'home', view: 'home', state: 'default', viewport: 'wide', fidelity: 'exact', path: '/' }] });
assert.equal(Object.hasOwn(plan, 'legacySuites'), false);

console.log(JSON.stringify({ ok: true, compatibility: 'retired', strictConfigSchema: true }));
