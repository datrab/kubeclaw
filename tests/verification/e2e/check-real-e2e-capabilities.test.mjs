import { registryTestContract } from './registry-test-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProgress } from './real-run-workspace.mjs';

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

function generatedProbeProject(t) {
  const projects = fileURLToPath(new URL('../../../Projects/', import.meta.url));
  fs.mkdirSync(projects, { recursive: true });
  const root = fs.mkdtempSync(path.join(projects, 'capability-probe-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.basename(root);
  const swarm = path.join(root, 'src', '.swarm');
  fs.mkdirSync(swarm, { recursive: true });
  const originalRegistry = process.env.KUBECLAW_REGISTRY_CONFIG;
  process.env.KUBECLAW_REGISTRY_CONFIG = registryTestContract;
  const originalImage = process.env.REAL_E2E_DEPLOYMENT_IMAGE;
  // Original generator metadata only; this test does not pull or deploy the image.
  process.env.REAL_E2E_DEPLOYMENT_IMAGE = 'registry.example.test:5443/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';
  try {
    fs.writeFileSync(path.join(swarm, 'progress.json'), JSON.stringify(buildProgress({ projectName: project })));
  } finally {
    if (originalRegistry === undefined) delete process.env.KUBECLAW_REGISTRY_CONFIG;
    else process.env.KUBECLAW_REGISTRY_CONFIG = originalRegistry;
    if (originalImage === undefined) delete process.env.REAL_E2E_DEPLOYMENT_IMAGE;
    else process.env.REAL_E2E_DEPLOYMENT_IMAGE = originalImage;
  }
  return project;
}

test('configured Codex capability probe follows production smoke dispatch', (t) => {
  const target = resolveProductionCodexLaunchTarget({
    env: {
      REAL_E2E_CONFIG_PROBE_PROJECT: generatedProbeProject(t),
    },
  });
  assert.equal(target.runtime, 'subagent');
  assert.equal(target.agentId, 'main');
  assert.equal(target.model, 'openai/gpt-5.3-codex-spark');
});

test('configured capability probe rejects non-Spark model overrides', (t) => {
  const project = generatedProbeProject(t);
  assert.throws(() => resolveProductionCodexLaunchTarget({
    env: {
      REAL_E2E_CONFIG_PROBE_PROJECT: project,
      REAL_E2E_MODEL: 'openai/gpt-4.1',
    },
  }), /REAL_E2E_MODEL_MUST_BE_SPARK/);
});
