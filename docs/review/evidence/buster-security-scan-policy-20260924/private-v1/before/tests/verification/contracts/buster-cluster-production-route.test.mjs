import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { buildRegistry, discoverPackages, createProductionNovaTestGate } from '@kubeclaw/nova-core';
import { loadProductionBusterRemotePlanRuntime } from '@kubeclaw/buster-engine';
import { resolvedTestPlanDigest, stableTestIdentity } from '@kubeclaw/pipeline-test-gate-contract';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { canonicalSwarmEntry, readTestBundle, writeTestBundle } from '../../fixtures/config/swarm-bundle.mjs';
import { FileNovaGateImportStore } from '../../../skills/nova/core/test-gates/remote-result-import.ts';
import { ModeledPreparation } from '../../fixtures/test-gate/modeled-preparation.mts';
import { ownedClusterTest } from '../../fixtures/test-gate/cluster-test-ownership.mjs';
import { clusterCommandApi, exposureRequest } from '../../fixtures/test-gate/cluster-command-api.mjs';
import { manifest, imageDigest } from '../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs';

const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };
const capabilities = ['kubernetes.fixture', 'kubernetes.exposure', 'kubernetes.runtime-security'];
function packages(root) {
  const installRoot = path.join(root, 'plugins');
  const packageRoot = path.join(installRoot, 'cluster-proof');
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'schemas'));
  fs.writeFileSync(path.join(packageRoot, 'package.json'), '{"type":"module"}\n');
  fs.copyFileSync(new URL('../../fixtures/test-gate/cluster-route-provider.mjs', import.meta.url), path.join(packageRoot, 'dist/provider.js'));
  fs.writeFileSync(path.join(packageRoot, 'schemas/config.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    required: ['capability', 'request', 'manifest', 'hostname'], additionalProperties: false,
    properties: { capability: { enum: capabilities }, request: { type: 'object' }, manifest: { type: 'string' }, hostname: { type: 'string' } },
  }));
  fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({
    id: 'ci2.cluster', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', stages: [], observers: [], adapters: [],
    testProviders: capabilities.map((capability, index) => ({ id: `route${index}`, contractId: `ci2.cluster${index}@1`,
      kind: 'test', module: 'dist/provider.js', export: 'provider', configSchema: 'schemas/config.json',
      inputs: [], outputs: [], requiredCapabilities: [capability], retrySafe: true, matrixFields: [], reportFormats: [],
      evidenceTypes: ['log'], evidenceDefaults: { onPass: ['log'], onFail: ['log'], onError: ['log'] } })),
  }));
  const registry = buildRegistry(discoverPackages({ installationRoots: [installRoot], trustPolicy: {
    trustedBuiltinRoots: [installRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'kubeclaw-platform-v2',
  } }));
  return { installRoot, registry };
}
function plan(registry, capability, profile) {
  const entry = registry.testProviderContracts.get(`ci2.cluster${capabilities.indexOf(capability)}@1`);
  assert(entry);
  const checked = manifest.replaceAll('registry.local/app', profile.registry);
  const request = capability === 'kubernetes.exposure' ? structuredClone(exposureRequest) : {
    operation: 'prepare', resource: { type: capability, canonicalId: 'kubernetes-fixture:attempt:one' },
    payload: { leaseName: 'test-one', namespaceName: `${profile.prefix}-one`, namespacePrefix: profile.prefix, project: 'ci2',
      immutableImage: `${profile.registry}@${imageDigest}`, imageDigest, manifestPath: 'provided-in-child',
      manifestDigest: `sha256:${crypto.createHash('sha256').update(checked).digest('hex')}`,
      serviceName: 'app', servicePort: 8080, retentionSeconds: 300, retentionMode: 'delete', readinessTimeoutMs: 1000, secretReferences: [] },
  };
  if (capability === 'kubernetes.runtime-security') {
    request.operation = 'inspect'; delete request.resource;
    request.payload = { leaseName: 'test-one', namespace: `${profile.prefix}-one`,
      immutableImage: `${profile.registry}@${imageDigest}`, manifestPath: 'provided-in-child',
      manifestDigest: `sha256:${crypto.createHash('sha256').update(checked).digest('hex')}` };
  }
  if (capability === 'kubernetes.exposure') request.payload.namespace = `${profile.prefix}-one`;
  const unsigned = { schemaVersion: 'resolved-test-plan.v1', planId: 'plan:ci2', runId: 'run:ci2', project: 'ci2',
    scope: { moduleId: 'module', gateId: null }, registrySnapshotDigest: registry.snapshotDigest,
    createdAt: '2026-09-24T00:00:00.000Z', suites: [],
    nodes: [{ id: 'probe', executionId: 'execution:probe', testIdentity: stableTestIdentity({ project: 'ci2', moduleId: 'module', gateId: null,
      suiteInstanceId: null, nodeId: 'probe', variation: {} }), suiteInstanceId: null, kind: 'test',
      provider: { packageId: entry.registration.package.packageId, packageVersion: entry.registration.package.packageVersion,
        contentDigest: entry.registration.package.contentDigest, registrationId: entry.registration.registrationId, contractId: entry.registration.contractId },
      reportAdapters: [], mode: 'blocking', reviewAgent: null,
      configuration: { schemaVersion: 'provider-configuration.v1', contractId: entry.registration.contractId,
        schemaDigest: entry.configSchemaDigest, values: { capability, request, manifest: checked, hostname: profile.hostname } },
      dependencies: [], timeoutMs: 20000, limits: { cpuMillis: 10000, memoryBytes: 512 * 1024 * 1024,
        logBytes: 1024 * 1024, artifactBytes: 4 * 1024 * 1024, artifactFiles: 16, processes: 16 },
      retryCount: 0, concurrencyGroup: null, parentNodeId: null, variation: {},
      evidence: { onPass: ['log'], onFail: ['log'], onError: ['log'] }, skipReason: null }], links: [], concurrencyLimits: {} };
  return { ...unsigned, planDigest: resolvedTestPlanDigest(unsigned) };
}

