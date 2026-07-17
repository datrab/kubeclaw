import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPluginRegistry } from '../../../../../skills/nova/pipeline/core/registry.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../../../../../skills/nova/pipeline/core/constants.ts';
import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { appendPipelineLifecycleEvent } from '../../../../../skills/nova/pipeline/services/status-store.ts';
import { runPipeline } from '../../../../../skills/nova/pipeline/runners/pipeline-runner.ts';
import { preparePipelineStart } from '../../../../../skills/nova/pipeline/runners/pipeline-runner-start.ts';
import {
  isScheduledValidatorComplete,
  markScheduledValidatorComplete,
} from '../../../../../skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts';
import { buildPipelineStepResult } from '../../../../../skills/nova/pipeline/services/contracts/pipeline-step-result.ts';
import { runScheduledValidator } from '../../../../../skills/nova/pipeline/runners/pipeline-runner-scheduling.ts';
import { resolveGateTargetModule } from '../../../../../skills/nova/pipeline/runners/gate-target-module.ts';
import { completePipeline } from '../../../../../skills/nova/pipeline/runners/pipeline-runner-terminal.ts';

function testConfig(dir) {
  const config = {
    project: 'pipeline-runner-test',
    _runId: 'run-observer-setup-fails',
    paths: { swarm_dir: dir },
    locks: {
      pipeline_run: {
        lease_ms: 2000,
        heartbeat_ms: 1000,
        mutation_stale_ms: 1,
        abort_settle_ms: 0,
      },
      lifecycle_append: {
        stale_ms: 1000,
        retry_count: 1,
        retry_delay_ms: 1,
      },
    },
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

test('runPipeline records typed runtime halt when Redis preflight fails after start', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-redis-preflight-'));
  const config = {
    project: 'pipeline-runner-test',
    _runId: 'run-redis-preflight-fails',
    run_id: 'run-redis-preflight-fails',
    paths: { swarm_dir: dir },
    locks: {
      pipeline_run: {
        lease_ms: 2000,
        heartbeat_ms: 1000,
        mutation_stale_ms: 1,
        abort_settle_ms: 0,
      },
      lifecycle_append: {
        stale_ms: 1000,
        timeout_ms: 1000,
        retry_count: 1,
        retry_delay_ms: 1,
      },
    },
    telemetry: { enabled: false },
  };
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const error = new Error('connect ECONNREFUSED 127.0.0.1:1');
  error.code = 'ECONNREFUSED';

  const exitCode = await runPipeline(config, progress, {
    deps: {
      pipelineRunner: {
        preflightRuntimeRedis: async () => {
          throw error;
        },
        output() {},
        discord() {},
        writeSummary() {
          return {};
        },
      },
    },
  });

  const lifecyclePath = path.join(dir, 'logs', 'pipeline', 'runs', 'run-redis-preflight-fails', 'lifecycle', 'canonical-events.jsonl');
  const events = fs.readFileSync(lifecyclePath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const halted = events.find((event) => event.type === 'pipeline_run.halted');

  assert.equal(exitCode, 1);
  assert.equal(events[0].type, 'pipeline_run.started');
  assert.equal(halted?.refs?.run_id, 'run-redis-preflight-fails');
  assert.equal(halted?.data?.step_type, 'pipeline');
  assert.equal(halted?.data?.step_id, 'runtime_config');
  assert.equal(halted?.data?.terminal_status, 'failed');
  assert.equal(halted?.data?.terminal_decision?.reasonCode, 'econnrefused');
  assert.equal(halted?.data?.terminal_decision?.source, 'pipeline:runtime_config');
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
        if (typeof calls.inspect === 'function') calls.inspect(stageId);
        if (calls.failStage === stageId) {
          return {
            schemaVersion: 'v1',
            producerKind: 'generator',
            producerType,
            outputs: {
              status: 'failed',
              reason: `${stageId} timed out`,
              failure_class: 'timeout',
            },
            diagnostics: {
              failure_class: 'timeout',
            },
          };
        }
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

function validatorDefinition(stageId, calls, opts = {}) {
  const producerType = stageId.split(':')[1];
  const findings = Array.isArray(opts.findings) ? opts.findings : [];
  return {
    manifest: {
      moduleId: `test.${producerType}`,
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'validator',
      hookFamily: 'validator.run',
      stageIds: [stageId],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: stageId,
      description: stageId,
      defaultEnabled: true,
    },
    implementation: {
      run: async (input) => {
        calls.push(stageId);
        return {
          schemaVersion: 'v1',
          producerKind: 'validator',
          producerType,
          nextAction: 'pass',
          diagnostics: {
            summary: 'Architecture validation passed',
            findings,
            metadata: {
              blocked: false,
              project: input.stateSnapshot.pipeline.project,
              run_id: input.ids.runId,
              timestamp: '2026-07-07T00:00:00.000Z',
              raw_findings: findings,
              execution_failed: false,
              contract_invalid: false,
            },
            typed: {
              validator: {
                schemaVersion: 'v1',
                validatorType: producerType,
                outcomeClass: 'passed',
                summary: 'Architecture validation passed',
                metadata: {
                  blocked: false,
                  execution_failed: false,
                  contract_invalid: false,
                },
              },
            },
          },
        };
      },
    },
  };
}

function completedRunConfig(dir, calls, pluginConfig = {}) {
  const config = {
    project: 'pipeline-runner-test',
    _runId: 'run-terminal-resume',
    run_id: 'run-terminal-resume',
    repo_root: dir,
    paths: { swarm_dir: path.join(dir, '.swarm') },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
    },
  };
  config._runStats = createRunStats();
  config.pluginRegistry = buildPluginRegistry({
    enabled: true,
    allowCustomModules: false,
    extraModulePaths: [],
    modules: pluginConfig.modules || {},
    stageOwners: pluginConfig.stageOwners || {},
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

test('completePipeline halts when a required terminal generator is disabled', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-terminal-disabled-'));
  const calls = [];
  const config = completedRunConfig(dir, calls, {
    modules: {
      'test.project_summary': { enabled: false },
    },
  });
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const runPipelineJsonl = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'pipeline.jsonl');

  fs.mkdirSync(path.dirname(runPipelineJsonl), { recursive: true });
  fs.writeFileSync(runPipelineJsonl, JSON.stringify({
    v: 1,
    type: 'observability.degraded',
    run_id: config._runId,
    project: config.project,
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_url_missing',
    detail: 'discord webhook delivery skipped: config.discord_webhook_url is missing',
  }) + '\n');

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const exitCode = await completePipeline(config, progress, {
    deps: { pipelineRunner: { writeSummary: () => ({}), output: () => {} } },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, []);

  const readModels = JSON.parse(fs.readFileSync(path.join(
    config.paths.swarm_dir,
    'logs',
    'pipeline',
    'runs',
    config._runId,
    'lifecycle',
    'read-models.json',
  ), 'utf8'));
  assert.equal(readModels.pipeline.status, 'HALTED');
  assert.equal(readModels.pipeline.step_type, 'generator');
  assert.equal(readModels.pipeline.step_id, 'generator:project_summary');
});

test('preparePipelineStart sends architecture validator start and pass notifications', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-arch-notify-'));
  const calls = [];
  const config = {
    project: 'pipeline-arch-notify',
    _runId: 'run-arch-notify',
    run_id: 'run-arch-notify',
    repo_root: dir,
    fallback_model: 'gpt-5.4',
    paths: {
      swarm_dir: path.join(dir, '.swarm'),
      modules_dir: path.join(dir, '.swarm', 'modules'),
      progress_file: path.join(dir, '.swarm', 'progress.json'),
    },
    arch_validation: { enabled: true, agent_enabled: false, timeout_minutes: 1, model: 'gpt-5.4' },
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
      validatorDefinition('validator:architecture', calls),
    ],
  }).registry;
  const discordCalls = [];

  const result = await preparePipelineStart(config, {
    project: 'pipeline-arch-notify',
    arch_validation: { enabled: true, approval_gate: { timeout_minutes: 5 } },
    modules: {},
    gates: {},
    execution_order: [],
  }, {
    deps: {
      pipelineRunner: {
        discord: async (_config, level, title, description, fields) => {
          discordCalls.push({ level, title, description, fields });
        },
      },
    },
  });

  assert.equal(result, null);
  assert.deepEqual(calls, ['validator:architecture']);
  assert.equal(discordCalls[0].level, 'INFO');
  assert.equal(discordCalls[0].title, 'Architecture Validator started');
  assert.equal(discordCalls[1].level, 'OK');
  assert.equal(discordCalls[1].title, 'Architecture Validator passed');
});

test('preparePipelineStart lists architecture findings and requires approval before module work', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-arch-approval-'));
  const calls = [];
  const finding = {
    id: 'MODULE_BOUNDARY_BLUR',
    severity: 'warning',
    explanation: 'Module ownership boundary is under-modeled.',
  };
  const config = {
    project: 'pipeline-arch-approval',
    _runId: 'run-arch-approval',
    run_id: 'run-arch-approval',
    repo_root: dir,
    fallback_model: 'gpt-5.4',
    paths: {
      swarm_dir: path.join(dir, '.swarm'),
      modules_dir: path.join(dir, '.swarm', 'modules'),
      progress_file: path.join(dir, '.swarm', 'progress.json'),
    },
    arch_validation: { enabled: true, agent_enabled: false, timeout_minutes: 1, model: 'gpt-5.4' },
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
      validatorDefinition('validator:architecture', calls, { findings: [finding] }),
    ],
  }).registry;
  const discordCalls = [];
  const approvalCalls = [];
  const progress = {
    project: 'pipeline-arch-approval',
    arch_validation: { enabled: true, approval_gate: { timeout_minutes: 5 } },
    modules: { '01-app': { title: 'App', dir: '01-app' } },
    gates: { 'operator-approval': { type: 'approval', title: 'Operator approval', timeout_minutes: 5, on_timeout: 'block' } },
    execution_order: ['module:01-app', 'gate:operator-approval'],
  };

  const result = await preparePipelineStart(config, progress, {
    deps: {
      pipelineRunner: {
        discord: async (_config, level, title, description, fields) => {
          discordCalls.push({ level, title, description, fields });
        },
        runGate: async (_config, currentProgress, gateId, gateOpts) => {
          approvalCalls.push({ gateId, gate: currentProgress.gates[gateId], opts: gateOpts });
          return buildPipelineStepResult({
            stepType: 'gate',
            stepId: gateId,
            nextAction: 'continue',
            outcome: 'passed',
            summary: 'Architecture findings approved',
            terminalAction: 'none',
            terminalScope: 'gate',
          });
        },
      },
    },
  });

  assert.equal(result, null);
  assert.deepEqual(calls, ['validator:architecture']);
  assert.equal(discordCalls.length, 1);
  assert.equal(discordCalls[0].title, 'Architecture Validator started');
  assert.equal(approvalCalls.length, 1);
  assert.equal(approvalCalls[0].gateId, 'architecture-approval');
  assert.equal(approvalCalls[0].opts.attempt, 1);
  assert.match(approvalCalls[0].gate.description, /MODULE_BOUNDARY_BLUR/);
  assert.equal(progress.execution_order[0], 'gate:architecture-approval');
});

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

