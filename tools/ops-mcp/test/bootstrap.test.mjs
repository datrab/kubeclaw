import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../../scripts/deploy-ops-mcp.sh', import.meta.url));
const env = { ...process.env, OPS_MCP_IMAGE: 'ghcr.io/datrab/kubeclaw-ops-mcp@sha256:' + 'a'.repeat(64) };
test('Ops rendering follows the operator namespace without broadening proxy identity', () => {
  const rendered = execFileSync('bash', [script, 'render'], { env: { ...env, TAILSCALE_OPERATOR_NAMESPACE: 'private-access' }, encoding: 'utf8' });
  assert.match(rendered, /(?:kubernetes.io\/metadata.name|k8s:io.kubernetes.pod.namespace): private-access/);
  assert.doesNotMatch(rendered, /(?:kubernetes.io\/metadata.name|k8s:io.kubernetes.pod.namespace): tailscale/);
  for (const identity of ['tailscale.com/managed: "true"', 'tailscale.com/parent-resource-type: ingress', 'tailscale.com/parent-resource: ops-mcp', 'tailscale.com/parent-resource-ns: kubeclaw']) assert.ok(rendered.includes(identity));
  assert.ok(rendered.includes(env.OPS_MCP_IMAGE));
});
test('invalid operator namespace is rejected before any deployment', () => {
  assert.throws(() => execFileSync('bash', [script, 'render'], { env: { ...env, TAILSCALE_OPERATOR_NAMESPACE: 'bad/ns' }, stdio: 'pipe' }));
});

test('Cilium policy-only rendering does not require an image and is included in full render', () => {
  const policyEnv = { ...env, TAILSCALE_OPERATOR_NAMESPACE: 'private-access' };
  delete policyEnv.OPS_MCP_IMAGE;
  const policies = execFileSync('bash', [script, 'policies'], { env: policyEnv, encoding: 'utf8' });
  assert.match(policies, /kind: CiliumNetworkPolicy/);
  assert.match(policies, /k8s:io.kubernetes.pod.namespace: private-access/);
  assert.doesNotMatch(policies, /kind: Deployment/);
  const full = execFileSync('bash', [script, 'render'], { env: { ...policyEnv, OPS_MCP_IMAGE: env.OPS_MCP_IMAGE }, encoding: 'utf8' });
  assert.ok(full.startsWith(policies));
});

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('custom namespace migration applies only project policies and cleanup needs no absent Ops deployment', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ops-migration-'));
  const log = join(directory, 'calls');
  const fake = '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n';
  writeFileSync(join(directory, 'kubectl'), fake, { mode: 0o755 });
  writeFileSync(join(directory, 'python3'), fake, { mode: 0o755 });
  const migration = fileURLToPath(new URL('../../../scripts/migrate-kubeclaw-network-policies-to-cilium.sh', import.meta.url));
  const custom = { ...env, PATH: directory + ':' + process.env.PATH, CALL_LOG: log, NAMESPACE: 'example-project', CILIUM_DATAPLANE_VERIFIED: 'true', CILIUM_TRAFFIC_VERIFIED: 'true' };
  try {
    execFileSync('bash', [migration, 'apply'], { env: custom });
    const applyCalls = readFileSync(log, 'utf8');
    assert.match(applyCalls, /apply -n example-project -f .*\/network-policies.yaml/);
    assert.doesNotMatch(applyCalls, /ops-mcp-network-policies.yaml/);
    writeFileSync(log, '');
    execFileSync('bash', [migration, 'cleanup'], { env: custom });
    const cleanupCalls = readFileSync(log, 'utf8');
    assert.match(cleanupCalls, /verify-cilium-policies.py example-project/);
    assert.doesNotMatch(cleanupCalls, /ops-mcp-network-policies.yaml/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
