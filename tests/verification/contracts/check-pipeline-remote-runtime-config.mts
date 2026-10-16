import { TEST_CORE_POLICY_SELECTION } from '../../fixtures/core-runtime-policy.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ProductionNovaTestGate,
  loadProductionNovaTestGate,
} from '@kubeclaw/nova-core';
import {
  BusterRemotePlanRuntime,
  loadProductionBusterRemotePlanRuntime as productionRuntime,
} from '@kubeclaw/buster-engine';

import { captureSwarmSettings, type BusterSettings, type WorkerCoreSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { declaredPipelineServices } from '../../../scripts/updates/pipeline-generation.mjs';
import type { BusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-client.ts';

// This original configuration-only suite starts empty stores, never preparation.
const preparation: BusterPreparation = {
  stage: async () => { throw new Error('UNEXPECTED_PREPARATION'); },
  extract: async () => { throw new Error('UNEXPECTED_PREPARATION'); },
  repository: async () => { throw new Error('UNEXPECTED_PREPARATION'); },
};
// Source-only configuration fixture: consume the declared Buster owners together.
// This is not a verified installed-service boot receipt or native acceptance.
const authorRoot = path.resolve('config');
const selection = declaredPipelineServices(authorRoot, { role: 'buster', namespace: 'kubeclaw', releaseName: 'agent-buster' })
  .find(service => service.callerId === 'buster-runtime');
if (!selection) throw new Error('TEST_BUSTER_SELECTION_REQUIRED');
const capture = captureSwarmSettings(path.join(authorRoot, 'pipeline.config.json'), selection);
const busterComponent = capture.components['buster-engine'];
const workerComponent = capture.components['worker-core'];
if (!busterComponent || !workerComponent) throw new Error('TEST_BUSTER_COMPONENT_REQUIRED');
const authored = busterComponent.settings as unknown as BusterSettings;
const snapshot = {
  buster: { ...authored, clusterInvokers: { ...authored.clusterInvokers,
    shared: { ...authored.clusterInvokers.shared,
      kubectlExecutable: path.resolve(capture.identity.generationDirectory, authored.clusterInvokers.shared.kubectlExecutable) } } },
  workerCore: workerComponent.settings as unknown as WorkerCoreSettings,
};
function loadProductionBusterRemotePlanRuntime(file: string, environment: NodeJS.ProcessEnv) {
  return productionRuntime(file, preparation, snapshot.buster, snapshot.workerCore.localRuntime, environment);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-runtime-config-'));
const root = process.cwd();
const tokenName = 'PHASE7_REMOTE_TOKEN';
const token = 'phase-7-production-token-000000000000';
const sourcePrivateKeyName = 'PHASE7_SOURCE_ATTESTATION_PRIVATE_KEY';
const sourcePublicKeyName = 'PHASE7_SOURCE_ATTESTATION_PUBLIC_KEY';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const sourceAttestationPrivateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const sourceAttestationPublicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const records = { maximumRecords: 100, maximumBytes: 32 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };

try {
  const novaConfig = path.join(temporary, 'nova.json');
  fs.writeFileSync(novaConfig, JSON.stringify({
    schemaVersion: 'nova-remote-test-gate-runtime.v1',
    endpoint: 'http://127.0.0.1:8080', tokenEnvironmentVariable: tokenName,
    sourceAttestationPrivateKeyEnvironmentVariable: sourcePrivateKeyName,
    sourceAuthority: 'nova:production',
    stateRoot: './nova-state',
    pollMilliseconds: 10, maximumResponseBytes: 1024 * 1024,
    maximumResultBytes: 16 * 1024 * 1024,
    maximumArchiveBytes: 1024 * 1024, maximumArchiveStoreBytes: 4 * 1024 * 1024,
    maximumEvidenceBytes: 1024 * 1024, maximumEvidenceStoreBytes: 4 * 1024 * 1024,
    recordLimits: records,
  }));
  assert.ok(loadProductionNovaTestGate(novaConfig,
    { [tokenName]: token, [sourcePrivateKeyName]: sourceAttestationPrivateKey }) instanceof ProductionNovaTestGate);
  const validNovaConfig = JSON.parse(fs.readFileSync(novaConfig, 'utf8'));
  fs.writeFileSync(novaConfig, JSON.stringify({ ...validNovaConfig, legacyLedgerPath: './retired.json' }));
  assert.throws(() => loadProductionNovaTestGate(novaConfig,
    { [tokenName]: token, [sourcePrivateKeyName]: sourceAttestationPrivateKey }),
  /NOVA_REMOTE_CONFIG_INVALID:root\.legacyLedgerPath/u);
  fs.writeFileSync(novaConfig, JSON.stringify(validNovaConfig));
  assert.throws(() => loadProductionNovaTestGate(novaConfig, {}), /NOVA_REMOTE_CONFIG_TOKEN_MISSING/u);
  assert.throws(() => loadProductionNovaTestGate(novaConfig, { [tokenName]: token }),
    /NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING/u);
  assert.throws(() => loadProductionNovaTestGate(novaConfig,
    { [tokenName]: token, [sourcePrivateKeyName]: 'not-a-key' }),
  /NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID/u);
  fs.writeFileSync(novaConfig, JSON.stringify({
    schemaVersion: 'nova-remote-test-gate-runtime.v1', endpoint: 'http://buster.internal',
    tokenEnvironmentVariable: tokenName, sourceAttestationPrivateKeyEnvironmentVariable: sourcePrivateKeyName,
    sourceAuthority: 'nova:production', stateRoot: './nova-state',
    pollMilliseconds: 10, maximumResponseBytes: 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024,
    maximumArchiveBytes: 1024 * 1024, maximumArchiveStoreBytes: 4 * 1024 * 1024,
    maximumEvidenceBytes: 1024 * 1024, maximumEvidenceStoreBytes: 4 * 1024 * 1024, recordLimits: records,
  }));
  assert.throws(() => loadProductionNovaTestGate(novaConfig,
    { [tokenName]: token, [sourcePrivateKeyName]: sourceAttestationPrivateKey }),
  /NOVA_REMOTE_PLAN_PLAINTEXT_NON_LOOPBACK/u);

  const platformConfig = path.join(temporary, 'platform.json');
  const pluginRoot = path.join(root, 'skills/buster/plugins');
  fs.writeFileSync(platformConfig, JSON.stringify({corePolicySelection: TEST_CORE_POLICY_SELECTION,
    schemaVersion: 'pipeline-platform.v2', effectLockTtlMs: 300_000, installationRoots: [pluginRoot], trustedBuiltinRoots: [pluginRoot],
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {}, grants: {},
    adapters: {}, activeAdapters: [], observers: {}, storageRoot: './platform-state', shutdownTimeoutMs: 5_000,
    orchestratorIssuerId: 'phase7-config-test', administrativeDecisionIssuers: [],
  }));
  const busterConfig = path.join(temporary, 'buster.json');
  const baseBuster = {
    schemaVersion: 'buster-remote-plan-runtime.v1',
    platformConfig, host: '127.0.0.1', port: 0,
    tokenEnvironmentVariable: tokenName, sourceAttestationPublicKeyEnvironmentVariable: sourcePublicKeyName,
    trustedSourceAuthority: 'nova:production', stateRoot: './buster-state', runtimeRoot: './buster-runs',
    tarExecutable: '/usr/bin/tar',
    maximumResultStoreBytes: 64 * 1024 * 1024,
    allowedCapabilities: [],
    maximumResponseBytes: 2 * 1024 * 1024,
    maximumResultBytes: 16 * 1024 * 1024,
    shutdownTimeoutMs: 5_000, recordLimits: records,
  };
  fs.writeFileSync(busterConfig, JSON.stringify(baseBuster));
  for (const key of ['maximumActiveJobs', 'maximumQueuedJobs', 'maximumConcurrentAttempts']) {
    for (const value of [1, 2, 8, 16, 64]) {
      fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, [key]: value }));
      assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig,
        { KUBECLAW_BUILD_REVISION: 'a'.repeat(40) }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
    }
  }
  fs.writeFileSync(busterConfig, JSON.stringify(baseBuster));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig,
    { [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey }),
  /BUSTER_REMOTE_WORKER_REVISION_INVALID/u);
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token }),
    /BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING/u);
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: token }), /BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/u);
  const runtime = loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey });
  assert.ok(runtime instanceof BusterRemotePlanRuntime);
  const address = await runtime.start();
  assert.equal(address.address, '127.0.0.1');
  await runtime.stop();
  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, allowedCapabilities: ['command.execute'] }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey }), /BUSTER_DIRECT_COMMAND_CONFIG_REQUIRED/u);
  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, allowedCapabilities: ['command.execute'], directCommand: {
    executableCatalog: { node: process.execPath }, executableSearchPath: [path.dirname(process.execPath)],
    runtimeReadRoots: [path.dirname(process.execPath), '/lib/x86_64-linux-gnu', '/lib64', '/etc/ssl'],
    maximumOutputBytes: 1024 * 1024, maximumExecutionMs: 10_000,
    maximumProcesses: 8, maximumMemoryBytes: 512 * 1024 * 1024, maximumCpuMillis: 10_000, terminationGraceMs: 100 } }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey }), /BUSTER_DIRECT_COMMAND_ISOLATION_REQUIRED/u);
  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, allowedCapabilities: ['command.execute'], directCommand: {
    executableCatalog: { node: process.execPath }, executableSearchPath: [path.dirname(process.execPath)],
    runtimeReadRoots: [path.dirname(process.execPath), '/lib/x86_64-linux-gnu', '/lib64', '/etc/ssl'],
    maximumOutputBytes: 1024 * 1024, maximumExecutionMs: 10_000, allowSampledProcessLimit: true,
    maximumProcesses: 8, maximumMemoryBytes: 512 * 1024 * 1024, maximumCpuMillis: 10_000, terminationGraceMs: 100 } }));
  const commandRuntime = loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey });
  const commandAddress = await commandRuntime.start(); assert.equal(commandAddress.address, '127.0.0.1');
  await commandRuntime.stop();

  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, allowedCapabilities: ['network.http'] }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey }), /BUSTER_NETWORK_HTTP_CONFIG_REQUIRED/u);
  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, allowedCapabilities: ['network.http'], networkHttp: {
    allowedOrigins: ['http://127.0.0.1:3000'], allowedHostSuffixes: ['.svc.cluster.local'], allowedPorts: [3000],
    maximumResponseBytes: 1024 * 1024, maximumExecutionMs: 10_000 } }));
  const httpRuntime = loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey });
  const httpAddress = await httpRuntime.start(); assert.equal(httpAddress.address, '127.0.0.1');
  await httpRuntime.stop();

  const httpConfiguration = JSON.parse(fs.readFileSync(busterConfig, 'utf8'));
  const healthConfiguration = { ...httpConfiguration, networkHttp: { ...httpConfiguration.networkHttp, registryHealth: true } };
  const healthEnvironment = { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey };
  fs.writeFileSync(busterConfig, JSON.stringify(healthConfiguration));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig, healthEnvironment), /BUSTER_REGISTRY_HEALTH_CONFIG_INVALID/u);
  // These are configuration-only checks: no build process is launched.
  const containerBuild = { buildctlExecutable: '/usr/local/bin/buildctl', buildkitHost: 'unix:///run/buildkit.sock',
    registryBaseUrl: 'https://registry.example.test:5443', registryReference: 'registry.example.test:5443',
    registryUsernameEnvironmentVariable: 'REGISTRY_HEALTH_USER', registryPasswordEnvironmentVariable: 'REGISTRY_HEALTH_PASSWORD',
    repositoryPrefix: 'kubeclaw/test', allowedPlatforms: ['linux/amd64'], allowedBuildArguments: [],
    maximumLogBytes: 1024, maximumExecutionMs: 5000, maximumManifestBytes: 1024 };
  fs.writeFileSync(busterConfig, JSON.stringify({ ...healthConfiguration, containerBuild }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig, healthEnvironment), /REGISTRY_HEALTH_USER|registryUsernameEnvironmentVariable/u);
  const registryEnvironment = { ...healthEnvironment, REGISTRY_HEALTH_USER: 'health-test', REGISTRY_HEALTH_PASSWORD: 'private-health-config-canary' };
  const configuredHealth = loadProductionBusterRemotePlanRuntime(busterConfig, registryEnvironment);
  const healthAddress = await configuredHealth.start(); assert.equal(healthAddress.address, '127.0.0.1'); await configuredHealth.stop();
  fs.writeFileSync(busterConfig, JSON.stringify({ ...healthConfiguration, containerBuild: { ...containerBuild, registryReference: 'foreign.example.test' } }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(busterConfig, registryEnvironment), /BUSTER_REGISTRY_HEALTH_ENDPOINT_MISMATCH/u);

  // Cluster policy rejects before constructing any new store. Existing originals above remain intact.
  const clusterConfiguration = { ...baseBuster, clusterBindings: { controllerNamespace: 'kubeclaw' },
    stateRoot: './cluster-negative-state',
    allowedCapabilities: ['kubernetes.fixture'], containerBuild };
  const clusterLoad = () => loadProductionBusterRemotePlanRuntime(busterConfig, registryEnvironment);
  const noClusterStore = () => assert.equal(fs.existsSync(path.join(temporary, 'cluster-negative-state')), false);
  for (const kubernetesRuntimeSecurity of [null, {}, snapshot.buster.clusterInvokers.runtimeSecurity, 'invalid']) {
    fs.writeFileSync(busterConfig, JSON.stringify({ ...clusterConfiguration, kubernetesRuntimeSecurity }));
    assert.throws(clusterLoad, { message: 'SWARM_CONFIG_LEGACY_OVERRIDE:kubernetesRuntimeSecurity' });
    noClusterStore();
  }
  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, stateRoot: './cluster-disabled-state' }));
  const disabledClusterRuntime = clusterLoad();
  const disabledClusterAddress = await disabledClusterRuntime.start();
  assert.equal(disabledClusterAddress.address, '127.0.0.1');
  await disabledClusterRuntime.stop();
  for (const clusterBindings of [null, {}, { controllerNamespace: '' },
    { controllerNamespace: 'kubeclaw', registryReference: containerBuild.registryReference }]) {
    fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, stateRoot: './cluster-negative-state', clusterBindings }));
    assert.throws(clusterLoad, /BUSTER_(?:REMOTE_CONFIG_INVALID:clusterBindings|CLUSTER_BINDINGS_INVALID)/); noClusterStore();
  }
  fs.writeFileSync(busterConfig, JSON.stringify({ ...clusterConfiguration, clusterBindings: undefined }));
  assert.throws(clusterLoad, /BUSTER_REMOTE_CONFIG_INVALID:clusterBindings/); noClusterStore();
  for (const retired of ['kubernetesFixture', 'tailscaleExposure']) {
    fs.writeFileSync(busterConfig, JSON.stringify({ ...clusterConfiguration, [retired]: {} }));
    assert.throws(clusterLoad, /SWARM_CONFIG_LEGACY_OVERRIDE/); noClusterStore();
  }
  for (const registryReference of ['', containerBuild.registryReference, 'foreign.example.test']) {
    fs.writeFileSync(busterConfig, JSON.stringify({ ...clusterConfiguration,
      clusterBindings: { controllerNamespace: 'kubeclaw', registryReference } }));
    assert.throws(clusterLoad, /BUSTER_CLUSTER_BINDINGS_INVALID/); noClusterStore();
  }
  fs.writeFileSync(busterConfig, JSON.stringify({ ...clusterConfiguration,
    containerBuild: { ...containerBuild, registryReference: 'foreign.example.test' } }));
  assert.throws(clusterLoad, /BUSTER_REGISTRY_HEALTH_ENDPOINT_MISMATCH/); noClusterStore();
  fs.writeFileSync(busterConfig, JSON.stringify({ ...clusterConfiguration, containerBuild: undefined }));
  assert.throws(clusterLoad, /BUSTER_REGISTRY_HEALTH_CONFIG_INVALID/); noClusterStore();
  fs.writeFileSync(busterConfig, JSON.stringify(clusterConfiguration));
  const clusterRuntime = clusterLoad();
  const clusterAddress = await clusterRuntime.start();
  assert.equal(clusterAddress.address, '127.0.0.1');
  await clusterRuntime.stop();

  // Each other real cluster route independently requires its namespace binding.
  const remainingClusterRoutes = [
    { capability: 'kubernetes.exposure', source: {} },
    { capability: 'kubernetes.runtime-security', source: {} },
  ];
  for (const [index, route] of remainingClusterRoutes.entries()) {
    const stateRoot = `./cluster-route-${index}-state`;
    const configuration = { ...baseBuster, ...route.source, stateRoot,
      allowedCapabilities: [route.capability] };
    fs.writeFileSync(busterConfig, JSON.stringify(configuration));
    assert.throws(clusterLoad, { message: 'BUSTER_REMOTE_CONFIG_INVALID:clusterBindings' });
    assert.equal(fs.existsSync(path.join(temporary, stateRoot)), false,
      `${route.capability}: missing binding must reject before store construction`);
    fs.writeFileSync(busterConfig, JSON.stringify({ ...configuration,
      clusterBindings: { controllerNamespace: 'kubeclaw' } }));
    const configuredRoute = clusterLoad();
    const routeAddress = await configuredRoute.start();
    assert.equal(routeAddress.address, '127.0.0.1');
    await configuredRoute.stop();
  }

  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, host: '0.0.0.0' }));
  assert.ok(loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey }) instanceof BusterRemotePlanRuntime);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '7-runtime-config', secrets: 'token-and-local-ed25519', transport: 'http-or-https' }));
