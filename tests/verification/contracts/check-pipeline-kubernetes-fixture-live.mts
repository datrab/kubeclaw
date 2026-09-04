import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRegistry, discoverPackages, loadPipelineTestScope, resolveTestPlan } from '@kubeclaw/nova-core';
import { DirectCommandCapabilityInvoker, KubernetesFixtureCapabilityInvoker, TestPlanRunner } from '@kubeclaw/buster-engine';
import { CompositeTestProviderCapabilityInvoker } from '../../../skills/buster/engine/test-gates/composite-capability-runtime.ts';
import { cleanupRealE2ERunWorkspace, createRealE2ERunWorkspace } from '../e2e/real-run-workspace.mjs';

if (process.env.KUBECLAW_KUBERNETES_FIXTURE_LIVE !== '1') {
  throw new Error('KUBECLAW_KUBERNETES_FIXTURE_LIVE=1 is required because this check creates and deletes a real namespace lease');
}

const registryHost = process.env.KUBECLAW_LOCAL_REGISTRY ?? 'registry-local.kubeclaw.svc.cluster.local:5001';
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const runtimeRevision = execFileSync('git', ['-C', repositoryRoot, 'rev-parse', '--verify', 'HEAD'],
  { encoding: 'utf8' }).trim();
const busterRuntimeRevision = process.env.KUBECLAW_BUILD_REVISION;
if (!busterRuntimeRevision || !/^[a-f0-9]{40,64}$/u.test(busterRuntimeRevision)) {
  throw new Error('KUBERNETES_FIXTURE_LIVE_BUSTER_REVISION_MISSING');
}
const registryUrl = `http://${registryHost}`;
const catalog = await (await fetch(`${registryUrl}/v2/_catalog`)).json() as { repositories?: string[] };
const repositoryName = catalog.repositories?.sort()[0];
if (!repositoryName) throw new Error('KUBERNETES_FIXTURE_LIVE_IMAGE_MISSING');
const tags = await (await fetch(`${registryUrl}/v2/${repositoryName}/tags/list`)).json() as { tags?: string[] };
const tag = tags.tags?.sort()[0];
if (!tag) throw new Error('KUBERNETES_FIXTURE_LIVE_TAG_MISSING');
const manifestResponse = await fetch(`${registryUrl}/v2/${repositoryName}/manifests/${tag}`, {
  headers: { Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' },
});
assert.equal(manifestResponse.ok, true);
await manifestResponse.arrayBuffer();
const digest = manifestResponse.headers.get('docker-content-digest');
assert.match(String(digest), /^sha256:[a-f0-9]{64}$/u);
const immutableImage = `${registryHost}/${repositoryName}@${digest}`;

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubernetes-fixture-live-'));
let leaseName: string | null = null;
const rawLeaseNames: string[] = [];
let generatedWorkspace: Awaited<ReturnType<typeof createRealE2ERunWorkspace>> | null = null;
let productionReceipt: Record<string, unknown> | null = null;
const cleanupErrors: unknown[] = [];
const kubectlJson = (args: string[], input?: string) => JSON.parse(execFileSync('/usr/local/bin/kubectl', args,
  { input, encoding: 'utf8' }) as string);
const waitForLeasePhase = async (name: string, phases: string[], timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = kubectlJson(['get', 'busternamespacelease', name, '-n', 'kubeclaw', '-o', 'json']);
    if (phases.includes(String(current.status?.phase))) return current;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`KUBERNETES_FIXTURE_LIVE_PHASE_TIMEOUT:${name}:${phases.join(',')}`);
};
try {
  const priorDeploymentImage = process.env.REAL_E2E_DEPLOYMENT_IMAGE;
  process.env.REAL_E2E_DEPLOYMENT_IMAGE = immutableImage;
  try {
    generatedWorkspace = await createRealE2ERunWorkspace({ mode: 'full', scenarioId: 'success' });
  } finally {
    if (priorDeploymentImage === undefined) delete process.env.REAL_E2E_DEPLOYMENT_IMAGE;
    else process.env.REAL_E2E_DEPLOYMENT_IMAGE = priorDeploymentImage;
  }
  const generatedScope = loadPipelineTestScope(path.join(generatedWorkspace.swarmDir, 'pipeline.json'),
    { moduleId: null, gateId: 'final-buster' });
  const declaration: any = structuredClone(generatedScope.declaration);
  declaration.suites = {};
  delete declaration.tests.health;
  declaration.concurrencyLimits = { manifest: 1, 'kubernetes-fixture': 1 };
  const pluginRoot = path.join(repositoryRoot, 'skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'kubernetes-fixture-live',
  } }));
  const limits = { cpuMillis: 120_000, memoryBytes: 512 * 1024 * 1024, logBytes: 4 * 1024 * 1024,
    artifactBytes: 8 * 1024 * 1024, artifactFiles: 16, processes: 32 };
  const plan = resolveTestPlan({ planId: `plan:kubernetes-fixture:${Date.now()}`, runId: `run:kubernetes-fixture:${Date.now()}`,
    project: 'live-kubernetes-fixture', scope: { moduleId: 'fixture-app', gateId: null }, createdAt: new Date().toISOString(),
    declaration, suiteTemplates: [], registry,
    facts: { changedPaths: ['k8s/deployment.yaml'], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 180_000, maximumTimeoutMs: 240_000, defaultLimits: limits, maximumLimits: limits,
      maximumRetryCount: 1, maximumMatrixSize: 1, maximumNodes: 4, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: { manifest: 1, 'kubernetes-fixture': 1 } } });
  const direct = new DirectCommandCapabilityInvoker({ workspaceRoot: generatedWorkspace.artifactRoot,
    executableCatalog: new Map([['cp', '/usr/bin/cp']]), executableSearchPath: ['/usr/bin'],
    runtimeReadRoots: ['/usr/bin', '/usr/lib/x86_64-linux-gnu', '/usr/lib64'], maximumOutputBytes: 4 * 1024 * 1024,
    maximumExecutionMs: 180_000, maximumProcesses: 32, maximumMemoryBytes: 512 * 1024 * 1024,
    maximumCpuMillis: 120_000, terminationGraceMs: 500, allowSampledProcessLimit: true });
  const liveRunRoot = path.dirname(generatedWorkspace.artifactRoot);
  const liveArtifactRoot = `${generatedWorkspace.artifactRoot}-suite5-artifacts`;
  const liveObservabilityRoot = `${generatedWorkspace.artifactRoot}-suite5-observability`;
  const kubernetes = new KubernetesFixtureCapabilityInvoker({ workspaceRoot: liveRunRoot,
    kubectlExecutable: '/usr/local/bin/kubectl',
    controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
    allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: [`${registryHost}/${repositoryName}`],
    allowedSecretReferences: [],
    allowedStorageClasses: [], allowDefaultStorageClass: true,
    maximumManifestBytes: 4 * 1024 * 1024, maximumResources: 64,
    maximumPersistentVolumeClaimBytes: 10 * 1024 ** 3, maximumPersistentVolumeTotalBytes: 20 * 1024 ** 3,
    maximumRetentionSeconds: 3600,
    maximumExecutionMs: 180_000, pollIntervalMs: 500 });
  const capabilities = new CompositeTestProviderCapabilityInvoker(new Map([
    ['command.execute', direct], ['kubernetes.fixture', kubernetes],
  ]));
  const runner = new TestPlanRunner({ plan, registry, workspaceRoot: generatedWorkspace.artifactRoot,
    repositoryRoot: generatedWorkspace.worktreePath,
    artifactRoot: liveArtifactRoot, observabilityRoot: liveObservabilityRoot, maximumConcurrency: 2,
    grants: new Map([['checked-manifest', ['command.execute']], ['kubernetes-deployment', ['kubernetes.fixture']]]),
    capabilityInvoker: capabilities, cleanupTimeoutMs: 180_000 });
  const result = await runner.run();
  assert.deepEqual(result.nodes.map((node) => node.outcome), ['passed', 'passed'], JSON.stringify(result));
  assert.deepEqual(result.cleanupErrors, []);
  const fixture = result.attempts.find((attempt) => attempt.nodeId === 'kubernetes-deployment');
  assert.ok(fixture);
  assert.equal(fixture.outputs[0]?.kind, 'value');
  const deployment: any = fixture.outputs[0]?.kind === 'value' ? fixture.outputs[0].value : null;
  assert.equal(deployment.immutableImage, immutableImage);
  assert.equal(Number.isFinite(Date.parse(deployment.createdAt)), true);
  assert.equal(Date.parse(deployment.createdAt) <= Date.parse(deployment.expiresAt), true);
  const producer = result.attempts.find((attempt) => attempt.nodeId === 'checked-manifest');
  assert.ok(producer);
  assert.equal(producer.outputs[0]?.kind, 'artifact');
  assert.equal(deployment.manifestDigest, producer.outputs[0]?.kind === 'artifact' ? producer.outputs[0].artifact.contentDigest : null);
  leaseName = String(fixture.providerDetails?.values.leaseName ?? '');
  assert.match(leaseName, /^test-[a-f0-9]{20}$/u);
  const lookup = (() => { try { execFileSync('/usr/local/bin/kubectl', ['get', 'busternamespacelease', leaseName!, '-n', 'kubeclaw']); return true; }
    catch { return false; } })();
  assert.equal(lookup, false, 'fixture cleanup must delete the real lease');

  const lifecycleLease = `test-retain-${Date.now().toString(16)}`.slice(0, 63);
  rawLeaseNames.push(lifecycleLease);
  const lifecycleResource = { apiVersion: 'kubeclaw.forgestack.ai/v1alpha1', kind: 'BusterNamespaceLease',
    metadata: { name: lifecycleLease, namespace: 'kubeclaw' }, spec: { namespaceName: lifecycleLease,
      namespacePrefix: 'test', runId: lifecycleLease, project: 'live-kubernetes-fixture', purpose: 'gate',
      capabilityProfile: 'default', cleanupPolicy: 'retain', ttlSeconds: 60, secretsToCopy: [],
      exposure: { provider: 'off' } } };
  const lifecycle = `${JSON.stringify(lifecycleResource)}\n`;
  execFileSync('/usr/local/bin/kubectl', ['apply', '-f', '-'], { input: lifecycle, encoding: 'utf8' });
  const readyLease = await waitForLeasePhase(lifecycleLease, ['Ready'], 120_000);
  assert.equal(readyLease.status.createdAt, readyLease.metadata.creationTimestamp);
  const retainedNamespace = String(readyLease.status.namespaceName);
  const expiredLease = await waitForLeasePhase(lifecycleLease, ['Expired'], 90_000);
  assert.equal(expiredLease.status.phase, 'Expired');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const stableExpiredLease = kubectlJson(['get', 'busternamespacelease', lifecycleLease, '-n', 'kubeclaw', '-o', 'json']);
  assert.equal(stableExpiredLease.status.phase, 'Expired');
  const namespaceStillExists = (() => { try { execFileSync('/usr/local/bin/kubectl', ['get', 'namespace', retainedNamespace]); return true; }
    catch { return false; } })();
  assert.equal(namespaceStillExists, false, 'retained fixture namespace must expire without recreation');

  const secretLease = `test-secret-${Date.now().toString(16)}`.slice(0, 63);
  rawLeaseNames.push(secretLease);
  const secretResource = { ...lifecycleResource, metadata: { name: secretLease, namespace: 'kubeclaw' },
    spec: { ...lifecycleResource.spec, namespaceName: secretLease, runId: secretLease, cleanupPolicy: 'delete',
      ttlSeconds: 300, secretsToCopy: ['not-approved-live-secret'] } };
  execFileSync('/usr/local/bin/kubectl', ['apply', '-f', '-'],
    { input: `${JSON.stringify(secretResource)}\n`, encoding: 'utf8' });
  const rejectedSecretLease = await waitForLeasePhase(secretLease, ['Failed'], 60_000);
  assert.match(String(rejectedSecretLease.status.message), /not approved for test deployment/u);
  const resultDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')}`;
  const decisionDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify({
    namespaceDeleted: true, retainedNamespaceExpired: true, rejectedUnapprovedSecret: true,
  })).digest('hex')}`;
  productionReceipt = { ok: true, schemaVersion: 'kubernetes-fixture-capability-diagnostic.v1',
    runId: plan.runId, jobId: plan.runId, runtimeRevision, busterRuntimeRevision,
    planDigest: plan.planDigest, resultDigest, decisionDigest, status: 'completed', decision: 'passed',
    evidenceDigests: [deployment.manifestDigest, resultDigest], evidenceCollected: true,
    runnerCleanupVerified: true, cleanupVerified: true, clusterCleanupObserved: true,
    phase: 'kubernetes-fixture-live', boundary: 'direct-capability-diagnostic',
    realComponents: ['generated-workspace', 'generated-plan', 'provider-process', 'command-sandbox', 'typed-artifact-link', 'kubernetes-api', 'namespace-controller',
      'local-registry-image', 'deployment', 'service', 'pod-readiness', 'lease-cleanup', 'retention-expiry',
      'secret-approval-denial'], mocks: 0, imageDigest: digest, manifestDigest: deployment.manifestDigest,
    namespaceDeleted: true, retainedNamespaceExpired: true, rejectedUnapprovedSecret: true,
    resources: { leaseName, lifecycleLease, secretLease } };
} finally {
  if (leaseName) {
    try { execFileSync('/usr/local/bin/kubectl', ['delete', 'busternamespacelease', leaseName, '-n', 'kubeclaw', '--ignore-not-found=true', '--wait=true', '--timeout=120s']); }
    catch (error) { cleanupErrors.push(error); }
  }
  for (const rawLeaseName of rawLeaseNames) {
    try { execFileSync('/usr/local/bin/kubectl', ['delete', 'busternamespacelease', rawLeaseName, '-n', 'kubeclaw',
      '--ignore-not-found=true', '--wait=true', '--timeout=120s']); } catch (error) { cleanupErrors.push(error); }
    try { execFileSync('/usr/local/bin/kubectl', ['wait', '--for=delete', `namespace/${rawLeaseName}`,
      '--timeout=120s']); } catch (error) { cleanupErrors.push(error); }
  }
  if (generatedWorkspace) {
    fs.rmSync(`${generatedWorkspace.artifactRoot}-suite5-artifacts`, { recursive: true, force: true });
    fs.rmSync(`${generatedWorkspace.artifactRoot}-suite5-observability`, { recursive: true, force: true });
    await cleanupRealE2ERunWorkspace(generatedWorkspace);
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}
if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'KUBERNETES_FIXTURE_LIVE_CLEANUP_FAILED');
if (productionReceipt) process.stdout.write(`${JSON.stringify(productionReceipt, null, 2)}\n`);