test('completePipeline repairs stale terminal artifacts for completed resumed runs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-terminal-repair-'));
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
  const latestPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'latest.json');
  const runTelemetryPath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'pipeline.jsonl');

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
    completed: [
      { stage_id: 'generator:project_summary', completed_at: '2026-06-03T00:00:00.000Z' },
      { stage_id: 'generator:pipeline_review', completed_at: '2026-06-03T00:00:00.000Z' },
      { stage_id: 'generator:case_study', completed_at: '2026-06-03T00:00:00.000Z' },
    ],
  }, null, 2));
  fs.mkdirSync(path.dirname(latestPath), { recursive: true });
  fs.writeFileSync(latestPath, JSON.stringify({
    run_id: config._runId,
    pipeline_run_id: config._runId,
    status: 'running',
    terminal_status: null,
  }, null, 2));
  config._terminalGeneratorRunState = undefined;

  const exitCode = await completePipeline(config, progress);

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, []);
  const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  assert.equal(latest.status, 'completed');
  assert.equal(latest.terminal_status, 'succeeded');
  const telemetryEvents = fs.readFileSync(runTelemetryPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(telemetryEvents.some((event) => event.type === 'pipeline.completed'), true);
});

test('completePipeline does not run terminal generators after a persisted terminal halt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-existing-halt-'));
  const calls = [];
  const outputs = [];
  const config = completedRunConfig(dir, calls);
  const progress = { modules: {}, gates: {}, execution_order: [] };

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  appendPipelineLifecycleEvent(config, 'pipeline_run.halted', {
    progress,
    result: {
      terminal_status: 'timed_out',
      terminal_decision: { reasonCode: 'timeout' },
      reason: 'Pipeline review timed out',
    },
    stepType: 'generator',
    stepId: 'pipeline_review',
    haltReason: 'timeout',
  });

  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        output(payload) {
          outputs.push(payload);
        },
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, []);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].halted_existing, true);
  assert.equal(outputs[0].terminal_status, 'timed_out');
  assert.equal(outputs[0].step_type, 'generator');
  assert.equal(outputs[0].step_id, 'pipeline_review');
});

