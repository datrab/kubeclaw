import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPluginRegistry } from '../../../../../skills/nova/pipeline/core/registry.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { appendPipelineLifecycleEvent } from '../../../../../skills/nova/pipeline/services/status-store.ts';
import { runPipeline } from '../../../../../skills/nova/pipeline/runners/pipeline-runner.ts';
import {
  isScheduledValidatorComplete,
  markScheduledValidatorComplete,
} from '../../../../../skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts';
import { completePipeline } from '../../../../../skills/nova/pipeline/runners/pipeline-runner-terminal.ts';

function testConfig(dir) {
  const config = {
    project: 'pipeline-runner-test',
    _runId: 'run-observer-setup-fails',
    paths: { swarm_dir: dir },
    pipeline_run_lock_lease_ms: 2000,
    pipeline_run_lock_heartbeat_ms: 1000,
  };
  Object.defineProperty(config, 'agent_observability', {
    get() {
      throw new Error('observer setup failed');
    },
  });
  return config;
}

test('runPipeline releases the run lock when observer setup fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-setup-'));
  const lockPath = path.join(dir, 'logs', 'pipeline', 'active-run.lock.json');

  await assert.rejects(
    () => runPipeline(testConfig(dir), { modules: {}, gates: {}, execution_order: [] }),
    /observer setup failed/,
  );
  assert.equal(fs.existsSync(lockPath), false);
});

function generatorDefinition(stageId, calls) {
  const producerType = stageId.split(':')[1];
  return {
    manifest: {
      moduleId: `test.${producerType}`,
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: [stageId],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: stageId,
      description: stageId,
      defaultEnabled: true,
    },
    implementation: {
      run: async () => {
        calls.push(stageId);
        return {
          schemaVersion: 'v1',
          producerKind: 'generator',
          producerType,
          outputs: { status: 'ok' },
        };
      },
    },
  };
}

function completedRunConfig(dir, calls) {
  const config = {
    project: 'pipeline-runner-test',
    _runId: 'run-terminal-resume',
    run_id: 'run-terminal-resume',
    repo_root: dir,
    paths: { swarm_dir: path.join(dir, '.swarm') },
  };
  config.pluginRegistry = buildPluginRegistry({
    enabled: true,
    allowCustomModules: false,
    extraModulePaths: [],
    modules: {},
    stageOwners: {},
    restrictedCapabilityAllowlist: {},
  }, {
    builtinModules: [
      generatorDefinition('generator:project_summary', calls),
      generatorDefinition('generator:pipeline_review', calls),
      generatorDefinition('generator:case_study', calls),
    ],
  }).registry;
  return config;
}

test('completePipeline resumes missing terminal generators for completed runs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-terminal-'));
  const calls = [];
  const config = completedRunConfig(dir, calls);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const completionPath = path.join(
    config.paths.swarm_dir,
    'logs',
    'pipeline',
    'runs',
    config._runId,
    'terminal-generator-completions.json',
  );

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
    progress,
    result: { exit: 0, reason: 'PIPELINE_COMPLETE' },
  });
  fs.mkdirSync(path.dirname(completionPath), { recursive: true });
  fs.writeFileSync(completionPath, JSON.stringify({
    schemaVersion: 'v1',
    project: config.project,
    run_id: config._runId,
    completed: [{ stage_id: 'generator:project_summary', completed_at: '2026-06-03T00:00:00.000Z' }],
  }, null, 2));
  config._terminalGeneratorRunState = undefined;

  const exitCode = await completePipeline(config, progress, {
    deps: { pipelineRunner: { writeSummary: () => ({}), output: () => {} } },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ['generator:pipeline_review', 'generator:case_study']);
  const saved = JSON.parse(fs.readFileSync(completionPath, 'utf8'));
  assert.deepEqual(saved.completed.map((entry) => entry.stage_id), [
    'generator:case_study',
    'generator:pipeline_review',
    'generator:project_summary',
  ]);
});

test('scheduled validator completion cache is isolated by run id when config is reused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-validator-'));
  const config = {
    project: 'pipeline-runner-test',
    _runId: 'run-a',
    run_id: 'run-a',
    paths: { swarm_dir: path.join(dir, '.swarm') },
  };
  const key = 'mandatory:before:gate:review:validator:full_lint';

  markScheduledValidatorComplete(config, key);
  assert.equal(isScheduledValidatorComplete(config, key), true);

  config._runId = 'run-b';
  config.run_id = 'run-b';

  assert.equal(isScheduledValidatorComplete(config, key), false);

  markScheduledValidatorComplete(config, key);
  assert.equal(isScheduledValidatorComplete(config, key), true);
});

test('terminal generator completion cache is isolated by run id when config is reused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-terminal-reuse-'));
  const calls = [];
  const config = completedRunConfig(dir, calls);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const deps = { pipelineRunner: { writeSummary: () => ({}), output: () => {} } };

  config._runId = 'run-a';
  config.run_id = 'run-a';
  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
    progress,
    result: { exit: 0, reason: 'PIPELINE_COMPLETE' },
  });
  assert.equal(await completePipeline(config, progress, { deps }), 0);
  assert.deepEqual(calls, [
    'generator:project_summary',
    'generator:pipeline_review',
    'generator:case_study',
  ]);

  config._runId = 'run-b';
  config.run_id = 'run-b';
  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  appendPipelineLifecycleEvent(config, 'pipeline_run.completed', {
    progress,
    result: { exit: 0, reason: 'PIPELINE_COMPLETE' },
  });
  assert.equal(await completePipeline(config, progress, { deps }), 0);
  assert.deepEqual(calls, [
    'generator:project_summary',
    'generator:pipeline_review',
    'generator:case_study',
    'generator:project_summary',
    'generator:pipeline_review',
    'generator:case_study',
  ]);
});
