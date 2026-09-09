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
  if (!enabled) { assert.deepEqual(secretRules, []); continue; }
  assert.equal(secretRules.length, 1);
  const [{ doc: role, rule }] = secretRules;
  assert.equal(role.kind, 'Role', 'OAuth Secret permission must never have cluster scope');
  assert.equal(role.metadata.namespace, namespace ?? 'tailscale');
  assert.deepEqual(rule.apiGroups, ['']); assert.deepEqual(rule.resources, ['secrets']);
  assert.deepEqual(rule.resourceNames, [secret ?? 'operator-oauth']); assert.deepEqual(rule.verbs, ['get']);
  const bindings = docs.filter((doc) => ['RoleBinding', 'ClusterRoleBinding'].includes(doc?.kind) && doc.roleRef.name === role.metadata.name);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].kind, 'RoleBinding'); assert.equal(bindings[0].roleRef.kind, 'Role');
  assert.equal(bindings[0].metadata.namespace, role.metadata.namespace);
  assert.deepEqual(bindings[0].subjects, [{ kind: 'ServiceAccount', name: 'agent-nova', namespace: 'agent-control' }]);
  assert.notEqual(role.metadata.namespace, 'unrelated-control', 'same Secret name has no grant in a control namespace');
  const deployment = docs.find((doc) => doc?.kind === 'Deployment' && doc.metadata.name === 'agent-nova');
  const agent = deployment.spec.template.spec.containers.find((container) => container.env?.some(({ name }) => name === 'AGENT_ROLE'));
  assert.equal(agent.env.find(({ name }) => name === 'TAILSCALE_OPERATOR_NAMESPACE')?.value, role.metadata.namespace);
  assert.equal(agent.env.find(({ name }) => name === 'TAILSCALE_OAUTH_SECRET_NAME')?.value, rule.resourceNames[0]);
  assert.ok(!docs.some((doc) => doc?.kind === 'Namespace' && doc.metadata.name === role.metadata.namespace), 'agent chart must not own the operator namespace');
}
for (const [namespace, secret] of [['', 'operator-oauth'], ['tailscale', '']]) {
  const result = render(true, namespace, secret); assert.notEqual(result.status, 0, 'empty verification scope must fail closed');
}
console.log(JSON.stringify({ ok: true, finding: 'IFR-17-001', scope: 'real-helm-rbac-graph', liveAuthorization: false }));
