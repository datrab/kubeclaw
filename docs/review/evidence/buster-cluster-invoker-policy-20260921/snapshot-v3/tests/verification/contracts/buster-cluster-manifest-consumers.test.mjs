import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalSwarmEntry, readTestBundle } from '../../fixtures/config/swarm-bundle.mjs';
import { validateBusterClusterInvokerSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';
import { clusterRuntimeBinding, kubernetesFixtureOptions, tailscaleExposureOptions } from '../../../skills/buster/engine/test-gates/production-cluster-options.ts';
import { createBusterCapabilityRuntime } from '../../../skills/buster/engine/test-gates/capability-runtime.ts';
import { KubernetesFixtureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts';
import { TailscaleExposureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/tailscale-exposure-runtime.ts';
import { boundedManifestDocuments } from '../../../skills/buster/engine/test-gates/kubernetes-manifest.ts';
import { flattenDocuments } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-manifest-files.ts';
import { localApi, request } from '../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs';

function authored() { return structuredClone(readTestBundle(canonicalSwarmEntry)['buster-engine'].settings); }
function runtime(root, settings, execute) {
  const policy = validateBusterClusterInvokerSettings(settings.clusterInvokers);
  const binding = clusterRuntimeBinding({ controllerNamespace: 'kubeclaw' }, policy);
  const { kubernetesFixture } = kubernetesFixtureOptions(true, policy, binding, 'https://registry.local');
  return createBusterCapabilityRuntime({ allowedCapabilities: new Set(['kubernetes.fixture']),
    kubernetesFixture: { ...kubernetesFixture, execute } }, { jobRoot: root, workspaceRoot: root }, settings.execution.processInput);
}
for (const limit of [16, 80]) test(`actual kubectl diagnostic captures ${limit} code units`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-diagnostic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = authored(); settings.clusterInvokers.shared.kubectlExecutable = process.execPath;
  settings.clusterInvokers.kubernetesFixture.registryRepositoryPrefixes = ['app'];
  settings.clusterInvokers.kubernetesFixture.diagnosticCodeUnits = limit;
  const cause = Object.assign(new Error('actual injected CLI boundary'), { stderr: 'z'.repeat(200) });
  let calls = 0;
  const instance = runtime(root, settings, async () => { calls++; throw cause; });
  t.after(() => instance.shutdown());
  await assert.rejects(instance.invoker.invoke('kubernetes.fixture', request(root, 'delete'), new AbortController().signal), error => {
    assert.equal(error.message, 'KUBERNETES_FIXTURE_KUBECTL_FAILED:' + 'z'.repeat(limit));
    assert.equal(error.cause, cause); return true;
  });
  assert.equal(calls, 1, 'failure reaches real auth command before preparation mutation');
});
for (const field of ['maximumManifestBytes', 'maximumResources']) {
  for (const low of [true, false]) test(`public invoker ${field}, low ${low}`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-manifest-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const settings = authored(); settings.clusterInvokers.shared.kubectlExecutable = process.execPath;
    settings.clusterInvokers.kubernetesFixture.registryRepositoryPrefixes = ['app'];
    settings.clusterInvokers.kubernetesFixture[field] = low ? (field === 'maximumManifestBytes' ? 100 : 1)
      : (field === 'maximumManifestBytes' ? 1048576 : 64);
    const api = localApi(); const instance = runtime(root, settings, api.execute.bind(api));
    t.after(() => instance.shutdown());
    const result = instance.invoker.invoke('kubernetes.fixture', request(root, 'delete'), new AbortController().signal);
    if (low) { await assert.rejects(result, field === 'maximumManifestBytes' ? /MANIFEST_SIZE_INVALID/ : /RESOURCE_COUNT_INVALID/);
      assert.equal(api.calls.length, 0, 'input quota rejects before external command'); }
    else { assert.equal((await result).ok, true); assert(api.calls.some(call => call.args[0] === 'apply')); }
  });
}
for (const [field, text, expected] of [
  ['maximumNodes', 'root: {nested: {value: 1}}', /COMPLEXITY_LIMIT/],
  ['maximumDepth', 'root: {nested: {value: 1}}', /COMPLEXITY_LIMIT/],
  ['maximumAliases', 'first: &value {name: shared}\nsecond: *value\nthird: *value\n', /ALIAS_LIMIT/],
]) test(`actual YAML consumer ${field}`, () => {
  const policy = authored().clusterInvokers.kubernetesFixture.manifest;
  assert.equal(boundedManifestDocuments(Buffer.from(text), policy).length, 1);
  assert.throws(() => boundedManifestDocuments(Buffer.from(text), { ...policy, [field]: 1 }), expected);
});
for (const field of ['maximumFlattenVisits', 'maximumFlattenPending']) test(`actual List consumer ${field}`, () => {
  const documents = [{ kind: 'List', items: [{ kind: 'ConfigMap' }, { kind: 'Service' }] }];
  const policy = authored().clusterInvokers.kubernetesFixture.manifest;
  assert.equal(flattenDocuments(documents, 64, policy).length, 2);
  assert.throws(() => flattenDocuments(documents, 64, { ...policy, [field]: 1 }), /COMPLEXITY_LIMIT/);
});

for (const version of ['v1', 'v2', 'v1alpha1', 'v2beta12', 'v1alpha', 'v1beta', 'v1rc1', 'v1alpha1x', '']) {
  test(`shared lease version domain reaches both actual constructors: ${version}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-version-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const settings = authored(); settings.clusterInvokers.shared.kubectlExecutable = process.execPath;
    const validPolicy = validateBusterClusterInvokerSettings(settings.clusterInvokers);
    const binding = clusterRuntimeBinding({ controllerNamespace: 'kubeclaw' }, validPolicy);
    const kube = kubernetesFixtureOptions(true, validPolicy, binding, 'https://registry.local').kubernetesFixture;
    const tail = tailscaleExposureOptions(true, validPolicy, binding).tailscaleExposure;
    const kubeConstructor = () => new KubernetesFixtureCapabilityInvoker({ ...kube, workspaceRoot: root,
      leaseApiVersion: version, processInputPolicy: settings.execution.processInput });
    const tailConstructor = () => new TailscaleExposureCapabilityInvoker({ ...tail,
      leaseApiVersion: version, processInputPolicy: settings.execution.processInput });
    settings.clusterInvokers.shared.leaseApiVersion = version;
    if (['v1', 'v2', 'v1alpha1', 'v2beta12'].includes(version)) {
      assert.doesNotThrow(() => validateBusterClusterInvokerSettings(settings.clusterInvokers));
      assert.doesNotThrow(kubeConstructor); assert.doesNotThrow(tailConstructor);
    } else {
      assert.throws(() => validateBusterClusterInvokerSettings(settings.clusterInvokers), /SWARM_CONFIG/);
      assert.throws(kubeConstructor, { message: 'KUBERNETES_FIXTURE_API_VERSION_INVALID' });
      assert.throws(tailConstructor, { message: 'TAILSCALE_EXPOSURE_API_INVALID' });
    }
  });
}
