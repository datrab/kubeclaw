#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildRegistry, discoverPackages, activateRegistry } from '../skills/nova/core/src/index.ts';
import { assertObserverSurfaces, assertObserverIdentities } from '../tests/verification/contracts/plugin-system-v2-observer-expectations.mjs';

const root = path.resolve(import.meta.dirname, '..');
const roots = ['common', 'nova', 'buster'].map((role) => path.join(root, 'skills', role, 'plugins'));
const registry = buildRegistry(discoverPackages({
  installationRoots: roots,
  trustPolicy: { trustedBuiltinRoots: roots, allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(), verifierId: 'ap08-reader-observers' },
}));
assertObserverSurfaces(registry, root);
const activated = await activateRegistry(registry, new Set(registry.observers.keys()));
assertObserverIdentities(activated.observers);
assert.equal(activated.stages.size, 0);
assert.equal(activated.adapters.size, 0);
console.log(JSON.stringify({ ok: true, observers: [...activated.observers.keys()],
  proof: 'registry identities, role inclusion, and selected activation; no delivery claim' }));
