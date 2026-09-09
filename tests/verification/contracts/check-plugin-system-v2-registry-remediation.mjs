import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePluginManifest, resolveReferencedValue, validateReferencedValue } from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
import { discoverPackages } from '../../../skills/common/plugin-runtime/foundation/registry/discovery.ts';
import { buildRegistry } from '../../../skills/common/plugin-runtime/foundation/registry/build.ts';
import { validateRuntimeRegistrationConfiguration } from '../../../skills/common/plugin-runtime/foundation/registry/configuration.ts';
import { computePackageDigest } from '../../../skills/common/plugin-runtime/foundation/registry/digest.ts';
import { installExternalPackage, removeInstalledPackage } from '../../../skills/common/plugin-runtime/foundation/packages/install.ts';

const readManifest = (root) => JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const fixture = 'tests/fixtures/plugin-system-v2/graph-plugin';
const graph = readManifest(fixture);
const surfaces = {
  stages: graph.stages,
  observers: graph.observers,
  adapters: readManifest('skills/common/plugins/artifact-store').adapters,
  testProviders: readManifest('skills/buster/plugins/direct-command').testProviders,
  reportAdapters: readManifest('skills/buster/plugins/junit-report-adapter').reportAdapters,
};
const empty = { ...graph, stages: [], observers: [], adapters: [] };
for (const testProviders of [undefined, []]) {
  for (const reportAdapters of [undefined, []]) {
    assert.throws(() => parsePluginManifest(JSON.stringify({ ...empty, testProviders, reportAdapters }), 'matrix'),
      (error) => error.code === 'REGISTRY_MANIFEST_INVALID');
  }
}
for (const [surface, registrations] of Object.entries(surfaces)) {
  assert(registrations.length > 0);
  parsePluginManifest(JSON.stringify({ ...empty, [surface]: registrations }), surface);
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-remediation-'));
try {
  const root = path.join(temporary, 'plugins');
  const source = path.join(root, 'graph');
  fs.mkdirSync(root);
  fs.cpSync(fixture, source, { recursive: true });
  const schemaPath = path.join(source, graph.stages[0].configSchema);
  const schema = (constant) => ({ $id: 'https://example.test/config', type: 'object',
    properties: { revision: { const: constant, default: constant } }, required: ['revision'], additionalProperties: false });
  fs.writeFileSync(schemaPath, JSON.stringify(schema('old')));
  const discover = () => discoverPackages({ installationRoots: [root], trustPolicy: {
    trustedBuiltinRoots: [root], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:regression',
  } });
  const contract = JSON.parse(fs.readFileSync('skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json', 'utf8'));
  const resultPath = path.join(source, graph.stages[0].resultSchema);
  fs.writeFileSync(resultPath, JSON.stringify({ $ref: `${contract.$id}#/$defs/stageResult` }));
  const first = buildRegistry(discover());
  const second = buildRegistry(discover());
  assert.equal(first.snapshotDigest, second.snapshotDigest);
  const validate = (snapshot, revision, type = graph.stages[0].type, id = graph.id) =>
    validateRuntimeRegistrationConfiguration(snapshot, new Set([`${id}:${graph.stages[0].id}`]), {
      stages: [{ type, config: { revision } }], observers: new Map(), adapters: new Map(),
    });
  validate(first, 'old'); validate(second, 'old');
  const input = {};
  assert.deepEqual(resolveReferencedValue(schemaPath, input, first.schemas), { revision: 'old' });
  assert.deepEqual(input, {}, 'default resolution clones caller input');
  validateReferencedValue(resultPath, { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] }, first.schemas);
  assert.throws(() => validateReferencedValue(resultPath, { schemaVersion: 'stage-result.v2', outcome: 'invalid' }, first.schemas));
  const nextManifest = { ...graph, packageVersion: '2.0.0' };
  fs.writeFileSync(path.join(source, 'plugin.json'), JSON.stringify(nextManifest));
  fs.writeFileSync(schemaPath, JSON.stringify(schema('new')));
  const third = buildRegistry(discover());
  assert.notEqual(first.snapshotDigest, third.snapshotDigest);
  validate(third, 'new'); validate(first, 'old');
  assert.deepEqual(resolveReferencedValue(schemaPath, {}, third.schemas), { revision: 'new' });
  assert.deepEqual(resolveReferencedValue(schemaPath, {}, first.schemas), { revision: 'old' });
  assert.throws(() => validate(first, 'new'), (error) => error.code === 'REGISTRY_RESULT_INVALID');
  assert.throws(() => validate(third, 'old'), (error) => error.code === 'REGISTRY_RESULT_INVALID');
  const peer = path.join(root, 'peer'); fs.cpSync(source, peer, { recursive: true });
  fs.writeFileSync(path.join(peer, 'plugin.json'), JSON.stringify({ ...nextManifest, id: 'test.peer',
    stages: [{ ...graph.stages[0], type: 'test.peer' }] }));
  fs.writeFileSync(path.join(peer, graph.stages[0].configSchema), JSON.stringify(schema('peer')));
  const combined = buildRegistry(discover());
  validate(combined, 'new'); validate(combined, 'peer', 'test.peer', 'test.peer');
  assert.throws(() => validate(combined, 'new', 'test.peer', 'test.peer'));

  const installRoot = path.join(temporary, 'installed'); fs.mkdirSync(installRoot);
  const canonicalSource = 'https://example.test/packages';
  const install = (sourceRoot) => {
    const digest = computePackageDigest(sourceRoot);
    return installExternalPackage({ actorId: 'operator:test', canonicalSource, sourceRoot, installationRoot: installRoot,
      expectedDigest: digest, policy: { operatorIds: new Set(['operator:test']),
        allowedSourceDigests: new Map([[canonicalSource, [digest]]]), verifiedAttestations: new Map() },
      trustEvidence: { method: 'source_digest_allowlist', verifier: 'test:installer' } });
  };
  for (const surface of ['stages', 'observers', 'testProviders', 'reportAdapters']) {
    const pkg = path.join(temporary, surface); fs.mkdirSync(pkg);
    const registration = { ...surfaces[surface][0], module: 'entry.js' };
    fs.writeFileSync(path.join(pkg, 'plugin.json'), JSON.stringify({ ...empty, [surface]: [registration] }));
    for (const key of ['configSchema', 'inputSchema', 'resultSchema', 'checkpointSchema']) {
      if (!registration[key]) continue;
      const file = path.join(pkg, registration[key]); fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ type: 'object' }));
    }
    const entry = path.join(pkg, 'entry.js');
    const validSource = `import './helper.js'; export function ${registration.export}() { throw new Error('must not execute'); }`;
    fs.writeFileSync(entry, validSource); fs.writeFileSync(path.join(pkg, 'helper.js'), 'export const helper = true;');
    const installed = install(pkg); removeInstalledPackage(installRoot, installed.root);
    fs.writeFileSync(entry, 'export function broken( {');
    assert.throws(() => install(pkg), /PLUGIN_INSTALL_MODULE_INVALID:entry.js/);
    fs.writeFileSync(entry, validSource); fs.writeFileSync(path.join(pkg, 'helper.js'), 'export function broken( {');
    assert.throws(() => install(pkg), /PLUGIN_INSTALL_MODULE_INVALID:helper.js/);
    assert.deepEqual(fs.readdirSync(installRoot).filter((name) => !name.startsWith('.')), []);
  }
  // Real shipped adapter source, manifest and import closure, no additional registration.
  const realAdapter = path.join(temporary, 'real-adapter');
  fs.cpSync('skills/buster/plugins/junit-report-adapter', realAdapter, { recursive: true,
    filter: (file) => !file.split(path.sep).includes('node_modules') });
  fs.rmSync(path.join(realAdapter, 'package.json'));
  const adapterInstalled = install(realAdapter); removeInstalledPackage(installRoot, adapterInstalled.root);
  fs.writeFileSync(path.join(realAdapter, 'src/adapter.js'), 'export function adapt( {');
  assert.throws(() => install(realAdapter), /PLUGIN_INSTALL_MODULE_INVALID:src\/adapter.js/);
  assert.deepEqual(fs.readdirSync(installRoot).filter((name) => !name.startsWith('.')), []);
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-registry-remediation', manifestSurfaces: 5,
    installSurfaces: 4, snapshots: 4, realReportAdapter: true }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