const profiles = [
  { name: 'first', prefix: 'test', namespace: 'control-first', group: 'first.example.test', version: 'v1alpha1',
    runtimeOutputBytes: 2048, runtimePadding: 1000, runtimeDeniedBytes: 1024, account: 'runner-first', registry: 'registry.local/app', hostname: 'preview.first.test', suffix: '.first.test' },
  { name: 'second', prefix: 'other', namespace: 'control-second', group: 'second.example.test', version: 'v2beta1',
    runtimeOutputBytes: 8192, runtimePadding: 4000, runtimeDeniedBytes: 2048, account: 'runner-second', registry: 'alternate.local/other', hostname: 'preview.second.test', suffix: '.second.test' },
];
for (const profile of profiles) for (const capability of capabilities) {
  test(`production decoder/service/IPC ${profile.name} ${capability}, allowed and grant/route denied`, { timeout: 60000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-route-'));
    return ownedClusterTest(t, root, async owner => {
    const api = clusterCommandApi(root, profile.hostname); api.seed(`${profile.prefix}-one`);
    const { installRoot, registry } = packages(root);
    const repository = path.join(root, 'repository'); fs.mkdirSync(path.join(repository, 'module'), { recursive: true });
    fs.writeFileSync(path.join(repository, 'README.md'), 'CI2 production routing proof\n');
    fs.writeFileSync(path.join(repository, 'checked.yaml'), manifest.replaceAll('registry.local/app', profile.registry));
    fs.writeFileSync(path.join(repository, 'module/FORGE.md'), '```kubeclaw-deliverables\n' + JSON.stringify({
      schemaVersion: 'forge-deliverables.v1', moduleId: 'module', substep: null, deliverables: ['README.md'] }) + '\n```\n');
    for (const args of [['init', '-q'], ['config', 'user.email', 'ci2@example.invalid'], ['config', 'user.name', 'CI2 Proof'],
      ['add', 'README.md', 'module/FORGE.md', 'checked.yaml'], ['commit', '-qm', 'source']]) execFileSync('git', ['-C', repository, ...args]);
    const documents = readTestBundle(canonicalSwarmEntry);
    const policy = documents['buster-engine'].settings.clusterInvokers;
    Object.assign(policy.shared, { kubectlExecutable: api.executable, leaseApiGroup: profile.group, leaseApiVersion: profile.version });
    Object.assign(policy.kubernetesFixture, { allowedNamespacePrefixes: [profile.prefix], registryRepositoryPrefixes: [profile.registry.split('/')[1]],
      runnerServiceAccount: profile.account, credentialReaderServiceAccount: 'reader' });
    Object.assign(policy.tailscaleExposure, { allowedNamespacePrefixes: [profile.prefix], allowedHostSuffixes: [profile.suffix] });
    Object.assign(policy.runtimeSecurity, { allowedNamespacePrefixes: [profile.prefix], maximumOutputBytes: profile.runtimeOutputBytes });
    const bundle = path.join(root, 'bundle/swarm.config.json'); writeTestBundle(bundle, documents);
    const snapshot = loadSwarmSettings({ SWARM_CONFIG: bundle });
    const keys = crypto.generateKeyPairSync('ed25519');
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = 'ci2-production-routing-token-000000000';
    const platformConfig = path.join(root, 'platform.json');
    fs.writeFileSync(platformConfig, JSON.stringify({ schemaVersion: 'pipeline-platform.v2', effectLockTtlMs: 300000,
      installationRoots: [installRoot], trustedBuiltinRoots: [installRoot], externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
      providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {}, storageRoot: path.join(root, 'platform-state'),
      shutdownTimeoutMs: 5000, orchestratorIssuerId: 'ci2', administrativeDecisionIssuers: [] }));
    const selectedPlan = plan(registry, capability, profile);
    const modes = ['allowed', 'grant-denied', 'route-denied', ...(capability === 'kubernetes.runtime-security' ? ['policy-denied'] : [])];
    for (const mode of modes) {
      const runRoot = path.join(root, mode); fs.mkdirSync(runRoot);
      const selectedRequest = selectedPlan.nodes[0].configuration.values.request.payload;
      api.seed(`${profile.prefix}-one`, capability === 'kubernetes.runtime-security' ? { padding: profile.runtimePadding, snapshot: {
        phase: 'Observed', manifestDigest: selectedRequest.manifestDigest, immutableImage: selectedRequest.immutableImage,
        findings: [], totalFindingCount: 0, omittedFindingCount: 0, podCount: 1, serviceCount: 1,
      } } : null);
      let selectedSnapshot = snapshot;
      if (mode === 'policy-denied') {
        const deniedDocuments = structuredClone(documents);
        deniedDocuments['buster-engine'].settings.clusterInvokers.runtimeSecurity.maximumOutputBytes = profile.runtimeDeniedBytes;
        writeTestBundle(bundle, deniedDocuments); selectedSnapshot = loadSwarmSettings({ SWARM_CONFIG: bundle });
      }
      const configuration = { schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig, host: '127.0.0.1', port: 0,
        tokenEnvironmentVariable: 'CI2_TOKEN', sourceAttestationPublicKeyEnvironmentVariable: 'CI2_KEY', trustedSourceAuthority: 'nova:production',
        stateRoot: path.join(runRoot, 'buster-state'), runtimeRoot: path.join(runRoot, 'runs'), tarExecutable: '/usr/bin/tar',
        maximumResultStoreBytes: 64 * 1024 * 1024, allowedCapabilities: mode === 'route-denied' ? [] : [capability],
        maximumResponseBytes: 2 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024, shutdownTimeoutMs: 5000, recordLimits: records,
        clusterBindings: { controllerNamespace: profile.namespace },
        containerBuild: { buildctlExecutable: '/usr/local/bin/buildctl', buildkitHost: 'unix:///run/buildkit.sock',
          registryBaseUrl: `https://${profile.registry.split('/')[0]}`, registryReference: profile.registry.split('/')[0],
          registryUsernameEnvironmentVariable: 'CI2_REGISTRY_USER', registryPasswordEnvironmentVariable: 'CI2_REGISTRY_PASSWORD',
          repositoryPrefix: 'ci2', allowedPlatforms: ['linux/amd64'], allowedBuildArguments: [], maximumLogBytes: 1024,
          maximumExecutionMs: 5000, maximumManifestBytes: 1024 } };
      const config = path.join(runRoot, 'runtime.json'); fs.writeFileSync(config, JSON.stringify(configuration));
      // Only native preparation identity/publication is modeled. Parser/extractor,
      // production decoder, real service/store, Nova HTTP and child IPC remain real.
      const preparation = new ModeledPreparation(path.join(runRoot, 'preparation'), { recordLimits: records,
        maximumArchiveBytes: 4 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024,
        maximumResultStoreBytes: 64 * 1024 * 1024, trustedSourceAuthority: 'nova:production', sourceAttestationPublicKey: publicKey });
      preparation.configure({ tarExecutable: process.env.KUBECLAW_TEST_TAR ?? '/usr/bin/tar', maximumExtractedBytes: 16 * 1024 * 1024 });
      const runtime = loadProductionBusterRemotePlanRuntime(config, preparation, selectedSnapshot.buster, selectedSnapshot.workerCore.localRuntime,
        { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), CI2_TOKEN: token, CI2_KEY: publicKey,
          CI2_REGISTRY_USER: 'ci2-local-test', CI2_REGISTRY_PASSWORD: 'ci2-local-fixture-only' });
      const lifetime = owner.runtime(runtime);
      try {
        const address = await lifetime.start();
        const gate = createProductionNovaTestGate({ stateRoot: path.join(runRoot, 'nova-state'), endpoint: `http://127.0.0.1:${address.port}`,
          token, sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey, pollMilliseconds: 10,
          maximumResponseBytes: 64 * 1024, maximumResultBytes: 16 * 1024 * 1024, maximumArchiveBytes: 4 * 1024 * 1024,
          maximumArchiveStoreBytes: 16 * 1024 * 1024, maximumEvidenceBytes: 4 * 1024 * 1024,
          maximumEvidenceStoreBytes: 16 * 1024 * 1024, recordLimits: records });
        const prior = api.calls().length;
        const execution = owner.invoke(signal => gate.execute({ signal, idempotencyKey: `ci2:${mode}`, pipelineStageId: 'stage:ci2', plan: selectedPlan,
          repositoryRoot: repository, repositoryId: 'repository:ci2', grants: new Map([['probe', mode === 'grant-denied' ? [] : [capability]]]),
          maximumConcurrency: 1, submittedAt: '2026-09-24T00:00:00.000Z', timeoutMs: 30000 }));
        if (mode === 'route-denied') {
          await assert.rejects(execution, /BUSTER_REMOTE_CAPABILITY_DENIED/);
          assert.equal(api.calls().length, prior); continue;
        }
        const executed = await execution;
        if (mode === 'grant-denied' || mode === 'policy-denied') {
          assert.notEqual(executed.remote.decision.state, 'passed');
          const imports = new FileNovaGateImportStore(path.join(runRoot, 'nova-state/imports'), {
            recordLimits: records, maximumEvidenceStoreBytes: 16 * 1024 * 1024 });
          const graphs = await imports.readExecutionGraphs();
          assert.equal(graphs.length, 1);
          assert.match(JSON.stringify(graphs[0].attempts), mode === 'grant-denied'
            ? /TEST_PROVIDER_CAPABILITY_DENIED/ : /KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED/);
          if (mode === 'grant-denied') assert.equal(api.calls().length, prior);
          else {
            const deniedCalls = api.calls().slice(prior); assert.equal(deniedCalls.length, 1);
            assert(api.responseBytes() > profile.runtimeDeniedBytes && api.responseBytes() < profile.runtimeOutputBytes);
            assert.deepEqual(deniedCalls[0].args, ['get', `busternamespaceleases.${profile.group}`, 'test-one', '-n', profile.namespace, '-o', 'json']);
            assert.notEqual(deniedCalls[0].pid, process.pid);
          }
          continue;
        }
        assert.equal(executed.remote.decision.state, 'passed', JSON.stringify(executed));
        const calls = api.calls().slice(prior);
        assert(calls.length > 0 && calls.every(call => call.pid !== process.pid), 'actual local CLI subprocesses executed');
        if (capability === 'kubernetes.runtime-security') {
          assert(api.responseBytes() > profile.runtimeDeniedBytes && api.responseBytes() < profile.runtimeOutputBytes);
          assert.equal(calls.length, 1);
          assert.deepEqual(calls[0].args, ['get', `busternamespaceleases.${profile.group}`, 'test-one', '-n', profile.namespace, '-o', 'json']);
          continue;
        }
        const auth = calls.filter(call => call.args[0] === 'auth');
        assert(auth.length >= 2);
        for (const call of auth) {
          assert.equal(call.args[3], `busternamespaceleases.${profile.group}`);
          assert.equal(call.args[call.args.indexOf('-n') + 1], profile.namespace);
        }
        if (capability === 'kubernetes.fixture') {
          const leases = calls.filter(call => call.args[0] === 'apply' && call.input.includes('"kind":"BusterNamespaceLease"'));
          assert.equal(leases.length, 2);
          for (const call of leases) {
            const lease = JSON.parse(call.input);
            assert.equal(lease.apiVersion, `${profile.group}/${profile.version}`);
            assert.equal(lease.metadata.namespace, profile.namespace);
            assert.deepEqual(lease.spec.access, [{ subject: `${profile.namespace}/${profile.account}`, mode: 'deployer' }]);
            assert.equal(lease.spec.verifiedImage, `${profile.registry}@${imageDigest}`);
          }
          assert(calls.some(call => call.args.includes('--namespace') && call.input.includes(profile.registry)));
        } else assert(calls.some(call => call.args[0] === 'patch'), 'exposure consumer must issue actual patch');
      } finally { await lifetime.stop(); }
    }
    });
  });
}
