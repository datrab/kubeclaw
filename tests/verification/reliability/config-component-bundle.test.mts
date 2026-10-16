import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureSwarmSettings, loadSwarmSettings, type BusterPreparationSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { readSwarmBundle, type SwarmSelection } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
import { componentOwners } from '../../fixtures/config/swarm-bundle.mjs';

// Raw current authors, not a legacy facade or a synthesized settings projection.
const configRoot = new URL('../../../config/', import.meta.url);
function readDocuments(): Record<string, any> {
  return { entry: JSON.parse(fs.readFileSync(new URL('pipeline.config.json', configRoot), 'utf8')),
    ...Object.fromEntries(componentOwners.map(owner => [owner, JSON.parse(fs.readFileSync(new URL(`components/${owner}.config.json`, configRoot), 'utf8'))])) };
}
function writeDocuments(file: string, documents: Record<string, any>) {
  fs.mkdirSync(path.join(path.dirname(file), 'components'), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(documents.entry));
  for (const owner of componentOwners) fs.writeFileSync(path.join(path.dirname(file), `components/${owner}.config.json`), JSON.stringify(documents[owner]));
}
function selection(documents: Record<string, any>, callerId: SwarmSelection['callerId'] = 'prism-worker'): SwarmSelection {
  const serviceInstanceId = callerId === 'buster-runtime' ? 'kubeclaw/agent-buster/buster-v2-runtime' : `kubeclaw/prism/${callerId}`;
  return { role: callerId === 'buster-runtime' ? 'buster' : 'prism', callerId, serviceInstanceId,
    bindings: documents.entry.bindings.filter((b: any) => b.instanceId === serviceInstanceId).map(({ role: _role, ...b }: any) => b) };
}
function capture(f: ReturnType<typeof fixture>, callerId?: SwarmSelection['callerId']) {
  return captureSwarmSettings(f.file, selection(f.documents, callerId));
}

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'component-bundle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'pipeline.config.json');
  const documents = readDocuments();
  writeDocuments(file, documents);
  return { root, file, documents, environment: { SWARM_CONFIG: file } };
}

test('explicit entry required; old inline authorship is rejected', t => {
  assert.throws(() => captureSwarmSettings(undefined, selection(readDocuments())), /SWARM_CONFIG_PATH_REQUIRED/);
  assert.throws(() => captureSwarmSettings('', selection(readDocuments())), /SWARM_CONFIG_PATH_REQUIRED/);
  const f = fixture(t);
  assert.throws(() => loadSwarmSettings(f.environment), /SWARM_CONFIG_RETIRED_FULL_FACADE/);
  f.documents.entry.operator = { prism: {} };
  writeDocuments(f.file, f.documents);
  assert.throws(() => capture(f), /SWARM_CONFIG_INVALID/);
});

for (const owner of componentOwners) test(`${owner}: missing file, wrong owner, unknown envelope and reference rejected`, t => {
  const f = fixture(t);
  const component = path.join(f.root, `components/${owner}.config.json`);
  fs.unlinkSync(component);
  assert.throws(() => capture(f), /ENOENT/);
  for (const mutate of [
    () => { f.documents[owner].owner = 'unknown'; },
    () => { f.documents[owner] = structuredClone(f.documents[componentOwners.find(candidate => candidate !== owner)!]); },
    () => { f.documents[owner].unknown = true; },
    () => { f.documents.entry.components[owner] = '../outside.json'; },
  ]) {
    f.documents = readDocuments();
    mutate(); writeDocuments(f.file, f.documents);
    assert.throws(() => readSwarmBundle(f.file, selection(f.documents)), /SWARM_CONFIG_INVALID/);
    assert.throws(() => capture(f), /SWARM_CONFIG_INVALID/);
  }
});

function requiredLeaves(value: unknown, prefix: string[] = []): string[][] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => requiredLeaves(child, [...prefix, key]));
}

test('every authored setting is required, including explicit nullable values', t => {
  const f = fixture(t), canonical = readDocuments();
  let obligations = 0;
  for (const owner of componentOwners) for (const [profileId, profile] of Object.entries(canonical[owner].profiles) as [string, any][]) for (const keys of requiredLeaves(profile.settings)) {
    const documents = structuredClone(canonical);
    let parent = documents[owner].profiles[profileId].settings;
    for (const key of keys.slice(0, -1)) parent = parent[key];
    delete parent[keys.at(-1)!];
    writeDocuments(f.file, documents);
    assert.throws(() => capture(f), /SWARM_CONFIG_INVALID/, `${owner}:${profileId}:${keys.join('.')}`);
    obligations++;
  }
  t.diagnostic(`Required-leaf deletion obligations checked: ${obligations}`);
});

test('both domains validate before selecting either and nested snapshots stay frozen', t => {
  const f = fixture(t), snapshot = capture(f);
  const resourcePolicy = snapshot.components['prism-execution']!.settings.resourcePolicy;
  assert(resourcePolicy && Object.isFrozen(resourcePolicy));
  const preparation = snapshot.authors['buster-engine'].profiles.runtime.settings.preparation as BusterPreparationSettings;
  assert(preparation.resourcePolicy && Object.isFrozen(preparation.resourcePolicy));
  assert(Object.isFrozen(snapshot.components));
  assert(Object.isFrozen(snapshot.identity.bindings));
  assert(Object.isFrozen(snapshot.profile.features));
  f.documents['buster-engine'].profiles.runtime.settings.preparation.maximumSourceBytes = 1;
  writeDocuments(f.file, f.documents);
  assert.throws(() => capture(f), /BUSTER_SOURCE_RESERVATION_INVALID/);
  f.documents = readDocuments();
  f.documents['prism-worker'].profiles.standard.settings.ingress.maximumConnections = 1;
  writeDocuments(f.file, f.documents);
  assert.throws(() => capture(f, 'buster-runtime'), /CONNECTION_BUDGET_INVALID/);
});

test('physical generation never borrows sibling files; entry and component aliases reject', t => {
  const f = fixture(t), generation = path.join(f.root, 'generation');
  fs.mkdirSync(generation);
  writeDocuments(path.join(generation, 'pipeline.config.json'), f.documents);
  const alias = path.join(f.root, 'alias'); fs.mkdirSync(alias);
  const aliasedEntry = path.join(alias, 'pipeline.config.json');
  fs.symlinkSync(path.join('..', 'generation', 'pipeline.config.json'), aliasedEntry);
  // A different valid sibling file must not be consulted through the entry alias directory.
  f.documents['prism-studio'].profiles.standard.settings.port = 19087;
  writeDocuments(f.file, f.documents);
  const physical = path.join(generation, 'pipeline.config.json');
  const studioSelection = selection(f.documents, 'prism-studio');
  assert.throws(() => captureSwarmSettings(aliasedEntry, studioSelection), /SYMLINK/);
  const snapshot = captureSwarmSettings(physical, studioSelection);
  assert.equal(snapshot.components['prism-studio']!.settings.port, 8080);
  assert.equal(snapshot.identity.generationDirectory, generation);
  const component = path.join(generation, 'components/prism-studio.config.json');
  fs.unlinkSync(component); fs.symlinkSync('../../components/prism-studio.config.json', component);
  assert.throws(() => captureSwarmSettings(physical, studioSelection), /ELOOP/);
});
