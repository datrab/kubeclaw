import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseAllDocuments } from 'yaml';
const prefix = 'busterNamespaceBroker.leaseClient.verificationRead';
function render(enabled, namespace, secret) {
  const args = ['template', 'agent-nova', 'charts/kubeclaw', '-n', 'agent-control', '-f', 'my-values/nova-values.yaml', '--set', `${prefix}.enabled=${enabled}`];
  if (namespace !== undefined) args.push('--set-string', `${prefix}.tailscaleOperatorNamespace=${namespace}`);
  if (secret !== undefined) args.push('--set-string', `${prefix}.tailscaleOAuthSecretName=${secret}`);
  return spawnSync('helm', args, { encoding: 'utf8' });
}
for (const [enabled, namespace, secret] of [[true, undefined, undefined], [true, 'custom-operator', 'custom-oauth'], [false, 'custom-operator', 'custom-oauth']]) {
  const result = render(enabled, namespace, secret); assert.equal(result.status, 0, result.stderr);
  const docs = parseAllDocuments(result.stdout).map((doc) => { assert.deepEqual(doc.errors, []); return doc.toJSON(); });
  const secretRules = docs.filter((doc) => ['Role', 'ClusterRole'].includes(doc?.kind))
    .flatMap((doc) => (doc.rules ?? []).filter((rule) => rule.resources.includes('secrets')).map((rule) => ({ doc, rule })));
  assert.deepEqual(secretRules, [], 'agents must never receive Kubernetes Secret access, including through legacy verification flags');
  assert.deepEqual(docs.filter(doc => ['RoleBinding', 'ClusterRoleBinding'].includes(doc?.kind)), [], 'Nova has no direct cluster binding');
  const deployment = docs.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === 'agent-nova');
  assert.equal(deployment.spec.template.spec.automountServiceAccountToken, false);
  const agent = deployment.spec.template.spec.containers.find(container => container.name === 'kubeclaw');
  assert.ok(!agent.env.some(({ name }) => ['TAILSCALE_OPERATOR_NAMESPACE', 'TAILSCALE_OAUTH_SECRET_NAME'].includes(name)));
}
for (const [namespace, secret] of [['', 'operator-oauth'], ['tailscale', '']]) {
  const result = render(true, namespace, secret);
  assert.equal(result.status, 0, 'retired verification scopes never mint a permission');
  const docs = parseAllDocuments(result.stdout).map(doc => doc.toJSON());
  assert.ok(!docs.some(doc => ['Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding'].includes(doc?.kind)));
}
console.log(JSON.stringify({ ok: true, finding: 'IFR-17-001', scope: 'real-helm-agent-without-rbac', liveAuthorization: false }));
