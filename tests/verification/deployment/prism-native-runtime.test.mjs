import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { load, loadAll } from 'js-yaml';
import { renderNativeWorkerNode } from '../../../scripts/render-native-worker-node.mjs';
import { nativePrismDeploymentSelection } from '../../../scripts/native-worker-deployment-preflight.mjs';

const selected = { ...load(fs.readFileSync('my-values/infra/native-worker-pools.yaml', 'utf8')),
  nodeName: 'native-render-test', runtime: { containerdVersion: 'v2.2.0-k3s1' } };

test('actual Prism Helm render binds V3 producer, supervisor, NRI selection and only its role mounts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-native-render-'));
  try {
    const bundle = renderNativeWorkerNode(selected);
    const file = path.join(directory, 'native.yaml'); fs.writeFileSync(file, bundle['prism-native-values.yaml']);
    const args = ['template', 'native-review', 'charts/prism', '-f', 'charts/prism/ci-values.yaml',
      '-f', file, '--namespace', 'kubeclaw', '--set', 'workerTrust.spiffe.enabled=true'];
    const docs = loadAll(execFileSync('helm', args, { encoding: 'utf8' }));
    assert.equal(nativePrismDeploymentSelection(docs, 'kubeclaw', selected), true);
    assert.throws(() => nativePrismDeploymentSelection(docs, 'other', selected), /POLICY_MISMATCH/);
    assert.throws(() => nativePrismDeploymentSelection(docs, 'kubeclaw', { ...selected, nodeName: 'other-node' }), /POLICY_MISMATCH/);
    const deployment = name => docs.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === `prism-${name}`);
    const worker = deployment('worker'); const control = deployment('control');
    const spec = worker.spec.template.spec; const supervisor = spec.containers.find(container => container.name === 'worker');
    const nri = JSON.parse(bundle['native-nri.json']);
    assert.equal(nri.roles.prism.policyDigest, worker.spec.template.metadata.annotations['kubeclaw.dev/native-worker-policy']);
    assert.equal(nri.roles.prism.container, supervisor.name); assert.equal(nri.roles.prism.namespace, 'kubeclaw');
    assert.equal(worker.spec.template.metadata.annotations['kubeclaw.dev/native-worker-role'], 'prism');
    assert.equal(worker.spec.strategy.type, 'Recreate'); assert.equal(worker.spec.replicas, 1);
    assert.deepEqual(spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms,
      [{ matchFields: [{ key: 'metadata.name', operator: 'In', values: [selected.nodeName] }] }]);
    assert.deepEqual(supervisor.command, ['node', 'skills/prism/server/native-worker.ts']);
    assert.equal(spec.securityContext.runAsUser, 0); assert.equal(spec.securityContext.fsGroup, undefined);
    assert.deepEqual(supervisor.securityContext.capabilities, { drop: ['ALL'], add: ['SETUID', 'SETGID', 'KILL'] });
    assert.equal(supervisor.securityContext.allowPrivilegeEscalation, false);
    assert.equal(supervisor.securityContext.privileged, undefined); assert.equal(spec.hostPID, undefined); assert.equal(spec.hostNetwork, undefined);
    const pool = JSON.parse(bundle['prism-pool.json']);
    const hosts = spec.volumes.filter(volume => volume.hostPath);
    assert.deepEqual(hosts.map(volume => volume.hostPath.path).sort(),
      [pool.cgroupRoot, pool.ownershipRoot, '/etc/kubeclaw/prism-pool.json', pool.nodeIdentityFile, pool.runtimeIdentityFile].sort());
    for (const name of ['native-policy', 'native-node-identity', 'native-runtime-identity']) {
      assert.equal(supervisor.volumeMounts.find(mount => mount.name === name).readOnly, true);
    }
    const proxy = spec.containers.find(container => container.name === 'worker-trust-proxy');
    assert.equal(proxy.securityContext.runAsUser, 1000); assert.deepEqual(proxy.securityContext.capabilities, { drop: ['ALL'] });
    for (const [name, pod] of [['control', control], ['worker', worker]]) {
      const container = pod.spec.template.spec.containers.find(container => container.name === name);
      assert.equal(container.env.find(item => item.name === 'PRISM_WORKER_EXECUTION_MODE').value, 'native');
      assert.equal(container.env.find(item => item.name === 'PRISM_ENGINE_CONTENT_DIGEST').value, supervisor.image.split('@')[1]);
    }
    assert.equal(control.spec.template.spec.volumes.some(volume => volume.hostPath), false);
    assert.throws(() => execFileSync('helm', [...args, '--set', 'worker.replicas=2'], { stdio: 'pipe' }));
    assert.throws(() => execFileSync('helm', [...args, '--set', 'worker.native.namespace=other'], { stdio: 'pipe' }));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('original statically built NRI executable reads the actual generated root-owned policy', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-nri-binary-'));
  try {
    const binary = path.join(directory, '10-kubeclaw-native');
    execFileSync(process.execPath, ['scripts/build-native-worker-nri.mjs', binary], { stdio: 'pipe' });
    const policy = path.join(directory, 'native-nri.json');
    fs.writeFileSync(policy, renderNativeWorkerNode(selected)['native-nri.json'], { mode: 0o600 });
    assert.equal(execFileSync(binary, ['--check-policy', policy], { encoding: 'utf8' }).trim(), 'NATIVE_NRI_POLICY_VALID');
    fs.chmodSync(policy, 0o666);
    assert.throws(() => execFileSync(binary, ['--check-policy', policy], { stdio: 'pipe' }));
    assert.throws(() => execFileSync(process.execPath, ['scripts/build-native-worker-nri.mjs', binary], { stdio: 'pipe' }));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
