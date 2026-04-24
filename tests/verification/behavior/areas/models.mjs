import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
} from '../../lib/lifecycle-audit-lib.mjs';

export async function registerModelsArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
}) {
  async function buildBuiltInRegistry(runtimeRoot) {
    const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
    const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
    assert.equal(errors.length, 0);
    return registry;
  }

  const runtimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  const runtimeMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/runtime.js');

  await record('Codex/OpenAI model -> subagent', async () => {
    assert.equal(runtimeMod.resolveRuntime({ model: 'openai/gpt-5' }), 'subagent');
    assert.equal(runtimeMod.resolveRuntime({ model: 'openai-codex/gpt-5.4' }), 'subagent');
    assert.equal(runtimeMod.modelToHarness('openai/gpt-5'), 'codex');
  });
  
  await record('Claude model -> ACP', async () => {
    assert.equal(runtimeMod.resolveRuntime({ model: 'anthropic/claude-sonnet-4-6' }), 'acp');
    assert.equal(runtimeMod.modelToHarness('anthropic/claude-sonnet-4-6'), 'claude');
  });
  
  await record('project-level model policy honors legacy progress.models compatibility', async () => {
    const policyRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
    const policyMod = await importRuntimeModule(policyRuntimeRoot, '/app/skills/pipeline/core/policy.js');
  
    const legacyProjectDefault = policyMod.resolvePolicy(
      { models: { forge: 'config-default-model' } },
      { models: { forge: 'legacy-project-model' } },
      'forge',
      {}
    );
    assert.equal(legacyProjectDefault.model, 'legacy-project-model');
    assert.equal(legacyProjectDefault.model_source, 'project_default');
  
    const defaultsWinsOverLegacy = policyMod.resolvePolicy(
      { models: { forge: 'config-default-model' } },
      {
        models: { forge: 'legacy-project-model' },
        defaults: { models: { forge: 'wave3-project-model' } },
      },
      'forge',
      {}
    );
    assert.equal(defaultsWinsOverLegacy.model, 'wave3-project-model');
    assert.equal(defaultsWinsOverLegacy.model_source, 'project_default');
  });
  
  await record('pipeline.started reports effective project model defaults', async () => {
    const telemetryRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.js');
    const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-start-models-'));
    const logRoot = path.join(repoRoot, '.swarm', 'logs');
    const runId = 'run-pipeline-start-models-1';
    const config = {
      project: 'behavior-pipeline-start-models',
      telemetry: { enabled: true },
      _logDir: logRoot,
      _runLogDir: path.join(logRoot, 'pipeline', 'runs', runId),
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      _pluginRegistry: registry,
    };
  
    telemetryMod.onPipelineStarted({ config }, {
      modules: {
        '01': { title: 'Scaffold', dir: '01-scaffold', depends_on: [] },
      },
      gates: {},
      execution_order: ['01'],
      models: {
        buster: 'legacy-buster-model',
        echo: 'legacy-echo-model',
      },
      defaults: {
        models: {
          forge: 'wave3-forge-model',
          buster: 'wave3-buster-model',
        },
      },
    });
    await flushAsync();
  
    const streamEvents = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(streamEvents.length, 1);
    assert.equal(streamEvents[0].type, 'pipeline.started');
    assert.deepEqual(streamEvents[0].models, {
      buster: 'wave3-buster-model',
      echo: 'legacy-echo-model',
      forge: 'wave3-forge-model',
    });
  });
}
