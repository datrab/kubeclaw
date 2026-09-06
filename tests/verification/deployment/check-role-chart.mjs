import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseAllDocuments } from 'yaml';

for (const [role, values, repository] of [
  ['nova', 'my-values/nova-values.yaml', 'ghcr.io/datrab/kubeclaw-nova'],
  ['prism', 'my-values/prism-agent-values.yaml', 'ghcr.io/datrab/kubeclaw-prism-agent'],
  ['buster', 'my-values/buster-values.yaml', 'ghcr.io/datrab/kubeclaw-buster-gateway'],
]) {
  const rendered = spawnSync('helm', ['template', `agent-${role}`, 'charts/kubeclaw', '-f', values], { encoding: 'utf8' });
  assert.equal(rendered.status, 0, `Real Helm rendering is required: ${rendered.error ?? rendered.stderr}`);
  const objects = parseAllDocuments(rendered.stdout).map(doc => { assert.deepEqual(doc.errors, []); return doc.toJSON(); });
  const deployment = objects.find(doc => doc?.kind === 'Deployment' && doc.metadata.name === `agent-${role}`);
  assert.ok(deployment, `Missing ${role} deployment`);
  const containers = deployment.spec.template.spec.containers;
  assert.ok(containers.some(container => container.image === `${repository}:latest`), `Missing role image: ${role}`);
  if (role === 'prism') {
    assert.equal(containers.find(container => container.name === 'prism-agent-bridge')?.image, `${repository}:latest`);
    assert.ok([...containers, ...deployment.spec.template.spec.initContainers].every(container => !container.image.includes('kubeclaw-nova')));
  }
  assert.ok([...containers, ...deployment.spec.template.spec.initContainers].every(container => !container.image.includes('kubeclaw-general')));
}
console.log('Real Helm rendered Nova, Prism and Buster with separate role images.');
