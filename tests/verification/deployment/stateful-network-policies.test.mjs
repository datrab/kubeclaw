import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { load, loadAll, dump } from 'js-yaml';
import { renderStatefulNetworkPolicies } from '../../../scripts/render-stateful-network-policies.mjs';

const file = 'my-values/infra/network-policies.yaml';
const helm = process.env.HELM_BIN ?? 'helm';

test('real chart service names, destination selectors and translated ports bind all three migrated database policies', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stateful-network-'));
  try {
    const values = {};
    for (const [profile, role, port] of [['redis', 'master', 6389], ['postgresql', 'primary', 5449]]) {
      const selected = load(fs.readFileSync(`my-values/infra/${profile}-values.yaml`, 'utf8'));
      selected.nameOverride = `${profile}-selected-label`;
      selected[role].service = { ports: { [profile]: port } };
      values[profile] = path.join(temporary, `${profile}.yaml`);
      fs.writeFileSync(values[profile], dump(selected));
    }
    const docs = renderStatefulNetworkPolicies(file, 'migration-test', {
      redis: { release: 'redis-migrated', values: values.redis },
      postgresql: { release: 'postgresql-migrated', values: values.postgresql },
      qdrant: { release: 'qdrant-migrated', values: 'my-values/infra/qdrant-values.yaml' },
    }, helm);
    const byName = new Map(docs.map(document => [document.metadata.name, document]));
    for (const [profile, consumer, target, service] of [
      ['redis', 'kubeclaw-agents-egress', 6379, 6389],
      ['postgresql', 'kubeclaw-litellm-egress', 5432, 5449],
    ]) {
      const ingress = byName.get(`kubeclaw-${profile}-ingress`).spec;
      assert.equal(ingress.endpointSelector.matchLabels['app.kubernetes.io/instance'], `${profile}-migrated`);
      assert.equal(ingress.endpointSelector.matchLabels['app.kubernetes.io/name'], `${profile}-selected-label`);
      assert.deepEqual(ingress.ingress[0].toPorts[0].ports, [{ port: String(target), protocol: 'TCP' }]);
      const policy = byName.get(consumer);
      const rule = policy.spec.egress.find(rule => rule.toEndpoints?.some(endpoint =>
        endpoint.matchLabels?.['app.kubernetes.io/instance'] === `${profile}-migrated`));
      assert.deepEqual(rule.toPorts[0].ports, [{ port: String(service), protocol: 'TCP' }, { port: String(target), protocol: 'TCP' }]);
    }
    const qdrant = byName.get('kubeclaw-qdrant-ingress').spec;
    assert.equal(qdrant.endpointSelector.matchLabels['app.kubernetes.io/instance'], 'qdrant-migrated');
    assert.equal(qdrant.endpointSelector.matchLabels.app, 'qdrant');
    assert.deepEqual(qdrant.ingress[0].toPorts[0].ports, [{ port: '6333', protocol: 'TCP' }, { port: '6334', protocol: 'TCP' }]);
    const qdrantEgress = byName.get('kubeclaw-agents-egress').spec.egress.find(rule => rule.toEndpoints?.some(endpoint => endpoint.matchLabels?.['app.kubernetes.io/instance'] === 'qdrant-migrated'));
    assert.deepEqual(qdrantEgress.toPorts[0].ports, qdrant.ingress[0].toPorts[0].ports);
    const original = loadAll(fs.readFileSync(file, 'utf8')).filter(Boolean);
    const originalWorld = original.find(document => document.metadata.name === 'kubeclaw-litellm-egress').spec.egress[1];
    assert.deepEqual(byName.get('kubeclaw-litellm-egress').spec.egress[1], originalWorld);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