test('completePipeline halts when configured final preview lacks final-buster URL evidence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-final-preview-missing-'));
  const calls = [];
  const outputs = [];
  const config = completedRunConfig(dir, calls);
  const progress = {
    modules: {},
    gates: {
      'final-buster': {
        type: 'buster',
        title: 'Final Buster',
        test_config: {
          k8s: {
            purpose: 'final-preview',
            preview: { provider: 'tailscale-ingress' },
          },
        },
      },
    },
    execution_order: ['gate:final-buster'],
  };

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        writeSummary: () => ({}),
        output(payload) {
          outputs.push(payload);
        },
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, []);

  const readModels = JSON.parse(fs.readFileSync(path.join(
    config.paths.swarm_dir,
    'logs',
    'pipeline',
    'runs',
    config._runId,
    'lifecycle',
    'read-models.json',
  ), 'utf8'));
  assert.equal(readModels.pipeline.status, 'HALTED');
  assert.equal(readModels.pipeline.step_type, 'pipeline');
  assert.equal(readModels.pipeline.step_id, 'final_preview_delivery');
  assert.equal(readModels.pipeline.halt_reason, 'final_preview_url_missing');
  assert.equal(outputs.at(-1).terminal_status, 'failed');
  assert.equal(outputs.at(-1).terminal_decision.reasonCode, 'final_preview_url_missing');
});

