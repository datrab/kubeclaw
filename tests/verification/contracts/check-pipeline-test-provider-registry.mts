import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRegistry,
  discoverPackages,
  validateTestProviderConfiguration,
} from '../../../skills/nova/core/src/index.ts';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'test-provider-registry-'));
const installRoot = path.join(workspace, 'plugins');
fs.mkdirSync(installRoot, { recursive: true });

const configSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['command'],
  properties: {
    command: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
  },
};

function provider(id: string, contractId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    contractId,
    kind: 'test',
    module: 'dist/provider.js',
    export: 'execute',
    configSchema: 'schemas/config.json',
    inputs: [{ name: 'repository', kind: 'value', required: true, schemaId: 'kubeclaw.repository-snapshot@1' }],
    outputs: [{ name: 'report', kind: 'artifact', required: false, mediaTypes: ['application/junit+xml'] }],
    requiredCapabilities: ['repository.read'],
    retrySafe: true,
    matrixFields: [],
    reportFormats: [],
    evidenceTypes: ['report', 'log'],
    evidenceDefaults: {
      onPass: ['report', 'log'],
      onFail: ['report', 'log'],
      onError: ['log'],
    },
    ...overrides,
  };
}

function writePackage(name: string, pluginId: string, providers: Record<string, unknown>[], schema: object = configSchema): string {
  const root = path.join(installRoot, name);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(root, 'schemas'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'provider.js'), 'export function execute() { return { outcome: "passed" }; }\n');
  fs.writeFileSync(path.join(root, 'schemas', 'config.json'), `${JSON.stringify(schema, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'plugin.json'), `${JSON.stringify({
    id: pluginId,
    apiVersion: 'pipeline-plugin-v2',
    packageVersion: '1.0.0',
    stages: [],
    observers: [],
    adapters: [],
    testProviders: providers,
  }, null, 2)}\n`);
  return root;
}

writePackage('unit', 'example.unit', [
  provider('command', 'example.command-test@1'),
  provider('framework', 'example.framework-test@1', {
    outputs: [{ name: 'coverage', kind: 'artifact', required: false, mediaTypes: ['application/lcov'] }],
    evidenceTypes: ['coverage', 'log'],
    evidenceDefaults: { onPass: ['coverage', 'log'], onFail: ['coverage', 'log'], onError: ['log'] },
  }),
]);

function discover() {
  return discoverPackages({
    installationRoots: [installRoot],
    trustPolicy: {
      trustedBuiltinRoots: [installRoot],
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:test-provider-registry',
    },
    now: () => new Date('2026-08-05T15:00:00Z'),
  });
}

const packages = discover();
const snapshot = buildRegistry(packages);
assert.equal(snapshot.testProviders.size, 2, 'one package can contain independent provider registrations');
assert.equal(snapshot.testProviderContracts.size, 2, 'contracts are independently selectable');
assert.match(snapshot.snapshotDigest, /^sha256:[a-f0-9]{64}$/);

const command = snapshot.testProviderContracts.get('example.command-test@1');
assert.ok(command);
assert.equal(command.registration.registrationId, 'command');
assert.equal(command.registration.package.packageId, 'example.unit');
assert.equal(command.registration.package.packageVersion, '1.0.0');
assert.equal(command.registration.package.contentDigest, command.package.provenance.package.contentDigest);
assert.equal(command.registration.entrypoint.module, 'dist/provider.js');
assert.equal(command.registration.retrySafe, true);
assert.equal(command.registration.inputs[0]?.kind, 'value');
assert.equal(command.registration.outputs[0]?.kind, 'artifact');
assert.equal(command.provenance.surface, 'test_provider');
assert.equal(command.configSchemaDigest,
  `sha256:${crypto.createHash('sha256').update(fs.readFileSync(command.configSchemaPath)).digest('hex')}`);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(command.registration), true);
assert.equal(Object.isFrozen(command.registration.evidenceDefaults.onFail), true);
assert.equal('set' in snapshot.testProviders, false, 'snapshot maps do not expose mutation');
assert.equal(buildRegistry(packages).snapshotDigest, snapshot.snapshotDigest, 'same locked packages produce the same snapshot digest');
assert.equal(
  buildRegistry([...packages].reverse()).snapshotDigest,
  snapshot.snapshotDigest,
  'package discovery order does not change the snapshot digest',
);

assert.doesNotThrow(() => validateTestProviderConfiguration(snapshot, 'example.command-test@1', {
  command: ['npm', 'test'],
}));
assert.throws(() => validateTestProviderConfiguration(snapshot, 'example.command-test@1', {
  command: 'npm test',
}), (error: unknown) => (error as { code?: string }).code === 'REGISTRY_RESULT_INVALID');
assert.throws(() => validateTestProviderConfiguration(snapshot, 'missing.contract@1', {}),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_REGISTRATION_MISSING');

writePackage('conflict', 'example.conflict', [provider('other', 'example.command-test@1')]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_TEST_PROVIDER_CONTRACT_CONFLICT');
fs.rmSync(path.join(installRoot, 'conflict'), { recursive: true });

writePackage('duplicate-id', 'example.duplicate-id', [
  provider('same', 'example.duplicate-one@1'),
  provider('same', 'example.duplicate-two@1'),
]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_REGISTRATION_CONFLICT');
fs.rmSync(path.join(installRoot, 'duplicate-id'), { recursive: true });

writePackage('bad-evidence', 'example.bad-evidence', [provider('bad', 'example.bad-evidence@1', {
  evidenceDefaults: { onPass: ['unknown'], onFail: ['log'], onError: ['log'] },
})]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_MANIFEST_INVALID');
fs.rmSync(path.join(installRoot, 'bad-evidence'), { recursive: true });

writePackage('duplicate-port', 'example.duplicate-port', [provider('bad', 'example.duplicate-port@1', {
  inputs: [
    { name: 'repository', kind: 'value', required: true, schemaId: 'kubeclaw.repository-snapshot@1' },
    { name: 'repository', kind: 'value', required: true, schemaId: 'kubeclaw.repository-snapshot@1' },
  ],
})]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_REGISTRATION_CONFLICT');
fs.rmSync(path.join(installRoot, 'duplicate-port'), { recursive: true });

writePackage('missing-module', 'example.missing-module', [provider('bad', 'example.missing-module@1', {
  module: 'dist/missing.js',
})]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_REFERENCE_MISSING');
fs.rmSync(path.join(installRoot, 'missing-module'), { recursive: true });

writePackage('missing-schema', 'example.missing-schema', [provider('bad', 'example.missing-schema@1', {
  configSchema: 'schemas/missing.json',
})]);
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_REFERENCE_MISSING');
fs.rmSync(path.join(installRoot, 'missing-schema'), { recursive: true });

const changedPackage = writePackage('changed', 'example.changed', [provider('changed', 'example.changed@1')]);
const beforeChange = buildRegistry(discover()).snapshotDigest;
fs.writeFileSync(path.join(changedPackage, 'schemas', 'config.json'), `${JSON.stringify({
  ...configSchema,
  properties: {
    ...configSchema.properties,
    command: {
      ...configSchema.properties.command,
      maxItems: 32,
    },
  },
}, null, 2)}\n`);
const afterChange = buildRegistry(discover()).snapshotDigest;
assert.notEqual(afterChange, beforeChange, 'provider package or schema changes alter the snapshot digest');
fs.rmSync(changedPackage, { recursive: true });

writePackage('bad-schema', 'example.bad-schema', [provider('bad', 'example.bad-schema@1')], {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'not-a-json-schema-type',
});
assert.throws(() => buildRegistry(discover()),
  (error: unknown) => (error as { code?: string }).code === 'REGISTRY_MANIFEST_INVALID');

console.log(JSON.stringify({
  ok: true,
  packages: snapshot.packages.size,
  testProviders: snapshot.testProviders.size,
  snapshotDigest: snapshot.snapshotDigest,
}));
