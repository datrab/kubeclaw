import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createEmptyCoreKernel } from '../../../skills/nova/core/src/index.ts';
import { discoverPackages } from '../../../skills/common/plugin-runtime/foundation/registry/discovery.ts';
import { buildRegistry } from '../../../skills/common/plugin-runtime/foundation/registry/build.ts';
import { isObserverDeliveryInput } from '../../../skills/nova/core/telemetry/observers.ts';
import type { LifecycleEvent } from '../../../skills/common/plugin-runtime/sdk/src/index.ts';

const root = path.resolve('.');
const removed = [
  'skills/common/pipeline',
  'skills/nova/pipeline',
  'skills/buster/pipeline',
  'skills/buster/buster-pipeline.ts',
  'skills/common/plugin-runtime/core',
];
for (const target of removed) {
  assert.equal(fs.existsSync(path.join(root, target)), false, `legacy runtime remains: ${target}`);
}

const kernel = createEmptyCoreKernel();
assert.deepEqual(kernel.registry.packages, []);
assert.deepEqual(kernel.registry.registrations, []);

const coreFiles = fs.readdirSync(path.join(root, 'skills/nova/core'), {
  recursive: true,
  withFileTypes: true,
}).filter((entry) => entry.isFile() && /\.(?:ts|mjs)$/u.test(entry.name));
for (const file of coreFiles) {
  const source = fs.readFileSync(path.join(file.parentPath, file.name), 'utf8');
  assert.doesNotMatch(source, /skills\/(?:common|nova|buster)\/plugins/u, `${file.name} imports a concrete plugin`);
}

const pluginRoots = [
  path.join(root, 'skills/common/plugins'),
  path.join(root, 'skills/nova/plugins'),
  path.join(root, 'skills/buster/plugins'),
];
const packages = discoverPackages({
  installationRoots: pluginRoots,
  trustPolicy: {
    trustedBuiltinRoots: pluginRoots,
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'phase12-release-gate',
  },
});
const registry = buildRegistry(packages);
assert.equal(registry.stages.size, 17);
assert.equal(registry.observers.size, 6);
assert.equal(registry.adapters.size, 18);
for (const [type, owner] of registry.stages) {
  assert.ok(type.startsWith('kubeclaw.'), `stage type is not namespaced: ${type}`);
  assert.ok(owner.package.manifest.id.startsWith('kubeclaw.'), `stage owner is not a package: ${type}`);
}

const entrypoint = fs.readFileSync(path.join(root, 'skills/nova/pipeline.ts'), 'utf8');
assert.match(entrypoint, /\.\/core\/cli\.ts/u);
assert.doesNotMatch(entrypoint, /pipeline\/cli\.ts|compatib/u);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(packageJson.scripts.pipeline, 'node skills/nova/pipeline.ts');

const effectEvent = (attemptId: string): LifecycleEvent => ({
  schemaVersion: 'lifecycle-event.v2',
  eventId: `event:${attemptId}`,
  sequence: 1,
  type: 'effect.requested',
  identity: { runId: 'run:phase12', stageId: 'telemetry', attemptId },
  occurredAt: '2026-07-29T00:00:00.000Z',
  causationId: null,
  payload: {},
});
assert.equal(isObserverDeliveryInput(effectEvent('attempt:pipeline')), true);
assert.equal(
  isObserverDeliveryInput(effectEvent('observer:kubeclaw.telemetry-observer:telemetry:event:1')),
  false,
  'observer capability effects must not recursively feed observer delivery',
);

console.log(JSON.stringify({
  ok: true,
  phase: 12,
  packages: packages.length,
  registrations: {
    stages: registry.stages.size,
    observers: registry.observers.size,
    adapters: registry.adapters.size,
  },
}));
