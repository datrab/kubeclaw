import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LEGACY_UNMIGRATED_SUITES } from '../../../skills/buster/plugins/buster-suite-runtime/src/protocol.ts';
import { EXECUTION_ORDER, DEPENDENCIES, validateSuiteNames } from '../../../skills/buster/plugins/buster-suite-runtime/src/runtime/runners/suite-runner.ts';

const oldRunner = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/build.ts';
assert.equal(fs.existsSync(oldRunner), false);
assert.equal(LEGACY_UNMIGRATED_SUITES.includes('build' as any), false);
assert.equal(EXECUTION_ORDER.includes('build'), false);
assert.equal(Object.hasOwn(DEPENDENCIES, 'build'), false);
assert.equal(Object.values(DEPENDENCIES).flat().includes('build'), false);
assert.throws(() => validateSuiteNames(['build']), /Invalid Buster suite request/u);
const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
assert.deepEqual(bridge.suites.build, { state: 'migrated', successor: 'kubeclaw.container-build@1' });
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-container-build-parity-ledger.json', 'utf8'));
assert.equal(ledger.items.length, 36);
execFileSync(process.execPath, ['tests/verification/contracts/check-pipeline-container-build-implementation.mts'], { stdio: 'pipe' });
console.log(JSON.stringify({ ok: true, phase: 'container-build-cutover', soleAuthority: 'container-build', deleted: ['legacy build protocol', 'legacy build runner'] }));
