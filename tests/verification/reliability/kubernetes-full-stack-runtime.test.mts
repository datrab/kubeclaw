import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { KubernetesFixtureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts';
import { resolveExecutable } from '../contracts/support/resolve-executable.mts';
const primary = `registry.local/core@sha256:${'a'.repeat(64)}`;
const database = `registry.local/db@sha256:${'b'.repeat(64)}`;
const security = { runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] } };
const manifest = { apiVersion: 'v1', kind: 'List', items: [
  { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'app' }, spec: {
    selector: { matchLabels: { app: 'app' } }, template: { metadata: { labels: { app: 'app' } }, spec: {
      automountServiceAccountToken: false, securityContext: { runAsNonRoot: true, seccompProfile: { type: 'RuntimeDefault' } },
      containers: [{ name: 'app', image: primary, securityContext: security }, { name: 'database', image: database, securityContext: security }] } } } },
  { apiVersion: 'v1', kind: 'Service', metadata: { name: 'app' }, spec: { selector: { app: 'app' }, ports: [{ port: 8080 }] } },
  { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: { name: 'deny' }, spec: { podSelector: {}, policyTypes: ['Ingress', 'Egress'] } },
] };
const requestResource = { type: 'kubernetes.fixture', canonicalId: 'kubernetes-fixture:attempt:stack' };
function setup(execute: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-stack-'));
  const invoker = new KubernetesFixtureCapabilityInvoker({ workspaceRoot: root, kubectlExecutable: resolveExecutable('kubectl'),
    controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
    allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: ['registry.local/core', 'registry.local/db'], allowedSecretReferences: [],
    allowedStorageClasses: ['fast'], allowDefaultStorageClass: false, maximumPersistentVolumeClaimBytes: 1024 ** 3,
    maximumPersistentVolumeTotalBytes: 2 * 1024 ** 3, maximumManifestBytes: 1024 ** 2, maximumResources: 64,
    maximumRetentionSeconds: 3600, maximumExecutionMs: 10_000, pollIntervalMs: 50, execute });
  const bytes = JSON.stringify(manifest);
  const manifestPath = path.join(root, 'manifest.json'); fs.writeFileSync(manifestPath, bytes);
  const payload = { leaseName: 'test-stack', namespaceName: 'test-stack', namespacePrefix: 'test', project: 'stack',
    immutableImage: primary, imageDigest: `sha256:${'a'.repeat(64)}`, fullStack: true, verifiedImages: [primary, database],
    manifestPath, manifestDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    serviceName: 'app', servicePort: 8080, retentionSeconds: 300, retentionMode: 'delete', readinessTimeoutMs: 1000 };
  return { invoker, root, payload };
}
test('full-stack prepare binds inventory and policies to lease but never applies policies as runner', async () => {
  let lease: any; let applied: any;
  const { invoker, root, payload } = setup(async (_: string, args: string[], options: any) => {
    let result: any = {};
    if (args[0] === 'auth') return { stdout: 'yes\n' };
    if (args[0] === 'apply') {
      const document = JSON.parse(String(options.input));
      if (document.kind === 'BusterNamespaceLease') lease = document; else applied = document;
    } else if (args[0] === 'get' && args[1] === 'busternamespacelease') result = { status: {
      phase: 'Ready', namespaceName: 'test-stack', createdAt: new Date().toISOString() } };
    else if (args[1] === 'pods') result = { items: [{ metadata: { name: 'app' }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } }] };
    else if (args[1] === 'service') result = { spec: { ports: [{ port: 8080 }] } };
    else if (args[1] === 'endpoints') result = { subsets: [{ addresses: [{ ip: '10.0.0.2' }], ports: [{ port: 8080 }] }] };
    else throw new Error(`Unexpected command ${args.join(' ')}`);
    return { stdout: JSON.stringify(result) };
  });
  try {
    const result = await invoker.invoke('kubernetes.fixture', { operation: 'prepare', resource: requestResource, payload } as any, new AbortController().signal);
    assert.equal(result.ok, true);
    assert.deepEqual(lease.spec.verifiedImages, [primary, database].sort());
    assert.deepEqual(lease.spec.endpointSelector, { app: 'app' });
    assert.equal(lease.spec.networkPolicies[0].name, 'deny');
    assert.equal(lease.spec.manifestDigest, payload.manifestDigest);
    assert.equal(applied.items.length, 2);
    assert.ok(applied.items.every((item: any) => item.kind !== 'NetworkPolicy'));
    await assert.rejects(() => invoker.invoke('kubernetes.fixture', { operation: 'prepare', resource: requestResource,
      payload: { ...payload, verifiedImages: [primary] } } as any, new AbortController().signal), /UNVERIFIED_IMAGE/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('replacement rejects stale lease and invalid timeout before any mutation', async () => {
  let mutations = 0;
  const { invoker, root } = setup(async (_: string, args: string[]) => {
    if (args[0] !== 'get') mutations++;
    return { stdout: JSON.stringify({ metadata: { uid: 'new-lease' }, spec: {}, status: {} }) };
  });
  const payload = { leaseName: 'test-stack', leaseUID: 'old-lease', namespace: 'test-stack', podName: 'app-0', podUID: 'old-pod', timeoutMs: 1000 };
  try {
    for (const timeoutMs of [0, 1000]) await assert.rejects(() => invoker.invoke('kubernetes.fixture', {
      operation: 'replace-pod', resource: requestResource, payload: { ...payload, timeoutMs } } as any, new AbortController().signal));
    assert.equal(mutations, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('timeout snapshots safe evidence before cleanup and preserves event read errors', async () => {
  let deleted = false; let eventRead = false;
  const { invoker, root, payload } = setup(async (_: string, args: string[]) => {
    if (args[0] === 'auth') return { stdout: 'yes' };
    if (args[0] === 'apply') return { stdout: '{}' };
    if (args[0] === 'delete') { assert.ok(eventRead); deleted = true; return { stdout: '{}' }; }
    if (args[1]?.startsWith('busternamespacelease')) return { stdout: JSON.stringify({ status: {
      phase: 'Ready', namespaceName: 'test-stack', createdAt: new Date().toISOString() } }) };
    assert.equal(deleted, false);
    if (args[1] === 'events') { eventRead = true; throw new Error('Forbidden secret=do-not-publish'); }
    return { stdout: JSON.stringify({ items: [{ metadata: { name: 'app', uid: 'pod-uid' },
      spec: { password: 'do-not-publish' }, status: { phase: 'Pending',
        conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: 'do-not-publish' }],
        initContainerStatuses: [{ name: 'init', state: { terminated: { exitCode: 1, reason: 'Error' } } }],
        containerStatuses: [{ name: 'app', restartCount: 3, state: { waiting: { reason: 'ImagePullBackOff' } },
          lastState: { terminated: { exitCode: 137, reason: 'OOMKilled', message: 'do-not-publish' } } }] } }] }) };
  });
  try {
    const result: any = await invoker.invoke('kubernetes.fixture', { operation: 'prepare', resource: requestResource, payload } as any, new AbortController().signal);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'KUBERNETES_FIXTURE_READINESS_TIMEOUT');
    const pod = result.failureEvidence.pods[0];
    assert.equal(pod.containerStatuses[0].state.waiting.reason, 'ImagePullBackOff');
    assert.equal(pod.containerStatuses[0].lastState.terminated.exitCode, 137);
    assert.equal(pod.initContainerStatuses[0].state.terminated.exitCode, 1);
    assert.deepEqual(result.failureEvidence.readErrors, ['events:unavailable']);
    assert.equal(deleted, true);
    assert.doesNotMatch(JSON.stringify(result), /do-not-publish|password/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('ordinary fixture provider result carries failure evidence without deployment outputs', async () => {
  const { provider } = await import('../../../skills/buster/plugins/kubernetes-fixture/src/provider.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-report-'));
  const file = path.join(root, 'manifest.json'); fs.writeFileSync(file, '{}');
  try {
    const evidence = { schemaVersion: 'kubernetes-fixture-failure.v1', pods: [], readErrors: ['pods:unavailable'] };
    const result = await provider().execute({ runId: 'run', nodeId: 'fixture', attemptId: 'attempt', timeoutMs: 1000,
      configuration: { values: { image: { reference: primary, digest: `sha256:${'a'.repeat(64)}` }, serviceName: 'app', servicePort: 8080 } },
      inputs: [{ name: 'checked-manifest', kind: 'artifact', artifact: { mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml',
        contentDigest: `sha256:${'b'.repeat(64)}`, sizeBytes: 2, storageUrl: new URL(`file://${file}`).href } }] }, {
      invoke: async () => ({ ok: false, errorCode: 'KUBERNETES_FIXTURE_READINESS_TIMEOUT', namespace: 'test-stack', failureEvidence: evidence }),
    });
    assert.equal(result.outcome, 'failed');
    assert.deepEqual(result.providerDetails.values.failureEvidence, evidence);
    assert.deepEqual(result.outputs, []);
    assert.match(result.summary, /READINESS_TIMEOUT.*test-stack/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('diagnostic cancellation avoids reads and collection bounds the public snapshot', async () => {
  const { collectFixtureFailureEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  const cancelled = await collectFixtureFailureEvidence('test-stack', AbortSignal.abort(), async () => { throw new Error('must not read'); });
  assert.deepEqual(cancelled.readErrors, ['pods:cancelled']);
  let reads = 0;
  const bounded = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async () => {
    reads++; return JSON.stringify({ items: Array.from({ length: 100 }, () => ({ metadata: { name: 'pod' }, reason: 'FailedScheduling' })) });
  });
  assert.equal(reads, 2);
  assert.equal(bounded.pods.length, 16);
  assert.equal(bounded.events.length, 32);
  assert.equal(bounded.truncated, true);
});
