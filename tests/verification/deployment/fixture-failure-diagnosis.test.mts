import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { KubernetesFixtureCapabilityInvoker, parseFixtureFailureDiagnosis, type FixtureFailureDiagnosisOptions } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts';
import { resolveExecutable } from '../contracts/support/resolve-executable.mts';

const image = `registry.local/app@sha256:${'a'.repeat(64)}`;
const diagnosis = { status: 'diagnosed', component: 'postgresql', errorMessage: 'TLS key permissions are invalid.',
  cause: 'Secret volume file mode is incorrect.', evidence: ['container/postgres: TLS permission failure'],
  nextStep: 'Correct the projected file mode.' };
function setup(options: { diagnosis?: FixtureFailureDiagnosisOptions; pass?: boolean; cancelOnPods?: AbortController }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-diagnosis-'));
  const events: string[] = [];
  let firstPod = true;
  const manifest = { apiVersion: 'v1', kind: 'List', items: [
    { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'app' }, spec: {
      selector: { matchLabels: { app: 'app' } }, template: { metadata: { labels: { app: 'app' } }, spec: {
        automountServiceAccountToken: false, securityContext: { runAsNonRoot: true, seccompProfile: { type: 'RuntimeDefault' } },
        containers: [{ name: 'app', image, securityContext: { runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] } } }] } } } },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'app' }, spec: { selector: { app: 'app' }, ports: [{ port: 8080 }] } },
    { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: { name: 'deny' }, spec: { podSelector: {}, policyTypes: ['Ingress', 'Egress'] } },
  ] };
  const bytes = JSON.stringify(manifest), manifestPath = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestPath, bytes);
  const invoker = new KubernetesFixtureCapabilityInvoker({ workspaceRoot: root, kubectlExecutable: resolveExecutable('kubectl'),
    controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
    allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: ['registry.local/app'], allowedSecretReferences: [],
    allowedStorageClasses: [], allowDefaultStorageClass: false, maximumPersistentVolumeClaimBytes: 1024 ** 3,
    maximumPersistentVolumeTotalBytes: 2 * 1024 ** 3, maximumManifestBytes: 1024 ** 2, maximumResources: 64,
    maximumRetentionSeconds: 3600, maximumExecutionMs: 1000, pollIntervalMs: 50, failureDiagnosis: options.diagnosis,
    execute: async (_command, args) => {
      if (args[0] === 'auth') return { stdout: 'yes' };
      if (args[0] === 'apply') return { stdout: '{}' };
      if (args[0] === 'delete') { events.push('cleanup'); return { stdout: '{}' }; }
      if (args[1]?.startsWith('busternamespacelease')) return { stdout: JSON.stringify({ status: {
        phase: 'Ready', namespaceName: 'test-diagnosis', createdAt: new Date().toISOString() } }) };
      if (args[1] === 'pods' && firstPod) {
        firstPod = false;
        if (options.cancelOnPods) options.cancelOnPods.abort();
        if (!options.pass) throw new Error('KUBERNETES_FIXTURE_KUBECTL_TIMEOUT');
      }
      events.push(`read:${args[1]}`);
      if (args[1] === 'namespace') return { stdout: JSON.stringify({ metadata: { uid: 'namespace-uid' } }) };
      if (args[1] === 'service') return { stdout: JSON.stringify({ spec: { ports: [{ port: 8080 }] } }) };
      if (args[1] === 'endpoints') return { stdout: JSON.stringify({ subsets: [{ addresses: [{ ip: '10.0.0.2' }], ports: [{ port: 8080 }] }] }) };
      if (args[1] === 'pods') return { stdout: JSON.stringify({ items: options.pass ? [{ metadata: { name: 'app' }, status: {
        phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } }] : [] }) };
      return { stdout: JSON.stringify({ items: [] }) };
    },
  });
  const payload = { leaseName: 'test-diagnosis', namespaceName: 'test-diagnosis', namespacePrefix: 'test', project: 'diagnosis',
    fullStack: true, verifiedImages: [image], immutableImage: image, imageDigest: `sha256:${'a'.repeat(64)}`, manifestPath,
    manifestDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, serviceName: 'app', servicePort: 8080,
    retentionSeconds: 300, retentionMode: 'delete', readinessTimeoutMs: 1000 };
  return { root, events, invoke: (signal = new AbortController().signal, override = {}) => invoker.invoke('kubernetes.fixture', {
    operation: 'prepare', resource: { type: 'kubernetes.fixture', canonicalId: 'kubernetes-fixture:attempt:diagnosis' }, payload: { ...payload, ...override },
  }, signal) };
}

