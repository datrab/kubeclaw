#!/usr/bin/env node
// Native authority-boundary qualification, NOT a registered drift-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expandSwarmConfig } from '../tests/verification/e2e/support/platform-config.ts';
import { loadPlatformConfig } from '../skills/common/plugin-runtime/foundation/config/platform.ts';
import { resolveCapabilityGrants } from '../skills/common/plugin-runtime/foundation/registry/capabilities.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const compact = JSON.parse(read('charts/kubeclaw/files/config/swarm.config.json'));
const original = JSON.stringify(compact);
const authored = { ...compact, repo_root: '/fixture/repository' };
const effective = expandSwarmConfig(authored);
for (const key of ['roles', 'grants', 'providers']) {
  assert(!Object.hasOwn(effective, key), `standard profile unexpectedly produces ${key}; reassess reader boundary`);
  assert.throws(() => expandSwarmConfig({ ...authored, [key]: {} }), new RegExp(`config\\.${key}: unsupported compact swarm config field`));
  assert.throws(() => expandSwarmConfig({ ...authored, overrides: { [key]: { fixture: {} } } }), new RegExp(`overrides\\.${key}: unsupported effective config path`));
}
// A real known-path override is accepted; rejection is not a broken expander.
const positive = expandSwarmConfig({ ...authored, overrides: { polling: { interval_seconds: 17 } } });
assert.equal(positive.polling.interval_seconds, 17);
assert.equal(JSON.stringify(compact), original, 'qualification modified authored config');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-capability-swarm-boundary-'));
try {
  const platform = JSON.parse(read('docs/site/use/workflows/wait-resume/platform.template.json'));
  const file = path.join(temporary, 'platform.json');
  fs.writeFileSync(file, JSON.stringify(platform));
  const loaded = loadPlatformConfig(file);
  assert.deepEqual(loaded.grants, platform.grants);
  assert.deepEqual(loaded.providers, platform.providers);
  fs.writeFileSync(file, JSON.stringify({ ...platform, roles: {} }));
  assert.throws(() => loadPlatformConfig(file), /PLATFORM_CONFIG_INVALID/);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

// Exercise the actual resolver with a finite in-memory registry, not an installed deployment.
const consumer = 'fixture.consumer:stage';
const provider = 'fixture.provider:state';
const capability = 'state.read';
const entry = (id, registration) => ({ package: { manifest: { id }, provenance: { package: { id, version: '1.0.0' } } }, registration });
const snapshot = {
  stages: new Map([['fixture.stage', entry('fixture.consumer', { id: 'stage', requiredCapabilities: [capability] })]]),
  observers: new Map(),
  adapters: new Map([[provider, entry('fixture.provider', { id: 'state', requiredCapabilities: [], providesCapabilities: [capability] })]]),
  capabilityProviders: new Map([[capability, [provider]]]),
};
const policy = {
  enabledRegistrations: new Set([consumer]),
  grants: new Map([[consumer, new Map([[capability, { allowedNamespaces: ['fixture.scope'] }]])]]),
  providers: new Map([[capability, provider]]),
};
const resolved = resolveCapabilityGrants(snapshot, policy);
assert.deepEqual(resolved.grants.get(consumer)[0].constraints, { allowedNamespaces: ['fixture.scope'] });
assert.equal(resolved.grants.get(consumer)[0].provider.registrationId, 'state');
assert.throws(() => resolveCapabilityGrants(snapshot, { ...policy, grants: new Map() }), error => error.code === 'REGISTRY_CAPABILITY_DENIED');
assert.throws(() => resolveCapabilityGrants(snapshot, { ...policy, grants: new Map([[consumer, new Map([...policy.grants.get(consumer), ['state.append', { allowedNamespaces: ['fixture.scope'] }]])]]) }), error => error.code === 'REGISTRY_CAPABILITY_UNREQUESTED');
assert.throws(() => resolveCapabilityGrants(snapshot, { ...policy, enabledRegistrations: new Set() }), error => error.code === 'REGISTRY_CAPABILITY_UNREQUESTED');

// Every new reader citation must still describe the exact revision it links.
const revision = JSON.parse(read('docs/generated/inventory/documentation-source-revision.json')).revision;
for (const relative of [
  'charts/kubeclaw/files/config/swarm.config.json',
  'docs/site/use/workflows/wait-resume/platform.template.json',
  'tests/verification/e2e/support/platform-config.ts',
  'tests/verification/e2e/support/config-profiles/standard.json',
  'skills/common/plugin-runtime/foundation/config/platform.schema.json',
  'skills/common/plugin-runtime/foundation/config/platform.ts',
  'skills/common/plugin-runtime/foundation/registry/capabilities.ts',
  'skills/nova/core/execution/authorization.ts',
]) {
  const pinned = spawnSync('git', ['show', `${revision}:${relative}`], { cwd: root, encoding: 'utf8' });
  assert.equal(pinned.status, 0, pinned.stderr);
  assert.equal(pinned.stdout, read(relative), `${relative}: new citation has stale source bytes`);
}

const generated = spawnSync(process.execPath, ['scripts/docs-publication.mjs', 'capability-page'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
assert.equal(generated.status, 0, generated.stderr);
assert.equal(generated.stdout, read('docs/site/reference/capabilities.md'), 'capability reader page differs from canonical generator');
assert(generated.stdout.includes('## Platform Grants Are Not Swarm Roles\n'));
console.log('Native swarm boundary PASS: no role/grant/provider translation; 6 invalid-authority controls rejected; known override accepted.');
console.log('Separate platform loader and finite registry grant/denial controls PASS; canonical capability page exact.');
console.log('NOT a registered role-grant Add/Change/Remove drift result, installed-registry/deployment proof, or independent A911-11 acceptance. Compact swarm has no grant authority; the corrected role-grant fixture targets the separate example platform policy.');
