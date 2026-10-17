import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { swarmReaderAssets } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
import { readBusterRemotePlanServicePolicy, readLegacyBusterRuntimeServicePolicy } from '../../../skills/common/plugin-runtime/foundation/config/buster-service-policy.ts';
import { capabilitySources } from '../../../skills/buster/engine/test-gates/production-capability-sources.ts';
import { networkHttpOptions } from '../../../skills/buster/engine/test-gates/production-command-options.ts';
import { runtimeAuthority } from '../../../skills/buster/engine/test-gates/production-config-values.ts';
import { loadProductionBusterRemotePlanRuntime } from '../../../skills/buster/engine/test-gates/production.ts';
import type { BusterSettings, WorkerCoreSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import type { BusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-client.ts';

const evidence = new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/', import.meta.url);
const read = (file: string) => JSON.parse(fs.readFileSync(new URL(file, evidence), 'utf8'));
const contract = read('PACKAGE-GENERATION-CONTRACT.json');
const owner = JSON.parse(fs.readFileSync(new URL('../../../'+contract.service10.existingFinalOwner.path, import.meta.url), 'utf8'));
const baseline = owner.profiles['local-A'].settings.remotePlanService;

test('service schema exactly preserves reviewed receiving domain and reader receipts bind both new assets', () => {
  const view = read('buster-remote-plan-profile-01/service-policy-view.schema.json');
  const { $schema, ...schema } = JSON.parse(fs.readFileSync(new URL('../../../skills/common/plugin-runtime/foundation/config/buster-service-policy.schema.json', import.meta.url), 'utf8'));
  assert.equal($schema, view.$schema);
  assert.deepEqual(schema, view.properties.policy, 'no weakened or reconstructed policy domain');
  const expectedOwner = fs.readFileSync(new URL('../../../'+contract.service10.existingFinalOwner.path, import.meta.url));
  assert.equal(createHash('sha256').update(expectedOwner).digest('hex'), contract.service10.existingFinalOwner.sha256);
  for (const name of ['buster-service-policy.ts', 'buster-service-policy.schema.json']) {
    const bytes = fs.readFileSync(new URL('../../../skills/common/plugin-runtime/foundation/config/'+name, import.meta.url));
    const receipt = swarmReaderAssets.find(asset => asset.name === name);
    assert.equal(receipt?.digest, 'sha256:'+createHash('sha256').update(bytes).digest('hex'));
    assert.equal(receipt?.byteLength, bytes.byteLength);
  }
});

test('exact approved final owner95 service profiles pass the shared real reader unchanged', () => {
  assert.equal(Object.keys(owner.profiles).length, 95);
  for (const [name, profile] of Object.entries(owner.profiles)) {
    const value = (profile as { settings: { remotePlanService: unknown } }).settings.remotePlanService;
    const policy = readBusterRemotePlanServicePolicy(value);
    assert.deepEqual(policy, value, name);
    assert.equal(Object.isFrozen(policy), true);
    assert.equal(Object.isFrozen(policy.recordLimits), true);
    assert.equal(Object.isFrozen(policy.allowedCapabilities), true);
  }
  assert.equal(contract.service10.fieldProjections.length, 20);
  for (const row of contract.service10.fieldProjections) {
    const parts = row.receivingPointer.split('/').slice(1);
    const value = parts.reduce((node: any, key: string) => node[key], owner);
    const selected = readBusterRemotePlanServicePolicy(owner.profiles[parts[1]].settings.remotePlanService);
    const received = parts.slice(4).reduce((node: any, key: string) => node[key], selected);
    assert.deepEqual(received, value, row.originalFieldIds.join(','));
  }
});

test('required service leaves, closed aliases and actual wire/timer boundaries reject without defaults', () => {
  for (const key of Object.keys(baseline)) {
    const value = structuredClone(baseline); delete value[key];
    assert.throws(() => readBusterRemotePlanServicePolicy(value), /BUSTER_SERVICE_POLICY_INVALID/, key);
  }
  for (const patch of [
    { maximumResponseBytes: 96 }, { shutdownTimeoutMs: 2147483648 }, { port: 65536 },
    { maximumResultBytes: Number.MAX_SAFE_INTEGER+1 }, { host: 'unregistered.example' },
    { allowedCapabilities: ['network.http', 'network.http'] }, { runtimeService: baseline },
    { recordLimits: { ...baseline.recordLimits, maximumRecords: 0 } },
  ]) assert.throws(() => readBusterRemotePlanServicePolicy({ ...baseline, ...patch }), /BUSTER_SERVICE_POLICY_INVALID/);
  const boundary = readBusterRemotePlanServicePolicy({ ...baseline, port: 0, maximumResponseBytes: 97, shutdownTimeoutMs: 2147483647 });
  assert.equal(boundary.port, 0); assert.equal(boundary.maximumResponseBytes, 97);
  const original = structuredClone(baseline), captured = readBusterRemotePlanServicePolicy(original);
  original.recordLimits.maximumBytes++; original.allowedCapabilities.length = 0;
  assert.deepEqual(captured, baseline, 'returned service policy cannot drift with its input');
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...baseline };
  assert.deepEqual(readLegacyBusterRuntimeServicePolicy(runtime), baseline);
  assert.throws(() => readLegacyBusterRuntimeServicePolicy({ ...runtime, remotePlanService: baseline }), /COMPETING_AUTHOR/);
  assert.throws(() => readLegacyBusterRuntimeServicePolicy({ ...runtime, schemaVersion: 'buster-remote-plan-runtime.v2' }), /VERSION_INVALID/);
});

const key = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
const source = { tokenEnvironmentVariable: 'TEST_BUSTER_TOKEN', sourceAttestationPublicKeyEnvironmentVariable: 'TEST_SOURCE_KEY', trustedSourceAuthority: 'fixture:original-source' };
test('real source key preflight rejects malformed/non-Ed25519 keys and absent issuer; never authenticates provenance', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
  for (const value of ['not a key', rsa]) assert.throws(() => runtimeAuthority(source, { TEST_BUSTER_TOKEN: 'fixture', TEST_SOURCE_KEY: value }), /BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/);
  assert.throws(() => runtimeAuthority({ ...source, trustedSourceAuthority: ' ' }, { TEST_BUSTER_TOKEN: 'fixture', TEST_SOURCE_KEY: key }), /AUTHORITY_REQUIRED/);
  assert.equal(runtimeAuthority(source, { TEST_BUSTER_TOKEN: 'fixture', TEST_SOURCE_KEY: key }).sourceAttestationPublicKey, key);
});

