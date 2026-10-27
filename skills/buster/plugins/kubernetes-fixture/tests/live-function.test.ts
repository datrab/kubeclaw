import assert from 'node:assert/strict';
import { provider, testContract } from '../src/provider.js';

const instance = provider();
assert.equal(typeof instance.execute, 'function');
assert.equal(typeof instance.cleanup, 'function');
assert.equal(testContract.mediaType, 'application/vnd.kubeclaw.checked-kubernetes-yaml');
const invocation: any = { runId: 'run', nodeId: 'fixture', attemptId: 'attempt:1', configuration: { values: {
  image: { reference: `registry.local/app@sha256:${'a'.repeat(64)}`, digest: `sha256:${'a'.repeat(64)}` },
  serviceName: 'app', servicePort: 8080,
} } };
const linkedImageInvocation: any = { ...invocation, configuration: { values: { serviceName: 'app', servicePort: 8080 } },
  inputs: [{ name: 'image', kind: 'value', schemaId: 'kubeclaw.container-image@1', value: {
    reference: `registry.local/app@sha256:${'a'.repeat(64)}`, digest: `sha256:${'a'.repeat(64)}`,
  } }] };
assert.equal(testContract.configuration(linkedImageInvocation).immutableImage,
  `registry.local/app@sha256:${'a'.repeat(64)}`);
assert.throws(() => testContract.configuration({ ...linkedImageInvocation, configuration: invocation.configuration }),
  /KUBERNETES_FIXTURE_IMAGE_AMBIGUOUS/u);
assert.deepEqual(testContract.identity(invocation, 'test'), testContract.identity(invocation, 'test'));
const maximumPrefix = `a${'b'.repeat(41)}`;
assert.equal(testContract.identity(invocation, maximumPrefix).namespaceName.length, 63);
await assert.rejects(() => instance.execute({ ...invocation, configuration: { values: {
  ...invocation.configuration.values, namespacePrefix: `${maximumPrefix}c`,
} }, inputs: [] }, {} as any), /KUBERNETES_FIXTURE_NAMESPACE_PREFIX_INVALID/u);
await assert.rejects(() => instance.execute({ ...invocation, inputs: [] }, {} as any), /KUBERNETES_FIXTURE_INPUT_REQUIRED/u);
await assert.rejects(() => instance.cleanup({ ...invocation, inputs: [] }, {
  invoke: async () => ({ ok: false }),
} as any), /KUBERNETES_FIXTURE_RELEASE_FAILED/u);
await instance.cleanup({ ...invocation, inputs: [] }, { invoke: async () => ({ ok: true }) } as any);
console.log(JSON.stringify({ ok: true, provider: 'kubernetes-fixture', deterministicIdentity: true, mocks: 0 }));
const secondImage = `registry.local/database@sha256:${'b'.repeat(64)}`;
const stackValues = { ...invocation.configuration.values, fullStack: true,
  verifiedImages: [secondImage, invocation.configuration.values.image.reference] };
assert.deepEqual(testContract.configuration({ ...invocation, inputs: [], configuration: { values: stackValues } }).verifiedImages,
  [...stackValues.verifiedImages].sort());
for (const verifiedImages of [[], [secondImage], [stackValues.verifiedImages[1], 'registry.local/database:latest'],
  [stackValues.verifiedImages[1], stackValues.verifiedImages[1]]]) {
  assert.throws(() => testContract.configuration({ ...invocation, inputs: [], configuration: { values: { ...stackValues, verifiedImages } } }), /IMAGE_INVENTORY_INVALID/u);
}
assert.throws(() => testContract.configuration({ ...invocation, inputs: [], configuration: {
  values: { ...invocation.configuration.values, verifiedImages: stackValues.verifiedImages } } }), /FULL_STACK_REQUIRED/u);

// The normal native failure summary must carry diagnosis to Nova, not merely
// hide it in a side artifact while a subsequent Forge repair sees generic timeout.
{
  const fs = await import('node:fs'); const os = await import('node:os');
  const path = await import('node:path'); const { pathToFileURL } = await import('node:url');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-diagnosis-summary-'));
  try {
    fs.writeFileSync(path.join(root, 'manifest.yaml'), '{}'); fs.mkdirSync(path.join(root, 'evidence'));
    const diagnostic = { status: 'diagnosed', component: 'postgresql', errorMessage: 'TLS key has unsafe mode.',
      cause: 'Decimal/octal mismatch.', evidence: ['postgres FATAL'], nextStep: 'Use decimal288.' };
    const result = await instance.execute({ ...invocation, timeoutMs: 1000,
      limits: { artifactFiles: 1, artifactBytes: 131072 }, workspace: { evidence: 'evidence' },
      inputs: [{ name: 'checked-manifest', kind: 'artifact', artifact: {
        mediaType: testContract.mediaType, contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2,
        storageUrl: pathToFileURL(path.join(root, 'manifest.yaml')).href } }] }, {
      workspaceRoot: root, invoke: async () => ({ ok: false, errorCode: 'READINESS_TIMEOUT', namespace: 'test-namespace',
        failureEvidence: { diagnosis: diagnostic } }),
    } as any);
    assert.equal(result.outcome, 'failed'); assert.equal(result.counts.failed, 1);
    assert.match(result.summary, /postgresql.*TLS key has unsafe mode.*Decimal\/octal mismatch/);
    assert.deepEqual(result.providerDetails.values.failureEvidence.diagnosis, diagnostic);
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'evidence/kubernetes-fixture-failure.json'), 'utf8'));
    assert.deepEqual(saved.diagnosis, diagnostic);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
