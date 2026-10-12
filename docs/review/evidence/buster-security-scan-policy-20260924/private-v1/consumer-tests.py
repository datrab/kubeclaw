exec((__import__('pathlib').Path(__file__).parent/'edit.py').read_text().split("write(C+'buster-security-scan.ts'")[0])
write('tests/verification/contracts/buster-security-scan-policy.test.mjs', '''import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { validateBusterSecurityScanSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-security-scan.ts';
import { SecurityScanCapabilityInvoker } from '../../../skills/buster/engine/test-gates/security-scan-runtime.ts';
import { securityScanOptions } from '../../../skills/buster/engine/test-gates/production-command-options.ts';
import { registryClientBinding } from '../../../skills/buster/engine/test-gates/production-registry-client.ts';
import { canonicalSwarmEntry, readTestBundle, writeTestBundle } from '../../fixtures/config/swarm-bundle.mjs';
import { scanCommandApi } from '../../fixtures/test-gate/scan-command-api.mjs';
import { ownedClusterTest } from '../../fixtures/test-gate/cluster-test-ownership.mjs';

const defaults = () => structuredClone(readTestBundle(canonicalSwarmEntry)['buster-engine'].settings.securityScan);
const dependency = { operation: 'dependency', payload: { projectDirectory: '.' } };
const digest = `sha256:${'a'.repeat(64)}`;
const image = repository => ({ operation: 'image', payload: { image: `${repository}@${digest}`, digest } });

function fixture(t, action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-policy-'));
  return ownedClusterTest(t, root, async owner => {
    const api = scanCommandApi(root);
    const manifest = path.join(root, 'checked.yaml'); fs.writeFileSync(manifest, 'kind: Pod\\n');
    const request = { operation: 'kubernetes-policy', payload: { manifestPath: manifest,
      manifestDigest: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(manifest)).digest('hex')}` } };
    const documents = readTestBundle(canonicalSwarmEntry);
    const policy = documents['buster-engine'].settings.securityScan;
    Object.assign(policy, { trivyExecutable: api.executable, cacheDirectory: api.cache,
      allowedRegistryPrefixes: ['one.test/public', 'two.test/team'], registryClientRepositoryPrefixes: [] });
    const entry = path.join(root, 'bundle/swarm.config.json');
    const capture = () => { writeTestBundle(entry, documents); return loadSwarmSettings({ SWARM_CONFIG: entry }).buster.securityScan; };
    const create = (selected = capture(), binding) => new SecurityScanCapabilityInvoker({ workspaceRoot: root,
      ...securityScanOptions(true, selected, binding).securityScan });
    const invoke = (scanner, value = request) => owner.invoke(signal => scanner.invoke('security.scan', value, signal));
    return action({ root, owner, api, request, documents, policy, entry, capture, create, invoke });
  });
}

for (const [name, value] of Object.entries(defaults())) {
  const leaves = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).map(key => [name, key]) : [[name]];
  for (const keys of leaves) test(`required scanner policy ${keys.join('.')} rejects before filesystem access`, () => {
    const policy = defaults(); const section = keys.length === 1 ? policy : policy[keys[0]]; delete section[keys.at(-1)];
    assert.throws(() => validateBusterSecurityScanSettings(policy), /SECURITY_SCAN_POLICY_INVALID/);
  });
}

test('two selected executable/cache/PATH/text profiles affect actual dependency and config consumers', { timeout: 10000 }, t => fixture(t, async f => {
  for (const [index, title, message, resolution] of [[1, 17, 23, 29], [2, 31, 37, 41]]) {
    const directory = path.join(f.root, `profile-${index}`); fs.mkdirSync(directory);
    const api = scanCommandApi(directory);
    const helpers = path.join(directory, 'helpers'); fs.mkdirSync(helpers);
    fs.writeFileSync(path.join(helpers, 'scanner-policy-helper'), `#!${process.execPath}\\nprocess.stdout.write('profile-${index}');`, { mode: 0o700 });
    api.seed({ helper: `profile-${index}` });
    Object.assign(f.policy, { trivyExecutable: api.executable, cacheDirectory: api.cache, executableSearchPath: [helpers],
      findings: { maximumTitleCodeUnits: title, maximumMessageCodeUnits: message, maximumResolutionCodeUnits: resolution } });
    const scanner = f.create();
    const config = await f.invoke(scanner); const dep = await f.invoke(scanner, dependency);
    assert.equal(config.findings[0].title.length, title); assert.equal(config.findings[0].message.length, message);
    assert.equal(config.findings[0].resolution.length, resolution); assert.equal(dep.findings[0].title.length, title);
    assert.equal(api.calls().length, 2); assert.equal(f.api.calls().length, 0);
    for (const call of api.calls()) { assert.notEqual(call.pid, process.pid); assert.equal(call.path, helpers); assert.equal(call.cache, api.cache); assert.equal(call.home, api.cache); assert.equal(call.auth, null); }
  }
}));

test('capture survives file/array/nested mutation; explicit reload changes actual consumer', { timeout: 10000 }, t => fixture(t, async f => {
  f.policy.findings.maximumTitleCodeUnits = 19;
  const selected = f.capture(); const authored = structuredClone(selected);
  const scanner = f.create(authored);
  authored.allowedRegistryPrefixes.splice(0, authored.allowedRegistryPrefixes.length, 'foreign.test/private');
  authored.executableSearchPath.splice(0, authored.executableSearchPath.length, '/missing');
  authored.findings.maximumTitleCodeUnits = 2; authored.databasePolicy.maximumDatabaseBytes = 1;
  f.policy.findings.maximumTitleCodeUnits = 47; f.policy.allowedRegistryPrefixes = ['replacement.test/team'];
  writeTestBundle(f.entry, f.documents);
  assert.equal((await f.invoke(scanner)).findings[0].title.length, 19);
  await f.invoke(scanner, image('one.test/public/app'));
  await assert.rejects(f.invoke(scanner, image('replacement.test/team/app')), /SECURITY_SCAN_IMAGE_DENIED/);
  const reloaded = loadSwarmSettings({ SWARM_CONFIG: f.entry }).buster.securityScan;
  const changed = f.create(reloaded);
  assert.equal((await f.invoke(changed)).findings[0].title.length, 47);
  await f.invoke(changed, image('replacement.test/team/app'));
  await assert.rejects(f.invoke(changed, image('one.test/public/app')), /SECURITY_SCAN_IMAGE_DENIED/);
}));

test('two full registry prefixes stay anonymous despite ambient cache Docker auth; slash boundary denies before CLI', { timeout: 10000 }, t => fixture(t, async f => {
  fs.mkdirSync(path.join(f.api.cache, '.docker')); fs.writeFileSync(path.join(f.api.cache, '.docker/config.json'), JSON.stringify({ auths: { 'one.test': { auth: 'ambient-canary' } } }));
  const scanner = f.create();
  for (const repository of ['one.test/public', 'one.test/public/app', 'two.test/team/app']) await f.invoke(scanner, image(repository));
  assert.equal(f.api.calls().length, 3);
  for (const call of f.api.calls()) assert.deepEqual(call.auth, { auths: {} });
  for (const repository of ['one.test/publicity', 'foreign.test/public', 'two.test/team-other']) await assert.rejects(f.invoke(scanner, image(repository)), /SECURITY_SCAN_IMAGE_DENIED/);
  assert.equal(f.api.calls().length, 3);
}));

for (const [field, mode] of [['maximumVulnerabilityAgeMs', 'vulnerability'], ['maximumJavaAgeMs', 'java']]) {
  test(`two ${field} profiles reject real source metadata before child`, { timeout: 10000 }, t => fixture(t, async f => {
    f.api.databases({ ageMs: mode === 'vulnerability' ? 60000 : 1000, javaAgeMs: mode === 'java' ? 60000 : 1000 });
    f.policy.databasePolicy[field] = 120000; await f.invoke(f.create(), dependency);
    f.policy.databasePolicy[field] = 30000;
    await assert.rejects(f.invoke(f.create(), dependency), new RegExp(`DATABASE_STALE:${mode}`));
    assert.equal(f.api.calls().length, 1);
  }));
}
for (const [field, generous, small, data] of [['maximumDatabaseBytes', 256, 32, { bytes: 64 }], ['maximumMetadataBytes', 1024, 128, { padding: 200 }]]) {
  test(`two ${field} profiles bound actual files before scanner spawn`, { timeout: 10000 }, t => fixture(t, async f => {
    f.api.databases(data); f.policy.databasePolicy[field] = generous; await f.invoke(f.create(), dependency);
    f.policy.databasePolicy[field] = small; await assert.rejects(f.invoke(f.create(), dependency), /DATABASE_BYTES_INVALID/);
    assert.equal(f.api.calls().length, 1);
  }));
}

test('execution maximum changes real delayed child outcome without request clamping', { timeout: 10000 }, t => fixture(t, async f => {
  f.api.seed({ delayMs: 500 }); f.policy.maximumExecutionMs = 2000;
  await f.invoke(f.create());
  f.policy.maximumExecutionMs = 100; await assert.rejects(f.invoke(f.create()), /SECURITY_SCAN_TIMEOUT/);
}));

test('output maximum changes real stdout outcome and retains output cause across synchronous abort', { timeout: 10000 }, t => fixture(t, async f => {
  f.policy.maximumOutputBytes = 64000; await f.invoke(f.create());
  f.policy.maximumOutputBytes = 1024;
  await assert.rejects(f.invoke(f.create()), { message: 'SECURITY_SCAN_OUTPUT_LIMIT_EXCEEDED' });
  assert.equal(f.api.calls().length, 2);
}));

test('captured private binding scopes actual credentials/CA; env/file replacement changes only new generation', { timeout: 10000 }, t => fixture(t, async f => {
  const descriptor = { registryBaseUrl: 'https://one.test', registryReference: 'one.test', registryCaFile: './ca.pem',
    registryUsernameEnvironmentVariable: 'SCAN_USER', registryPasswordEnvironmentVariable: 'SCAN_PASSWORD' };
  fs.writeFileSync(path.join(f.root, 'ca.pem'), 'fixture CA; native TLS coverage is separate');
  const environment = { SCAN_USER: 'reader', SCAN_PASSWORD: 'first-private-canary' };
  const binding = registryClientBinding(descriptor, f.root, environment);
  const options = securityScanOptions(true, f.capture(), binding).securityScan;
  const scanner = new SecurityScanCapabilityInvoker({ workspaceRoot: f.root, ...options });
  options.registryAccess.password = 'mutated-options';
  environment.SCAN_PASSWORD = 'next-private-canary'; descriptor.registryBaseUrl = 'https://two.test'; descriptor.registryReference = 'two.test';
  await f.invoke(scanner, image('one.test/public/app')); await f.invoke(scanner, image('two.test/team/app'));
  assert.deepEqual(f.api.calls()[0].auth, { auths: { 'one.test': { auth: Buffer.from('reader:first-private-canary').toString('base64') } } });
  assert(f.api.calls()[0].args.includes(path.join(f.root, 'ca.pem'))); assert.deepEqual(f.api.calls()[1].auth, { auths: {} });
  assert(!f.api.calls()[1].args.includes('--cacert'));
  const changed = f.create(f.capture(), registryClientBinding(descriptor, f.root, environment));
  await f.invoke(changed, image('two.test/team/app'));
  assert.deepEqual(f.api.calls()[2].auth, { auths: { 'two.test': { auth: Buffer.from('reader:next-private-canary').toString('base64') } } });
  await assert.rejects(f.invoke(changed, image('two.test/private/app')), /SECURITY_SCAN_IMAGE_DENIED/);
  assert.equal(f.api.calls().length, 3);
}));

test('configured HTTP host is denied before scanner I/O; malformed binding never becomes anonymous', { timeout: 10000 }, t => fixture(t, async f => {
  const binding = registryClientBinding({ registryBaseUrl: 'http://one.test', registryReference: 'one.test' }, f.root, {});
  await assert.rejects(f.invoke(f.create(f.capture(), binding), image('one.test/public/app')), /SECURITY_SCAN_HTTP_LAB_UNSUPPORTED/);
  assert.equal(f.api.calls().length, 0);
  for (const invalid of [null, {}, { registryBaseUrl: 'https://one.test', registryReference: 'one.test' },
    { registryBaseUrl: 'http://one.test', registryReference: 'two.test' }]) {
    assert.throws(() => registryClientBinding(invalid, f.root, {}));
  }
}));
''')
