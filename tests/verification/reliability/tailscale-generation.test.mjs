import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { TailscaleExposureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/tailscale-exposure-runtime.ts';
import { exposureAPI } from './tailscale-api-fixture.mjs';

test('actual kubectl binds Ready, replay and cleanup to durable exposure ownership', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tailscale-wire-')); const api = await exposureAPI(root);
  const priorConfig = process.env.KUBECONFIG; process.env.KUBECONFIG = api.config;
  try {
    const client = new TailscaleExposureCapabilityInvoker({ kubectlExecutable: execFileSync('which', ['kubectl'], { encoding: 'utf8' }).trim(),
      controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
      allowedNamespacePrefixes: ['test'], allowedHostSuffixes: ['.ts.net'], maximumExecutionMs: 10_000, pollIntervalMs: 10 });
    const request = attempt => ({ operation: 'prepare', resource: { type: 'kubernetes.exposure', canonicalId: `kubernetes-exposure:attempt:${attempt}` },
      payload: { leaseName: 'preview-one', namespace: 'test-one', serviceName: 'web', servicePort: 80,
        expiresAt: api.state.lease.status.expiresAt, path: '/current', readinessTimeoutMs: 5000 } });
    const invoke = value => client.invoke('kubernetes.exposure', value, new AbortController().signal);
    const first = request('one'); const result = await invoke(first);
    assert.equal(result.url, 'https://preview.ts.net/current', 'previous Ready URL never satisfies new generation');
    assert(api.state.staleReads >= 3); assert.match(result.releaseAction, /exposure-owner/);
    const owner = api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
    const patches = api.state.patches.length; const generation = api.state.lease.metadata.generation;
    assert.equal((await invoke(first)).url, result.url);
    assert.equal(api.state.patches.length, patches, 'same-attempt restart adopts the existing exposure');
    assert.equal(api.state.lease.metadata.generation, generation);
    await assert.rejects(invoke({ ...first, payload: { ...first.payload, path: '/changed' } }), /ATTEMPT_REQUEST_CHANGED/);
    await assert.rejects(invoke({ ...first, operation: 'release', payload: { ...first.payload, path: '/changed' } }), /ATTEMPT_REQUEST_CHANGED/);
    assert.equal(api.state.patches.length, patches);
    const second = request('two'); await invoke(second);
    assert.notEqual(api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'], owner);
    const beforeCleanup = api.state.patches.length;
    const oldCleanup = await invoke({ ...first, operation: 'release' });
    assert.equal(oldCleanup.superseded, true); assert.equal(api.state.patches.length, beforeCleanup);
    assert.equal(api.state.lease.spec.exposure.provider, 'tailscale-ingress');
    api.state.conflict = true;
    await assert.rejects(invoke({ ...second, operation: 'release' }), /409|Conflict|conflict|KUBECTL_FAILED/);
    assert.equal(api.state.lease.spec.exposure.provider, 'tailscale-ingress', 'failed CAS cannot disable exposure');
    assert.equal(api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'], 'concurrent-replacement');
    assert.equal((await invoke({ ...second, operation: 'release' })).superseded, true);
    const third = request('three'); await invoke(third);
    const released = await invoke({ ...third, operation: 'release' }); assert.equal(released.released, true);
    assert.equal(api.state.lease.status.exposureGeneration, api.state.lease.metadata.generation);
    assert.equal(api.state.lease.status.exposurePhase, 'Off');
    await invoke(request('four'));
    const previousOwner = api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
    api.state.autoObserve = false;
    const preparePatched = () => new Promise(resolve => {
      api.state.onPatch = patch => { if (patch.spec.purpose === 'final-preview') { api.state.onPatch = undefined; resolve(); } };
    });
    const fifthSignal = new AbortController(); const sixthSignal = new AbortController();
    let patched = preparePatched();
    const fifth = client.invoke('kubernetes.exposure', request('five'), fifthSignal.signal).then(() => null, error => error);
    await patched;
    const pendingOwner = api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'];
    patched = preparePatched();
    const sixth = client.invoke('kubernetes.exposure', request('six'), sixthSignal.signal).then(() => null, error => error);
    await patched;
    fifthSignal.abort(); sixthSignal.abort();
    assert.match(String(await fifth), /CANCELLED|LEASE_CHANGED/);
    assert.match(String(await sixth), /CANCELLED/);
    assert.equal(api.state.lease.spec.exposure.provider, 'off');
    assert.deepEqual(JSON.parse(api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-predecessors']), [previousOwner, pendingOwner],
      'aborted chained takeovers retain exact predecessor authority for controller cleanup');
    const patchCount = api.state.patches.length;
    api.state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-predecessors'] = 'null';
    await assert.rejects(invoke(request('seven')), /PREDECESSORS_INVALID/);
    assert.equal(api.state.patches.length, patchCount, 'corrupt lineage cannot authorize another mutation');
  } finally {
    if (priorConfig === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = priorConfig;
    await api.close(); fs.rmSync(root, { recursive: true, force: true });
  }
});
