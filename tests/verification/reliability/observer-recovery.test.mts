import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareRuntime, createAdapterRuntime } from '../../../skills/nova/core/execution/engine-runtime.ts';
import { ObserverRuntime, type CanonicalEvent, type ObserverDeliveryRecord } from '../../../skills/nova/core/telemetry/observers.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import type { ObserverCheckpoint, PipelineDefinition } from '@kubeclaw/plugin-sdk';
import type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';

test('observer retries stay bounded after reconstruction and completed deliveries rebuild missing checkpoints', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-recovery-'));
  const plugin = path.join(root, 'plugins', 'file-observer');
  const output = path.join(root, 'sink', 'events.txt');
  const observerId = 'test.file-observer:files';
  fs.mkdirSync(path.join(plugin, 'src'), { recursive: true });
  fs.mkdirSync(path.join(plugin, 'schemas'));
  fs.writeFileSync(path.join(plugin, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(plugin, 'schemas/config.json'), JSON.stringify({ type: 'object', additionalProperties: false,
    required: ['output'], properties: { output: { type: 'string' } } }));
  fs.writeFileSync(path.join(plugin, 'schemas/checkpoint.json'), JSON.stringify({ type: 'object', additionalProperties: false,
    required: ['sequence', 'eventId'], properties: { sequence: { type: 'integer', minimum: 1 }, eventId: { type: 'string' } } }));
  fs.writeFileSync(path.join(plugin, 'schemas/input.json'), '{"type":"object","additionalProperties":false}');
  fs.writeFileSync(path.join(plugin, 'schemas/result.json'), JSON.stringify({ $ref: 'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult' }));
  // A real installed observer writes to disk. A missing sink directory causes
  // the OS failure; no adapter or delivery outcome is substituted.
  fs.writeFileSync(path.join(plugin, 'src/observer.ts'), `import fs from 'node:fs';
    export async function observe(delivery, context) {
      const fd = fs.openSync(context.contract.config.output, 'a');
      try { fs.writeSync(fd, delivery.event.eventId + '\\n'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
    }
    export async function execute() { return { schemaVersion: 'stage-result.v2', outcome: 'passed' }; }
  `);
  fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({ id: 'test.file-observer', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', adapters: [],
    stages: [{ id: 'unused', type: 'test.file-observer', module: 'src/observer.ts', export: 'execute', requiredCapabilities: [],
      configSchema: 'schemas/config.json', inputSchema: 'schemas/input.json', resultSchema: 'schemas/result.json' }],
    observers: [{ id: 'files', module: 'src/observer.ts', export: 'observe', subscriptions: ['run.started'], delivery: 'at_least_once', ordering: 'per_run',
      failurePolicy: { mode: 'best_effort', maxAttempts: 2, backoffMs: 0, timeoutMs: 1000 }, requiredCapabilities: [],
      configSchema: 'schemas/config.json', checkpointSchema: 'schemas/checkpoint.json' }] }));
  const platform: PlatformConfig = { schemaVersion: 'pipeline-platform.v2', installationRoots: [path.dirname(plugin)], trustedBuiltinRoots: [path.dirname(plugin)],
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} }, providers: {}, grants: {}, adapters: {}, activeAdapters: [],
    observers: { [observerId]: { output } }, storageRoot: path.join(root, 'state'), shutdownTimeoutMs: 1000,
    orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [] };
  const definition: PipelineDefinition = { schemaVersion: 'pipeline-definition.v2', id: 'observer-test', maxConcurrency: 1,
    stages: [{ id: 'unused', type: 'test.file-observer', dependsOn: [], config: { output }, input: {}, execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 1000 } }] };
  const prepared = await prepareRuntime(platform, definition);
  const events = new FileJournal<CanonicalEvent>(path.join(root, 'events.jsonl'));
  const event = (id: string) => events.append({ schemaVersion: 'lifecycle-event.v2', eventId: id, sequence: events.records().length + 1,
    type: 'run.started', identity: { runId: id }, occurredAt: new Date().toISOString(), causationId: null, payload: {} });
  const adapters = createAdapterRuntime(platform, root, prepared, events);
  const checkpointPath = path.join(root, 'checkpoints.jsonl');
  const deliveryPath = path.join(root, 'deliveries.jsonl');
  const runtime = () => new ObserverRuntime({ registry: prepared.granted, activated: prepared.activated, adapters, events,
    checkpoints: new FileJournal<ObserverCheckpoint>(checkpointPath), deliveries: new FileJournal<ObserverDeliveryRecord>(deliveryPath),
    configs: new Map([[observerId, { output }]]) });
  try {
    event('event:outage');
    const first = await runtime().drain();
    assert.equal(first.delivered, 0);
    assert.match(first.failures[0]!.error, /ENOENT/);
    const initialRecords = fs.readFileSync(deliveryPath, 'utf8');
    assert.equal(new FileJournal<ObserverDeliveryRecord>(deliveryPath).records().filter(record => record.entry.status === 'started').length, 2);
    fs.mkdirSync(path.dirname(output));
    for (let attempt = 0; attempt < 3; attempt++) {
      const recovered = await runtime().drain();
      assert.equal(recovered.failures[0]!.error, 'OBSERVER_DELIVERY_ATTEMPTS_EXHAUSTED');
      assert.equal(fs.readFileSync(deliveryPath, 'utf8'), initialRecords);
      assert.equal(fs.existsSync(output), false);
    }
    event('event:healthy');
    const healthy = await runtime().drain();
    assert.equal(healthy.delivered, 1, JSON.stringify(healthy));
    assert.equal(fs.readFileSync(output, 'utf8'), 'event:healthy\n');
    const completedRecords = fs.readFileSync(deliveryPath, 'utf8');
    // Remove only the derived checkpoint. Durable delivery history must
    // rebuild it without executing the already completed observer again.
    fs.rmSync(checkpointPath);
    assert.equal((await runtime().drain()).delivered, 1);
    assert.equal(fs.readFileSync(output, 'utf8'), 'event:healthy\n');
    assert.equal(fs.readFileSync(deliveryPath, 'utf8'), completedRecords);
    assert.equal((await runtime().drain()).delivered, 0);
  } finally { await adapters.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
});
