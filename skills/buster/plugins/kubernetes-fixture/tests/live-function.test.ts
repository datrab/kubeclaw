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
console.log(JSON.stringify({ ok: true, provider: 'kubernetes-fixture', deterministicIdentity: true, mocks: 0 }));
