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
  loadProductionBusterRemotePlanRuntime,
} from '@kubeclaw/buster-engine';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-runtime-config-'));
const root = process.cwd();
const tokenName = 'PHASE7_REMOTE_TOKEN';
const token = 'phase-7-production-token-000000000000';
const sourcePrivateKeyName = 'PHASE7_SOURCE_ATTESTATION_PRIVATE_KEY';
const sourcePublicKeyName = 'PHASE7_SOURCE_ATTESTATION_PUBLIC_KEY';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const sourceAttestationPrivateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceAttestationPublicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
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
  fs.writeFileSync(platformConfig, JSON.stringify({
    schemaVersion: 'pipeline-platform.v2', installationRoots: [pluginRoot], trustedBuiltinRoots: [pluginRoot],
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {}, grants: {},
    adapters: {}, activeAdapters: [], observers: {}, storageRoot: './platform-state', shutdownTimeoutMs: 5_000,
    orchestratorIssuerId: 'phase7-config-test', administrativeDecisionIssuers: [],
  }));
  const busterConfig = path.join(temporary, 'buster.json');
  const baseBuster = {
    schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig, host: '127.0.0.1', port: 0,
    tokenEnvironmentVariable: tokenName, sourceAttestationPublicKeyEnvironmentVariable: sourcePublicKeyName,
    trustedSourceAuthority: 'nova:production', stateRoot: './buster-state', runtimeRoot: './buster-runs',
    tarExecutable: '/usr/bin/tar', maximumArchiveBytes: 1024 * 1024,
    maximumResultBytes: 16 * 1024 * 1024, maximumResultStoreBytes: 64 * 1024 * 1024,
    maximumExtractedBytes: 4 * 1024 * 1024, allowedCapabilities: [],
    maximumRequestBytes: 2 * 1024 * 1024, maximumResponseBytes: 2 * 1024 * 1024,
    maximumResultBytes: 16 * 1024 * 1024,
    shutdownTimeoutMs: 5_000, recordLimits: records,
  };
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

  fs.writeFileSync(busterConfig, JSON.stringify({ ...baseBuster, host: '0.0.0.0' }));
  assert.ok(loadProductionBusterRemotePlanRuntime(busterConfig,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), [tokenName]: token, [sourcePublicKeyName]: sourceAttestationPublicKey }) instanceof BusterRemotePlanRuntime);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '7-runtime-config', secrets: 'token-and-local-ed25519', transport: 'http-or-https' }));
