import assert from 'node:assert/strict';
import test from 'node:test';
import { readTestBundle, canonicalSwarmEntry } from '../../fixtures/config/swarm-bundle.mjs';
import { clusterCommand } from '../../fixtures/test-gate/cluster-command.mjs';
import { request } from '../../fixtures/test-gate/kubernetes-cleanup-fixture.mjs';
import { clusterRuntimeBinding, kubernetesFixtureOptions, tailscaleExposureOptions } from '../../../skills/buster/engine/test-gates/production-cluster-options.ts';
import { createBusterCapabilityRuntime } from '../../../skills/buster/engine/test-gates/capability-runtime.ts';
import { validateBusterClusterInvokerSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts';

function create(t, command, capability, timeout) {
  const settings = readTestBundle(canonicalSwarmEntry)['buster-engine'].settings;
  settings.clusterInvokers.shared.kubectlExecutable = command.binary;
  settings.clusterInvokers.kubernetesFixture.registryRepositoryPrefixes = ['app'];
  settings.clusterInvokers.kubernetesFixture.shortCommandTimeoutMs = timeout;
  settings.clusterInvokers.tailscaleExposure.shortCommandTimeoutMs = timeout;
  const policy = validateBusterClusterInvokerSettings(settings.clusterInvokers);
  const binding = clusterRuntimeBinding({ controllerNamespace: 'kubeclaw' }, policy);
  const runtime = createBusterCapabilityRuntime({ allowedCapabilities: new Set([capability]),
    ...kubernetesFixtureOptions(capability === 'kubernetes.fixture', policy, binding, 'https://registry.local'),
    ...tailscaleExposureOptions(capability === 'kubernetes.exposure', policy, binding) },
    { jobRoot: command.root, workspaceRoot: command.root }, settings.execution.processInput);
  t.after(() => runtime.shutdown()); return runtime;
}
for (const capability of ['kubernetes.fixture', 'kubernetes.exposure']) {
  for (const short of [600, 2000]) test(`${capability} actual auth process uses short deadline ${short}`, { timeout: 15000 }, async t => {
    // The first auth command has an observable actual start, then exits after the selected low deadline.
    // Subsequent deliberate RBAC denial terminates the positive control without mutating a cluster.
    const command = clusterCommand(t, "if(args[0]!=='auth')throw new Error('UNEXPECTED_NON_AUTH');setTimeout(()=>process.stdout.write('no'),1000);");
    const runtime = create(t, command, capability, short);
    const input = capability === 'kubernetes.fixture' ? request(command.root, 'delete') : {
      operation: 'prepare', resource: { type: capability, canonicalId: 'kubernetes-exposure:attempt:one' },
      payload: { leaseName: 'test-one', namespace: 'test-one', serviceName: 'app', servicePort: 80,
        expiresAt: '2099-01-01T00:00:00.000Z', path: '/', readinessTimeoutMs: 5000 } };
    await assert.rejects(runtime.invoker.invoke(capability, input, new AbortController().signal),
      short === 600 ? /TIMEOUT/ : /RBAC_DENIED/);
    assert.equal(command.calls().length, 1); assert.equal(command.calls()[0].args[0], 'auth');
    assert.equal(command.owned.length, 1); assert(command.owned.every(row => row.closed));
  });
}
