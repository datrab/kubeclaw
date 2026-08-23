import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSuiteNames } from '../../../skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts';
import { LEGACY_UNMIGRATED_SUITES } from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';

const legacy = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/bundle.ts';
assert.equal(fs.existsSync(legacy), false);
assert.equal(LEGACY_UNMIGRATED_SUITES.includes('bundle' as never), false);
assert.throws(() => validateSuiteNames(['bundle']), /Invalid Buster suite request/u);

const runner = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts', 'utf8');
const protocol = fs.readFileSync('skills/buster/plugins/buster-suite-runtime/src/protocol.ts', 'utf8');
for (const source of [runner, protocol]) assert.doesNotMatch(source, /['"]bundle['"]/u);

const scaffoldValues = fs.readFileSync('skills/nova/project_setup/tools/progress-scaffold-values.ts', 'utf8');
const scaffoldDiscovery = fs.readFileSync('skills/nova/project_setup/tools/progress-scaffold-discovery.ts', 'utf8');
assert.match(scaffoldValues, /MIGRATED_SUITES[^;]*bundle/su);
assert.match(scaffoldDiscovery, /delete config\.bundle/u);
assert.match(scaffoldDiscovery, /uses: 'kubeclaw\.size-budget@1'/u);
assert.match(scaffoldDiscovery, /maximumFileCount/u);
assert.match(scaffoldDiscovery, /LEGACY_BUNDLE_CONFIGURATION_RETIRED/u);

const setupSkill = fs.readFileSync('skills/nova/project_setup/SKILL.md', 'utf8');
const progressReference = fs.readFileSync('skills/nova/project_setup/progress-json.md', 'utf8');
assert.doesNotMatch(setupSkill, /`a11y`, `perf`, `bundle`/u);
assert.doesNotMatch(progressReference, /\| `bundle` \| `bundle` \|/u);
assert.match(progressReference, /migrates an existing `bundle` selection/u);

const realWorkspace = fs.readFileSync('tests/verification/e2e/real-run-workspace.mjs', 'utf8');
assert.match(realWorkspace, /uses: 'kubeclaw\.size-budget@1'/u);
assert.match(realWorkspace, /needs: \['size-budget'\]/u);
assert.doesNotMatch(realWorkspace, /test_config:\s*\{[^}]*bundle/su);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.match(packageJson.scripts['verify:test-gate:size-budget-cutover'], /size-budget-production/u);
assert.equal(fs.existsSync('tests/verification/contracts/check-pipeline-size-budget-production.mts'), true);
assert.equal(fs.existsSync('contracts/pipeline-test-gate/v1/examples/size-budget-growth.json'), true);

const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
assert.deepEqual(bridge.suites.bundle, { state: 'migrated', successor: 'kubeclaw.size-budget@1' });

await import('./check-pipeline-size-budget-implementation.mts');
console.log(JSON.stringify({ ok: true, phase: 'size-budget-cutover', authority: 'replacement-only',
  legacyDeleted: true, activeScaffoldingMigrates: true, productionDeclarationUsesReplacement: true, mocks: 0 }));
