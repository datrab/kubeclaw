import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
  PLUGIN_CONTRACT_VERSION,
} from '../../../../../skills/nova/pipeline/core/constants.ts';
import { buildPluginRegistry } from '../../../../../skills/nova/pipeline/core/registry.ts';
import { emitEvent } from '../../../../../skills/nova/pipeline/services/telemetry/dispatch.ts';
import {
  TELEMETRY_SINK_HOOK_FAMILY,
  TELEMETRY_SINK_STAGE_ID,
  buildTelemetrySinkInput,
  validateTelemetrySinkInput,
} from '../../../../../skills/nova/pipeline/services/telemetry-sink-contract.ts';
import { buildTelemetryStreamEvent } from '../../../../../skills/nova/pipeline/services/telemetry-stream.ts';

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-dispatch-test-'));
  return {
    project: 'telemetry-dispatch-test',
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _runId: 'run-telemetry-dispatch-test',
    run_id: 'run-telemetry-dispatch-test',
    telemetry: {
      sink_timeout_ms: 15,
    },
  };
}

function hangingSinkDefinition() {
  return {
    manifest: {
      moduleId: 'test.telemetry.hanging',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'telemetry',
      hookFamily: TELEMETRY_SINK_HOOK_FAMILY,
      stageIds: [TELEMETRY_SINK_STAGE_ID],
      capabilities: ['read.state', 'emit.stream'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Hanging telemetry sink',
      description: 'Test sink that never resolves.',
      defaultEnabled: true,
      priority: 1,
    },
    implementation: {
      observe: () => new Promise(() => {}),
    },
  };
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('emitEvent appends durable telemetry and returns when a sink hangs', async () => {
  const config = makeConfig();
  const { registry, errors } = buildPluginRegistry({
    enabled: true,
    allowCustomModules: false,
    extraModulePaths: [],
    modules: {},
    stageOwners: {},
    restrictedCapabilityAllowlist: {},
  }, {
    builtinModules: [hangingSinkDefinition()],
  });
  assert.deepEqual(errors, []);
  config.pluginRegistry = registry;

  const startedAt = Date.now();
  const result = await emitEvent({ config }, 'cost.update', { module_id: 'alpha', cost_usd: 1 });
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 1000);
  assert.equal(result.disk.ok, true);
  assert.deepEqual(result.results, [{
    moduleId: 'test.telemetry.hanging',
    ok: false,
    error: "telemetry sink 'test.telemetry.hanging' timed out after 15ms",
  }]);

  const pipelineEvents = readJsonl(path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'pipeline.jsonl'));
  assert.ok(pipelineEvents.some((event) => event.type === 'cost.update' && event.module_id === 'alpha'));
});

test('telemetry sink and stream envelopes keep authoritative identity fields', () => {
  const config = makeConfig();
  const input = buildTelemetrySinkInput(
    { config, runId: 'ctx-run' },
    'cost.update',
    {
      run_id: 'payload-run',
      type: 'payload.type',
      seq: 999,
      project: 'payload-project',
      source: 'payload-source',
      emitter: 'payload-emitter',
      module_id: 'alpha',
      cost_usd: 1,
    },
    { runId: 'option-run', emitter: 'option-emitter' },
  );

  assert.equal(input.ids.runId, 'option-run');

  const event = buildTelemetryStreamEvent(
    'cost.update',
    input.event.payload,
    { runId: input.ids.runId, project: config.project },
    7,
    { emitter: input.event.emitter },
    '2026-06-03T00:00:00.000Z',
  );

  assert.equal(event.run_id, 'option-run');
  assert.equal(event.type, 'cost.update');
  assert.equal(event.seq, 7);
  assert.equal(event.project, config.project);
  assert.equal(event.source, 'pipeline');
  assert.equal(event.producer, 'option-emitter');
  assert.equal(event.module_id, 'alpha');
});

test('telemetry sink builder rejects unsupported Discord embeds', () => {
  const input = buildTelemetrySinkInput(
    { config: makeConfig() },
    'cost.update',
    { module_id: 'alpha' },
    {
      presentation: {
        discord: {
          level: 'INFO',
          title: 'Cost update',
          embeds: [{ title: 'unsupported' }],
        },
      },
    },
  );

  assert.match(validateTelemetrySinkInput(input).join('\n'), /presentation\.discord\.embeds is not supported/);
});
