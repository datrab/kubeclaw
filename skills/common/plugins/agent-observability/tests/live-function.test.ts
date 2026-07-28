import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = path.resolve('../../../..');
const core = await import(pathToFileURL(path.join(repository, 'skills/common/plugin-runtime/core/src/index.ts')).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-agent-observability-'));
const roots = [
  path.join(repository, 'skills/common/plugins'),
  path.join(repository, 'skills/nova/plugins'),
  path.join(repository, 'skills/buster/plugins'),
];
const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: roots,
  trustPolicy: {
    trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'test:agent-observability',
  },
  now: () => new Date('2026-07-26T00:00:00Z'),
}));
const enabled = new Set([
  'kubeclaw.agent-observability:ingester',
  'kubeclaw.agent-observability:evidence',
]);
const granted = core.resolveCapabilityGrants(snapshot, {
  enabledRegistrations: enabled,
  providers: new Map([
    ['telemetry.emit', 'kubeclaw.telemetry-store:telemetry'],
    ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
  ]),
  grants: new Map([
    ['kubeclaw.agent-observability:ingester', new Map([
      ['telemetry.emit', { allowedEventPrefixes: ['plugin.kubeclaw.openclaw-agent-events.'] }],
    ])],
    ['kubeclaw.agent-observability:evidence', new Map([
      ['artifacts.write', { allowedNamespaces: ['kubeclaw.agent-observability-evidence'] }],
    ])],
  ]),
});
const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
const adapters = new core.AdapterRuntime({
  granted, activated,
  configs: new Map([
    ['kubeclaw.telemetry-store:telemetry', { journalPath: path.join(temporary, 'telemetry.jsonl') }],
    ['kubeclaw.artifact-store:artifact-store', { artifactRoot: path.join(temporary, 'artifacts') }],
  ]),
  effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(temporary, 'effects.jsonl')), undefined, undefined, new core.MemoryResourceLockManager()),
  shutdownTimeoutMs: 1000,
  async emitDomainEvent() {},
});
const events = new core.FileJournal(path.join(temporary, 'events.jsonl'));
events.append({
  schemaVersion: 'plugin-domain-event.v2',
  eventId: 'event:session-end',
  sequence: 1,
  type: 'plugin.kubeclaw.openclaw-agent-events.session-end',
  producer: snapshot.adapters.get('kubeclaw.openclaw-agent-events:source')?.provenance
    ?? snapshot.observers.get('kubeclaw.agent-observability:ingester').provenance,
  identity: { runId: 'run:1' },
  occurredAt: '2026-07-26T00:00:00Z',
  causationId: null,
  payload: { event: { token: 'must-not-survive', usage: { input: 10, output: 5 } } },
});
const checkpoints = new core.FileJournal(path.join(temporary, 'checkpoints.jsonl'));
try {
  await adapters.start();
  const observers = new core.ObserverRuntime({
    registry: granted, activated, adapters, events, checkpoints, configs: new Map(),
    now: () => new Date('2026-07-26T00:00:01Z'),
    wait: async () => {},
  });
  assert.deepEqual(await observers.drain(), { delivered: 2, failures: [] });
  assert.deepEqual(await observers.drain(), { delivered: 0, failures: [] });
  const telemetry = fs.readFileSync(path.join(temporary, 'telemetry.jsonl'), 'utf8');
  assert.match(telemetry, /agent-observability-event\.v2/);
  assert.doesNotMatch(telemetry, /must-not-survive/);
  const catalog = fs.readFileSync(path.join(temporary, 'artifacts', 'catalog.jsonl'), 'utf8');
  assert.match(catalog, /agent-evidence:event:session-end/);
  const complete = fs.readFileSync(path.join(temporary, 'effects.jsonl'), 'utf8');
  assert.doesNotMatch(complete, /must-not-survive/);
  assert.equal(checkpoints.records().length, 2);
} finally {
  await adapters.shutdown();
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.agent-observability', suite: 'live-function' }));
