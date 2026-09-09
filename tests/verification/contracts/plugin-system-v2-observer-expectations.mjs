import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Release expectations are intentional identities, not counts derived from discovery.
const expectedObservers = {
  'kubeclaw.agent-observability:evidence': ['src/observers.ts', 'recordEvidence'],
  'kubeclaw.agent-observability:ingester': ['src/observers.ts', 'ingest'],
  'kubeclaw.notification-observer:notifications': ['src/observer.ts', 'observe'],
  'kubeclaw.notification-observer:preview-delivery': ['src/observer.ts', 'deliverPreview'],
  'kubeclaw.telemetry-observer:telemetry': ['src/observer.ts', 'observe'],
};
const expectedRoleObservers = {
  nova: [
    'kubeclaw.agent-observability:evidence',
    'kubeclaw.agent-observability:ingester',
    'kubeclaw.notification-observer:notifications',
    'kubeclaw.notification-observer:preview-delivery',
    'kubeclaw.telemetry-observer:telemetry',
  ],
  buster: ['kubeclaw.agent-observability:evidence', 'kubeclaw.agent-observability:ingester'],
  prism: ['kubeclaw.agent-observability:evidence', 'kubeclaw.agent-observability:ingester'],
};

export function assertObserverIdentities(observers) {
  assert.deepEqual([...observers.keys()].sort(), Object.keys(expectedObservers).sort(),
    'release observer identities changed; audit is a journal projection, not an observer');
}

export function assertObserverSurfaces(registry, root) {
  assertObserverIdentities(registry.observers);
  for (const [id, [module, exportName]] of Object.entries(expectedObservers)) {
    const entry = registry.observers.get(id);
    assert.equal(`${entry.package.manifest.id}:${entry.registration.id}`, id);
    assert.equal(entry.provenance.surface, 'observer', `${id} has the wrong surface`);
    assert.equal(entry.registration.module, module, `${id} has the wrong module`);
    assert.equal(entry.registration.export, exportName, `${id} has the wrong export`);
  }
  for (const [role, expected] of Object.entries(expectedRoleObservers)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, `packaging/runtime/roles/${role}.json`), 'utf8'));
    assert.equal(manifest.role, role);
    assert.equal(manifest.schemaVersion, 'pipeline-runtime-role.v1');
    const actual = [...registry.observers].filter(([, entry]) => manifest.plugins.includes(entry.package.manifest.id))
      .map(([id]) => id).sort();
    assert.deepEqual(actual, expected, `${role} observer surfaces changed`);
  }
}
