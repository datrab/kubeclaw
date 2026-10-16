import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readTestPipeline, canonicalPipelineEntry, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { clusterRuntimeBinding, kubernetesFixtureOptions, tailscaleExposureOptions } from '../../../skills/buster/engine/test-gates/production-cluster-options.ts';
import { createBusterCapabilityRuntime } from '../../../skills/buster/engine/test-gates/capability-runtime.ts';
import { request, localApi } from '../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs';

for (const capability of ['kubernetes.fixture', 'kubernetes.exposure']) {
  for (const poll of [50, 200]) test(`actual ${capability} polling cadence ${poll}`, { timeout: 10000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-poll-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const settings = structuredClone(captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(readTestPipeline())).components['buster-engine'].settings);
    const policy = settings.clusterInvokers; policy.shared.kubectlExecutable = process.execPath;
    policy.kubernetesFixture.registryRepositoryPrefixes = ['app'];
    policy.kubernetesFixture.pollIntervalMs = poll; policy.tailscaleExposure.pollIntervalMs = poll;
    const binding = clusterRuntimeBinding({ controllerNamespace: 'kubeclaw' }, policy);
    const calls = []; const api = localApi();
    const expiry = '2099-01-01T00:00:00.000Z';
    const lease = { metadata: { name: 'test-one', resourceVersion: '1', generation: 1, annotations: {} },
      spec: { namespaceName: 'test-one', serviceName: 'app', servicePort: 80 },
      status: { phase: 'Ready', namespaceName: 'test-one', expiresAt: expiry, createdAt: '2026-09-21T00:00:00.000Z' } };
    let owner;
    const execute = async (command, args, options) => {
      if (capability === 'kubernetes.fixture') {
        if (args[0] === 'get' && args[1] === 'busternamespacelease') {
          calls.push(performance.now());
          if (calls.length < 3) return { stdout: JSON.stringify({ status: { phase: 'Pending' } }) };
        }
        return api.execute(command, args, options);
      }
      if (args[0] === 'auth') return { stdout: 'yes' };
      if (args[0] === 'patch') {
        const patch = JSON.parse(args[args.indexOf('-p') + 1]);
        if (Object.hasOwn(patch.metadata, 'annotations')) {
          Object.assign(lease.metadata.annotations, patch.metadata.annotations);
          owner = lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
        }
        Object.assign(lease.spec, patch.spec);
        lease.metadata.generation++;
        return { stdout: '{}' };
      }
      if (args[0] === 'get') {
        if (owner) {
          calls.push(performance.now());
          Object.assign(lease.status, { exposureOwner: owner, exposureGeneration: lease.metadata.generation,
            exposurePhase: calls.length < 3 ? 'Pending' : 'Ready', previewUrl: 'https://preview.ts.net/', exposureHostname: 'preview.ts.net' });
        }
        return { stdout: JSON.stringify(lease) };
      }
      throw new Error('UNEXPECTED_CLUSTER_COMMAND');
    };
    const options = capability === 'kubernetes.fixture' ? kubernetesFixtureOptions(true, policy, binding, 'https://registry.local')
      : tailscaleExposureOptions(true, policy, binding);
    if (options.kubernetesFixture) options.kubernetesFixture.execute = execute;
    if (options.tailscaleExposure) options.tailscaleExposure.execute = execute;
    const runtime = createBusterCapabilityRuntime({ allowedCapabilities: new Set([capability]), ...options },
      { jobRoot: root, workspaceRoot: root }, settings.execution.processInput);
    t.after(() => runtime.shutdown());
    const input = capability === 'kubernetes.fixture' ? request(root, 'delete') : {
      operation: 'prepare', resource: { type: capability, canonicalId: 'kubernetes-exposure:attempt:one' },
      payload: { leaseName: 'test-one', namespace: 'test-one', serviceName: 'app', servicePort: 80,
        expiresAt: expiry, path: '/', readinessTimeoutMs: 1500 } };
    assert.equal((await runtime.invoker.invoke(capability, input, new AbortController().signal)).ok, true);
    assert.equal(calls.length, 3); assert(calls[2] - calls[0] >= 2 * poll - 5);
    assert(calls[2] - calls[0] < 1000, 'restoring fixed 1000 ms cannot satisfy the authored cadence');
  });
}
