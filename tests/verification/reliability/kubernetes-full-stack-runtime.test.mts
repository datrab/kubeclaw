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
    if (args[0] === 'logs') return { stdout: 'connection refused password=do-not-publish' };
    if (args[1] === 'namespace') return { stdout: JSON.stringify({ metadata: { name: 'test-stack', uid: 'namespace-uid' } }) };
    if (args[1] === 'events') { eventRead = true; throw new Error('Forbidden secret=do-not-publish'); }
    return { stdout: JSON.stringify({ items: [{ metadata: { name: 'app', uid: 'pod-uid' },
      spec: { containers: [{ env: [{ name: 'CONFIG', value: 'do-not-publish' }] }] }, status: { phase: 'Pending',
        conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: 'do-not-publish' }],
        initContainerStatuses: [{ name: 'init', state: { terminated: { exitCode: 1, reason: 'Error' } } }],
        containerStatuses: [{ name: 'app', restartCount: 3, state: { waiting: { reason: 'ImagePullBackOff' } },
          lastState: { terminated: { exitCode: 137, reason: 'OOMKilled', message: 'do-not-publish' } } }] } }] }) };
  });
  try {
    const result: any = await invoker.invoke('kubernetes.fixture', { operation: 'prepare', resource: requestResource, payload } as any, new AbortController().signal);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'KUBERNETES_FIXTURE_READINESS_TIMEOUT');
    assert.equal(result.failureEvidence.namespaceIdentity.uid, 'namespace-uid');
    const pod = result.failureEvidence.pods[0];
    assert.equal(pod.containerStatuses[0].state.waiting.reason, 'ImagePullBackOff');
    assert.equal(pod.containerStatuses[0].lastState.terminated.exitCode, 137);
    assert.equal(pod.initContainerStatuses[0].state.terminated.exitCode, 1);
    assert.deepEqual(result.failureEvidence.readErrors, ['events:forbidden']);
    assert.equal(result.failureEvidence.logs.length, 3);
    assert.match(result.failureEvidence.logs[0].text, /connection refused/);
    assert.equal(result.failureEvidence.logs[2].previous, true);
    assert.equal(deleted, true);
    assert.doesNotMatch(JSON.stringify(result), /do-not-publish|password=(?!\[REDACTED\])/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('ordinary fixture provider result carries failure evidence without deployment outputs', async () => {
  const { provider } = await import('../../../skills/buster/plugins/kubernetes-fixture/src/provider.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-report-'));
  const file = path.join(root, 'manifest.json'); fs.writeFileSync(file, '{}');
  try {
    const evidence = { schemaVersion: 'kubernetes-fixture-failure.v1', pods: [], readErrors: ['pods:unavailable'] };
    const invocation: any = { runId: 'run', nodeId: 'fixture', attemptId: 'attempt', timeoutMs: 1000,
      workspace: { evidence: '.' }, limits: { artifactFiles: 2, artifactBytes: 1024 * 1024 },
      configuration: { values: { image: { reference: primary, digest: `sha256:${'a'.repeat(64)}` }, serviceName: 'app', servicePort: 8080 } },
      inputs: [{ name: 'checked-manifest', kind: 'artifact', artifact: { mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml',
        contentDigest: `sha256:${'b'.repeat(64)}`, sizeBytes: 2, storageUrl: new URL(`file://${file}`).href } }] };
    const context: any = { workspaceRoot: root,
      invoke: async () => ({ ok: false, errorCode: 'KUBERNETES_FIXTURE_READINESS_TIMEOUT', namespace: 'test-stack', failureEvidence: evidence }),
    };
    const result = await provider().execute(invocation, context);
    assert.equal(result.outcome, 'failed');
    assert.deepEqual(result.providerDetails.values.failureEvidence, evidence);
    assert.deepEqual(result.outputs, []);
    assert.match(result.summary, /READINESS_TIMEOUT.*test-stack/);
    assert.equal(result.providerDetails.values.failureArtifactError, null);
    assert.equal(result.evidenceFiles[0].type, 'log');
    const snapshot = path.join(root, result.evidenceFiles[0].file);
    assert.deepEqual(JSON.parse(fs.readFileSync(snapshot, 'utf8')), evidence);
    assert.equal(fs.statSync(snapshot).mode & 0o777, 0o600);
    const { stageEvidenceFiles, FileEvidenceStore } = await import('../../../skills/buster/engine/test-gates/artifacts.ts');
    const staged = path.join(root, 'staged');
    const use = await stageEvidenceFiles(root, staged, result.evidenceFiles, 2, 1024 * 1024);
    assert.equal(use.files, 1);
    const stored = await new FileEvidenceStore(path.join(root, 'store')).store('attempt', staged, result.evidenceFiles[0], 1024 * 1024);
    assert.equal(stored.artifact.contentDigest, `sha256:${crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex')}`);
    fs.rmSync(staged, { recursive: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(new URL(stored.artifact.storageUrl), 'utf8')), evidence);
    const repeated = await provider().execute(invocation, context);
    assert.equal(repeated.outcome, 'failed');
    assert.equal(repeated.providerDetails.values.errorCode, 'KUBERNETES_FIXTURE_READINESS_TIMEOUT');
    assert.equal(repeated.providerDetails.values.failureArtifactError, 'already-exists');
    assert.deepEqual(repeated.evidenceFiles, []);
    const limited = await provider().execute({ ...invocation, limits: { artifactFiles: 0, artifactBytes: 0 } }, context);
    assert.equal(limited.providerDetails.values.failureArtifactError, 'budget-exceeded');
    assert.deepEqual(limited.providerDetails.values.failureEvidence, evidence);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-outside-'));
    try {
      fs.symlinkSync(outside, path.join(root, 'escape'));
      const denied = await provider().execute({ ...invocation, workspace: { evidence: 'escape' } }, context);
      assert.equal(denied.providerDetails.values.failureArtifactError, 'path-denied');
      assert.deepEqual(fs.readdirSync(outside), []);
      const missing = await provider().execute({ ...invocation, workspace: { evidence: 'missing' } }, context);
      assert.equal(missing.providerDetails.values.failureArtifactError, 'write-failed');
      assert.equal(missing.outcome, 'failed');
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
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
  assert.equal(reads, 4);
  assert.equal(bounded.pods.length, 16);
  assert.equal(bounded.events.length, 32);
  assert.equal(bounded.truncated, true);
});

test('diagnostic read failures retain actionable categories without leaking stderr', async () => {
  const { collectFixtureFailureEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  for (const [failure, reason] of [
    [new Error('Forbidden password=private'), 'forbidden'],
    [new Error('Unauthorized token=private'), 'unauthorized'],
    [new Error('NotFound private'), 'not-found'],
    [Object.assign(new Error('private'), { code: 'ETIMEDOUT' }), 'timeout'],
    [Object.assign(new Error('private'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }), 'output-limit'],
    [new SyntaxError('private'), 'invalid-json'],
  ] as const) {
    const evidence = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async () => {
      throw new Error('KUBERNETES_FIXTURE_KUBECTL_FAILED', { cause: failure });
    });
    assert.deepEqual(evidence.readErrors, [`pods:${reason}`, `events:${reason}`, `persistentvolumeclaims:${reason}`, `namespace:${reason}`]);
    assert.doesNotMatch(JSON.stringify(evidence), /private|password=|token=/u);
  }
  const malformed = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async () => '{}');
  assert.deepEqual(malformed.readErrors, ['pods:invalid-json', 'events:invalid-json', 'persistentvolumeclaims:invalid-json']);
  const timedOut = await collectFixtureFailureEvidence('test-stack', AbortSignal.abort(new DOMException('private', 'TimeoutError')), async () => { throw new Error('not reached'); });
  assert.deepEqual(timedOut.readErrors, ['pods:timeout']);
});

test('diagnostics preserve probe/scheduling errors and bounded redacted current/previous logs', async () => {
  const { collectFixtureFailureEvidence, fixtureDiagnosticText } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  const requests: string[][] = [];
  const evidence = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    requests.push([...args]);
    if (args[0] === 'logs') {
      if (args.includes('--previous=true')) throw new Error('Forbidden private-stderr');
      return 'x'.repeat(4090) + '\nconnection refused token=abc https://user:pass@host literal-value';
    }
    if (args[1] === 'namespace') return JSON.stringify({ metadata: { name: 'test-stack', uid: 'ns-uid' } });
    if (args[1] === 'events') return JSON.stringify({ items: [{ reason: 'Unhealthy', message: 'Readiness probe failed: dial tcp: connection refused' }] });
    return JSON.stringify({ items: [{ metadata: { name: 'app' }, spec: { containers: [{ env: [{ value: 'literal-value' }] }] },
      status: { conditions: [{ reason: 'Unschedulable', message: '0/3 nodes available: insufficient memory' }],
        containerStatuses: [{ name: 'app', state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off restarting failed container' } }, lastState: { terminated: { exitCode: 1 } } }] } }] });
  });
  assert.match(String(evidence.events[0]?.message), /connection refused/);
  assert.match(JSON.stringify(evidence.pods), /insufficient memory/);
  assert.match(String(evidence.logs[0]?.text), /connection refused/);
  assert.ok(String(evidence.logs[0]?.text).length < 1100);
  assert.deepEqual(evidence.readErrors, ['logs/app/app/previous:forbidden']);
  assert.doesNotMatch(JSON.stringify(evidence), /abc|user:pass|literal-value|private-stderr/);
  assert.ok(requests.filter(args => args[0] === 'logs').every(args => args.includes('--limit-bytes=4096') && args.includes('--tail=40')));
  assert.doesNotMatch(fixtureDiagnosticText('Authorization: Bearer hidden\npassword="two words" api_key=hidden')!, /hidden|two words/);
});

test('credential redaction covers OAuth responses, prefixed keys and database URLs', async () => {
  const { fixtureDiagnosticText } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  assert.doesNotMatch(fixtureDiagnosticText('postgresql://user:private-password@db/main access_token=hidden', ['postgresql', 'token'])!, /private-password|hidden/);
  for (const input of ['{"access_token":"sensitive-value"}', 'refresh_token=sensitive-value', '{"Authorization":"Basic sensitive-value"}', '{"Cookie":"session=sensitive-value"}',
    'client_secret: sensitive-value', String.raw`{"password":"prefix\"sensitive-value"}`,  'DB_PASSWORD=sensitive-value', 'AWS_SECRET_ACCESS_KEY=sensitive-value',
    'postgresql://user:sensitive-value@db/main', 'redis://:sensitive-value@host', String.raw`\"access_token\":\"sensitive-value\"`]) {
    assert.doesNotMatch(fixtureDiagnosticText(input)!, /sensitive-value/);
  }
});

test('unresolved Secret sources explicitly withhold free-form diagnostics without hiding structural causes', async () => {
  const { collectFixtureFailureEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  const result = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    assert.notEqual(args[0], 'logs');
    if (args[1] === 'namespace') return '{}';
    if (args[1] === 'events') return JSON.stringify({ items: [{ reason: 'Unhealthy', message: 'secret-canary' }] });
    return JSON.stringify({ items: [{ metadata: { name: 'app' }, spec: { containers: [{ envFrom: [{ secretRef: { name: 'private' } }] }] },
      status: { containerStatuses: [{ name: 'app', state: { waiting: { reason: 'CrashLoopBackOff', message: 'secret-canary' } } }] } }] });
  });
  assert.equal(result.unresolvedPrivateSources, true);
  assert.match(JSON.stringify(result), /CrashLoopBackOff/);
  assert.doesNotMatch(JSON.stringify(result), /secret-canary/);
  assert.equal(result.logs[0]?.omitted, 'unresolved-private-sources');
});

test('private values remain redacted when serialized and events are withheld without Pod discovery', async () => {
  const { fixtureDiagnosticText, collectFixtureFailureEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  for (const secret of ['alpha\rbravo', 'alpha\r\nbravo']) assert.doesNotMatch(fixtureDiagnosticText('CONFIG=' + secret, [secret])!, /alpha|bravo/);
  const secret = 'alpha\nbravo';
  assert.doesNotMatch(fixtureDiagnosticText('2026-10-23T00:00:00Z bravo', [secret])!, /bravo/);
  for (const encoded of [JSON.stringify(secret), encodeURIComponent(secret), Buffer.from(secret).toString('base64')]) {
    const output = fixtureDiagnosticText('CONFIG=' + encoded, [secret]);
    assert.doesNotMatch(output!, /alpha|bravo|YWxwaGE/);
  }
  const result = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    if (args[1] === 'pods') throw new Error('Forbidden');
    if (args[1] === 'events') return JSON.stringify({ items: [{ reason: 'Unhealthy', message: 'unlabelled-private-value' }] });
    return '{}';
  });
  assert.equal(result.unresolvedPrivateSources, true);
  assert.doesNotMatch(JSON.stringify(result), /unlabelled-private-value/);
  assert.match(JSON.stringify(result), /Unhealthy/);
});

test('diagnostic log requests and total UTF-8 evidence remain bounded', async () => {
  const { collectFixtureFailureEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  let reads = 0;
  const result = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    if (args[0] === 'logs') { reads++; return 'x'.repeat(4096); }
    if (args[1] === 'namespace') return '{}';
    if (args[1] === 'events') return JSON.stringify({ items: [] });
    return JSON.stringify({ items: Array.from({ length: 16 }, (_, index) => ({ metadata: { name: 'pod-' + index },
      status: { containerStatuses: Array.from({ length: 16 }, (_, i) => ({ name: 'app-' + i,
        state: { waiting: { reason: 'CrashLoopBackOff', message: '語'.repeat(2000) } },
        lastState: { terminated: { exitCode: 1, message: '語'.repeat(2000) } } })) } })) });
  });
  assert.equal(reads, 8);
  assert.equal(result.logReadLimitReached, true);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 96 * 1024);
  assert.ok(result.logs.every(log => log.text === ''));
});

test('replacement retries only bounded explicit conflicts and revalidates ownership', async () => {
  for (const mode of ['recover', 'changed', 'persistent', 'forbidden', 'cancelled']) {
    let patches = 0; let reads = 0; let request: any;
    const versions: string[] = [];
    const abort = new AbortController();
    const { invoker, root } = setup(async (_: string, args: string[]) => {
      if (args[0] === 'auth') return { stdout: 'yes' };
      if (args[0] === 'patch') {
        patches++;
        const patch = JSON.parse(args[args.indexOf('-p') + 1]!);
        versions.push(patch.metadata.resourceVersion);
        request = JSON.parse(patch.metadata.annotations['kubeclaw.forgestack.ai/replace-pod']);
        if (mode === 'cancelled') abort.abort();
        if (mode === 'forbidden') throw new Error('Error from server (Forbidden): denied');
        if (patches === 1 || mode === 'persistent') throw new Error('Error from server (Conflict): object modified');
        return { stdout: '{}' };
      }
      if (args[1]?.startsWith('busternamespaceleases.')) {
        reads++;
        return { stdout: JSON.stringify({ metadata: { uid: mode === 'changed' && patches ? 'other' : 'lease', resourceVersion: String(reads) },
          spec: { fullStack: true, purpose: 'gate', namespaceName: 'test-stack', namespacePrefix: 'test', serviceName: 'app', servicePort: 8080 },
          status: { namespaceName: 'test-stack', phase: 'Ready', expiresAt: new Date(Date.now() + 60000).toISOString(),
            ...(patches >= 2 ? { podReplacement: { ...request, phase: 'DeletionRequested' } } : {}) } }) };
      }
      if (args[1] === 'pods') return { stdout: JSON.stringify({ items: [{ metadata: { name: 'app-0', uid: mode === 'recover' && patches >= 2 ? 'new-pod' : 'pod',
        ownerReferences: [{ controller: true, kind: 'ReplicaSet', uid: 'owner' }] },
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } }] }) };
      if (args[1] === 'service') return { stdout: JSON.stringify({ spec: { ports: [{ port: 8080 }] } }) };
      if (args[1] === 'endpoints') return { stdout: JSON.stringify({ subsets: [{ addresses: [{ ip: '10.0.0.2' }], ports: [{ port: 8080 }] }] }) };
      throw new Error(`Unexpected command ${args}`);
    });
    try {
      const invoke = () => invoker.invoke('kubernetes.fixture', { operation: 'replace-pod', resource: requestResource,
        payload: { leaseName: 'test-stack', leaseUID: 'lease', namespace: 'test-stack', podName: 'app-0', podUID: 'pod', timeoutMs: 5000 } } as any, abort.signal);
      if (mode === 'recover') {
        assert.equal((await invoke()).ok, true);
        assert.equal(patches, 2); assert.deepEqual(versions, ['1', '2']);
      } else {
        await assert.rejects(invoke, mode === 'changed' ? /LEASE_DENIED/ : mode === 'cancelled' ? /CANCELLED/ : mode === 'forbidden' ? /Forbidden/ : /Conflict/);
        assert.equal(patches, mode === 'persistent' ? 3 : 1);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});


test('prepare preserves replacement lease-change diagnostics before release without bypassing rejection', async () => {
  let patched = false, released = false, eventsRead = false;
  const { invoker, root, payload } = setup(async (_: string, args: string[]) => {
    if (args[0] === 'auth') return { stdout: 'yes' };
    if (args[0] === 'apply') return { stdout: '{}' };
    if (args[0] === 'patch') { patched = true; return { stdout: '{}' }; }
    if (args[0] === 'delete') { assert.ok(eventsRead); released = true; return { stdout: '{}' }; }
    assert.equal(released, false, 'Diagnostic reads must precede release');
    if (args[1]?.startsWith('busternamespacelease')) return { stdout: JSON.stringify({
      metadata: { uid: patched ? 'changed-lease' : 'lease', resourceVersion: '1' },
      spec: { fullStack: true, purpose: 'gate', namespaceName: 'test-stack', namespacePrefix: 'test', serviceName: 'app', servicePort: 8080 },
      status: { phase: 'Ready', namespaceName: 'test-stack', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+60000).toISOString() },
    }) };
    if (args[1] === 'events') { eventsRead = true; return { stdout: JSON.stringify({ items: [{ reason: 'Unhealthy', message: 'connection refused token=private-canary' }] }) }; }
    if (args[1] === 'namespace') return { stdout: JSON.stringify({ metadata: { uid: 'namespace-uid' } }) };
    if (args[0] === 'logs') return { stdout: 'connection refused password=private-canary' };
    if (args[1] === 'pods') return { stdout: JSON.stringify({ items: [{ metadata: { name: 'app-0', uid: 'pod', labels: { app: 'app' }, ownerReferences: [{ controller: true, kind: 'ReplicaSet', uid: 'owner' }] },
      status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }], containerStatuses: [{ name: 'app', restartCount: 1, state: { running: {} }, lastState: { terminated: { exitCode: 0, reason: 'Completed' } } }] } }] }) };
    if (args[1] === 'service') return { stdout: JSON.stringify({ spec: { ports: [{ port: 8080 }] } }) };
    if (args[1] === 'endpoints') return { stdout: JSON.stringify({ subsets: [{ addresses: [{ ip: '10.0.0.2' }], ports: [{ port: 8080 }] }] }) };
    throw new Error('Unexpected command '+args.join(' '));
  });
  try {
    const result: any = await invoker.invoke('kubernetes.fixture', { operation: 'prepare', resource: requestResource,
      payload: { ...payload, podReplacementSelectors: [{ app: 'app' }] } } as any, new AbortController().signal);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'KUBERNETES_FIXTURE_REPLACEMENT_LEASE_CHANGED');
    assert.equal(result.failureEvidence.namespaceIdentity.uid, 'namespace-uid');
    assert.equal(result.failureEvidence.pods[0].containerStatuses[0].lastState.terminated.exitCode, 0);
    assert.equal(result.failureEvidence.logs.some((log: any) => log.previous), true);
    assert.equal(released, true);
    assert.doesNotMatch(JSON.stringify(result), /private-canary/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readiness query timeout preserves diagnostics, but cancellation/denial/admission timeout still throw', async () => {
  for (const mode of ['pods', 'service', 'endpoints', 'cancelled', 'forbidden', 'apply']) {
    let injected = false, released = false, eventsRead = false;
    const abort = new AbortController();
    const { invoker, root, payload } = setup(async (_: string, args: string[]) => {
      if (args[0] === 'auth') return { stdout: 'yes' };
      if (args[0] === 'delete') { if (mode !== 'cancelled') assert.ok(eventsRead); released = true; return { stdout: '{}' }; }
      assert.equal(released, false);
      const target = ['service', 'endpoints'].includes(mode) ? mode : 'pods';
      if (!injected && ((mode === 'apply' && args[0] === 'apply' && args.includes('--namespace')) ||
          (mode !== 'apply' && args[0] === 'get' && args[1] === target))) {
        injected = true;
        if (mode === 'cancelled') abort.abort();
        throw new Error(mode === 'forbidden' ? 'Forbidden password=private-canary' : 'KUBERNETES_FIXTURE_KUBECTL_TIMEOUT');
      }
      if (args[0] === 'apply') return { stdout: '{}' };
      if (args[1]?.startsWith('busternamespacelease')) return { stdout: JSON.stringify({ status: {
        phase: 'Ready', namespaceName: 'test-stack', createdAt: new Date().toISOString(),
      } }) };
      if (args[1] === 'events') { eventsRead = true; return { stdout: JSON.stringify({ items: [{ reason: 'Unhealthy', message: 'Readiness probe failed: HTTP503 password=private-canary' }] }) }; }
      if (args[1] === 'namespace') return { stdout: JSON.stringify({ metadata: { uid: 'ns-uid' } }) };
      if (args[1] === 'service') return { stdout: JSON.stringify({ spec: { ports: [{ port: 8080 }] } }) };
      if (args[1] === 'endpoints') return { stdout: JSON.stringify({ subsets: [] }) };
      if (args[0] === 'logs') return { stdout: 'diagnostic token=private-canary' };
      return { stdout: JSON.stringify({ items: [{ metadata: { name: 'app' }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } }] }) };
    });
    try {
      const invoke = () => invoker.invoke('kubernetes.fixture', { operation: 'prepare', resource: requestResource, payload } as any, abort.signal);
      if (['cancelled', 'forbidden', 'apply'].includes(mode)) {
        await assert.rejects(invoke, mode === 'cancelled' ? /CANCELLED/ : mode === 'forbidden' ? /Forbidden/ : /KUBECTL_TIMEOUT/);
      } else {
        const result: any = await invoke();
        assert.equal(result.ok, false);
        assert.equal(result.errorCode, 'KUBERNETES_FIXTURE_READINESS_QUERY_TIMEOUT');
        assert.equal(result.failureEvidence.namespaceIdentity.uid, 'ns-uid');
        assert.equal(result.failureEvidence.events[0].reason, 'Unhealthy');
        assert.equal(released, true);
        assert.doesNotMatch(JSON.stringify(result), /private-canary/);
      }
      assert.equal(injected, true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('removed bootstrap payload is rejected before execution', async () => {
 const {invoker,root,payload}=setup(async ()=>{throw new Error('unexpected execution');});
 try {
  for (const obsolete of [{profile:'familyclaw.v1',release:'familyclaw'},null,{}]) {
   await assert.rejects(()=>invoker.invoke('kubernetes.fixture',{operation:'prepare',resource:requestResource,payload:{...payload,familyclawBootstrap:obsolete}} as any,new AbortController().signal),/KUBERNETES_FIXTURE_BOOTSTRAP_REMOVED/);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});


test('PVC diagnostics retain only bounded structural status and classify denied reads', async () => {
  const { collectFixtureFailureEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  const result = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    if (args[1] === 'namespace') return '{}';
    if (args[1] !== 'persistentvolumeclaims') return '{"items":[]}';
    assert.deepEqual(args, ['get', 'persistentvolumeclaims', '-n', 'test-stack', '-o', 'json']);
    return JSON.stringify({ items: Array.from({ length: 20 }, () => ({ metadata: { name: 'data', annotations: { private: 'canary' } },
      spec: { volumeName: 'private-volume-canary' }, status: { phase: 'Bound', conditions: [{ type: 'canary', status: 'True', message: 'canary', reason: 'canary' }] } })) });
  });
  assert.equal(result.persistentVolumeClaims.length, 16);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.persistentVolumeClaims[0], { name: 'data', namespace: null, phase: 'Bound', boundVolumePresent: true, conditions: [{ type: 'Other', status: 'True' }] });
  assert.doesNotMatch(JSON.stringify(result), /canary/);
  const denied = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    if (args[1] === 'persistentvolumeclaims') throw new Error('Forbidden private-canary');
    return args[1] === 'namespace' ? '{}' : '{"items":[]}';
  });
  assert.deepEqual(denied.readErrors, ['persistentvolumeclaims:forbidden']);
  assert.deepEqual(denied.persistentVolumeClaims, []);
});


test('scheduler categories survive private-text withholding without publishing arbitrary values', async () => {
  const { collectFixtureFailureEvidence, fixtureSchedulerCategories } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  assert.deepEqual(fixtureSchedulerCategories('FailedScheduling', 'Insufficient cpu, Insufficient memory, pod has unbound immediate PersistentVolumeClaims; private-canary'), ['insufficient-cpu', 'insufficient-memory', 'unbound-pvc']);
  assert.deepEqual(fixtureSchedulerCategories('Other', 'Insufficient cpu'), []);
  assert.deepEqual(fixtureSchedulerCategories('Unschedulable', 'private-canary'), ['unclassified']);
  assert.deepEqual(fixtureSchedulerCategories('FailedScheduling', "volume node affinity conflict; didn't match Pod's node affinity/selector; untolerated taint; Too many pods"), ['volume-node-affinity', 'node-affinity', 'untolerated-taint', 'pod-capacity']);
  const result = await collectFixtureFailureEvidence('fixture', new AbortController().signal, async args => JSON.stringify(args[1] === 'events'
    ? { items: [{ reason: 'FailedScheduling', message: 'Insufficient memory private-canary' }] }
    : { items: [] }));
  assert.equal(result.unresolvedPrivateSources, true);
  assert.deepEqual(result.events[0].schedulerCategories, ['insufficient-memory']);
  assert.equal(JSON.stringify(result).includes('private-canary'), false);
});


test('private init logs expose only fixed hints; app logs remain unread and canaries stay private', async () => {
  const { collectFixtureFailureEvidence, fixtureInitLogCategories } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  const canary = 'opaque-private-canary-path-and-token';
  const calls: string[][] = [];
  const result = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    calls.push([...args]);
    if (args[0] === 'logs') return `2026-10-26T00:00:00Z cp: ${canary}: Permission denied\n${canary}`;
    return JSON.stringify({ items: args[1] === 'pods' ? [{ metadata: { name: 'app' },
      spec: { containers: [{ envFrom: [{ secretRef: { name: 'private' } }] }] },
      status: { initContainerStatuses: [{ name: 'seed', lastState: { terminated: { exitCode: 1 } } }],
        containerStatuses: [{ name: 'app' }] } }] : [] });
  });
  assert.equal(result.unresolvedPrivateSources, true);
  assert.equal(calls.filter(args => args[0] === 'logs').length, 2);
  assert.ok(calls.filter(args => args[0] === 'logs').every(args => args[args.indexOf('-c') + 1] === 'seed'));
  assert.deepEqual(result.logs[0]?.categories, ['permission-denied']);
  assert.deepEqual(result.logs[1]?.categories, ['permission-denied']);
  assert.ok(result.logs.every(log => log.text === null));
  assert.ok(!JSON.stringify(result).includes(canary));
  assert.deepEqual(fixtureInitLogCategories(canary), ['unclassified']);
  assert.deepEqual(fixtureInitLogCategories('x'.repeat(4096) + 'Permission denied'), ['unclassified']);
  assert.deepEqual(fixtureInitLogCategories('Read-only file system; No space left on device; No such file or directory; Operation not permitted'),
    ['read-only-filesystem', 'no-space', 'missing-path', 'operation-not-permitted']);
});

test('private init diagnostic failures stay bounded and never export subprocess secrets', async () => {
  const { collectFixtureFailureEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  const canary = 'private-error-canary';
  let reads = 0;
  const result = await collectFixtureFailureEvidence('test-stack', new AbortController().signal, async args => {
    if (args[0] === 'logs') {
      reads++;
      assert.ok(args.includes('--limit-bytes=4096'));
      throw new Error(`Forbidden ${canary}`, { cause: new Error(canary) });
    }
    return JSON.stringify({ items: args[1] === 'pods' ? [{ metadata: { name: 'app' },
      spec: { containers: [{ envFrom: [{ secretRef: { name: 'private' } }] }] },
      status: { initContainerStatuses: Array.from({ length: 12 }, (_, i) => ({ name: `seed-${i}`,
        lastState: { terminated: { exitCode: 1 } } })) } }] : [] });
  });
  assert.equal(reads, 8);
  assert.equal(result.readErrors.filter(value => value.startsWith('logs/')).length, 8);
  assert.ok(result.readErrors.filter(value => value.startsWith('logs/')).every(value => value.endsWith(':forbidden')));
  assert.equal(JSON.stringify(result).includes(canary), false);
});


test('admitted resource projection is bounded and excludes arbitrary spec and resource values', async () => {
  const { fixturePodEvidence } = await import('../../../skills/buster/engine/test-gates/kubernetes-fixture-diagnostics.ts');
  const result = fixturePodEvidence({ spec: { nodeName: 'node-1', overhead: { cpu: '10m' },
    containers: [{ name: 'app', env: [{ value: 'private-canary' }], resources: {
      requests: { cpu: '250m', memory: '1Gi', 'private-canary': 'private-canary' }, limits: { cpu: 'private-canary', memory: '2Gi' } } }],
    initContainers: Array.from({ length: 17 }, () => ({ name: 'seed', restartPolicy: 'Always', resources: { requests: { cpu: 1 } } })) } });
  const projection = result.resources as any;
  assert.equal(projection.nodeName, 'node-1');
  assert.deepEqual(projection.containers[0].requests, { cpu: '250m', memory: '1Gi' });
  assert.deepEqual(projection.containers[0].limits, { cpu: null, memory: '2Gi' });
  assert.equal(projection.overhead.cpu, '10m');
  assert.equal(projection.initContainers[0].restartPolicy, 'Always');
  assert.equal(projection.initContainers.length, 16);
  assert.equal(projection.truncated, true);
  assert.equal(JSON.stringify(result).includes('private-canary'), false);
});
