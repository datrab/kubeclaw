import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
} from '../../lib/lifecycle-audit-lib.mjs';

import {
  buildBuiltInRegistry,
} from './helpers.mjs';

export async function registerModelsArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
}) {
  const runtimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  const runtimeMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/runtime.ts');

  await record('Codex/OpenAI model -> subagent', async () => {
    assert.equal(runtimeMod.resolveRuntime({ model: 'openai/gpt-5' }), 'subagent');
    assert.equal(runtimeMod.resolveRuntime({ model: 'openai/gpt-5.4' }), 'subagent');
    assert.equal(runtimeMod.resolveRuntime({ model: 'openai-codex/gpt-5.4' }), 'subagent');
    assert.equal(runtimeMod.canonicalizeModelId('openai-codex/gpt-5.4'), 'openai/gpt-5.4');
    assert.equal(runtimeMod.canonicalizeModelId('codex-5.4'), 'gpt-5.4');
    assert.equal(runtimeMod.modelToHarness('openai/gpt-5'), 'codex');
  });
  
  await record('Claude model -> ACP', async () => {
    assert.equal(runtimeMod.resolveRuntime({ model: 'anthropic/claude-sonnet-4-6' }), 'acp');
    assert.equal(runtimeMod.modelToHarness('anthropic/claude-sonnet-4-6'), 'claude');
  });
  
  await record('project-level model policy ignores legacy progress.models compatibility', async () => {
    const policyRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
    const policyMod = await importRuntimeModule(policyRuntimeRoot, '/app/skills/pipeline/core/policy.ts');
  
    const legacyIgnored = policyMod.resolvePolicy(
      { fallback_model: 'platform-fallback-model' },
      { models: { forge: 'legacy-project-model' } },
      'forge',
      {}
    );
    assert.equal(legacyIgnored.model, 'platform-fallback-model');
    assert.equal(legacyIgnored.model_source, 'platform_fallback');
  
    const defaultsOwnProjectPolicy = policyMod.resolvePolicy(
      { fallback_model: 'platform-fallback-model' },
      {
        models: { forge: 'legacy-project-model' },
        defaults: { models: { forge: 'wave3-project-model' } },
      },
      'forge',
      {}
    );
    assert.equal(defaultsOwnProjectPolicy.model, 'wave3-project-model');
    assert.equal(defaultsOwnProjectPolicy.model_source, 'project_default');

    const policySource = fs.readFileSync(path.join(policyRuntimeRoot, 'app/skills/pipeline/core/policy.ts'), 'utf8');
    assert.equal(policySource.includes('progress?.models'), false);
    assert.equal(policySource.includes('legacy progress.models'), false);
  });
  
  await record('pipeline.started reports effective project model defaults', async () => {
    const telemetryRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.ts');
    const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-pipeline-start-models-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const runId = 'run-pipeline-start-models-1';
    const config = {
      project: 'behavior-pipeline-start-models',
      telemetry: { enabled: true },
      paths: { swarm_dir: swarmDir },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-10T00:00:00.000Z'),
      pluginRegistry: registry,
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
      forge: 'wave3-forge-model',
    });
  });
}
