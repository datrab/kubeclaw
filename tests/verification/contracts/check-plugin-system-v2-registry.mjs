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
fs.writeFileSync(path.join(packageRoot, 'dist', 'stage.js'), `
  globalThis.__pluginV2ActivationCount = (globalThis.__pluginV2ActivationCount ?? 0) + 1;
  export function execute() { return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] }; }
`);
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

delete globalThis.__pluginV2ActivationCount;
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
assert.equal(globalThis.__pluginV2ActivationCount, undefined, 'discovery must not import executable modules');
assert.equal(packages.length, 1);
assert.match(packages[0].provenance.package.contentDigest, /^sha256:[a-f0-9]{64}$/);
const snapshot = core.buildRegistry(packages);
assert.equal(snapshot.stages.get('example.stage')?.registration.id, 'main');
assert.equal(snapshot.packages.size, 1);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal('set' in snapshot.stages, false, 'frozen registry maps must not expose mutation');
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['example.stage:main']),
  providers: new Map([['state.read', 'example.stage:state']]),
  grants: new Map([['example.stage:main', new Map([['state.read', { namespace: 'run' }]])]]),
});
assert.equal(granted.grants.get('example.stage:main')?.[0]?.capability, 'state.read');
assert.equal(granted.selectedProviders.get('state.read')?.registration.id, 'state');
assert.throws(() => core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: new Set(['example.stage:main']),
  providers: new Map([['state.read', 'example.stage:state']]),
  grants: new Map(),
}), (error) => error?.code === 'REGISTRY_CAPABILITY_DENIED');

const activated = await core.activateRegistry(snapshot, new Set(granted.grants.keys()));
assert.equal(globalThis.__pluginV2ActivationCount, 1, 'activation imports exactly after freeze');
assert.equal(typeof activated.stages.get('example.stage')?.execute, 'function');

assert.throws(() => core.buildRegistry([...packages, ...packages]), (error) => error?.code === 'REGISTRY_PACKAGE_DUPLICATE');

fs.rmSync(workspace, { recursive: true, force: true });
delete globalThis.__pluginV2ActivationCount;
console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-registry' }));
