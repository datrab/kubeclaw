import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSwarmBundle, type SwarmSelection } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { createPipelineGenerationReceipt, createPipelineServiceSelection, readPipelineServiceSelection,
  selectionProjection } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-generation.ts';
import { portableJson, sha256Text } from '@kubeclaw/plugin-sdk/values';

const owners = ['prism-control', 'prism-studio', 'prism-worker', 'prism-execution', 'buster-engine', 'worker-core'];
function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-selection-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'components'));
  const source = new URL('../../../charts/kubeclaw/files/config/', import.meta.url);
  const entry = JSON.parse(fs.readFileSync(new URL('swarm.config.json', source), 'utf8'));
  entry.schemaVersion = 'pipeline-entry.v3';
  entry.components = Object.fromEntries(owners.map(owner => [owner, `components/${owner}.config.json`]));
  entry.bindings = [{ role: 'prism', owner: 'prism-studio', instanceId: 'test.release/studio', profileId: 'standard' }];
  const file = path.join(root, 'pipeline.config.json');
  const writeEntry = () => fs.writeFileSync(file, JSON.stringify(entry));
  writeEntry();
  for (const owner of owners) {
    const raw = JSON.parse(fs.readFileSync(new URL(`${owner}.config.json`, source), 'utf8'));
    fs.writeFileSync(path.join(root, entry.components[owner]), JSON.stringify({
      schemaVersion: 'pipeline-component.v2', owner, profiles: { standard: { settings: raw.settings } },
    }));
  }
  const selection: SwarmSelection = { role: 'prism', serviceInstanceId: 'test.release/studio', callerId: 'prism-studio',
    bindings: [{ owner: 'prism-studio', instanceId: 'test.release/studio', profileId: 'standard' }] };
  return { root, file, entry, selection, writeEntry };
}

test('Studio selects only its authored tuple while all six owners are captured', t => {
  const f = fixture(t), result = readSwarmBundle(f.file, f.selection);
  assert.deepEqual(Object.keys(result.components), ['prism-studio']);
  assert.equal(Object.keys(result.authors).length, 6);
  assert.equal(result.components['prism-studio']?.settings.port, 8080);
  assert.equal(result.identity.files.length, 7);
  assert(result.identity.files.some(file => file.name === 'components/prism-studio.config.json'));
  assert(Object.isFrozen(result.components['prism-studio']?.settings));
  assert(Object.isFrozen(result.authors['buster-engine'].profiles));
});

test('whole selected profiles change actual loaded values; no first-profile fallback', t => {
  const f = fixture(t), file = path.join(f.root, 'components/prism-studio.config.json');
  const author = JSON.parse(fs.readFileSync(file, 'utf8'));
  author.profiles.alternate = structuredClone(author.profiles.standard);
  author.profiles.alternate.settings.port = 19089;
  fs.writeFileSync(file, JSON.stringify(author));
  f.entry.bindings[0].profileId = 'alternate'; f.writeEntry();
  assert.throws(() => readSwarmBundle(f.file, f.selection), /SELECTION_PROFILE_MISMATCH/);
  const alternate = { ...f.selection, bindings: [{ ...f.selection.bindings[0], profileId: 'alternate' }] };
  assert.equal(readSwarmBundle(f.file, alternate).components['prism-studio']?.settings.port, 19089);
  f.entry.bindings[0].profileId = 'absent'; f.writeEntry();
  assert.throws(() => readSwarmBundle(f.file, alternate), /PROFILE_REQUIRED/);
});

test('duplicate root tuple rejects even when profile is identical', t => {
  const f = fixture(t);
  f.entry.bindings.push({ ...f.entry.bindings[0] }); f.writeEntry();
  assert.throws(() => readSwarmBundle(f.file, f.selection), /DUPLICATE_BINDING/);
});

test('unrelated selected owner and wrong service identity reject', t => {
  const f = fixture(t);
  assert.throws(() => readSwarmBundle(f.file, { ...f.selection,
    bindings: [...f.selection.bindings, { owner: 'buster-engine', instanceId: 'test.release/studio', profileId: 'standard' }] }), /SELECTION_OWNERS_INVALID/);
  assert.throws(() => readSwarmBundle(f.file, { ...f.selection,
    bindings: [{ ...f.selection.bindings[0], instanceId: 'another.release/studio' }] }), /SELECTION_OWNERS_INVALID/);
  f.entry.bindings = []; f.writeEntry();
  assert.throws(() => readSwarmBundle(f.file, f.selection), /SWARM_CONFIG_INVALID/);
});

test('unselected invalid profile rejects before returning Studio', t => {
  const f = fixture(t), file = path.join(f.root, 'components/buster-engine.config.json');
  const author = JSON.parse(fs.readFileSync(file, 'utf8'));
  author.profiles.invalid = structuredClone(author.profiles.standard);
  delete author.profiles.invalid.settings.preparation.maximumArchiveBytes;
  fs.writeFileSync(file, JSON.stringify(author));
  assert.throws(() => readSwarmBundle(f.file, f.selection), /SWARM_CONFIG_INVALID:component:buster-engine/);
});

