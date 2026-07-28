import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/common/plugin-runtime/core/src/index.ts')).href);
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-registry-v2-'));
const installRoot = path.join(workspace, 'plugins');
const packageRoot = path.join(installRoot, 'example');
fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true });
const stageSource = `
  export function execute() { return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] }; }
`;
fs.writeFileSync(path.join(packageRoot, 'dist', 'stage.js'), stageSource);
fs.writeFileSync(path.join(packageRoot, 'dist', 'state.js'), `
  export function activate() { return { ready: true }; }
`);
for (const name of ['config', 'input', 'result']) {
  fs.writeFileSync(path.join(packageRoot, 'schemas', `${name}.json`), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
  }));
}
fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({
  id: 'example.stage',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  stages: [{
    id: 'main',
    type: 'example.stage',
    module: 'dist/stage.js',
    export: 'execute',
    requiredCapabilities: ['state.read'],
    configSchema: 'schemas/config.json',
    inputSchema: 'schemas/input.json',
    resultSchema: 'schemas/result.json',
  }],
  observers: [],
  adapters: [{
    id: 'state',
    module: 'dist/state.js',
    export: 'activate',
    providesCapabilities: ['state.read'],
    requiredCapabilities: [],
    configSchema: 'schemas/config.json',
  }],
}));

const packages = core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
  now: () => new Date('2026-07-25T22:00:00Z'),
});
assert.equal(packages.length, 1);
assert.match(packages[0].provenance.package.contentDigest, /^sha256:[a-f0-9]{64}$/);
assert.equal(Object.isFrozen(packages[0].manifest.stages), true, 'manifest registrations must be deeply frozen');
const snapshot = core.buildRegistry(packages);
assert.equal(snapshot.stages.get('example.stage')?.registration.id, 'main');
assert.equal(snapshot.packages.size, 1);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal('set' in snapshot.stages, false, 'frozen registry maps must not expose mutation');
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['example.stage:main']),
  providers: new Map([['state.read', 'example.stage:state']]),
  grants: new Map([['example.stage:main', new Map([['state.read', { allowedNamespaces: ['run'] }]])]]),
});
assert.equal(granted.grants.get('example.stage:main')?.[0]?.capability, 'state.read');
assert.equal(granted.selectedProviders.get('state.read')?.registration.id, 'state');
assert.doesNotThrow(() => core.validateRuntimeRegistrationConfiguration(
  snapshot,
  granted.enabledRegistrations,
  {
    stages: [{ type: 'example.stage', config: {} }],
    observers: new Map(),
    adapters: new Map([['example.stage:state', {}]]),
  },
));
assert.throws(() => core.validateRuntimeRegistrationConfiguration(
  snapshot,
  granted.enabledRegistrations,
  {
    stages: [{ type: 'example.stage', config: { coreMustNotInterpretThis: true } }],
    observers: new Map(),
    adapters: new Map([['example.stage:state', {}]]),
  },
), (error) => error?.code === 'REGISTRY_RESULT_INVALID');
assert.throws(() => core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['example.stage:main']),
  providers: new Map([['state.read', 'example.stage:state']]),
  grants: new Map(),
}), (error) => error?.code === 'REGISTRY_CAPABILITY_DENIED');
assert.throws(() => core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['example.stage:main']),
  providers: new Map([
    ['state.read', 'example.stage:state'],
    ['network.http', 'missing:adapter'],
  ]),
  grants: new Map([['example.stage:main', new Map([['state.read', { allowedNamespaces: ['run'] }]])]]),
}), (error) => error?.code === 'REGISTRY_CAPABILITY_PROVIDER_INVALID');

const activated = await core.activateRegistry(snapshot, new Set(granted.grants.keys()));
assert.equal(typeof activated.stages.get('example.stage')?.execute, 'function');

