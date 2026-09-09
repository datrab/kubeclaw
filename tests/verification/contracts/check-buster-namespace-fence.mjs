import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadAll } from 'js-yaml';

const render = (namespace, version = '1.30.0') => ['template', 'review', 'charts/kubeclaw', '--namespace', namespace,
  '--kube-version', version, '--set', 'agentRole=buster', '--set', 'busterNamespaceBroker.enabled=true',
  '--set', 'busterNamespaceBroker.allowedPrefixes={test,preview}'];
const names = new Set();
for (const namespace of ['kubeclaw', 'alternative']) {
  const documents = loadAll(execFileSync('helm', render(namespace), { encoding: 'utf8' })).filter(Boolean);
  const policy = documents.find(document => document.kind === 'ValidatingAdmissionPolicy');
  const binding = documents.find(document => document.kind === 'ValidatingAdmissionPolicyBinding');
  const deployment = documents.find(document => document.kind === 'Deployment' && document.metadata.name.endsWith('-namespace-controller'));
  const account = deployment.spec.template.spec.serviceAccountName;
  const identity = `system:serviceaccount:${namespace}:${account}`;
  const worker = `system:serviceaccount:${namespace}:agent-buster`;
  assert.equal(policy.spec.matchConditions[0].expression, `request.userInfo.username in [${JSON.stringify(identity)}, ${JSON.stringify(worker)}]`);
  assert.equal(policy.spec.validations[0].expression, `request.userInfo.username != ${JSON.stringify(worker)}`);
  assert.equal(binding.spec.policyName, policy.metadata.name);
  assert.deepEqual(binding.spec.validationActions, ['Deny']);
  assert.equal(policy.spec.failurePolicy, 'Fail');
  assert.deepEqual(policy.spec.matchConstraints.resourceRules[0].operations, ['CREATE', 'DELETE']);
  assert.match(policy.spec.validations[1].expression, /\["test","preview"\]\.exists/);
  const roleBinding = documents.find(document => document.kind === 'ClusterRoleBinding' && document.metadata.name.endsWith('-namespace-controller'));
  assert.deepEqual(roleBinding.subjects, [{ kind: 'ServiceAccount', name: account, namespace }]);
  const environment = deployment.spec.template.spec.containers[0].env;
  assert.equal(environment.find(entry => entry.name === 'BUSTER_ALLOWED_NAMESPACE_PREFIXES').value, 'test,preview');
  assert(!names.has(policy.metadata.name)); names.add(policy.metadata.name);
}
const old = spawnSync('helm', render('alternative', '1.29.9'), { encoding: 'utf8' });
assert.notEqual(old.status, 0); assert.match(old.stderr, /requires Kubernetes >=1.30/);
console.log(JSON.stringify({ ok: true, scope: 'helm-render-only', installations: names.size }));
