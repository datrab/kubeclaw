import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSwarmSettings, loadPrismSettings, loadBusterSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { readTestBundle, writeTestBundle, canonicalSwarmEntry, componentOwners } from '../../fixtures/config/swarm-bundle.mjs';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'component-bundle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'swarm.config.json');
  const documents = readTestBundle(canonicalSwarmEntry);
  writeTestBundle(file, documents);
  return { root, file, documents, environment: { SWARM_CONFIG: file } };
}

test('explicit entry required; old inline authorship is rejected', t => {
  assert.throws(() => loadSwarmSettings({}), /SWARM_CONFIG_PATH_REQUIRED/);
  assert.throws(() => loadSwarmSettings({ SWARM_CONFIG: '' }), /SWARM_CONFIG_PATH_REQUIRED/);
  const f = fixture(t);
  f.documents.entry.operator = { prism: {} };
  writeTestBundle(f.file, f.documents);
  assert.throws(() => loadSwarmSettings(f.environment), /SWARM_CONFIG_INVALID/);
});

for (const owner of componentOwners) test(`${owner}: missing file, wrong owner, unknown envelope and reference rejected`, t => {
  const f = fixture(t);
  const component = path.join(f.root, `${owner}.config.json`);
  fs.unlinkSync(component);
  assert.throws(() => loadSwarmSettings(f.environment), /ENOENT/);
  for (const mutate of [
    () => { f.documents[owner].owner = 'unknown'; },
    () => { f.documents[owner].unknown = true; },
    () => { f.documents.entry.components[owner] = '../outside.json'; },
  ]) {
    f.documents = readTestBundle(canonicalSwarmEntry);
    mutate(); writeTestBundle(f.file, f.documents);
    assert.throws(() => loadSwarmSettings(f.environment), /SWARM_CONFIG_INVALID/);
  }
});

function requiredLeaves(value: unknown, prefix: string[] = []): string[][] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => requiredLeaves(child, [...prefix, key]));
}

test('every authored setting is required, including explicit nullable values', t => {
  const f = fixture(t), canonical = readTestBundle(canonicalSwarmEntry);
  for (const owner of componentOwners) for (const keys of requiredLeaves(canonical[owner].settings)) {
    const documents = structuredClone(canonical);
    let parent = documents[owner].settings;
    for (const key of keys.slice(0, -1)) parent = parent[key];
    delete parent[keys.at(-1)!];
    writeTestBundle(f.file, documents);
    assert.throws(() => loadSwarmSettings(f.environment), /SWARM_CONFIG_INVALID/, `${owner}:${keys.join('.')}`);
  }
});

test('both domains validate before selecting either and nested snapshots stay frozen', t => {
  const f = fixture(t), snapshot = loadSwarmSettings(f.environment);
  assert(Object.isFrozen(snapshot.prism.native.resourcePolicy));
  assert(Object.isFrozen(snapshot.buster.preparation.resourcePolicy));
  assert(Object.isFrozen(snapshot.profile.features));
  f.documents['buster-engine'].settings.preparation.maximumSourceBytes = 1;
  writeTestBundle(f.file, f.documents);
  assert.throws(() => loadPrismSettings(f.environment), /BUSTER_SOURCE_RESERVATION_INVALID/);
  f.documents = readTestBundle(canonicalSwarmEntry);
  f.documents['prism-worker'].settings.ingress.maximumConnections = 1;
  writeTestBundle(f.file, f.documents);
  assert.throws(() => loadBusterSettings(f.environment), /CONNECTION_BUDGET_INVALID/);
});

test('real ConfigMap-style entry symlink resolves component files within its physical generation', t => {
  const f = fixture(t), generation = path.join(f.root, 'generation');
  fs.mkdirSync(generation);
  writeTestBundle(path.join(generation, 'swarm.config.json'), f.documents);
  const alias = path.join(f.root, 'entry.json');
  fs.symlinkSync(path.join('generation', 'swarm.config.json'), alias);
  // A different valid sibling file must not be consulted through the entry alias directory.
  f.documents['prism-studio'].settings.port = 19087;
  writeTestBundle(f.file, f.documents);
  const snapshot = loadSwarmSettings({ SWARM_CONFIG: alias });
  assert.equal(snapshot.prism.studio.port, 8080);
  assert.equal(snapshot.identity.generationDirectory, generation);
  const component = path.join(generation, 'prism-studio.config.json');
  fs.unlinkSync(component); fs.symlinkSync('../prism-studio.config.json', component);
  assert.throws(() => loadSwarmSettings({ SWARM_CONFIG: alias }), /ELOOP/);
});