assert.throws(() => core.buildRegistry([...packages, ...packages]), (error) => error?.code === 'REGISTRY_PACKAGE_DUPLICATE');
const aliasRoot = path.join(workspace, 'plugins-alias');
fs.symlinkSync(installRoot, aliasRoot, 'dir');
assert.throws(() => core.discoverPackages({
  installationRoots: [installRoot, aliasRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}), (error) => error?.code === 'REGISTRY_PACKAGE_DUPLICATE');

fs.appendFileSync(path.join(packageRoot, 'dist', 'stage.js'), '\n// mutation after discovery\n');
await assert.rejects(
  () => core.activateRegistry(snapshot, new Set(granted.grants.keys())),
  (error) => error?.code === 'REGISTRY_PACKAGE_INTEGRITY_MISMATCH',
);
fs.writeFileSync(path.join(packageRoot, 'dist', 'stage.js'), stageSource);

const unsafeRoot = path.join(installRoot, 'unsafe');
fs.mkdirSync(path.join(unsafeRoot, 'dist'), { recursive: true });
fs.mkdirSync(path.join(unsafeRoot, 'schemas'), { recursive: true });
fs.writeFileSync(path.join(unsafeRoot, 'dist', 'stage.js'), `
  import fs from 'node:fs';
  fs.writeFileSync('import-side-effect.txt', 'forbidden');
  export function execute() { return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] }; }
`);
for (const name of ['config', 'input', 'result']) {
  fs.writeFileSync(path.join(unsafeRoot, 'schemas', `${name}.json`), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
  }));
}
fs.writeFileSync(path.join(unsafeRoot, 'plugin.json'), JSON.stringify({
  id: 'example.unsafe',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  stages: [
    {
      id: 'main',
      type: 'example.unsafe',
      module: 'dist/stage.js',
      export: 'execute',
      requiredCapabilities: [],
      configSchema: 'schemas/config.json',
      inputSchema: 'schemas/input.json',
      resultSchema: 'schemas/result.json',
    },
    {
      id: 'sibling',
      type: 'example.unsafe-sibling',
      module: 'dist/stage.js',
      export: 'missingSibling',
      requiredCapabilities: [],
      configSchema: 'schemas/config.json',
      inputSchema: 'schemas/input.json',
      resultSchema: 'schemas/result.json',
    },
  ],
  observers: [],
  adapters: [],
}));
const unsafePackages = core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
});
const unsafeSnapshot = core.buildRegistry(unsafePackages);
await assert.rejects(
  () => core.activateRegistry(unsafeSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_IMPORT_SIDE_EFFECT',
);
assert.equal(fs.existsSync(path.join(unsafeRoot, 'import-side-effect.txt')), false);
fs.writeFileSync(path.join(unsafeRoot, 'dist', 'stage.js'), `
  import { writeFile } from 'node:fs/promises';
  await writeFile('async-import-side-effect.txt', 'forbidden');
  export function execute() { return {}; }
  export function missingSibling() { return {}; }
`);
const asyncUnsafeSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}));
await assert.rejects(
  () => core.activateRegistry(asyncUnsafeSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_IMPORT_SIDE_EFFECT',
);
assert.equal(fs.existsSync(path.join(unsafeRoot, 'async-import-side-effect.txt')), false);
fs.writeFileSync(path.join(unsafeRoot, 'dist', 'stage.js'), `
  import fs from 'node:fs';
  fs.openSync('open-import-side-effect.txt', 'w');
  export function execute() { return {}; }
  export function missingSibling() { return {}; }
`);
const openUnsafeSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}));
await assert.rejects(
  () => core.activateRegistry(openUnsafeSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_IMPORT_SIDE_EFFECT',
);
assert.equal(fs.existsSync(path.join(unsafeRoot, 'open-import-side-effect.txt')), false);
fs.writeFileSync(path.join(unsafeRoot, 'dist', 'stage.js'), `
  process.on('beforeExit', () => {});
  export function execute() { return {}; }
  export function missingSibling() { return {}; }
`);
const processUnsafeSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}));
await assert.rejects(
  () => core.activateRegistry(processUnsafeSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_IMPORT_SIDE_EFFECT',
);
fs.writeFileSync(path.join(unsafeRoot, 'dist', 'stage.js'), `
  import { exit } from 'node:process';
  exit(0);
  export function execute() { return {}; }
  export function missingSibling() { return {}; }
`);
const exitUnsafeSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}));
await assert.rejects(
  () => core.activateRegistry(exitUnsafeSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_IMPORT_SIDE_EFFECT',
);
fs.writeFileSync(path.join(unsafeRoot, 'dist', 'stage.js'), `
  import { Resolver } from 'node:dns';
  new Resolver().resolve4('example.com', () => {});
  export function execute() { return {}; }
  export function missingSibling() { return {}; }
`);
const dnsUnsafeSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}));
await assert.rejects(
  () => core.activateRegistry(dnsUnsafeSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_IMPORT_SIDE_EFFECT'
    && error.details?.cause?.includes('node:dns.Resolver.resolve4'),
);
fs.writeFileSync(path.join(unsafeRoot, 'dist', 'stage.js'), `
  import { Resolver } from 'node:dns/promises';
  await new Resolver().resolve4('example.com');
  export function execute() { return {}; }
  export function missingSibling() { return {}; }
`);
const dnsPromisesUnsafeSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}));
await assert.rejects(
  () => core.activateRegistry(dnsPromisesUnsafeSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_IMPORT_SIDE_EFFECT'
    && error.details?.cause?.includes('node:dns/promises.Resolver.resolve4'),
);
fs.writeFileSync(
  path.join(unsafeRoot, 'dist', 'stage.js'),
  'export function execute() { return {}; }\n',
);
const invalidExportSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:registry',
  },
}));
await assert.rejects(
  () => core.activateRegistry(invalidExportSnapshot, new Set(['example.unsafe:main'])),
  (error) => error?.code === 'REGISTRY_EXECUTOR_INVALID',
  'one enabled registration cannot activate when a sibling registration in the same package is invalid',
);

fs.rmSync(workspace, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-registry' }));