test('actual production loader rejects service policy/source crypto BEFORE registry or store effects', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-service-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = JSON.parse(fs.readFileSync(new URL('../../../config/components/buster-engine.config.json', import.meta.url), 'utf8')).profiles.runtime.settings as BusterSettings;
  const worker = JSON.parse(fs.readFileSync(new URL('../../../config/components/worker-core.config.json', import.meta.url), 'utf8')).profiles.standard.settings as WorkerCoreSettings;
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...baseline, ...source,
    platformConfig: path.join(root, 'never-resolve-platform.json'), stateRoot: path.join(root, 'must-not-create-store'),
    runtimeRoot: path.join(root, 'must-not-create-runs'), tarExecutable: '/usr/bin/tar' };
  const file = path.join(root, 'runtime.json');
  let environmentReads = 0;
  const environment = new Proxy({ KUBECLAW_BUILD_REVISION: 'a'.repeat(40) }, { get(target, name) {
    if (name === 'TEST_SOURCE_KEY' || name === 'TEST_BUSTER_TOKEN') environmentReads++;
    return Reflect.get(target, name);
  } });
  fs.writeFileSync(file, JSON.stringify({ ...runtime, maximumResponseBytes: 96 }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation, settings, worker.localRuntime, environment), /SERVICE_POLICY_INVALID/);
  assert.equal(environmentReads, 0, 'service policy rejects before credential lookup');
  fs.writeFileSync(file, JSON.stringify(runtime));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation, settings, worker.localRuntime,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), TEST_BUSTER_TOKEN: 'fixture', TEST_SOURCE_KEY: 'not a public key' }), /BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/);
  assert.deepEqual(fs.readdirSync(root), ['runtime.json'], 'invalid inputs never reach registry discovery/store handles');
});

 test('legacy v1 preserves immutable deny-all without weakening selected-owner validation', () => {
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...structuredClone(baseline), allowedCapabilities: [] as string[] };
  const policy = readLegacyBusterRuntimeServicePolicy(runtime);
  assert.deepEqual(policy.allowedCapabilities, []);
  assert.equal(Object.isFrozen(policy.allowedCapabilities), true);
  runtime.allowedCapabilities.push('network.http');
  assert.deepEqual(policy.allowedCapabilities, [], 'no implicit capability or mutable alias');
  assert.throws(() => readBusterRemotePlanServicePolicy({ ...baseline, allowedCapabilities: [] }), /SERVICE_POLICY_INVALID/);
  for (const allowedCapabilities of [undefined, ['unknown.capability'], ['network.http', 'network.http']]) {
    assert.throws(() => readLegacyBusterRuntimeServicePolicy({ ...runtime, allowedCapabilities }), /SERVICE_POLICY_INVALID/);
  }
});


test('real capability receivers reject malformed boolean authors without false-value refill', () => {
  const command = (value: unknown) => capabilitySources({ directCommand: {
    cgroupRoot: '/fixture/cgroup', allowSampledProcessLimit: value,
  } }, new Set(['command.execute']), {});
  const network = (value: unknown) => networkHttpOptions({
    allowedPorts: [443], maximumResponseBytes: 1024, maximumExecutionMs: 1000, allowWebSocket: value,
  }, null, undefined, undefined);
  for (const value of [null, 0, 1, '', 'false', 'true', [], {}]) {
    assert.throws(() => command(value), /BUSTER_REMOTE_CONFIG_INVALID:directCommand.allowSampledProcessLimit/);
    assert.throws(() => network(value), /BUSTER_REMOTE_CONFIG_INVALID:networkHttp.allowWebSocket/);
  }
  for (const value of [undefined, false, true]) {
    assert.equal(command(value).allowSampledProcessLimit, value === true);
    assert.equal(network(value).networkHttp?.allowWebSocket, value === true);
  }
  assert.throws(() => capabilitySources({ directCommand: { allowSampledProcessLimit: false } },
    new Set(['command.execute']), {}), /BUSTER_DIRECT_COMMAND_ISOLATION_REQUIRED/);
  assert.equal(capabilitySources({ directCommand: { allowSampledProcessLimit: true } },
    new Set(['command.execute']), {}).allowSampledProcessLimit, true);
  assert.equal(capabilitySources({}, new Set(), {}).directCommandSource, null);
  assert.deepEqual(networkHttpOptions(null, null, undefined, undefined), {});
});
