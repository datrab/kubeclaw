import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readReusedCapabilityProbeResult,
  tailscaleOperatorPodListArgs,
} from './check-real-e2e-capabilities.mjs';

test('Tailscale operator capability probe matches Helm pod label shape', () => {
  const args = tailscaleOperatorPodListArgs({ namespace: 'tailscale', selector: 'app=operator' });
  assert.deepEqual(args, [
    '-n',
    'tailscale',
    'get',
    'pods',
    '-l',
    'app=operator',
    '-o',
    'json',
  ]);
  assert.equal(args.includes('app.kubernetes.io/name=tailscale-operator'), false);
});

test('reused matrix capability probe preserves structured failures', () => {
  const probe = {
    ok: false,
    mode: 'full',
    checks: [{ code: 'tailscale_operator', ok: false }],
    failures: [{ reason: 'INFRA_MISSING_TAILSCALE_OPERATOR' }],
  };
  const reused = readReusedCapabilityProbeResult({
    REAL_E2E_MODE: 'full',
    REAL_E2E_CAPABILITY_PROBE_RESULT_JSON: JSON.stringify(probe),
  });
  assert.equal(reused.ok, false);
  assert.equal(reused.reused_from_matrix, true);
  assert.deepEqual(reused.failures, probe.failures);
});