test('completePipeline writes summary before terminal generators and completes after they pass', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-terminal-order-'));
  const calls = [];
  const config = completedRunConfig(dir, calls);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const summaryPath = path.join(config.paths.swarm_dir, 'runs', config._runId, 'summary.json');

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  calls.inspect = (stageId) => {
    if (stageId !== 'generator:pipeline_review') return;
    const readModels = JSON.parse(fs.readFileSync(path.join(
      config.paths.swarm_dir,
      'logs',
      'pipeline',
      'runs',
      config._runId,
      'lifecycle',
      'read-models.json',
    ), 'utf8'));
    assert.notEqual(readModels.pipeline.status, 'COMPLETED');
    assert.equal(fs.existsSync(summaryPath), true);
  };

  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        writeSummary() {
          fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
          fs.writeFileSync(summaryPath, JSON.stringify({ ok: true }, null, 2));
          return { failed: false };
        },
        output() {},
      },
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.slice(), [
    'generator:project_summary',
    'generator:pipeline_review',
    'generator:case_study',
  ]);
});

test('completePipeline rechecks degraded evidence before recording clean completion', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-completion-discord-degraded-'));
  const calls = [];
  const outputs = [];
  const config = completedRunConfig(dir, calls);
  const progress = {
    modules: {},
    gates: {},
    execution_order: [],
    real_e2e: { execution_boundary: 'final-buster' },
  };
  const pipelineJsonl = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'pipeline.jsonl');
  calls.inspect = (stageId) => {
    if (stageId !== 'generator:project_summary') return;
    fs.mkdirSync(path.dirname(pipelineJsonl), { recursive: true });
    fs.appendFileSync(pipelineJsonl, JSON.stringify({
      v: 1,
      type: 'observability.degraded',
      run_id: config._runId,
      project: config.project,
      component: 'discord',
      surface: 'webhook',
      reason: 'webhook_delivery_failed',
      detail: 'completion Discord delivery failed',
    }) + '\n');
  };

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        writeSummary() {
          return { failed: false };
        },
        output(payload) {
          outputs.push(payload);
        },
      },
    },
  });

  const lifecyclePath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'lifecycle', 'canonical-events.jsonl');
  const events = fs.readFileSync(lifecyclePath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const halted = events.find((event) => event.type === 'pipeline_run.halted');
  const completed = events.find((event) => event.type === 'pipeline_run.completed');

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.slice(), ['generator:project_summary']);
  assert.equal(halted?.data?.step_type, 'pipeline');
  assert.equal(halted?.data?.step_id, 'degraded_evidence');
  assert.equal(halted?.data?.terminal_decision?.reasonCode, 'degraded_evidence_requires_handoff');
  assert.equal(completed, undefined);
  assert.equal(outputs[0].terminal_decision.reasonCode, 'degraded_evidence_requires_handoff');
});

