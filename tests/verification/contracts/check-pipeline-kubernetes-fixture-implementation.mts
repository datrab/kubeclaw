import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { KubernetesFixtureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts';
import { resolveExecutable } from './support/resolve-executable.mts';

const pluginRoot = path.resolve('skills/buster/plugins');
const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
  trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
  verifierId: 'kubernetes-fixture-implementation',
} }));
const entry = registry.testProviderContracts.get('kubeclaw.kubernetes-fixture@1');
assert.ok(entry);
assert.equal(entry.registration.kind, 'fixture');
assert.deepEqual(entry.registration.capabilities, ['kubernetes.fixture']);
assert.equal(entry.registration.retrySafe, false);
assert.deepEqual(entry.registration.inputs.map((input) => input.name), ['image', 'checked-manifest']);
assert.equal(entry.registration.outputs.find(output => output.name === 'deployment')?.schemaId, 'kubeclaw.kubernetes-deployment-fixture@1');
const controllerChart = fs.readFileSync('charts/kubeclaw/templates/buster-namespace-controller.yaml', 'utf8');
const controllerSource = fs.readFileSync('cmd/buster-namespace-controller/main.go', 'utf8');
const runtimeSource = fs.readFileSync('skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', 'utf8');
assert.doesNotMatch(controllerChart, /pods\/portforward/u);
assert.doesNotMatch(controllerSource, /pods\/portforward/u);
assert.match(runtimeSource, /#releaseAfterPrepareFailure\(leaseName: string\)/u);
assert.match(runtimeSource, /new AbortController\(\)[\s\S]*#release\(leaseName, controller\.signal\)/u);
assert.match(runtimeSource, /\['get', 'service', serviceName[\s\S]*\['get', 'endpoints', serviceName/u);
assert.match(runtimeSource, /Math\.min\(15_000, deadline - Date\.now\(\)\)/u);
assert.match(runtimeSource, /NotFound[\s\S]*not found/u);
assert.match(runtimeSource, /readinessDeadline - Date\.now\(\)[\s\S]*#waitService/u);
assert.match(runtimeSource, /servicePortName[\s\S]*hasConfiguredPort/u);
assert.match(runtimeSource, /retentionMode[\s\S]*cleanupPolicy: retentionMode/u);
assert.match(runtimeSource, /status\.createdAt[\s\S]*KUBERNETES_FIXTURE_CREATED_AT_INVALID/u);
assert.match(runtimeSource, /#secretReferences\.has\(name\)[\s\S]*KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED/u);
assert.match(runtimeSource, /annotations\['tailscale\.com\/expose'\][\s\S]*KUBERNETES_FIXTURE_EXTERNAL_SERVICE_DENIED/u);
assert.match(runtimeSource, /externalIPs\.length > 0[\s\S]*externalName\.trim\(\)\.length > 0/u);
assert.match(runtimeSource, /field === 'containers' && containers\.length < 1/u);
assert.match(runtimeSource, /hostPort !== undefined && hostPort !== 0/u);
assert.match(controllerSource, /expireLease\([\s\S]*deleteOwnedNamespace/u);
assert.match(controllerSource, /allowedSourceSecrets\[name\][\s\S]*not approved for test namespace copying/u);
assert.match(controllerSource, /generated testCredentials keys must be username and password/u);
assert.match(runtimeSource, /access: \[\{ subject: this\.#runnerSubject, mode: 'deployer' \}\]/u);
const legacyExecutionPath = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/k8s-execution.ts';
if (fs.existsSync(legacyExecutionPath)) {
  const legacyExecution = fs.readFileSync(legacyExecutionPath, 'utf8');
  assert.doesNotMatch(legacyExecution, /port.?forward/iu);
  assert.match(legacyExecution, /svc\.cluster\.local/u);
  assert.match(legacyExecution, /retryHttpTextCheck\(serviceUrl/u);
}

const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/kubernetes-fixture.v1.json', 'utf8'));
const digest = `sha256:${'a'.repeat(64)}`;
const declaration: any = { suites: { deploy: { uses: 'kubeclaw.kubernetes-fixture-suite@1' } },
  tests: { manifest: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', config: { executable: 'cp',
    args: ['checked.yaml', 'checked-output.yaml'], resultMode: 'exit-code', artifacts: [
      { id: 'checked', path: 'checked-output.yaml', mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' },
    ] } } }, fixtures: { deploy: { uses: 'kubeclaw.kubernetes-fixture@1', retries: 0,
    config: { image: { reference: `registry.local/app@${digest}`, digest }, serviceName: 'app', servicePort: 8080 },
    inputs: { 'checked-manifest': { from: 'manifest', output: 'artifact-1', mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' } } } } };
const limits = { cpuMillis: 60_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
  artifactBytes: 8 * 1024 * 1024, artifactFiles: 16, processes: 16 };
const plan = resolveTestPlan({ planId: 'plan:kubernetes-fixture', runId: 'run:kubernetes-fixture', project: 'proof',
  scope: { moduleId: 'app', gateId: null }, createdAt: '2026-08-21T15:00:00.000Z', declaration,
  suiteTemplates: [suite], registry, facts: { changedPaths: ['checked.yaml'], moduleType: 'service', pipelineStage: 'test' },
  policy: { defaultTimeoutMs: 120_000, maximumTimeoutMs: 180_000, defaultLimits: limits, maximumLimits: limits,
    maximumRetryCount: 1, maximumMatrixSize: 2, maximumNodes: 4, defaultConcurrencyLimit: 1,
    maximumConcurrencyLimits: { 'kubernetes-fixture': 2 } } });
assert.deepEqual(plan.nodes.map((node) => [node.id, node.kind]), [['deploy', 'fixture'], ['manifest', 'test']]);
assert.deepEqual(plan.nodes.find((node) => node.id === 'deploy')?.dependencies.map((item) => item.nodeId), ['manifest']);
assert.equal(plan.links[0]?.mediaType, 'application/vnd.kubeclaw.checked-kubernetes-yaml');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubernetes-fixture-implementation-'));
try {
  const executable = resolveExecutable('kubectl');
  assert.throws(() => new KubernetesFixtureCapabilityInvoker({ workspaceRoot: temporary, kubectlExecutable: executable,
    controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
    allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: ['registry.local/app'], allowedSecretReferences: [],
    allowedStorageClasses: ['example.com/fast'], allowDefaultStorageClass: false,
    maximumManifestBytes: 1024 * 1024, maximumResources: 64,
    maximumPersistentVolumeClaimBytes: 10 * 1024 ** 3, maximumPersistentVolumeTotalBytes: 15 * 1024 ** 3,
    maximumRetentionSeconds: 3600, maximumExecutionMs: 120_000 }), /KUBERNETES_FIXTURE_STORAGE_CLASSES_INVALID/u);
  const capability = new KubernetesFixtureCapabilityInvoker({ workspaceRoot: temporary, kubectlExecutable: executable,
    controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
    allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: ['registry.local/app'], allowedSecretReferences: [],
    allowedStorageClasses: ['fast'], allowDefaultStorageClass: false,
    maximumPersistentVolumeClaimBytes: 10 * 1024 ** 3, maximumPersistentVolumeTotalBytes: 15 * 1024 ** 3,
    maximumManifestBytes: 1024 * 1024,
    maximumResources: 64, maximumRetentionSeconds: 3600, maximumExecutionMs: 120_000 });
  await assert.rejects(() => capability.invoke('kubernetes.fixture', { operation: 'prepare',
    resource: { type: 'kubernetes.fixture', canonicalId: 'invalid' }, payload: {} } as any,
  new AbortController().signal), /KUBERNETES_FIXTURE_CAPABILITY_REQUEST_INVALID/u);
  const deniedManifest = 'apiVersion: v1\nkind: ServiceAccount\nmetadata:\n  name: denied\n';
  const deniedPath = path.join(temporary, 'denied.yaml');
  fs.writeFileSync(deniedPath, deniedManifest);
  await assert.rejects(() => capability.invoke('kubernetes.fixture', { operation: 'prepare',
    resource: { type: 'kubernetes.fixture', canonicalId: 'kubernetes-fixture:attempt:denied' }, payload: {
      leaseName: 'test-denied', namespaceName: 'test-denied', namespacePrefix: 'test', project: 'proof',
      immutableImage: `registry.local/app@${digest}`, imageDigest: digest, manifestPath: deniedPath,
      manifestDigest: `sha256:${crypto.createHash('sha256').update(deniedManifest).digest('hex')}`,
      serviceName: 'app', servicePort: 8080, retentionSeconds: 300, readinessTimeoutMs: 10_000,
      retentionMode: 'delete', secretReferences: [],
    } } as any, new AbortController().signal), /KUBERNETES_FIXTURE_RESOURCE_KIND_DENIED:ServiceAccount/u);
  const validManifest = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  selector:\n    matchLabels:\n      app: app\n  template:\n    metadata:\n      labels:\n        app: app\n    spec:\n      securityContext:\n        runAsNonRoot: true\n        seccompProfile:\n          type: RuntimeDefault\n      containers:\n        - name: app\n          image: registry.local/app@${digest}\n          securityContext:\n            runAsNonRoot: true\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: [ALL]\n`;
  const validPath = path.join(temporary, 'valid.yaml');
  fs.writeFileSync(validPath, validManifest);
  await assert.rejects(() => capability.invoke('kubernetes.fixture', { operation: 'prepare',
    resource: { type: 'kubernetes.fixture', canonicalId: 'kubernetes-fixture:attempt:secret-denied' }, payload: {
      leaseName: 'test-secret-denied', namespaceName: 'test-secret-denied', namespacePrefix: 'test', project: 'proof',
      immutableImage: `registry.local/app@${digest}`, imageDigest: digest, manifestPath: validPath,
      manifestDigest: `sha256:${crypto.createHash('sha256').update(validManifest).digest('hex')}`,
      serviceName: 'app', servicePort: 8080, retentionSeconds: 300, retentionMode: 'delete',
      readinessTimeoutMs: 10_000, secretReferences: ['not-approved'],
    } } as any, new AbortController().signal), /KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED/u);

  const deadlineManifest = `${validManifest}---\napiVersion: v1\nkind: Service\nmetadata:\n  name: app\nspec:\n  selector:\n    app: app\n  ports:\n    - port: 8080\n      targetPort: 8080\n`;
  const deadlinePath = path.join(temporary, 'deadline.yaml');
  fs.writeFileSync(deadlinePath, deadlineManifest);
  const podTimeouts: number[] = [];
  const deadlineCapability = new KubernetesFixtureCapabilityInvoker({ workspaceRoot: temporary,
    kubectlExecutable: executable, controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai',
    leaseApiVersion: 'v1alpha1', allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: ['registry.local/app'],
    allowedSecretReferences: [], allowedStorageClasses: ['fast'], allowDefaultStorageClass: false,
    maximumManifestBytes: 1024 * 1024, maximumResources: 64,
    maximumPersistentVolumeClaimBytes: 10 * 1024 ** 3, maximumPersistentVolumeTotalBytes: 15 * 1024 ** 3,
    maximumRetentionSeconds: 3600, maximumExecutionMs: 2_000, pollIntervalMs: 50,
    async execute(_command, args, options) {
      if (args[0] === 'auth') return { stdout: 'yes\n' };
      if (args[0] === 'apply') return { stdout: '{}' };
      if (args[0] === 'delete') return { stdout: '{}' };
      if (args[0] === 'get' && args[1] === 'busternamespacelease') return { stdout: JSON.stringify({ status: {
        phase: 'Ready', namespaceName: 'test-deadline', createdAt: new Date().toISOString(),
      } }) };
      if (args[0] === 'get' && args[1] === 'pods') {
        podTimeouts.push(Number(options.timeout));
        return { stdout: '{"items":[]}' };
      }
      throw new Error(`unexpected kubectl operation: ${args.join(' ')}`);
    },
  });
  await assert.rejects(() => deadlineCapability.invoke('kubernetes.fixture', { operation: 'prepare',
    resource: { type: 'kubernetes.fixture', canonicalId: 'kubernetes-fixture:attempt:deadline' }, payload: {
      leaseName: 'test-deadline', namespaceName: 'test-deadline', namespacePrefix: 'test', project: 'proof',
      immutableImage: `registry.local/app@${digest}`, imageDigest: digest, manifestPath: deadlinePath,
      manifestDigest: `sha256:${crypto.createHash('sha256').update(deadlineManifest).digest('hex')}`,
      serviceName: 'app', servicePort: 8080, retentionSeconds: 300, retentionMode: 'delete',
      readinessTimeoutMs: 1_000, secretReferences: [],
    } } as any, new AbortController().signal), /KUBERNETES_FIXTURE_READINESS_TIMEOUT/u);
  assert.ok(podTimeouts.length > 1);
  assert.ok(podTimeouts.every((timeout) => timeout > 0 && timeout <= 1_000),
    `pod polls exceeded their remaining readiness budget: ${podTimeouts.join(',')}`);
  const fixtureRequest = (name: string, storageDocuments: string) => {
    const manifest = `${validManifest}---\napiVersion: v1\nkind: Service\nmetadata:\n  name: app\nspec:\n  ports:\n    - port: 8080\n      targetPort: 8080\n${storageDocuments}`;
    const manifestPath = path.join(temporary, `${name}.yaml`);
    fs.writeFileSync(manifestPath, manifest);
    return { operation: 'prepare', resource: { type: 'kubernetes.fixture', canonicalId: `kubernetes-fixture:attempt:${name}` },
      payload: { leaseName: `test-${name}`, namespaceName: `test-${name}`, namespacePrefix: 'test', project: 'proof',
        immutableImage: `registry.local/app@${digest}`, imageDigest: digest, manifestPath,
        manifestDigest: `sha256:${crypto.createHash('sha256').update(manifest).digest('hex')}`,
        serviceName: 'app', servicePort: 8080, retentionSeconds: 300, retentionMode: 'delete',
        readinessTimeoutMs: 10_000, secretReferences: [] } } as any;
  };
  const invokeFixture = (request: any) => capability.invoke('kubernetes.fixture', request, new AbortController().signal);
  await assert.rejects(() => invokeFixture(fixtureRequest('storage-class', `---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data\nspec:\n  storageClassName: forbidden\n  resources:\n    requests:\n      storage: 1Gi\n`)), /KUBERNETES_FIXTURE_STORAGE_CLASS_DENIED:forbidden/u);
  await assert.rejects(() => invokeFixture(fixtureRequest('prebound-volume', `---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data\nspec:\n  storageClassName: fast\n  volumeName: shared-production-volume\n  resources:\n    requests:\n      storage: 1Gi\n`)), /KUBERNETES_FIXTURE_PVC_SOURCE_DENIED:data/u);
  await assert.rejects(() => invokeFixture(fixtureRequest('cross-source', `---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data\nspec:\n  storageClassName: fast\n  dataSourceRef:\n    apiGroup: snapshot.storage.k8s.io\n    kind: VolumeSnapshot\n    name: production-snapshot\n    namespace: production\n  resources:\n    requests:\n      storage: 1Gi\n`)), /KUBERNETES_FIXTURE_PVC_SOURCE_DENIED:data/u);
  await assert.rejects(() => invokeFixture(fixtureRequest('claim-size', `---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data\nspec:\n  storageClassName: fast\n  resources:\n    requests:\n      storage: 11Gi\n`)), /KUBERNETES_FIXTURE_PVC_SIZE_DENIED:data/u);
  await assert.rejects(() => invokeFixture(fixtureRequest('total-size', `---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: first\nspec:\n  storageClassName: fast\n  resources:\n    requests:\n      storage: 8Gi\n---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: second\nspec:\n  storageClassName: fast\n  resources:\n    requests:\n      storage: 8Gi\n`)), /KUBERNETES_FIXTURE_PVC_TOTAL_SIZE_DENIED/u);
  await assert.rejects(() => invokeFixture(fixtureRequest('claim-template', `---\napiVersion: apps\/v1\nkind: StatefulSet\nmetadata:\n  name: stateful\nspec:\n  serviceName: app\n  selector:\n    matchLabels:\n      app: app\n  template:\n    metadata:\n      labels:\n        app: app\n    spec:\n      securityContext:\n        runAsNonRoot: true\n        seccompProfile:\n          type: RuntimeDefault\n      containers:\n        - name: app\n          image: registry.local/app@${digest}\n          securityContext:\n            runAsNonRoot: true\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: [ALL]\n  volumeClaimTemplates:\n    - metadata:\n        name: state\n      spec:\n        storageClassName: fast\n        resources:\n          requests:\n            storage: 11Gi\n`)), /KUBERNETES_FIXTURE_PVC_SIZE_DENIED:state/u);
  await assert.rejects(() => invokeFixture(fixtureRequest('replica-total', `---\napiVersion: apps\/v1\nkind: StatefulSet\nmetadata:\n  name: replicated\nspec:\n  replicas: 16\n  serviceName: app\n  selector:\n    matchLabels:\n      app: app\n  template:\n    metadata:\n      labels:\n        app: app\n    spec:\n      securityContext:\n        runAsNonRoot: true\n        seccompProfile:\n          type: RuntimeDefault\n      containers:\n        - name: app\n          image: registry.local/app@${digest}\n          securityContext:\n            runAsNonRoot: true\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: [ALL]\n  volumeClaimTemplates:\n    - metadata:\n        name: state\n      spec:\n        storageClassName: fast\n        resources:\n          requests:\n            storage: 1Gi\n`)), /KUBERNETES_FIXTURE_PVC_TOTAL_SIZE_DENIED/u);
  await assert.rejects(() => invokeFixture(fixtureRequest('ephemeral-volume', `---\napiVersion: v1\nkind: Pod\nmetadata:\n  name: ephemeral\nspec:\n  securityContext:\n    runAsNonRoot: true\n    seccompProfile:\n      type: RuntimeDefault\n  containers:\n    - name: app\n      image: registry.local/app@${digest}\n      securityContext:\n        runAsNonRoot: true\n        allowPrivilegeEscalation: false\n        capabilities:\n          drop: [ALL]\n  volumes:\n    - name: data\n      ephemeral:\n        volumeClaimTemplate:\n          spec:\n            storageClassName: fast\n            resources:\n              requests:\n                storage: 100Gi\n`)), /KUBERNETES_FIXTURE_GENERIC_EPHEMERAL_VOLUME_DENIED/u);

  const validationCapability = new KubernetesFixtureCapabilityInvoker({ workspaceRoot: temporary,
    kubectlExecutable: executable, controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai',
    leaseApiVersion: 'v1alpha1', allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: ['registry.local/app'],
    allowedSecretReferences: [], allowedStorageClasses: ['fast'], allowDefaultStorageClass: false,
    maximumManifestBytes: 1024 * 1024, maximumResources: 64,
    maximumPersistentVolumeClaimBytes: 10 * 1024 ** 3, maximumPersistentVolumeTotalBytes: 15 * 1024 ** 3,
    maximumRetentionSeconds: 3600, maximumExecutionMs: 120_000,
    execute: async () => ({ stdout: 'no\n', stderr: '' }) });
  for (const [index, quantity] of ['1.5Gi', '1000m', '1e3'].entries()) {
    const request = fixtureRequest(`quantity-${index}`, `---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data\nspec:\n  storageClassName: fast\n  resources:\n    requests:\n      storage: ${JSON.stringify(quantity)}\n`);
    await assert.rejects(() => validationCapability.invoke('kubernetes.fixture', request,
      new AbortController().signal), /KUBERNETES_FIXTURE_RBAC_DENIED:create/u);
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ ok: true, phase: 'kubernetes-fixture-implementation', authority: 'replacement-only',
  providerKind: 'fixture', typedManifestLink: true, narrowCapability: true, injectedExecutorVectors: true, nativeCluster: false }));
