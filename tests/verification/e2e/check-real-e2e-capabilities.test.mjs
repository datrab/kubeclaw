import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readReusedCapabilityProbeResult,
  resolveProductionCodexLaunchTarget,
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

test('configured Codex capability probe follows production smoke dispatch', () => {
  const target = resolveProductionCodexLaunchTarget({
    env: {
      REAL_E2E_CONFIG_PROBE_PROJECT: 'pipeline-smoke-landing',
    },
  });
  assert.equal(target.runtime, 'subagent');
  assert.equal(target.agentId, 'main');
  assert.equal(target.model, 'openai/gpt-5.3-codex-spark');
});

test('configured capability probe rejects non-Spark model overrides', () => {
  assert.throws(() => resolveProductionCodexLaunchTarget({
    env: {
      REAL_E2E_CONFIG_PROBE_PROJECT: 'pipeline-smoke-landing',
      REAL_E2E_MODEL: 'openai/gpt-4.1',
    },
  }), /REAL_E2E_MODEL_MUST_BE_SPARK/);
});