test('retired filename, legacy schema, escaping references and tree symlinks reject', t => {
  const f = fixture(t), retired = path.join(f.root, 'swarm.config.json');
  fs.copyFileSync(f.file, retired);
  assert.throws(() => readSwarmBundle(retired, f.selection), /RETIRED_ENTRY/);
  f.entry.schemaVersion = 'swarm-entry.v2'; f.writeEntry();
  assert.throws(() => readSwarmBundle(f.file, f.selection), /SWARM_CONFIG_INVALID/);
  f.entry.schemaVersion = 'pipeline-entry.v3';
  f.entry.components['prism-studio'] = '../outside.json'; f.writeEntry();
  assert.throws(() => readSwarmBundle(f.file, f.selection), /SWARM_CONFIG_INVALID/);
  f.entry.components['prism-studio'] = 'components/prism-studio.config.json'; f.writeEntry();
  fs.renameSync(path.join(f.root, 'components'), path.join(f.root, 'physical-components'));
  fs.symlinkSync('physical-components', path.join(f.root, 'components'));
  assert.throws(() => readSwarmBundle(f.file, f.selection), { code: 'ENOTDIR' });
  const alias = path.join(f.root, 'alias'); fs.symlinkSync('pipeline.config.json', alias);
  assert.throws(() => readSwarmBundle(alias, f.selection), /SYMLINK/);
});

test('caller-role mismatch and competing selection fields reject', t => {
  const f = fixture(t);
  for (const role of ['nova', 'buster'] as const) {
    f.entry.bindings[0].role = role; f.writeEntry();
    assert.throws(() => readSwarmBundle(f.file, { ...f.selection, role }), /CALLER_ROLE_INVALID/);
  }
  const extra = { ...f.selection, competingAuthor: 'ignored?' };
  assert.throws(() => readSwarmBundle(f.file, extra), /SELECTION_INVALID/);
  assert.throws(() => readSwarmBundle(f.file, { ...f.selection,
    bindings: [{ ...f.selection.bindings[0], competingAuthor: 'ignored?' }] } as unknown as SwarmSelection), /SELECTION_BINDING_INVALID/);
});

test('components directory replacement during capture rejects', t => {
  const f = fixture(t), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-pipeline-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.cpSync(path.join(f.root, 'components'), outside, { recursive: true });
  const original = fs.openSync;
  let replaced = false;
  fs.openSync = function (...args: Parameters<typeof fs.openSync>) {
    if (!replaced && String(args[0]).endsWith('components/prism-control.config.json')) {
      replaced = true;
      fs.renameSync(path.join(f.root, 'components'), path.join(f.root, 'old-components'));
      fs.symlinkSync(outside, path.join(f.root, 'components'));
    }
    return Reflect.apply(original, fs, args);
  };
  try { assert.throws(() => readSwarmBundle(f.file, f.selection), /SWARM_CONFIG_CHANGED/); }
  finally { fs.openSync = original; }
  assert(replaced);
});

test('intrinsic relations on an unselected owner reject before Studio projection', t => {
  const f = fixture(t), file = path.join(f.root, 'components/prism-worker.config.json');
  const author = JSON.parse(fs.readFileSync(file, 'utf8'));
  author.profiles.invalid = structuredClone(author.profiles.standard);
  author.profiles.invalid.settings.ingress.maximumConnections = 1;
  fs.writeFileSync(file, JSON.stringify(author));
  assert.throws(() => captureSwarmSettings(f.file, f.selection), /CONNECTION_BUDGET_INVALID/);
});

test('generation receipt binds all raw files, profile values and reader assets', t => {
  const f = fixture(t), capture = captureSwarmSettings(f.file, f.selection);
  const before = createPipelineGenerationReceipt(capture);
  assert.equal(before.files.length, 7);
  assert(before.files.every(file => file.byteLength > 0 && /^sha256:[a-f0-9]{64}$/u.test(file.digest)));
  assert(before.readerAssets.some(asset => asset.name === 'swarm-components.schema.json'));
  const file = path.join(f.root, 'components/prism-studio.config.json');
  const author = JSON.parse(fs.readFileSync(file, 'utf8'));
  author.profiles.standard.settings.port = 19089;
  fs.writeFileSync(file, JSON.stringify(author));
  const after = createPipelineGenerationReceipt(captureSwarmSettings(f.file, f.selection));
  assert.notEqual(after.digest, before.digest);
  assert.equal(createPipelineGenerationReceipt(capture).digest, before.digest, 'captured A does not reload B');
});

test('closed service receipt detects alteration and fixes caller/package/generation association', t => {
  const f = fixture(t), capture = captureSwarmSettings(f.file, f.selection);
  const packageDigest = `sha256:${'a'.repeat(64)}` as const;
  const receipt = createPipelineServiceSelection(capture, 'prism-studio', packageDigest);
  assert.equal(receipt.generationDigest, createPipelineGenerationReceipt(capture).digest);
  assert.deepEqual(selectionProjection(readPipelineServiceSelection(receipt, 'prism-studio')), f.selection);
  assert.throws(() => createPipelineServiceSelection(capture, 'prism-worker', packageDigest), /CALLER_MISMATCH/);
  assert.throws(() => readPipelineServiceSelection({ ...receipt, competingAuthor: true }, 'prism-studio'), /SELECTION_INVALID/);
  assert.throws(() => readPipelineServiceSelection({ ...receipt, serviceInstanceId: 'other' }, 'prism-studio'), /DIGEST_MISMATCH/);
  assert.throws(() => readPipelineServiceSelection(receipt, 'prism-worker'), /SELECTION_INVALID/);
  assert(Object.isFrozen(receipt.bindings[0]));
  for (const patch of [{ role: 'unsupported-role' }, { serviceInstanceId: null }, { bindings: 17 },
    { bindings: [{ ...receipt.bindings[0], competingAuthor: true }] }]) {
    const { digest: _digest, ...original } = receipt;
    const body = { ...original, ...patch };
    assert.throws(() => readPipelineServiceSelection({ ...body, digest: sha256Text(portableJson(body)) }, 'prism-studio'),
      /SWARM_CONFIG_SELECTION/);
  }
});