test('completePipeline halts with generator timeout before recording clean completion', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-generator-timeout-'));
  const calls = [];
  calls.failStage = 'generator:pipeline_review';
  const outputs = [];
  const config = completedRunConfig(dir, calls);
  const progress = { modules: {}, gates: {}, execution_order: [] };

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        output(payload) {
          outputs.push(payload);
        },
        writeSummary: () => ({}),
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.slice(), [
    'generator:project_summary',
    'generator:pipeline_review',
  ]);
  const terminalOutput = outputs.find((payload) => payload?.terminal_status === 'timed_out' || payload?.terminal?.status === 'timed_out');
  assert.ok(terminalOutput);
  assert.equal(terminalOutput.step_type, 'generator');
  assert.equal(terminalOutput.step_id, 'generator:pipeline_review');
  assert.equal(terminalOutput.terminal_decision.reasonCode, 'timeout');

  const readModels = JSON.parse(fs.readFileSync(path.join(
    config.paths.swarm_dir,
    'logs',
    'pipeline',
    'runs',
    config._runId,
    'lifecycle',
    'read-models.json',
  ), 'utf8'));
  assert.equal(readModels.pipeline.status, 'HALTED');
  assert.equal(readModels.pipeline.step_type, 'generator');
  assert.equal(readModels.pipeline.step_id, 'generator:pipeline_review');
  assert.equal(readModels.pipeline.terminal_status, 'timed_out');
});

