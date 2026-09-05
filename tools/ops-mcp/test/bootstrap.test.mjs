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
