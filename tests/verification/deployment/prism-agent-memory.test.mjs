import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
const read = (directory, role) => yaml.loadAll(fs.readFileSync(`${directory}/${role}/resources.yaml`, 'utf8')).filter(Boolean);
const baseline = 'releases/gitops/runtime-41111231907-1';
const changed = 'releases/gitops/prism-agent-memory-20261031';
test('Prism memory recovery preserves every image and all unrelated resources', () => {
  for (const role of ['buster', 'nova', 'prism']) {
    const before = read(baseline, role), after = read(changed, role);
    if (role === 'prism') {
      const pod = after.find(d => d.kind === 'Deployment' && d.metadata.name === 'agent-prism').spec.template.spec;
      const agent = pod.containers.find(c => c.name === 'kubeclaw');
      assert.deepEqual(agent.resources, {requests: {cpu: '500m', memory: '2Gi'}, limits: {cpu: '2', memory: '8Gi'}});
      agent.resources = before.find(d => d.kind === 'Deployment' && d.metadata.name === 'agent-prism').spec.template.spec.containers.find(c => c.name === 'kubeclaw').resources;
    }
    assert.deepEqual(after, before);
  }
});