test('completePipeline blocks clean E2E success when required Discord receipt is missing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-discord-receipt-'));
  const generatorCalls = [];
  const config = completedRunConfig(dir, generatorCalls);
  config._runId = 'run-discord-receipt-required';
  config.run_id = 'run-discord-receipt-required';
  const progress = {
    modules: {},
    gates: {},
    execution_order: [],
    evidence: {
      require_discord_delivery_receipt: true,
    },
  };
  const outputs = [];
  const summaries = [];

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });

  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        output(payload) {
          outputs.push(payload);
        },
        writeSummary(_config, terminalStatus, reasonCode) {
          summaries.push({ terminalStatus, reasonCode });
          return { failed: false };
        },
        async injectNeedsNova() {},
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(generatorCalls, [
    'generator:project_summary',
  ]);
  assert.equal(outputs[0].terminal_status, 'blocked');
  assert.equal(outputs[0].terminal_decision.reasonCode, 'degraded_evidence_requires_handoff');
  assert.equal(outputs[0].degraded_evidence[0].code, 'discord_delivery_receipt_missing');
  assert.equal(outputs[0].degraded_evidence[0].action_required.includes('canonical restored or acknowledged evidence'), true);
  assert.equal(summaries.at(-1).reasonCode, 'degraded_evidence_requires_handoff');
});

test('completePipeline blocks clean success with unresolved observability degraded evidence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-observability-degraded-'));
  const config = completedRunConfig(dir, []);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const runPipelineJsonl = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'pipeline.jsonl');
  const outputs = [];

  fs.mkdirSync(path.dirname(runPipelineJsonl), { recursive: true });
  fs.writeFileSync(runPipelineJsonl, JSON.stringify({
    v: 1,
    type: 'observability.degraded',
    run_id: config._runId,
    project: config.project,
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_url_missing',
    detail: 'discord webhook delivery skipped: config.discord_webhook_url is missing',
  }) + '\n');

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        output(payload) {
          outputs.push(payload);
        },
        writeSummary: () => ({}),
        async injectNeedsNova() {},
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(outputs[0].terminal_status, 'blocked');
  assert.equal(outputs[0].terminal_decision.reasonCode, 'degraded_evidence_requires_handoff');
  assert.equal(outputs[0].degraded_evidence[0].code, 'webhook_url_missing');
  assert.equal(outputs[0].degraded_evidence[0].surface, 'discord:webhook');
});

test('completePipeline accepts restored observability degraded evidence with matching health key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-observability-restored-'));
  const calls = [];
  const config = completedRunConfig(dir, calls);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const runPipelineJsonl = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'pipeline.jsonl');

  fs.mkdirSync(path.dirname(runPipelineJsonl), { recursive: true });
  fs.writeFileSync(runPipelineJsonl, [
    {
      v: 1,
      type: 'observability.degraded',
      run_id: config._runId,
      project: config.project,
      component: 'telemetry_sink',
      surface: 'builtin.telemetry.redis',
      reason: 'telemetry_sink_failed',
      detail: 'telemetry sink timed out',
      impacted_event_type: 'agent.tool.started',
      degraded_at: '2026-07-11T13:56:31.877Z',
    },
    {
      v: 1,
      type: 'observability.restored',
      run_id: config._runId,
      project: config.project,
      component: 'telemetry_sink',
      surface: 'builtin.telemetry.redis',
      reason: 'telemetry_sink_failed',
      detail: 'telemetry sink restored',
      gate_id: 'module-review',
      gate_type: 'review',
      impacted_event_type: 'gate.started',
      restored_at: '2026-07-11T13:56:31.885Z',
    },
  ].map((entry) => JSON.stringify(entry)).join('\n') + '\n');

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        output() {},
        writeSummary: () => ({}),
      },
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    'generator:project_summary',
    'generator:pipeline_review',
    'generator:case_study',
  ]);
});