test('failed preparation awaits bounded diagnosis before release, preserving native failure and safe evidence', async () => {
  let fixture: ReturnType<typeof setup>;
  fixture = setup({ diagnosis: { timeoutMs: 100, diagnose: async input => {
    assert.equal(input.namespace, 'test-diagnosis'); assert.equal(input.leaseName, 'test-diagnosis');
    assert.equal(input.errorCode, 'KUBERNETES_FIXTURE_READINESS_QUERY_TIMEOUT');
    assert.ok(input.failureEvidence); assert.equal(input.signal.aborted, false);
    assert.ok(!fixture.events.includes('cleanup')); fixture.events.push('diagnosis'); return diagnosis;
  } } });
  try {
    const result: any = await fixture.invoke();
    assert.equal(result.ok, false); assert.equal(result.errorCode, 'KUBERNETES_FIXTURE_READINESS_QUERY_TIMEOUT');
    assert.deepEqual(result.failureEvidence.diagnosis, diagnosis);
    assert.ok(fixture.events.indexOf('diagnosis') < fixture.events.indexOf('cleanup'));
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('throw, malformed output and ignored timeout cannot mask native failure or prevent cleanup', async () => {
  for (const kind of ['throw', 'malformed', 'timeout']) {
    let diagnosticSignal: AbortSignal | undefined;
    const fixture = setup({ diagnosis: { timeoutMs: 20, cancellationGraceMs: 5, diagnose: async input => {
      diagnosticSignal = input.signal;
      if (kind === 'throw') throw new Error('private-secret-canary');
      if (kind === 'malformed') return { ...diagnosis, rawLogs: 'private-secret-canary' };
      return new Promise(() => {});
    } } });
    try {
      const result: any = await fixture.invoke();
      assert.equal(result.ok, false); assert.equal(result.errorCode, 'KUBERNETES_FIXTURE_READINESS_QUERY_TIMEOUT');
      assert.equal(result.failureEvidence.diagnosis.status, 'unavailable');
      assert.ok(fixture.events.includes('cleanup')); assert.doesNotMatch(JSON.stringify(result), /private-secret-canary|rawLogs/);
      if (kind === 'timeout') assert.equal(diagnosticSignal?.aborted, true);
    } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
  }
});

test('cancellation before or during diagnosis releases lease and preserves cancellation', async () => {
  for (const during of [false, true]) {
    const abort = new AbortController(); let calls = 0;
    const fixture = setup({ ...(during ? {} : { cancelOnPods: abort }), diagnosis: { timeoutMs: 100, cancellationGraceMs: 5, diagnose: async input => {
      calls++; abort.abort(); assert.equal(input.signal.aborted, true); return new Promise(() => {});
    } } });
    try {
      await assert.rejects(() => fixture.invoke(abort.signal));
      assert.equal(calls, during ? 1 : 0); assert.ok(fixture.events.includes('cleanup'));
    } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
  }
});

test('successful preparation and validation failures do not dispatch diagnosis', async () => {
  let calls = 0;
  const fixture = setup({ pass: true, diagnosis: { timeoutMs: 100, diagnose: async () => { calls++; return diagnosis; } } });
  try {
    assert.equal((await fixture.invoke()).ok, true);
    await assert.rejects(() => fixture.invoke(undefined, { namespacePrefix: 'denied' }));
    assert.equal(calls, 0);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('diagnosis protocol rejects unbounded, extra or contradictory output', () => {
  assert.deepEqual(parseFixtureFailureDiagnosis(diagnosis), diagnosis);
  for (const candidate of [{ ...diagnosis, cause: null }, { ...diagnosis, evidence: Array(17).fill('x') },
    { ...diagnosis, status: 'passed' }, { ...diagnosis, errorMessage: 'x'.repeat(4097) },
    { ...diagnosis, secret: 'private' }]) assert.throws(() => parseFixtureFailureDiagnosis(candidate));
});


test('timeout waits for abort-aware transport settlement before deleting namespace', async () => {
  let fixture: ReturnType<typeof setup>;
  fixture = setup({ diagnosis: { timeoutMs: 10, cancellationGraceMs: 100, diagnose: async input => {
    await new Promise<void>(resolve => input.signal.addEventListener('abort', () => {
      setTimeout(() => { fixture.events.push('transport-settled'); resolve(); }, 20);
    }, { once: true }));
    throw new Error('cancelled without publishing private transport detail');
  } } });
  try {
    const result: any = await fixture.invoke();
    assert.equal(result.failureEvidence.diagnosis.status, 'unavailable');
    assert.ok(fixture.events.indexOf('transport-settled') >= 0);
    assert.ok(fixture.events.indexOf('transport-settled') < fixture.events.indexOf('cleanup'));
    assert.doesNotMatch(JSON.stringify(result), /private transport detail/);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test('uncooperative diagnostic callback cannot block lease release and reports unconfirmed termination', async () => {
  const fixture = setup({ diagnosis: { timeoutMs: 10, cancellationGraceMs: 10,
    diagnose: async () => new Promise(() => {}) } });
  try {
    const result: any = await fixture.invoke();
    assert.equal(result.ok, false); assert.ok(fixture.events.includes('cleanup'));
    assert.match(result.failureEvidence.diagnosis.nextStep, /termination is unconfirmed/);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});
