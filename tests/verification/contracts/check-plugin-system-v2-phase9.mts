#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../..');
const readJson = (relativePath: string) => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), 'utf8'),
);
const ledger = readJson('docs/architecture/plugin-system-migration-units.json');
const phase9 = readJson('docs/architecture/plugin-system-phase9-evidence.json');
const expectedUnits = [
  'buster-worker-and-suites',
  'forge-and-implementation',
  'privileged-adapters',
  'prompt-library',
  'review-approval-and-reporting',
  'validation-and-lint',
];

assert.deepEqual([...phase9.units].sort(), expectedUnits);
assert.equal(phase9.status, 'complete');
assert.equal(phase9.activeAuthority, 'skills-role-bundles-v1');
assert.deepEqual(phase9.registry, {
  pipelinePackages: 30,
  stages: 14,
  observers: 5,
  adapters: 16,
  registrations: 35,
  discoveredPackageRoots: 31,
});

for (const unitId of expectedUnits) {
  const unit = ledger.units.find((candidate: { id: string }) => candidate.id === unitId);
  assert.ok(unit, `missing Phase 9 migration unit: ${unitId}`);
  assert.equal(unit.status, 'parity-proven', `${unitId} is not parity-proven`);
  assert.deepEqual(unit.parityBlockers, [], `${unitId} retains parity blockers`);
  assert.ok(unit.evidenceRecord, `${unitId} has no immutable evidence record`);
  assert.equal(
    fs.existsSync(path.join(root, unit.evidenceRecord)),
    true,
    `${unitId} evidence record is missing`,
  );
  for (const mapping of unit.replacementMappings) {
    assert.notEqual(mapping.status, 'blocked', `${unitId}/${mapping.id} is blocked`);
  }
}

const observerUnit = ledger.units.find(
  (candidate: { id: string }) => candidate.id === 'observability-and-notifications',
);
assert.equal(
  observerUnit.status,
  'baseline-retained',
  'observer migration belongs to Phase 10 and cannot be claimed by Phase 9',
);

const core = await import(pathToFileURL(
  path.join(root, 'skills/common/plugin-runtime/core/src/index.ts'),
).href);
const pluginRoots = ['common', 'nova', 'buster']
  .map((role) => path.join(root, 'skills', role, 'plugins'));
const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: pluginRoots,
  trustPolicy: {
    trustedBuiltinRoots: pluginRoots,
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'verification:phase9',
  },
  now: () => new Date('2026-07-28T00:00:00.000Z'),
}));

assert.equal(snapshot.packages.size, phase9.registry.pipelinePackages);
assert.equal(snapshot.stages.size, phase9.registry.stages);
assert.equal(snapshot.observers.size, phase9.registry.observers);
assert.equal(snapshot.adapters.size, phase9.registry.adapters);
assert.equal(
  snapshot.stages.size + snapshot.observers.size + snapshot.adapters.size,
  phase9.registry.registrations,
);

console.log(JSON.stringify({
  ok: true,
  contract: 'plugin-system-v2-phase9',
  parityUnits: expectedUnits.length,
  packages: snapshot.packages.size,
  registrations: phase9.registry.registrations,
}));
