import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { busterRuntimeSelection, canonicalPipelineEntry, readTestPipeline, writeTestPipeline } from '../../fixtures/config/pipeline-components.mjs';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { clusterRuntimeBinding, kubernetesFixtureOptions, tailscaleExposureOptions } from '../../../skills/buster/engine/test-gates/production-cluster-options.ts';
import { createBusterCapabilityRuntime } from '../../../skills/buster/engine/test-gates/capability-runtime.ts';
import { request } from '../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs';
import { ownedClusterTest } from '../../fixtures/test-gate/cluster-test-ownership.mjs';
import { clusterCommandApi, exposureRequest } from '../../fixtures/test-gate/cluster-command-api.mjs';

const cases = [
  ['kubernetes.fixture', 'namespace', /KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED/],
  ['kubernetes.fixture', 'registry', /KUBERNETES_FIXTURE_IMAGE_DENIED/],
  ['kubernetes.fixture', 'secret', /KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED/],
  ['kubernetes.fixture', 'storage', /KUBERNETES_FIXTURE_STORAGE_CLASS_DENIED/],
  ['kubernetes.fixture', 'manifest', /KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT/],
  ['kubernetes.exposure', 'namespace', /TAILSCALE_EXPOSURE_NAMESPACE_DENIED/],
  ['kubernetes.exposure', 'host', /TAILSCALE_EXPOSURE_HOST_DENIED/],
];
function alter(policy, capability, field, direct) {
  const selected = capability === 'kubernetes.fixture' ? policy.kubernetesFixture : policy.tailscaleExposure;
  if (field === 'namespace') selected.allowedNamespacePrefixes.splice(0, 1, 'changed');
  if (field === 'registry') (direct ? selected.allowedRegistryPrefixes : selected.registryRepositoryPrefixes).splice(0, 1, direct ? 'registry.local/changed' : 'changed');
  if (field === 'secret') selected.allowedSecretReferences.splice(0, 1, 'changed');
  if (field === 'storage') selected.allowedStorageClasses.splice(0, 1, 'changed');
  if (field === 'manifest') selected.manifest.maximumDepth = 1;
  if (field === 'host') selected.allowedHostSuffixes.splice(0, 1, '.changed.invalid');
}
function consumerOptions(settings, capability) {
  const policy = settings.clusterInvokers;
  const binding = clusterRuntimeBinding({ controllerNamespace: 'capture-control' }, policy);
  return { allowedCapabilities: new Set([capability]),
    ...kubernetesFixtureOptions(capability === 'kubernetes.fixture', policy, binding, 'https://registry.local'),
    ...tailscaleExposureOptions(capability === 'kubernetes.exposure', policy, binding) };
}
for (const mode of ['file', 'caller']) for (const [capability, field, expected] of cases) {
  test(`captured ${mode} ${capability} ${field} governs actual commands after mutation`, { timeout: 15000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-capture-'));
    return ownedClusterTest(t, root, async owner => {
    const api = clusterCommandApi(root);
    const documents = readTestPipeline(canonicalPipelineEntry);
    const authored = documents['buster-engine'].profiles.runtime.settings.clusterInvokers;
    authored.shared.kubectlExecutable = api.executable;
    authored.kubernetesFixture.registryRepositoryPrefixes = ['app'];
    authored.kubernetesFixture.allowedSecretReferences = ['source'];
    authored.kubernetesFixture.allowedStorageClasses = ['fast'];
    const entry = path.join(root, 'config/pipeline.config.json');
    writeTestPipeline(entry, documents);
    const snapshot = captureSwarmSettings(entry, busterRuntimeSelection(documents));
    // Mutable direct caller inputs are intentionally separate from loader-frozen inputs.
    const options = structuredClone(consumerOptions(snapshot.components['buster-engine'].settings, capability));
    const create = selected => {
      owner.signal.throwIfAborted();
      const runtime = createBusterCapabilityRuntime(selected, { jobRoot: root, workspaceRoot: root }, snapshot.components['buster-engine'].settings.execution.processInput);
      owner.runtime({ stop: () => runtime.shutdown() });
      return runtime;
    };
    const captured = create(options);
    const input = capability === 'kubernetes.fixture' ? request(root, 'delete') : exposureRequest;
    if (field === 'secret') input.payload.secretReferences = ['source'];
    if (field === 'storage') {
      fs.appendFileSync(input.payload.manifestPath, '\n---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data\nspec:\n  storageClassName: fast\n  accessModes: [ReadWriteOnce]\n  resources:\n    requests:\n      storage: 1Mi\n');
      input.payload.manifestDigest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(input.payload.manifestPath)).digest('hex')}`;
    }
    const invoke = instance => owner.invoke(signal => instance.invoker.invoke(capability, structuredClone(input), signal));
    assert.equal((await invoke(captured)).ok, true, 'unmodified positive control reaches successful real consumer');
    const before = api.calls().length;
    if (mode === 'file') {
      alter(authored, capability, field, false);
      // Rewrite the component bytes, not an in-memory projection or a symlink.
      fs.writeFileSync(path.join(root, 'config/components/buster-engine.config.json'), JSON.stringify(documents['buster-engine']));
    } else alter(options, capability, field, true);
    api.seed();
    assert.equal((await invoke(captured)).ok, true, 'already captured consumer keeps its original authorization/parser policy');
    assert(api.calls().length > before, 'post-mutation success must issue real commands');
    if (mode === 'file') {
      const sameSnapshot = create(consumerOptions(snapshot.components['buster-engine'].settings, capability));
      api.seed();
      assert.equal((await invoke(sameSnapshot)).ok, true, 'new consumer from the old snapshot still uses original file policy');
    }
    const freshOptions = mode === 'file'
      ? consumerOptions(captureSwarmSettings(entry, busterRuntimeSelection(documents)).components['buster-engine'].settings, capability) : options;
    const fresh = create(freshOptions);
    api.seed(); const prior = api.calls().length;
    await assert.rejects(invoke(fresh), expected, 'fresh capture must apply changed policy to the identical request');
    if (field !== 'host') assert.equal(api.calls().length, prior, 'changed input authorization/parser budget fails before commands');
    else assert(api.calls().length > prior, 'host denial must follow real returned preview URL');
    });
  });
}