test('completePipeline keeps degraded evidence unresolved when restored health key differs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-observability-restored-mismatch-'));
  const calls = [];
  const config = completedRunConfig(dir, calls);
  const progress = { modules: {}, gates: {}, execution_order: [] };
  const runPipelineJsonl = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config._runId, 'pipeline.jsonl');
  const outputs = [];

  fs.mkdirSync(path.dirname(runPipelineJsonl), { recursive: true });
  fs.writeFileSync(runPipelineJsonl, [
    {
      v: 1,
      type: 'observability.degraded',
      run_id: config._runId,
      project: config.project,
      component: 'telemetry_sink',
      surface: 'builtin.telemetry.redis',
      reason: 'telemetry_sink_failed',
      detail: 'telemetry sink timed out',
    },
    {
      v: 1,
      type: 'observability.restored',
      run_id: config._runId,
      project: config.project,
      component: 'telemetry_sink',
      surface: 'builtin.telemetry.redis',
      reason: 'telemetry_sink_registry_failed',
      detail: 'different telemetry sink issue restored',
    },
  ].map((entry) => JSON.stringify(entry)).join('\n') + '\n');

  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress });
  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        output(payload) {
          outputs.push(payload);
        },
        writeSummary: () => ({}),
        async injectNeedsNova() {},
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(outputs[0].terminal_decision.reasonCode, 'degraded_evidence_requires_handoff');
  assert.equal(outputs[0].degraded_evidence[0].code, 'telemetry_sink_failed');
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

test('resolveGateTargetModule infers the reviewed module from execution order', () => {
  const progress = {
    execution_order: ['01-foundation', 'gate:module-01-review', '02-content-polish'],
    modules: {
      '01-foundation': { dir: '01-foundation' },
      '02-content-polish': { dir: '02-content-polish' },
    },
    gates: {
      'module-01-review': { type: 'review' },
    },
  };

  assert.deepEqual(resolveGateTargetModule(progress, 'module-01-review'), {
    moduleId: '01-foundation',
    moduleDir: '01-foundation',
    source: 'execution_order',
  });
});

test('scheduled review-gate full_lint carries the target module directory into validator input', async () => {
  const capturedInputs = [];
  const config = {
    project: 'pipeline-runner-test',
    _runId: 'run-review-gate-validator',
    run_id: 'run-review-gate-validator',
    paths: { swarm_dir: path.join(os.tmpdir(), 'pipeline-runner-test-swarm') },
    pluginRegistry: {
      enabled: true,
      stageOwners: {
        'validator.run': {
          'validator:full_lint': {
            manifest: {
              moduleId: 'test.validator.full_lint',
              kind: 'validator',
              hookFamily: 'validator.run',
              stageIds: ['validator:full_lint'],
              capabilities: [],
              sourceType: 'local',
              trustTier: 'trusted',
            },
            implementation: {
              run: async ({ input }) => {
                capturedInputs.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'validator',
                  producerType: 'full_lint',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: 'Full lint passed',
                    typed: { validator: { outcomeClass: 'passed' } },
                  },
                };
              },
            },
          },
        },
      },
    },
  };
  const progress = {
    execution_order: ['01-foundation', 'gate:review'],
    modules: {
      '01-foundation': { dir: 'Projects/app/src/modules/01-foundation', title: 'Foundation' },
    },
    gates: {
      review: { type: 'review', lint_tier: 'full' },
    },
  };

  const result = await runScheduledValidator(config, progress, 'validator:full_lint', {
    scope: 'module',
    moduleId: '01-foundation',
    gateId: 'review',
    scheduleKey: 'mandatory:before:gate:review:validator:full_lint',
    scheduleReason: 'mandatory_full_lint_before_review',
    validatorConfig: { tier: 'full' },
  });

  assert.equal(result.nextAction, 'pass');
  assert.equal(capturedInputs.length, 1);
  assert.equal(capturedInputs[0].ids.scope, 'module');
  assert.equal(capturedInputs[0].ids.moduleDir, 'Projects/app/src/modules/01-foundation');
  assert.equal(capturedInputs[0].executionContext.moduleDir, 'Projects/app/src/modules/01-foundation');
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
