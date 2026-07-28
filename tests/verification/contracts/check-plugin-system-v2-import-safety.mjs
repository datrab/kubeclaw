import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/common/plugin-runtime/core/src/index.ts')).href);
const roots = [
  path.resolve('skills/common/plugins'),
  path.resolve('skills/nova/plugins'),
  path.resolve('skills/buster/plugins'),
];
const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: roots,
  trustPolicy: {
    trustedBuiltinRoots: roots,
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:all-first-party-imports',
  },
}));
const enabled = new Set([
  ...[...snapshot.stages.values()].map(
    (entry) => `${entry.package.manifest.id}:${entry.registration.id}`,
  ),
  ...snapshot.observers.keys(),
  ...snapshot.adapters.keys(),
]);
const activated = await core.activateRegistry(snapshot, enabled);
assert.equal(activated.stages.size, 14);
assert.equal(activated.observers.size, 5);
assert.equal(activated.adapters.size, 14);
console.log(JSON.stringify({
  ok: true,
  contract: 'plugin-system-v2-import-safety',
  packages: snapshot.packages.size,
  registrations: enabled.size,
}));
