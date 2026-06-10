import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
  runGateViaRegistry,
} from '../../lib/lifecycle-audit-lib.mjs';

function getFieldValue(fields = [], name) {
  return fields.find((field) => field.name === name)?.value;
}

function gateRuntimeEvents(xaddEvents, streamKey) {
  return xaddEvents(streamKey)
    .filter((event) => !String(event.type || '').startsWith('plugin.gate.'))
    .map((event, index) => ({ ...event, seq: index + 1 }));
}

function stepExit(result) {
  const status = result?.terminal?.status ?? result?.terminal_status ?? null;
  return status === "succeeded" ? 0 : (status ? 1 : null);
}

function stepSummary(result) {
  return result?.diagnostics?.summary;
}

function stepMetadata(result) {
  return result?.diagnostics?.metadata || {};
}

function stepGateStatus(result) {
  return result?.diagnostics?.typed?.controlResult?.diagnostics?.typed?.gate?.gateRunStatus;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

function platformTestDefaults() {
  return {
    fallback_model: 'fallback-model',
    rate_limit: { max_pauses_per_module: 3, cooldown_hours: 0 },
    review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
  };
}

export async function registerGatesArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
}) {
  await record('review gates execute through gate stage owners and preserve pass semantics', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const gateCalls = [];
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'gate.execute': {
          ...registry.stageOwners['gate.execute'],
          'gate:review': {
            ...registry.stageOwners['gate.execute']['gate:review'],
            implementation: {
              execute: async ({ input }) => {
                gateCalls.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'gate',
                  producerType: 'review',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: 'Review gate passed',
                    findings: [],
                    metadata: {
                      gate_id: 'gate:review',
                      gate_type: 'review',
                    },
                    typed: {
                      gate: {
                        schemaVersion: 'v1',
                        gateRunStatus: 'PASS',
                        outcomeClass: 'passed',
                      },
                    },
                  },
                };
              },
            },
          },
        },
      },
    };

    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-stage-pass-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-review-stage-pass-1';

        const deps = {
        gateRunner: {
          runners: {
            review: async () => {
              throw new Error('direct review runner fallback should not run when stage owner is registered');
            },
          },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-stage-pass',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
          };

    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
          output_file: 'review-output.json',
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:review', { deps });

    assert.equal(result.kind, 'pipeline_step_result');
    assert.equal(result.nextAction, 'continue');
    assert.equal(result.outcome, 'passed');
    assert.equal(stepExit(result), 0);
    assert.equal(stepGateStatus(result), 'PASS');
    assert.equal(result.correlation.gate_id, 'gate:review');
    assert.equal(result.correlation.gate_type, 'review');
    assert.equal(gateCalls.length, 1);
    assert.equal(gateCalls[0].ids.stageId, 'gate:review');
    assert.equal(gateCalls[0].ids.gateId, 'gate:review');
    assert.equal(gateCalls[0].ids.gateType, 'review');
    assert.equal(gateCalls[0].refs.gateEvaluationRef, 'gate_evaluation:run-review-stage-pass-1:gate:review:1');
    assert.equal(gateCalls[0].executionContext.novaPromptProvided, false);
  });

  await record('gate type owners fail closed when their registry stage owner is missing', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const gateExecuteOwners = { ...registry.stageOwners['gate.execute'] };
    delete gateExecuteOwners['gate:review'];
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'gate.execute': gateExecuteOwners,
      },
    };

    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-stage-owner-missing-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-review-stage-owner-missing-1';
        const configDeps2 = {
        gateRunner: {
          runners: {
            review: async () => {
              throw new Error('direct review runner fallback should not run when registry stage owner is missing');
            },
          },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-stage-owner-missing',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
          };
    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:review', { deps: configDeps2 });
    await flushAsync();

    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), "Review gate execution failed: No registered plugin owner found for hookFamily 'gate.execute' stage 'gate:review' in the startup-frozen registry.");

    const streamKey = 'pipeline:telemetry:behavior-review-stage-owner-missing:run-review-stage-owner-missing-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[0].gate_id, 'gate:review');
    assert.equal(events[0].gate_type, 'review');
    assert.equal(events[1].gate_id, 'gate:review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].reason, stepSummary(result));
  });

  await record('review gate stage-owner block results preserve current NEEDS_NOVA correlation', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'gate.execute': {
          ...registry.stageOwners['gate.execute'],
          'gate:review': {
            ...registry.stageOwners['gate.execute']['gate:review'],
            implementation: {
              execute: async () => ({
                schemaVersion: 'v1',
                producerKind: 'gate',
                producerType: 'review',
                nextAction: 'block',
                issueType: 'code',
                diagnostics: {
                  summary: 'Review gate needs Nova guidance',
                  findings: [],
                  metadata: {
                    attempt: 2,
                    fix_cycles: 1,
                    gateway_label: 'echo-review-gate-2',
                    session_key: 'agent:main:acp:review-gate-2',
                  },
                  typed: {
                    gate: {
                      schemaVersion: 'v1',
                      gateRunStatus: 'FAIL',
                      outcomeClass: 'needs_nova',
                    },
                  },
                },
              }),
            },
          },
        },
      },
    };

    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-stage-block-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-review-stage-block-1';

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-stage-block',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    };

    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:review', {});

    assert.equal(result.kind, 'pipeline_step_result');
    assert.equal(result.nextAction, 'halt');
    assert.equal(result.outcome, 'needs_nova');
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), 'Review gate needs Nova guidance');
    assert.equal(stepMetadata(result).attempt, 2);
    assert.equal(stepMetadata(result).fix_cycles, 1);
    assert.equal(stepMetadata(result).gateway_label, 'echo-review-gate-2');
    assert.equal(stepMetadata(result).session_key, 'agent:main:acp:review-gate-2');
    assert.equal(result.correlation.gate_id, 'gate:review');
    assert.equal(result.correlation.gate_type, 'review');
  });

  await record('review gate request_fix stage contracts fail closed when remediation payload is missing', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'gate.execute': {
          ...registry.stageOwners['gate.execute'],
          'gate:review': {
            ...registry.stageOwners['gate.execute']['gate:review'],
            implementation: {
              execute: async () => ({
                schemaVersion: 'v1',
                producerKind: 'gate',
                producerType: 'review',
                nextAction: 'request_fix',
                issueType: 'code',
                diagnostics: {
                  summary: 'Review gate requested remediation without payload',
                  findings: [],
                  metadata: {},
                  typed: {
                    gate: {
                      schemaVersion: 'v1',
                      gateRunStatus: 'FAIL',
                      outcomeClass: 'fix_requested',
                    },
                  },
                },
              }),
            },
          },
        },
      },
    };

    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-stage-invalid-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-review-stage-invalid-1';

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-stage-invalid',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    };

    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:review', {});
    await flushAsync();

    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), 'Review gate execution failed: Review gate returned invalid control result: request_fix for gate:review requires diagnostics.typed.remediation');
    assert.equal(result.diagnostics.contract_invalid, true);
    assert.equal(result.diagnostics.contract_diagnostic.diagnosticType, 'plugin_contract_invalid');
    assert.equal(result.diagnostics.contract_diagnostic.stageId, 'gate:review');
    assert.deepEqual(result.diagnostics.contract_diagnostic.validationErrors, ['request_fix for gate:review requires diagnostics.typed.remediation']);

    const streamKey = 'pipeline:telemetry:behavior-review-stage-invalid:run-review-stage-invalid-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[0].gate_id, 'gate:review');
    assert.equal(events[0].gate_type, 'review');
    assert.equal(events[1].gate_id, 'gate:review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].reason, 'Review gate execution failed: Review gate returned invalid control result: request_fix for gate:review requires diagnostics.typed.remediation');
  });

  await record('gate plugin boundary rejects contradictory typed results', async () => {
    for (const contractCase of [
      {
        name: 'legacy-exit-shape',
        rawResult: { exit: 0, status: 'FAIL', reason: 'legacy shape must not be coerced at plugin boundary' },
        expected: 'plugin output must be a typed gate control result',
      },
      {
        name: 'pass-with-fail-status',
        rawResult: {
          schemaVersion: 'v1',
          producerKind: 'gate',
          producerType: 'review',
          nextAction: 'pass',
          diagnostics: {
            summary: 'Contradictory pass',
            findings: [],
            metadata: {},
            typed: { gate: { schemaVersion: 'v1', gateRunStatus: 'FAIL', outcomeClass: 'passed' } },
          },
        },
        expected: "pass for review cannot report failing gateRunStatus 'FAIL'",
      },
      {
        name: 'block-without-diagnostics',
        rawResult: {
          schemaVersion: 'v1',
          producerKind: 'gate',
          producerType: 'review',
          nextAction: 'block',
          issueType: 'code',
        },
        expected: 'diagnostics must be an object',
      },
    ]) {
      const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
      installFakeRedis(gateRuntimeRoot);
      globalThis.__fakeRedisCalls = [];
      globalThis.__fakeRedisCounters = Object.create(null);

      const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
      const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
      const registry = await buildBuiltInRegistry(gateRuntimeRoot);
      const testRegistry = {
        ...registry,
        stageOwners: {
          ...registry.stageOwners,
          'gate.execute': {
            ...registry.stageOwners['gate.execute'],
            'gate:review': {
              ...registry.stageOwners['gate.execute']['gate:review'],
              implementation: { execute: async () => contractCase.rawResult },
            },
          },
        },
      };

      const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), `behavior-gate-plugin-contract-${contractCase.name}-`));
      const logDir = path.join(swarmDir, 'logs');
      const runId = `run-gate-plugin-contract-${contractCase.name}-1`;
      const config = {
        ...platformTestDefaults(),
        project: `behavior-gate-plugin-contract-${contractCase.name}`,
        paths: { swarm_dir: swarmDir, modules_dir: path.join(swarmDir, 'modules') },
        telemetry: { enabled: true },
        pluginRegistry: testRegistry,
        _runId: runId,
        run_id: runId,
        _runStats: runtimeCoreMod.createRunStats('2026-04-26T00:00:00.000Z'),
      };
      const progress = { modules: {}, gates: { 'gate:review': { type: 'review', title: 'Review Gate' } } };

      const result = await gateRunnerMod.runGate(config, progress, 'gate:review', {});
      await flushAsync();

      assert.notEqual(stepExit(result), 0);
      assert.equal(['error', 'needs_nova'].includes(result.outcome), true);
      assert.equal(result.correlation.gate_id, 'gate:review');
      assert.match(stepSummary(result), new RegExp(contractCase.expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(result.diagnostics.contract_invalid, true);
      assert.equal(result.diagnostics.contract_diagnostic.diagnosticType, 'plugin_contract_invalid');
      assert.equal(result.diagnostics.contract_diagnostic.stageId, 'gate:review');
      assert.equal(result.diagnostics.contract_diagnostic.validationErrors.some((entry) => entry.includes(contractCase.expected)), true);
      assert.equal(result.diagnostics.contract_diagnostic.rawResultPreview, undefined);
      assert.equal(result.diagnostics.contract_diagnostic.coercedResultPreview, undefined);
      assert.equal(result.diagnostics.contract_diagnostic.rawResultSummary?.redacted, true);

      const streamKey = `pipeline:telemetry:behavior-gate-plugin-contract-${contractCase.name}:${runId}`;
      const events = gateRuntimeEvents(xaddEvents, streamKey);
      assert.equal(events.some((event) => event.type === 'gate.verdict' && String(event.reason || '').includes(contractCase.expected)), true);
    }
  });

  await record('buster gates execute through gate stage owners and preserve reconciliation snapshot parity', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const gateCalls = [];
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'gate.execute': {
          ...registry.stageOwners['gate.execute'],
          'gate:buster': {
            ...registry.stageOwners['gate.execute']['gate:buster'],
            implementation: {
              execute: async ({ input }) => {
                gateCalls.push(input);
                return {
                  schemaVersion: 'v1',
                  producerKind: 'gate',
                  producerType: 'buster',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: 'Buster gate passed',
                    findings: [],
                    metadata: {
                      completion_source: 'gate_status',
                      gate_id: 'gate:buster',
                      gate_type: 'buster',
                    },
                    typed: {
                      gate: {
                        schemaVersion: 'v1',
                        gateRunStatus: 'PASS',
                        outcomeClass: 'passed',
                      },
                    },
                  },
                };
              },
            },
          },
        },
      },
    };

    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-stage-pass-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-buster-stage-pass-1';
    fs.mkdirSync(path.join(swarmDir, 'gates'), { recursive: true });
    fs.writeFileSync(
      path.join(swarmDir, 'gates', 'gate-buster-output.json'),
      JSON.stringify({ status: 'FAIL', reason: 'stale failure' }, null, 2),
    );
    fs.writeFileSync(
      path.join(swarmDir, 'gate:buster-gate-status.json'),
      JSON.stringify({ status: 'PASS', source: 'gate-status-fallback' }, null, 2),
    );

        const configDeps3 = {
        gateRunner: {
          runners: {
            buster: async () => {
              throw new Error('direct buster runner fallback should not run when stage owner is registered');
            },
          },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-stage-pass',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
          };

    const progress = {
      modules: {},
      gates: {
        'gate:buster': {
          type: 'buster',
          title: 'Buster Gate',
          output_file: 'gates/gate-buster-output.json',
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:buster', { deps: configDeps3 });

    assert.equal(stepExit(result), 0);
    assert.equal(stepGateStatus(result), 'PASS');
    assert.equal(stepMetadata(result).completion_source, 'gate_status');
    assert.equal(result.correlation.gate_id, 'gate:buster');
    assert.equal(result.correlation.gate_type, 'buster');
    assert.equal(gateCalls.length, 1);
    assert.equal(gateCalls[0].ids.stageId, 'gate:buster');
    assert.equal(gateCalls[0].ids.gateId, 'gate:buster');
    assert.equal(gateCalls[0].ids.gateType, 'buster');
    assert.equal(gateCalls[0].refs.gateEvaluationRef, 'gate_evaluation:run-buster-stage-pass-1:gate:buster:1');
    assert.equal(gateCalls[0].stateSnapshot.gate.gate_completion_is_pass, false);
    assert.equal(gateCalls[0].stateSnapshot.gate.gate_completion_source, null);
    assert.equal(gateCalls[0].stateSnapshot.gate.output_status, 'FAIL');
    assert.equal(Object.prototype.hasOwnProperty.call(gateCalls[0].stateSnapshot.diagnostics, 'gate_status'), false);
  });

  await record('buster gate stage-owner block results preserve failure classification and correlation', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'gate.execute': {
          ...registry.stageOwners['gate.execute'],
          'gate:buster': {
            ...registry.stageOwners['gate.execute']['gate:buster'],
            implementation: {
              execute: async () => ({
                schemaVersion: 'v1',
                producerKind: 'gate',
                producerType: 'buster',
                nextAction: 'block',
                issueType: 'code',
                diagnostics: {
                  summary: "Gate 'gate:buster' failed after 2 fix attempts",
                  findings: [],
                  metadata: {
                    reason: "Gate 'gate:buster' failed after 2 fix attempts",
                    failure_class: 'fix_loop_exhausted',
                    fix_attempts: 2,
                    gateway_label: 'buster-gate-stage-block-2',
                    session_key: 'agent:main:acp:buster-gate-stage-block-2',
                    dispatch_id: 'dispatch-buster-stage-block-2',
                    gate_id: 'gate:buster',
                    gate_type: 'buster',
                  },
                  typed: {
                    gate: {
                      schemaVersion: 'v1',
                      gateRunStatus: 'FAIL',
                      outcomeClass: 'needs_nova',
                    },
                  },
                },
              }),
            },
          },
        },
      },
    };

    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-stage-block-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-buster-stage-block-1';

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-stage-block',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    };

    const progress = {
      modules: {},
      gates: {
        'gate:buster': {
          type: 'buster',
          title: 'Buster Gate',
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:buster', {});

    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), "Gate 'gate:buster' failed after 2 fix attempts");
    assert.equal(stepMetadata(result).failure_class, 'fix_loop_exhausted');
    assert.equal(stepMetadata(result).fix_attempts, 2);
    assert.equal(stepMetadata(result).gateway_label, 'buster-gate-stage-block-2');
    assert.equal(stepMetadata(result).session_key, 'agent:main:acp:buster-gate-stage-block-2');
    assert.equal(stepMetadata(result).dispatch_id, 'dispatch-buster-stage-block-2');
    assert.equal(result.correlation.gate_id, 'gate:buster');
    assert.equal(result.correlation.gate_type, 'buster');
  });

  await record('buster gate request_fix stage contracts fail closed when remediation payload is missing', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'gate.execute': {
          ...registry.stageOwners['gate.execute'],
          'gate:buster': {
            ...registry.stageOwners['gate.execute']['gate:buster'],
            implementation: {
              execute: async () => ({
                schemaVersion: 'v1',
                producerKind: 'gate',
                producerType: 'buster',
                nextAction: 'request_fix',
                issueType: 'code',
                diagnostics: {
                  summary: 'Buster gate requested remediation without payload',
                  findings: [],
                  metadata: {},
                  typed: {
                    gate: {
                      schemaVersion: 'v1',
                      gateRunStatus: 'FAIL',
                      outcomeClass: 'fix_requested',
                    },
                  },
                },
              }),
            },
          },
        },
      },
    };

    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-stage-invalid-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-buster-stage-invalid-1';

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-stage-invalid',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      pluginRegistry: testRegistry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    };

    const progress = {
      modules: {},
      gates: {
        'gate:buster': {
          type: 'buster',
          title: 'Buster Gate',
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:buster', {});
    await flushAsync();

    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), 'Buster gate execution failed: Buster gate returned invalid control result: request_fix for gate:buster requires diagnostics.typed.remediation');

    const streamKey = 'pipeline:telemetry:behavior-buster-stage-invalid:run-buster-stage-invalid-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[0].gate_id, 'gate:buster');
    assert.equal(events[0].gate_type, 'buster');
    assert.equal(events[1].gate_id, 'gate:buster');
    assert.equal(events[1].gate_type, 'buster');
    assert.equal(events[1].reason, 'Buster gate execution failed: Buster gate returned invalid control result: request_fix for gate:buster requires diagnostics.typed.remediation');
  });

  await record('pipeline scheduler rejects review non-JSON output instead of treating existence as pass', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner-scheduling.ts');
    const statusStoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-nonjson-invalid-'));
    const outputPath = path.join(swarmDir, 'review-output.md');
    fs.writeFileSync(outputPath, '# Review complete\nLooks good.\n');

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-nonjson-invalid',
      _runId: 'run-review-nonjson-invalid-1',
      run_id: 'run-review-nonjson-invalid-1',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    const progress = {
      execution_order: ['gate:review'],
      modules: {},
      gates: {
        review: {
          type: 'review',
          title: 'Review Gate',
          output_file: 'review-output.md',
        },
      },
    };

    const output = statusStoreMod.readGateOutput(config, progress.gates.review);
    assert.equal(output.exists, true);
    assert.equal(output.isPass, false);
    assert.equal(output.invalid_contract, true);
    assert.equal(output.parse_error, true);
    assert.equal(output.invalid_reason, 'invalid_json');

    const projected = statusStoreMod.projectGateSchedulerState(config, 'review', progress.gates.review);
    assert.equal(projected.status, 'INVALID_OUTPUT');
    assert.equal(projected.scheduler_consumed, false);
    assert.equal(projected.scheduler_drift.some((entry) => entry.code === 'gate_output_invalid_contract'), true);

    const next = pipelineRunnerMod.findNextStep(config, progress);
    assert.deepEqual(next, { type: 'gate', id: 'review' });
  });

  await record('gate output projection rejects missing or unknown status contracts', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);

    const statusStoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-output-contract-'));

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-gate-output-contract',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
    };

    const missingStatusGate = { type: 'buster', title: 'Missing Status Gate', output_file: 'missing-status.json' };
    fs.writeFileSync(path.join(swarmDir, missingStatusGate.output_file), JSON.stringify({ summary: 'looks done' }, null, 2));
    const missingStatus = statusStoreMod.projectGateCompletionState(config, 'missing-status', missingStatusGate);
    assert.equal(missingStatus.done, true);
    assert.equal(missingStatus.ok, false);
    assert.equal(missingStatus.outcome, 'invalid_contract');
    assert.equal(missingStatus.data.invalid_reason, 'missing_status');

    const unknownStatusGate = { type: 'buster', title: 'Unknown Status Gate', output_file: 'unknown-status.json' };
    fs.writeFileSync(path.join(swarmDir, unknownStatusGate.output_file), JSON.stringify({ status: 'MAYBE', summary: 'ambiguous' }, null, 2));
    const unknownStatus = statusStoreMod.projectGateCompletionState(config, 'unknown-status', unknownStatusGate);
    assert.equal(unknownStatus.done, true);
    assert.equal(unknownStatus.ok, false);
    assert.equal(unknownStatus.outcome, 'invalid_contract');
    assert.equal(unknownStatus.data.invalid_reason, 'unknown_status');
  });

  await record('buster gate invalid output contract fails closed without entering fix loop', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-invalid-output-'));
    const logDir = path.join(swarmDir, 'logs');
    const runId = 'run-buster-invalid-output-1';
    fs.writeFileSync(path.join(swarmDir, 'gate-instructions.md'), 'Run the final Buster gate.');

        const configDeps4 = {
        busterGate: {
          resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
          logEffectivePolicy: () => {},
          discord: async () => {},
          gitCommitAndPush: async () => {},
          runOnce: async (deps, _config, _progress, gateId) => deps.pollResult(false, 'invalid_contract', {
            gate: gateId,
            status: 'INVALID_OUTPUT',
            reason: 'Gate output contract invalid: missing_status',
            invalid_reason: 'missing_status',
            run_id: runId,
            attempt: 1,
            dispatch_id: 'dispatch-invalid-output',
            gateway_label: 'buster-invalid-output',
            session_key: 'session-invalid-output',
            _source: 'output_file',
          }),
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-invalid-output',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
      },
      telemetry: { enabled: true },
      default_timeout_minutes: 5,
      poll_interval_seconds: 0,
      pluginRegistry: registry,
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-26T00:00:00.000Z'),
          };

    const progress = {
      modules: {},
      gates: {
        'gate:buster': {
          type: 'buster',
          title: 'Buster Gate',
          instructions_file: 'gate-instructions.md',
          output_file: 'gate-output.json',
          on_fail: 'fix_and_retest',
          max_fix_cycles: 2,
        },
      },
    };

    const result = await gateRunnerMod.runGate(config, progress, 'gate:buster', { deps: configDeps4 });
    await flushAsync();

    assert.equal(stepExit(result), 1);
    assert.equal(stepMetadata(result).failure_class, 'invalid_contract');
    assert.equal(stepSummary(result), 'Gate output contract invalid: missing_status');
    assert.equal(result.correlation.gate_id, 'gate:buster');
    assert.equal(result.correlation.gate_type, 'buster');
    assert.equal(stepMetadata(result).dispatch_id, 'dispatch-invalid-output');
    assert.equal(stepMetadata(result).gateway_label, 'buster-invalid-output');
    assert.equal(stepMetadata(result).session_key, 'session-invalid-output');

    const streamKey = 'pipeline:telemetry:behavior-buster-invalid-output:run-buster-invalid-output-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.equal(events.some((event) => event.type === 'gate.verdict' && event.reason === 'Gate output contract invalid: missing_status'), true);
  });

  await record('missing gate registry dispatch errors still emit authoritative gate failure telemetry', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
  
    const config = {
      ...platformTestDefaults(),
      project: 'behavior-gate-registry-missing',
      telemetry: { enabled: true },
      _runId: 'run-gate-registry-missing-1',
      run_id: 'run-gate-registry-missing-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
    };
  
    const progress = {
      modules: {},
    };
  
    const result = await gateRunnerMod.runGate(config, progress, 'gate:missing', {});
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), "Gate registry missing in progress.json while dispatching 'gate:missing'");
  
    const streamKey = 'pipeline:telemetry:behavior-gate-registry-missing:run-gate-registry-missing-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.deepEqual(events.map((event) => event.seq), [1, 2]);
    assert.equal(events[0].gate_id, 'gate:missing');
    assert.equal(events[0].gate_type, null);
    assert.equal(events[1].gate_id, 'gate:missing');
    assert.equal(events[1].gate_type, null);
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].reason, "Gate registry missing in progress.json while dispatching 'gate:missing'");
  });
  
  await record('missing gate registry dispatch errors also emit correlated operator Discord alerts', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const discordCalls = [];
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-registry-missing-discord-'));
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-gate-registry-missing-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });

        const configDeps5 = {
        gateRunner: {
          discord: async (...args) => { discordCalls.push(args); },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-gate-registry-missing-discord',
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-gate-registry-missing-discord-1',
      run_id: 'run-gate-registry-missing-discord-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      modules: {},
    };
  
    const result = await gateRunnerMod.runGate(config, progress, 'gate:missing', { deps: configDeps5 });
    assert.equal(stepExit(result), 1);
    await flushAsync();
    const alert = readJsonl(path.join(runLogDir, 'discord.jsonl')).find((entry) => entry.title === 'Gate Dispatch Failed: gate:missing');
    assert.equal(Boolean(alert), true, 'missing missing-gate-registry dispatch Discord alert');
    assert.equal(alert.description, "Gate registry missing in progress.json while dispatching 'gate:missing'");
    assert.equal(alert.fields.some((field) => field.name === 'Run ID' && field.value === 'run-gate-registry-missing-discord-1'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate' && field.value === 'gate:missing'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate Type'), false);
  });
  
  await record('missing gate dispatch errors still emit authoritative gate failure telemetry', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-gate-missing',
      telemetry: { enabled: true },
      _runId: 'run-gate-missing-1',
      run_id: 'run-gate-missing-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
    };
  
    const progress = {
      modules: {},
      gates: {},
    };
  
    const result = await gateRunnerMod.runGate(config, progress, 'gate:missing', {});
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), "Gate 'gate:missing' not found in progress.json");
  
    const streamKey = 'pipeline:telemetry:behavior-gate-missing:run-gate-missing-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.deepEqual(events.map((event) => event.seq), [1, 2]);
    assert.equal(events[0].gate_id, 'gate:missing');
    assert.equal(events[0].gate_type, null);
    assert.equal(events[1].gate_id, 'gate:missing');
    assert.equal(events[1].gate_type, null);
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].reason, "Gate 'gate:missing' not found in progress.json");
  });
  
  await record('missing gate dispatch errors also emit correlated operator Discord alerts', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const discordCalls = [];
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-missing-discord-'));
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-gate-missing-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });

        const configDeps6 = {
        gateRunner: {
          discord: async (...args) => { discordCalls.push(args); },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-gate-missing-discord',
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-gate-missing-discord-1',
      run_id: 'run-gate-missing-discord-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      modules: {},
      gates: {},
    };
  
    const result = await gateRunnerMod.runGate(config, progress, 'gate:missing', { deps: configDeps6 });
    assert.equal(stepExit(result), 1);
    await flushAsync();
    const alert = readJsonl(path.join(runLogDir, 'discord.jsonl')).find((entry) => entry.title === 'Gate Dispatch Failed: gate:missing');
    assert.equal(Boolean(alert), true, 'missing missing-gate dispatch Discord alert');
    assert.equal(alert.description, "Gate 'gate:missing' not found in progress.json");
    assert.equal(alert.fields.some((field) => field.name === 'Run ID' && field.value === 'run-gate-missing-discord-1'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate' && field.value === 'gate:missing'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate Type'), false);
  });
  
  await record('gate dispatch errors still emit authoritative gate failure telemetry', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-gate-dispatch',
      telemetry: { enabled: true },
      _runId: 'run-gate-dispatch-1',
      run_id: 'run-gate-dispatch-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
    };
  
    const progress = {
      modules: {},
      gates: {
        'gate:unknown': { type: 'mystery', title: 'Mystery Gate' },
      },
    };
  
    const result = await gateRunnerMod.runGate(config, progress, 'gate:unknown', {});
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
  
    const streamKey = 'pipeline:telemetry:behavior-gate-dispatch:run-gate-dispatch-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.deepEqual(events.map((event) => event.seq), [1, 2]);
    assert.equal(events[0].gate_id, 'gate:unknown');
    assert.equal(events[0].gate_type, 'mystery');
    assert.equal(events[1].gate_id, 'gate:unknown');
    assert.equal(events[1].gate_type, 'mystery');
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].reason, "Unknown gate type 'mystery' for gate 'gate:unknown'");
  });
  
  await record('gate dispatch errors also emit correlated operator Discord alerts', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const discordCalls = [];
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-gate-dispatch-discord-'));
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-gate-dispatch-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });

        const configDeps7 = {
        gateRunner: {
          discord: async (...args) => { discordCalls.push(args); },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-gate-dispatch-discord',
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-gate-dispatch-discord-1',
      run_id: 'run-gate-dispatch-discord-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:unknown': { type: 'mystery', title: 'Mystery Gate' },
      },
    };
  
    const result = await gateRunnerMod.runGate(config, progress, 'gate:unknown', { deps: configDeps7 });
    assert.equal(stepExit(result), 1);
    await flushAsync();
    const alert = readJsonl(path.join(runLogDir, 'discord.jsonl')).find((entry) => entry.title === 'Gate Dispatch Failed: Mystery Gate');
    assert.equal(Boolean(alert), true, 'missing gate dispatch Discord alert');
    assert.equal(alert.description, "Unknown gate type 'mystery' for gate 'gate:unknown'");
    assert.equal(alert.fields.some((field) => field.name === 'Run ID' && field.value === 'run-gate-dispatch-discord-1'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate' && field.value === 'gate:unknown'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate Type' && field.value === 'mystery'), true);
  });
  
  await record('review gate setup failures still emit authoritative gate failure telemetry', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(reviewRuntimeRoot);
  
    const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-fastfail',
      telemetry: { enabled: true },
      _runId: 'run-review-fastfail-1',
      run_id: 'run-review-fastfail-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
    };
  
    const progress = {
      modules: {},
      gates: {
        'gate:review': { type: 'review', title: 'Review Gate', reviewers: [] },
      },
    };
  
    const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', {});
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), 'No reviewers configured');
  
    const streamKey = 'pipeline:telemetry:behavior-review-fastfail:run-review-fastfail-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[0].gate_id, 'gate:review');
    assert.equal(events[0].gate_type, 'review');
    assert.equal(events[1].gate_id, 'gate:review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].reason, "No reviewers configured for gate 'gate:review'");
  });
  
  await record('review gate setup failures also emit correlated operator Discord alerts', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(reviewRuntimeRoot);
    const discordCalls = [];
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-fastfail-discord-'));
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-review-fastfail-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });

        const configDeps8 = {
        reviewGate: {
          discord: async (...args) => { discordCalls.push(args); },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-fastfail-discord',
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-review-fastfail-discord-1',
      run_id: 'run-review-fastfail-discord-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:review': { type: 'review', title: 'Review Gate', reviewers: [] },
      },
    };
  
    const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps8 });
    assert.equal(stepExit(result), 1);
    await flushAsync();
    const alert = readJsonl(path.join(runLogDir, 'discord.jsonl')).find((entry) => entry.title === 'Review Gate Misconfigured: Review Gate');
    assert.equal(Boolean(alert), true, 'missing review gate setup Discord alert');
    assert.equal(alert.description, "No reviewers configured for gate 'gate:review'.");
    assert.equal(alert.fields.some((field) => field.name === 'Run ID' && field.value === 'run-review-fastfail-discord-1'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate' && field.value === 'gate:review'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate Type' && field.value === 'review'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Attempt' && field.value === '1'), true);
  });
  
  await record('buster gate setup failures still emit authoritative gate failure telemetry', async () => {
    const { runtimeRoot: busterRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(busterRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const busterGateRunnerMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(busterRuntimeRoot);
  
        const configDeps9 = {
        busterGate: {
          readGateInstructions: () => { throw new Error('missing instructions file'); },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-fastfail',
      paths: { swarm_dir: '/tmp/behavior-buster-fastfail-swarm' },
      telemetry: { enabled: true },
      _runId: 'run-buster-fastfail-1',
      run_id: 'run-buster-fastfail-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:buster': { type: 'buster', title: 'Buster Gate' },
      },
    };
  
    const result = await runGateViaRegistry(busterRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps9 });
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), 'missing instructions file');
  
    const streamKey = 'pipeline:telemetry:behavior-buster-fastfail:run-buster-fastfail-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[0].gate_id, 'gate:buster');
    assert.equal(events[0].gate_type, 'buster');
    assert.equal(events[1].gate_id, 'gate:buster');
    assert.equal(events[1].gate_type, 'buster');
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].reason, "Gate 'gate:buster' instructions read failed: missing instructions file");
  });
  
  await record('buster gate setup failures also emit correlated operator Discord alerts', async () => {
    const { runtimeRoot: busterRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(busterRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const busterGateRunnerMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(busterRuntimeRoot);
    const discordCalls = [];
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-fastfail-discord-'));
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-buster-fastfail-discord-1');
    fs.mkdirSync(runLogDir, { recursive: true });

        const configDeps10 = {
        busterGate: {
          discord: async (...args) => { discordCalls.push(args); },
          readGateInstructions: () => { throw new Error('missing instructions file'); },
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-fastfail-discord',
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-buster-fastfail-discord-1',
      run_id: 'run-buster-fastfail-discord-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:buster': { type: 'buster', title: 'Buster Gate' },
      },
    };
  
    const result = await runGateViaRegistry(busterRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps10 });
    assert.equal(stepExit(result), 1);
    await flushAsync();
    const alert = readJsonl(path.join(runLogDir, 'discord.jsonl')).find((entry) => entry.title === 'Buster Gate Setup Failed: Buster Gate');
    assert.equal(Boolean(alert), true, 'missing buster gate setup Discord alert');
    assert.equal(alert.description, 'Gate instructions could not be read: missing instructions file');
    assert.equal(alert.fields.some((field) => field.name === 'Run ID' && field.value === 'run-buster-fastfail-discord-1'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate' && field.value === 'gate:buster'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate Type' && field.value === 'buster'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Attempt' && field.value === '1'), true);
  });
  
  await record('buster gate unexpected safety-net failures also emit operator Discord alerts', async () => {
    const { runtimeRoot: busterRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(busterRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const busterGateRunnerMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(busterRuntimeRoot);
    const discordCalls = [];
    const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-unexpected-discord-'));
    const logDir = path.join(swarmDir, 'logs');
    const runLogDir = path.join(logDir, 'pipeline', 'runs', 'run-buster-unexpected-1');
    fs.mkdirSync(runLogDir, { recursive: true });

        const configDeps11 = {
        busterGate: {
          discord: async (...args) => { discordCalls.push(args); },
          readGateInstructions: () => 'Gate instructions',
          resolvePolicy: () => ({ model: 'buster-model', model_source: 'test', thinking: 'not_supported_on_redis' }),
          logEffectivePolicy: () => {},
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-unexpected',
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      pluginRegistry: registry,
      _runId: 'run-buster-unexpected-1',
      run_id: 'run-buster-unexpected-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:buster': { type: 'buster', title: 'Buster Gate', on_fail: 'fix_and_retest', max_fix_cycles: -1 },
      },
    };
  
    const result = await runGateViaRegistry(busterRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps11 });
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), "Gate 'gate:buster' ended unexpectedly");
  
    const alert = readJsonl(path.join(runLogDir, 'discord.jsonl')).find((entry) => entry.title === "Gate 'gate:buster' Ended Unexpectedly");
    assert.equal(Boolean(alert), true, 'missing buster unexpected safety-net Discord alert');
    assert.equal(alert.description, 'Buster gate loop exited without a terminal outcome. Manual review required.');
    assert.equal(alert.fields.some((field) => field.name === 'Run ID' && field.value === 'run-buster-unexpected-1'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate' && field.value === 'gate:buster'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Gate Type' && field.value === 'buster'), true);
    assert.equal(alert.fields.some((field) => field.name === 'Attempt' && field.value === '1'), true);
  
    const streamKey = 'pipeline:telemetry:behavior-buster-unexpected:run-buster-unexpected-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[1].gate_id, 'gate:buster');
    assert.equal(events[1].gate_type, 'buster');
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].reason, "Gate 'gate:buster' ended unexpectedly");
  });
  
  await record('review gate post-start failures still emit authoritative gate failure telemetry', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(reviewRuntimeRoot);
  
        const configDeps12 = {
        reviewGate: {
          discord: async () => {},
          runOnce: async () => ({ error: 'reviewer transport crashed', gateway_label: 'echo-quality', session_key: 'agent:main:acp:echo-review-poststart' }),
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-poststart-fail',
      paths: { swarm_dir: '/tmp/behavior-review-poststart-fail-swarm' },
      telemetry: { enabled: true },
      _runId: 'run-review-poststart-fail-1',
      run_id: 'run-review-poststart-fail-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
          reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
        },
      },
    };
  
    const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps12 });
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), 'Review failed: reviewer transport crashed');
    assert.equal(stepMetadata(result).gateway_label, 'echo-quality');
    assert.equal(stepMetadata(result).session_key, 'agent:main:acp:echo-review-poststart');
  
    const streamKey = 'pipeline:telemetry:behavior-review-poststart-fail:run-review-poststart-fail-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[0].gate_id, 'gate:review');
    assert.equal(events[0].gate_type, 'review');
    assert.equal(events[1].gate_id, 'gate:review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].reason, 'Review failed: reviewer transport crashed');
  });

  await record('review gate malformed output fails closed instead of regex-falling through to GO', async () => {
    for (const reviewCase of [
      {
        name: 'nonjson',
        content: '# Review complete\nLooks good.\n',
        expectedReason: /^Review invalid output: Review output must be valid JSON:/,
      },
      {
        name: 'missing-status',
        content: JSON.stringify({ summary: 'looks good' }, null, 2),
        expectedReason: 'Review invalid output: Review output missing required status',
      },
    ]) {
      const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
      installFakeRedis(reviewRuntimeRoot);
      globalThis.__fakeRedisCalls = [];
      globalThis.__fakeRedisCounters = Object.create(null);

      const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
      const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
      const registry = await buildBuiltInRegistry(reviewRuntimeRoot);
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `behavior-review-invalid-output-${reviewCase.name}-`));
      const swarmDir = path.join(repoRoot, '.swarm');
      fs.mkdirSync(swarmDir, { recursive: true });
      const sessionKey = `agent:main:acp:echo-review-invalid-output-${reviewCase.name}`;
      const runId = `run-review-invalid-output-${reviewCase.name}-1`;

            const configDeps13 = {
          reviewGate: {
            discord: async () => {},
            archiveGateOutputIfPresent: () => null,
            generateLintReport: () => ({ report: null, error: 'lint disabled in test' }),
            formatLintReportForReviewer: () => 'lint block',
            readGateInstructions: () => 'Review the code',
            buildReviewerPrompt: () => ({ prompt: 'Return strict JSON' }),
            resolvePolicy: () => ({ model: 'echo-model', model_source: 'test', thinking: 'high' }),
            logEffectivePolicy: () => {},
            spawnReviewerAgent: async () => ({}),
            getTrackedAgent: () => ({
              sessionKey,
              telemetry_dispatch_id: `dispatch-review-invalid-output-${reviewCase.name}`,
              dispatch_id: `dispatch-review-invalid-output-${reviewCase.name}`,
              gatewayLabel: `echo-quality-${reviewCase.name}`,
              streamLogPath: null,
            }),
            pollForFile: async (_config, outputFilePath) => {
              fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
              fs.writeFileSync(outputFilePath, reviewCase.content);
              return { ok: true, status: { session_key: sessionKey } };
            },
            killReviewerAgent: async () => true,
            sleep: async () => {},
            gitCommitAndPush: async () => {},
          },
        };
const config = {
        ...platformTestDefaults(),
        project: `behavior-review-invalid-output-${reviewCase.name}`,
        repo_root: repoRoot,
        paths: { swarm_dir: swarmDir },
        telemetry: { enabled: true },
        _runId: runId,
        run_id: runId,
        _runStats: runtimeCoreMod.createRunStats('2026-04-26T00:00:00.000Z'),
        pluginRegistry: registry,
              };

      const progress = {
        modules: {},
        gates: {
          'gate:review': {
            type: 'review',
            title: 'Review Gate',
            review_name: 'quality',
            reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
          },
        },
      };

      const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps13 });
      await flushAsync();

      assert.equal(stepExit(result), 1);
      if (reviewCase.expectedReason instanceof RegExp) {
        assert.match(stepSummary(result), reviewCase.expectedReason);
      } else {
        assert.equal(stepSummary(result), reviewCase.expectedReason);
      }
      assert.notEqual(stepGateStatus(result), 'PASS');

      const streamKey = `pipeline:telemetry:behavior-review-invalid-output-${reviewCase.name}:${runId}`;
      const events = gateRuntimeEvents(xaddEvents, streamKey);
      assert.equal(events.some((event) => event.type === 'gate.verdict' && String(event.reason || '').startsWith('Review invalid output:')), true);
    }
  });
  
  await record('review gate initial no-output failures preserve terminal detail in operator reason and telemetry', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(reviewRuntimeRoot);
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-no-output-detail-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:echo-review-no-output-detail';
  
        const configDeps14 = {
        reviewGate: {
          discord: async () => {},
          archiveGateOutputIfPresent: () => null,
          generateLintReport: () => ({ report: null, error: 'lint disabled in test' }),
          formatLintReportForReviewer: () => 'lint block',
          readGateInstructions: () => 'Review the code',
          buildReviewerPrompt: () => ({ prompt: 'Return GO or NO-GO' }),
          resolvePolicy: () => ({ model: 'echo-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnReviewerAgent: async () => ({}),
          getTrackedAgent: () => ({
            sessionKey,
            telemetry_dispatch_id: 'dispatch-review-no-output-detail-1',
            dispatch_id: 'dispatch-review-no-output-detail-1',
            gatewayLabel: 'echo-quality-no-output-detail',
            streamLogPath: null,
          }),
          pollForFile: async () => ({
            ok: false,
            reason: 'session_ended_no_output',
            status: { detail: 'adapter command missing', session_key: sessionKey },
          }),
          killReviewerAgent: async () => true,
          sleep: async () => {},
          gitCommitAndPush: async () => {},
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-no-output-detail',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-review-no-output-detail-1',
      run_id: 'run-review-no-output-detail-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
          review_name: 'quality',
          reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
        },
      },
    };
  
    const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps14 });
    await flushAsync();
  
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), 'Review failed: Review file not received (session_ended_no_output (adapter command missing))');
    assert.equal(stepMetadata(result).gateway_label, null);
    assert.equal(stepMetadata(result).session_key, sessionKey);
  
    const streamKey = 'pipeline:telemetry:behavior-review-no-output-detail:run-review-no-output-detail-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
    assert.equal(events[1].gate_id, 'gate:review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].verdict, 'NO-GO');
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].reason, 'Review failed: Review file not received (session_ended_no_output (adapter command missing))');
  });
  
  await record('review gate initial no-output failure alerts surface transcript activity state', async () => {
    for (const transcriptCase of [
      { name: 'active', transcript: { eventCount: 3, lastActivityPoll: 0 }, expected: 'active (3 events)' },
      { name: 'stale', transcript: { eventCount: 3, lastActivityPoll: 4 }, expected: 'stale (no activity for 4 polls)' },
    ]) {
      const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
      installFakeRedis(reviewRuntimeRoot);
      globalThis.__fakeRedisCalls = [];
      globalThis.__fakeRedisCounters = Object.create(null);
    
      const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
      const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
      const registry = await buildBuiltInRegistry(reviewRuntimeRoot);
      const discordCalls = [];
    
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `behavior-review-no-output-transcript-${transcriptCase.name}-`));
      const swarmDir = path.join(repoRoot, '.swarm');
      fs.mkdirSync(swarmDir, { recursive: true });
      const sessionKey = `agent:main:acp:echo-review-no-output-transcript-${transcriptCase.name}`;
    
            const configDeps15 = {
          reviewGate: {
            discord: async (...args) => { discordCalls.push(args); },
            archiveGateOutputIfPresent: () => null,
            generateLintReport: () => ({ report: null, error: 'lint disabled in test' }),
            formatLintReportForReviewer: () => 'lint block',
            readGateInstructions: () => 'Review the code',
            buildReviewerPrompt: () => ({ prompt: 'Return GO or NO-GO' }),
            resolvePolicy: () => ({ model: 'echo-model', model_source: 'test', thinking: 'high' }),
            logEffectivePolicy: () => {},
            spawnReviewerAgent: async () => ({}),
            getTrackedAgent: () => ({
              sessionKey,
              telemetry_dispatch_id: `dispatch-review-no-output-transcript-${transcriptCase.name}`,
              dispatch_id: `dispatch-review-no-output-transcript-${transcriptCase.name}`,
              gatewayLabel: `echo-quality-${transcriptCase.name}`,
              streamLogPath: null,
            }),
            pollForFile: async () => ({
              ok: false,
              reason: 'session_ended_no_output',
              status: { detail: 'adapter command missing', session_key: sessionKey },
              transcript: transcriptCase.transcript,
            }),
            killReviewerAgent: async () => true,
            sleep: async () => {},
            gitCommitAndPush: async () => {},
          },
        };
const config = {
        ...platformTestDefaults(),
        project: `behavior-review-no-output-transcript-${transcriptCase.name}`,
        repo_root: repoRoot,
        paths: { swarm_dir: swarmDir },
        telemetry: { enabled: true },
        pluginRegistry: registry,
        _runId: `run-review-no-output-transcript-${transcriptCase.name}-1`,
        run_id: `run-review-no-output-transcript-${transcriptCase.name}-1`,
        _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
              };
    
      const progress = {
        modules: {},
        gates: {
          'gate:review': {
            type: 'review',
            title: 'Review Gate',
            review_name: 'quality',
            reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
          },
        },
      };
    
      const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps15 });
      assert.equal(stepExit(result), 1);
      await flushAsync();

      const alert = readJsonl(path.join(swarmDir, 'logs', 'pipeline', 'runs', config._runId, 'discord.jsonl')).find((entry) => entry.title === 'Review Gate Failed: Review Gate');
      assert.equal(Boolean(alert), true, `missing transcript alert for ${transcriptCase.name} no-output review failure`);
      assert.equal(alert.description, 'Review failed: Review file not received (session_ended_no_output (adapter command missing))');
      const transcriptField = alert.fields.find((field) => field.name === 'Transcript');
      assert.equal(Boolean(transcriptField), true);
      assert.equal(transcriptField.value, transcriptCase.expected);
    }
  });
  
  await record('review gate reviewer rate-limit exhaustion emits authoritative pause and failure telemetry', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(reviewRuntimeRoot);
  
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-rate-limit-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:echo-review-rate-limit';
    const dispatchId = 'dispatch-review-rate-limit-tracked-1';
    let pollCount = 0;
  
        const configDeps16 = {
        reviewGate: {
          discord: async () => {},
          archiveGateOutputIfPresent: () => null,
          generateLintReport: () => ({ report: null, error: 'lint disabled in test' }),
          formatLintReportForReviewer: () => 'lint block',
          readGateInstructions: () => 'Review the code',
          buildReviewerPrompt: () => ({ prompt: 'Return GO or NO-GO' }),
          resolvePolicy: () => ({ model: 'echo-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnReviewerAgent: async () => ({}),
          getTrackedAgent: () => ({ sessionKey, telemetry_dispatch_id: dispatchId, streamLogPath: null }),
          pollForFile: async () => {
            pollCount++;
            return { ok: false, reason: 'rate_limited', status: { reason: 'provider overloaded', provider: 'anthropic', session_key: sessionKey } };
          },
          killReviewerAgent: async () => true,
          sleep: async () => {},
          gitCommitAndPush: async () => {},
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-rate-limit',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-review-rate-limit-1',
      run_id: 'run-review-rate-limit-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
          };
  
    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
          review_name: 'quality',
          reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
        },
      },
    };
  
    const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps16 });
    await flushAsync();
  
    assert.equal(pollCount, 2);
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), "Review gate 'gate:review' exceeded max rate limit pauses");
    assert.equal(result.correlation.run_id, 'run-review-rate-limit-1');
    assert.equal(stepMetadata(result).attempt, 1);
    assert.equal(stepMetadata(result).review_attempt, 1);
    assert.equal(stepMetadata(result).dispatch_id, dispatchId);
    assert.equal(stepMetadata(result).gateway_label, null);
    assert.equal(stepMetadata(result).session_key, sessionKey);
    assert.equal(stepMetadata(result).rate_limit_pauses, 2);
    assert.equal(stepMetadata(result).max_rate_limit_pauses, 1);
    assert.equal(stepMetadata(result).rate_limit_status?.run_id, 'run-review-rate-limit-1');
    assert.equal(stepMetadata(result).rate_limit_status?.dispatch_id, dispatchId);
  
    const streamKey = 'pipeline:telemetry:behavior-review-rate-limit:run-review-rate-limit-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    assert.deepEqual(events.map((event) => event.type), ['gate.started', 'rate_limit.detected', 'gate.verdict', 'retry.exhausted']);
    assert.equal(events[1].gate_id, 'gate:review');
    assert.equal(events[1].gate_type, 'review');
    assert.equal(events[1].session_key, sessionKey);
    assert.equal(events[1].agent_type, 'echo');
    assert.equal(events[1].pause_count, 1);
    assert.equal(events[2].gate_id, 'gate:review');
    assert.equal(events[2].verdict, 'NO-GO');
    assert.equal(events[2].session_key, sessionKey);
    assert.equal(events[2].dispatch_id, dispatchId);
    assert.equal(events[2].reason, "Review gate 'gate:review' exceeded max rate limit pauses");
    assert.equal(events[3].gate_id, 'gate:review');
    assert.equal(events[3].gate_type, 'review');
    assert.equal(events[3].module_id, null);
    assert.equal(events[3].phase, 'review_gate');
    assert.equal(events[3].session_key, sessionKey);
    assert.equal(events[3].dispatch_id, dispatchId);
    assert.equal(events[3].reason, "Review gate 'gate:review' exceeded max rate limit pauses");
    assert.equal(events[3].max_attempts, 1);
    assert.equal(events[3].max_fails, 1);
  });

  await record('review gate reviewer rate-limit pause and resume Discord alerts preserve canonical correlation', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(reviewRuntimeRoot);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-rate-limit-discord-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-review-rate-limit-discord-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });

    const sessionKey = 'agent:main:acp:echo-review-rate-limit-discord';
    const dispatchId = 'dispatch-review-echo-rate-limit-1';
    let pollCount = 0;

        const configDeps17 = {
        reviewGate: {
          archiveGateOutputIfPresent: () => null,
          generateLintReport: () => ({ report: null, error: 'lint disabled in test' }),
          formatLintReportForReviewer: () => 'lint block',
          readGateInstructions: () => 'Review the code',
          buildReviewerPrompt: () => ({ prompt: 'Return GO or NO-GO' }),
          resolvePolicy: () => ({ model: 'echo-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnReviewerAgent: async () => ({}),
          getTrackedAgent: () => ({
            sessionKey,
            telemetry_dispatch_id: dispatchId,
            dispatch_id: dispatchId,
            gatewayLabel: 'echo-quality-rate-limit-discord',
            streamLogPath: null,
          }),
          pollForFile: async (_config, outputFilePath) => {
            pollCount += 1;
            if (pollCount === 1) {
              return { ok: false, reason: 'rate_limited', status: { attempt: 2, reason: 'provider overloaded', provider: 'anthropic', dispatch_id: dispatchId, session_key: sessionKey } };
            }
            fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
            fs.writeFileSync(outputFilePath, JSON.stringify({ status: 'GO', summary: 'looks good' }, null, 2));
            return { ok: true, status: { attempt: 2, session_key: sessionKey, gateway_label: 'echo-quality' } };
          },
          killReviewerAgent: async () => true,
          sleep: async () => {},
          gitCommitAndPush: async () => {},
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-rate-limit-discord',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
      rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
          };

    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
          review_name: 'quality',
          reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
        },
      },
    };

    const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps17 });
    await flushAsync();

    assert.equal(stepExit(result), 0);
    assert.equal(pollCount, 2);

    const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const pauseEntry = runScopedEntries.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/2');
    const resumeEntry = runScopedEntries.find((entry) => entry.title === 'Rate limit cooldown complete');

    assert.equal(Boolean(pauseEntry), true);
    assert.equal(Boolean(resumeEntry), true);
    assert.equal(getFieldValue(pauseEntry.fields, 'Run ID'), runId);
    assert.equal(getFieldValue(pauseEntry.fields, 'Gate'), 'gate:review');
    assert.equal(getFieldValue(pauseEntry.fields, 'Gate Type'), 'review');
    assert.equal(getFieldValue(pauseEntry.fields, 'Attempt'), '2');
    assert.equal(getFieldValue(pauseEntry.fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(pauseEntry.fields, 'Label'), undefined);
    assert.equal(getFieldValue(pauseEntry.fields, 'Session'), sessionKey);
    assert.equal(getFieldValue(resumeEntry.fields, 'Run ID'), runId);
    assert.equal(getFieldValue(resumeEntry.fields, 'Gate'), 'gate:review');
    assert.equal(getFieldValue(resumeEntry.fields, 'Gate Type'), 'review');
    assert.equal(getFieldValue(resumeEntry.fields, 'Attempt'), '2');
    assert.equal(getFieldValue(resumeEntry.fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(resumeEntry.fields, 'Label'), undefined);
    assert.equal(getFieldValue(resumeEntry.fields, 'Session'), sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-review-rate-limit-discord:run-review-rate-limit-discord-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    const rateLimitEvent = events.find((event) => event.type === 'rate_limit.detected');
    assert(rateLimitEvent, 'missing review gate rate_limit.detected event');
    assert.equal(rateLimitEvent.gate_id, 'gate:review');
    assert.equal(rateLimitEvent.gate_type, 'review');
    assert.equal(rateLimitEvent.dispatch_id, dispatchId);
    assert.equal(rateLimitEvent.session_key, sessionKey);
    assert.equal(rateLimitEvent.attempt, 2);
  });

  await record('review gate exhaustion falls back to canonical result attempt and pause budget fields', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(reviewRuntimeRoot);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-review-rate-limit-fallback-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(swarmDir, { recursive: true });
    const sessionKey = 'agent:main:acp:echo-review-rate-limit-fallback';
    const dispatchId = 'dispatch-review-rate-limit-fallback-1';
    const discordCalls = [];
    const reviewRateLimitResult = {
      ok: false,
      reason: 'rate_limit_exhausted',
      rate_limit_exhausted: true,
      rate_limit_status: {
        attempt: 4,
        reason: 'provider overloaded',
        provider: 'anthropic',
        dispatch_id: dispatchId,
        gateway_label: 'echo-quality',
        session_key: sessionKey,
        max_rate_limit_pauses: 3,
      },
    };

        const configDeps18 = {
        reviewGate: {
          discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
          archiveGateOutputIfPresent: () => null,
          generateLintReport: () => ({ report: null, error: 'lint disabled in test' }),
          formatLintReportForReviewer: () => 'lint block',
          readGateInstructions: () => 'Review the code',
          buildReviewerPrompt: () => ({ prompt: 'Return GO or NO-GO' }),
          resolvePolicy: () => ({ model: 'echo-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          runOnce: async () => reviewRateLimitResult,
          gitCommitAndPush: async () => {},
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-review-rate-limit-fallback',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      telemetry: { enabled: true },
      _runId: 'run-review-rate-limit-fallback-1',
      run_id: 'run-review-rate-limit-fallback-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      pluginRegistry: registry,
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
          };

    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
          review_name: 'quality',
          reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
        },
      },
    };

    const result = await runGateViaRegistry(reviewRuntimeRoot, config, progress, 'gate:review', { deps: configDeps18 });
    await flushAsync();

    assert.equal(stepExit(result), 1);
    assert.equal(result.correlation.run_id, 'run-review-rate-limit-fallback-1');
    assert.equal(stepMetadata(result).gate, 'gate:review');
    assert.equal(result.correlation.gate_id, 'gate:review');
    assert.equal(result.correlation.gate_type, 'review');
    assert.equal(stepMetadata(result).attempt, 4);
    assert.equal(stepMetadata(result).dispatch_id, dispatchId);
    assert.equal(stepMetadata(result).gateway_label, 'echo-quality');
    assert.equal(stepMetadata(result).session_key, sessionKey);
    assert.equal(stepMetadata(result).max_rate_limit_pauses, 3);
    assert.equal(stepMetadata(result).rate_limit_status?.max_rate_limit_pauses, 3);
    assert.equal(reviewRateLimitResult.max_rate_limit_pauses, undefined);
    assert.equal(reviewRateLimitResult.rate_limit_status?.max_rate_limit_pauses, 3);

    const exhaustedDiscord = discordCalls.find((call) => call.title === 'Review Gate Rate Limit Exhausted: Review Gate');
    assert.equal(exhaustedDiscord.description, 'Review attempt 4 exceeded max ACP rate limit pauses (3).');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Run ID'), 'run-review-rate-limit-fallback-1');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gate'), 'gate:review');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gate Type'), 'review');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Attempt'), '4');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gateway Label'), 'echo-quality');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Session'), sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-review-rate-limit-fallback:run-review-rate-limit-fallback-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    const verdictEvent = events.find((event) => event.type === 'gate.verdict');
    const retryExhaustedEvent = events.find((event) => event.type === 'retry.exhausted');
    assert.equal(verdictEvent.verdict, 'NO-GO');
    assert.equal(verdictEvent.attempt, 4);
    assert.equal(verdictEvent.dispatch_id, dispatchId);
    assert.equal(verdictEvent.gateway_label, 'echo-quality');
    assert.equal(verdictEvent.session_key, sessionKey);
    assert.equal(retryExhaustedEvent.gate_type, 'review');
    assert.equal(retryExhaustedEvent.attempt, 4);
    assert.equal(retryExhaustedEvent.max_attempts, 3);
    assert.equal(retryExhaustedEvent.max_fails, 3);
    assert.equal(retryExhaustedEvent.dispatch_id, dispatchId);
    assert.equal(retryExhaustedEvent.gateway_label, 'echo-quality');
    assert.equal(retryExhaustedEvent.session_key, sessionKey);
  });

  await record('buster gate rate-limit exhaustion Discord alerts preserve canonical correlation', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const rateLimitMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/rate-limit.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const discordCalls = [];

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-rate-limit-exhausted-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-buster-rate-limit-exhausted-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });

    const dispatchId = 'dispatch-buster-rate-limit-exhausted-1';
    const sessionKey = 'agent:main:acp:gate-buster-rate-limit-exhausted';
    const gateRateLimitResult = {
      ok: false,
      reason: 'rate_limit_exhausted',
      attempt: 4,
      dispatch_id: dispatchId,
      gateway_label: dispatchId,
      session_key: sessionKey,
      rate_limit_status: {
        attempt: 4,
        dispatch_id: dispatchId,
        gateway_label: dispatchId,
        session_key: sessionKey,
        max_rate_limit_pauses: 3,
      },
    };

        const configDeps19 = {
        busterGate: {
          discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
          readGateInstructions: () => 'Run the gate tests',
          resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
          logEffectivePolicy: () => {},
          validateBusterConfig: () => {},
          gitCommitAndPush: async () => {},
          runOnce: async () => gateRateLimitResult,
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-rate-limit-exhausted',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      agents: { buster: {} },
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      _runStats: runtimeCoreMod.createRunStats('2026-04-15T00:00:00.000Z'),
      pluginRegistry: registry,
      default_timeout_minutes: 5,
      default_max_fails: 1,
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
          };

    const progress = {
      modules: {},
      gates: {
        'gate:buster': { type: 'buster', title: 'Buster Gate', timeout_minutes: 5 },
      },
    };

    const result = await runGateViaRegistry(gateRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps19 });
    await flushAsync();

    assert.equal(stepExit(result), 1);
    assert.equal(result.correlation.run_id, runId);
    assert.equal(stepMetadata(result).attempt, 4);
    assert.equal(stepMetadata(result).dispatch_id, dispatchId);
    assert.equal(stepMetadata(result).gateway_label, dispatchId);
    assert.equal(stepMetadata(result).session_key, sessionKey);
    assert.equal(stepMetadata(result).max_rate_limit_pauses, 3);
    assert.equal(stepMetadata(result).rate_limit_status?.run_id, runId);
    assert.equal(stepMetadata(result).rate_limit_status?.max_rate_limit_pauses, 3);
    assert.equal(gateRateLimitResult.max_rate_limit_pauses, undefined);
    assert.equal(gateRateLimitResult.rate_limit_status?.max_rate_limit_pauses, 3);

    const exhaustedDiscord = discordCalls.find((call) => call.title === "Gate 'gate:buster' Rate Limit Exhausted");
    assert.equal(exhaustedDiscord.description, 'Gate attempt 4 exceeded max ACP rate limit pauses (3).');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Run ID'), 'run-buster-rate-limit-exhausted-1');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gate'), 'gate:buster');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gate Type'), 'buster');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Attempt'), '4');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gateway Label'), dispatchId);
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Session'), sessionKey);

    const streamKey = 'pipeline:telemetry:behavior-buster-rate-limit-exhausted:run-buster-rate-limit-exhausted-1';
    const events = gateRuntimeEvents(xaddEvents, streamKey);
    const verdictEvent = events.find((event) => event.type === 'gate.verdict');
    const retryExhaustedEvent = events.find((event) => event.type === 'retry.exhausted');
    assert.equal(verdictEvent.verdict, 'NO-GO');
    assert.equal(verdictEvent.gate_type, 'buster');
    assert.equal(verdictEvent.attempt, 4);
    assert.equal(verdictEvent.dispatch_id, dispatchId);
    assert.equal(verdictEvent.gateway_label, dispatchId);
    assert.equal(verdictEvent.session_key, sessionKey);
    assert.equal(retryExhaustedEvent.gate_type, 'buster');
    assert.equal(retryExhaustedEvent.attempt, 4);
    assert.equal(retryExhaustedEvent.max_attempts, 3);
    assert.equal(retryExhaustedEvent.max_fails, 3);
    assert.equal(retryExhaustedEvent.dispatch_id, dispatchId);
    assert.equal(retryExhaustedEvent.gateway_label, dispatchId);
    assert.equal(retryExhaustedEvent.session_key, sessionKey);
  });

  await record('buster gate Redis-owned rate-limit exhaustion preserves canonical stop and Discord correlation', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const pollingMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
    const rateLimitMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/rate-limit.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);
    const discordCalls = [];

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-redis-rate-limit-exhausted-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-buster-redis-rate-limit-exhausted-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });

    const dispatchId = 'dispatch-buster-redis-rate-limit-exhausted-1';
    const sessionKey = 'agent:main:acp:gate-buster-redis-rate-limit-exhausted';
    let redisReads = 0;

        const configDeps20 = {
        busterGate: {
          discord: async (_config, _level, title, description, fields) => { discordCalls.push({ title, description, fields }); },
          readGateInstructions: () => 'Run the gate tests',
          resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
          logEffectivePolicy: () => {},
          validateBusterConfig: () => {},
          archiveModuleCompletions: async () => {},
          spawnAgent: async () => {},
          getTrackedAgent: () => ({
            telemetry_dispatch_id: dispatchId,
            dispatch_id: dispatchId,
            gatewayLabel: dispatchId,
            sessionKey,
          }),
          waitBusterGateCompletionEvidence: async ({ gateId, gate }) => {
            redisReads += 1;
            return rateLimitMod.buildGateTerminalOwnedRedisRateLimitExitResult({
              status: 'FAIL',
              outcome: 'RATE_LIMITED',
              source: 'buster-pipeline',
              reason: 'max_pauses_exceeded',
              summary: 'max_pauses_exceeded',
              run_id: runId,
              attempt: 1,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: sessionKey,
              max_rate_limit_pauses: 3,
            }, {
              expectedIdentity: { run_id: runId, attempt: 1, dispatch_id: dispatchId, gateway_label: dispatchId, session_key: sessionKey },
              gateId,
              gateType: gate.type,
              resultOverrides: { outcome_class: "rate_limited" },
            });
          },
          gitCommitAndPush: async () => {},
        },
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-redis-rate-limit-exhausted',
      repo_root: repoRoot,
      paths: { swarm_dir: swarmDir },
      agents: { buster: {} },
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _disable_discord_webhooks: true,
      discord_webhook_url: 'https://example.invalid/webhook',
      _runStats: runtimeCoreMod.createRunStats('2026-04-15T00:00:00.000Z'),
      pluginRegistry: registry,
      default_timeout_minutes: 5,
      default_max_fails: 1,
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
          };

    const progress = {
      modules: {},
      gates: {
        'gate:buster': { type: 'buster', title: 'Buster Gate', timeout_minutes: 5 },
      },
    };

    const result = await runGateViaRegistry(gateRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps20 });
    await flushAsync();

    assert.equal(redisReads, 1);
    assert.equal(stepExit(result), 1);
    assert.equal(stepSummary(result), "Gate 'gate:buster' exceeded max rate limit pauses");
    assert.equal(result.correlation.run_id, runId);
    assert.equal(stepMetadata(result).attempt, 1);
    assert.equal(stepMetadata(result).dispatch_id, dispatchId);
    assert.equal(stepMetadata(result).gateway_label, dispatchId);
    assert.equal(stepMetadata(result).session_key, sessionKey);
    assert.equal(stepMetadata(result).gate, 'gate:buster');
    assert.equal(result.correlation.gate_id, 'gate:buster');
    assert.equal(result.correlation.gate_type, 'buster');
    assert.equal(stepMetadata(result).status?.status, 'RATE_LIMITED');
    assert.equal(stepMetadata(result).max_rate_limit_pauses, 3);
    assert.equal(stepMetadata(result).rate_limit_status?.status, 'RATE_LIMITED');
    assert.equal(stepMetadata(result).rate_limit_status?.gate_id, 'gate:buster');
    assert.equal(stepMetadata(result).rate_limit_status?.gate_type, 'buster');
    assert.equal(stepMetadata(result).rate_limit_status?.max_rate_limit_pauses, 3);
    assert.equal(stepMetadata(result).rate_limit_status?.dispatch_id, dispatchId);
    assert.equal(stepMetadata(result).rate_limit_status?.gateway_label, dispatchId);
    assert.equal(stepMetadata(result).rate_limit_status?.session_key, sessionKey);

    const exhaustedDiscord = discordCalls.find((call) => call.title === "Gate 'gate:buster' Rate Limit Exhausted");
    assert.equal(Boolean(exhaustedDiscord), true);
    assert.equal(exhaustedDiscord.description, 'Gate attempt 1 exceeded max ACP rate limit pauses (3).');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Run ID'), runId);
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gate'), 'gate:buster');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gate Type'), 'buster');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Attempt'), '1');
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Dispatch'), dispatchId);
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Gateway Label'), dispatchId);
    assert.equal(getFieldValue(exhaustedDiscord.fields, 'Session'), sessionKey);
  });

  await record('buster gate rate-limit pause and resume Discord alerts preserve canonical correlation', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const pollingMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
    const rateLimitMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/rate-limit.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-rate-limit-discord-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-buster-rate-limit-discord-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });

    const sessionKey = 'agent:main:acp:gate-buster-rate-limit-discord';
    const dispatchId = 'buster-gate-gate:buster-1700000000000-1';
    let redisReadCount = 0;
    const realDateNow = Date.now;
    Date.now = () => 1700000000000;

    try {
            const configDeps21 = {
          busterGate: {
            readGateInstructions: () => 'buster gate instructions',
            resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
            logEffectivePolicy: () => {},
            validateBusterConfig: () => {},
            gitCommitAndPush: async () => {},
            archiveModuleCompletions: async () => {},
            spawnAgent: async () => ({}),
            killAgent: async () => true,
            getTrackedAgent: () => ({
              telemetry_dispatch_id: dispatchId,
              dispatch_id: dispatchId,
              gatewayLabel: dispatchId,
              sessionKey,
            }),
            waitBusterGateCompletionEvidence: async ({ gateId, gate }) => {
              redisReadCount += 1;
              if (redisReadCount === 1) {
                return pollingMod.pollResult(false, 'rate_limited', rateLimitMod.buildGateSessionRateLimitStatus({
                  status: 'FAIL',
                  outcome: 'RATE_LIMITED',
                  reason: 'provider overloaded',
                  provider: 'anthropic',
                  dispatch_id: dispatchId,
                  gateway_label: dispatchId,
                  session_key: sessionKey,
                }, {
                  gateId,
                  gateType: gate.type,
                  runIdFallback: runId,
                  attemptFallback: 1,
                  dispatchIdFallback: dispatchId,
                  gatewayLabelFallback: dispatchId,
                  sessionKeyFallback: sessionKey,
                }));
              }
              return pollingMod.pollResult(true, 'target_reached', {
                gate: gateId,
                status: 'PASS',
                summary: 'done',
                run_id: runId,
                attempt: 1,
                dispatch_id: dispatchId,
                gateway_label: dispatchId,
                session_key: sessionKey,
              });
            },
          },
        };
const config = {
        ...platformTestDefaults(),
        project: 'behavior-buster-rate-limit-discord',
        repo_root: repoRoot,
        paths: { swarm_dir: swarmDir },
        poll_interval_seconds: 0,
        agents: { buster: {} },
        telemetry: { enabled: true },
        _runId: runId,
        run_id: runId,
        _disable_discord_webhooks: true,
        discord_webhook_url: 'https://example.invalid/webhook',
        _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
        pluginRegistry: registry,
        default_timeout_minutes: 5,
        default_max_fails: 1,
        rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
              };

      const progress = {
        modules: {},
        gates: {
          'gate:buster': { type: 'buster', title: 'Buster Gate', timeout_minutes: 5 },
        },
      };

      const result = await runGateViaRegistry(gateRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps21 });
      await flushAsync();

      assert.equal(stepExit(result), 0);
      assert.equal(redisReadCount, 2);

      const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      const pauseEntry = runScopedEntries.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/2');
      const resumeEntry = runScopedEntries.find((entry) => entry.title === 'Rate limit cooldown complete');

      assert.equal(Boolean(pauseEntry), true);
      assert.equal(Boolean(resumeEntry), true);
      assert.equal(getFieldValue(pauseEntry.fields, 'Run ID'), runId);
      assert.equal(getFieldValue(pauseEntry.fields, 'Gate'), 'gate:buster');
      assert.equal(getFieldValue(pauseEntry.fields, 'Gate Type'), 'buster');
      assert.equal(getFieldValue(pauseEntry.fields, 'Attempt'), '1');
      assert.equal(getFieldValue(pauseEntry.fields, 'Dispatch'), dispatchId);
      assert.equal(getFieldValue(pauseEntry.fields, 'Label'), undefined);
      assert.equal(getFieldValue(pauseEntry.fields, 'Session'), sessionKey);
      assert.equal(getFieldValue(resumeEntry.fields, 'Run ID'), runId);
      assert.equal(getFieldValue(resumeEntry.fields, 'Gate'), 'gate:buster');
      assert.equal(getFieldValue(resumeEntry.fields, 'Gate Type'), 'buster');
      assert.equal(getFieldValue(resumeEntry.fields, 'Attempt'), '1');
      assert.equal(getFieldValue(resumeEntry.fields, 'Dispatch'), dispatchId);
      assert.equal(getFieldValue(resumeEntry.fields, 'Label'), undefined);
      assert.equal(getFieldValue(resumeEntry.fields, 'Session'), sessionKey);

      const streamKey = 'pipeline:telemetry:behavior-buster-rate-limit-discord:run-buster-rate-limit-discord-1';
      const events = gateRuntimeEvents(xaddEvents, streamKey);
      const rateLimitEvent = events.find((event) => event.type === 'rate_limit.detected');
      assert(rateLimitEvent, 'missing buster gate rate_limit.detected event');
      assert.equal(rateLimitEvent.gate_id, 'gate:buster');
      assert.equal(rateLimitEvent.gate_type, 'buster');
      assert.equal(rateLimitEvent.dispatch_id, dispatchId);
      assert.equal(rateLimitEvent.session_key, sessionKey);
      assert.equal(rateLimitEvent.attempt, 1);
    } finally {
      Date.now = realDateNow;
    }
  });

  await record('buster gate Redis rate-limit pause and resume preserves tracked correlation', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const gateRunnerMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const pollingMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/polling.ts');
    const rateLimitMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/rate-limit.ts');
    const runtimeCoreMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const registry = await buildBuiltInRegistry(gateRuntimeRoot);

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-redis-rate-limit-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const logRoot = path.join(swarmDir, 'logs');
    const runId = 'run-buster-gate-redis-rate-limit-1';
    const runLogDir = path.join(logRoot, 'pipeline', 'runs', runId);
    fs.mkdirSync(runLogDir, { recursive: true });

    const sessionKey = 'agent:main:acp:gate-buster-redis-rate-limit';
    const dispatchId = 'dispatch-buster-gate-redis-rate-limit-tracked-1';
    const gatewayLabel = 'gate-buster-redis-dispatch';
    const activeSessionPath = path.join(logRoot, 'gates', 'gate:buster', 'active-session.json');
    const realDateNow = Date.now;
    let spawnCount = 0;
    Date.now = () => 1700000000000;

    try {
            const configDeps22 = {
          busterGate: {
            readGateInstructions: () => 'buster gate instructions',
            resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
            logEffectivePolicy: () => {},
            validateBusterConfig: () => {},
            gitCommitAndPush: async () => {},
            archiveModuleCompletions: async () => {},
            waitBusterGateCompletionEvidence: async ({ gateId, gate }) => {
              if (spawnCount === 1) {
                return pollingMod.pollResult(false, 'rate_limited', rateLimitMod.buildGateSessionRateLimitStatus({
                  status: 'RATE_LIMITED',
                  reason: 'provider overloaded',
                  provider: 'anthropic',
                  run_id: runId,
                  attempt: 1,
                  dispatch_id: dispatchId,
                  gateway_label: gatewayLabel,
                  session_key: sessionKey,
                }, {
                  gateId,
                  gateType: gate.type,
                  runIdFallback: runId,
                  attemptFallback: 1,
                  dispatchIdFallback: dispatchId,
                  gatewayLabelFallback: gatewayLabel,
                  sessionKeyFallback: sessionKey,
                }));
              }
              return pollingMod.pollResult(true, 'target_reached', {
                gate: gateId,
                status: 'PASS',
                summary: 'done',
                run_id: runId,
                attempt: 1,
                dispatch_id: dispatchId,
                gateway_label: gatewayLabel,
                session_key: sessionKey,
              });
            },
            spawnAgent: async () => {
              spawnCount += 1;
              const gateStatusPath = path.join(swarmDir, 'gate:buster-gate-status.json');
              const gateOutputPath = path.join(swarmDir, 'gates', 'gate-buster-output.json');
              if (spawnCount > 1) {
                fs.writeFileSync(gateStatusPath, JSON.stringify({ status: 'PASS', summary: 'done' }));
                fs.mkdirSync(path.dirname(gateOutputPath), { recursive: true });
                fs.writeFileSync(gateOutputPath, JSON.stringify({ status: 'PASS', summary: 'done' }));
              }
              return {};
            },
            getTrackedAgent: (label) => label === 'buster-gate:buster'
              ? { sessionKey, telemetry_dispatch_id: dispatchId, gatewayLabel, runtime: 'acp' }
              : null,
            killAgent: async () => true,
          },
        };
const config = {
        ...platformTestDefaults(),
        project: 'behavior-buster-gate-redis-rate-limit',
        repo_root: repoRoot,
        paths: { swarm_dir: swarmDir },
        poll_interval_seconds: 0,
        agents: { buster: {} },
        telemetry: { enabled: true },
        _runId: runId,
        run_id: runId,
        _disable_discord_webhooks: true,
        discord_webhook_url: 'https://example.invalid/webhook',
        _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
        pluginRegistry: registry,
        default_timeout_minutes: 5,
        default_max_fails: 1,
        rate_limit: { max_pauses_per_module: 2, cooldown_hours: 0 },
              };

      const progress = {
        modules: {},
        gates: {
          'gate:buster': { type: 'buster', title: 'Buster Gate', timeout_minutes: 5, output_file: 'gates/gate-buster-output.json' },
        },
      };

      const result = await runGateViaRegistry(gateRuntimeRoot, config, progress, 'gate:buster', { deps: configDeps22 });
      await flushAsync();

      assert.equal(stepExit(result), 0);
      assert.equal(spawnCount, 2);
      assert.equal(fs.existsSync(activeSessionPath), false);

      const runScopedEntries = fs.readFileSync(path.join(runLogDir, 'discord.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      const pauseEntry = runScopedEntries.find((entry) => entry.title === '⏳ Rate Limited — Pause 1/2');
      const resumeEntry = runScopedEntries.find((entry) => entry.title === 'Rate limit cooldown complete');

      assert.equal(Boolean(pauseEntry), true);
      assert.equal(Boolean(resumeEntry), true);
      assert.equal(getFieldValue(pauseEntry.fields, 'Run ID'), runId);
      assert.equal(getFieldValue(pauseEntry.fields, 'Dispatch'), dispatchId);
      assert.equal(getFieldValue(pauseEntry.fields, 'Gateway Label'), gatewayLabel);
      assert.equal(getFieldValue(pauseEntry.fields, 'Session'), sessionKey);
      assert.equal(getFieldValue(resumeEntry.fields, 'Dispatch'), dispatchId);
      assert.equal(getFieldValue(resumeEntry.fields, 'Gateway Label'), gatewayLabel);
      assert.equal(getFieldValue(resumeEntry.fields, 'Session'), sessionKey);

      const streamKey = 'pipeline:telemetry:behavior-buster-gate-redis-rate-limit:run-buster-gate-redis-rate-limit-1';
      const events = gateRuntimeEvents(xaddEvents, streamKey);
      const rateLimitEvent = events.find((event) => event.type === 'rate_limit.detected');
      assert(rateLimitEvent, 'missing buster gate Redis rate_limit.detected event');
      assert.equal(rateLimitEvent.gate_id, 'gate:buster');
      assert.equal(rateLimitEvent.dispatch_id, dispatchId);
      assert.equal(rateLimitEvent.gateway_label, gatewayLabel);
      assert.equal(rateLimitEvent.session_key, sessionKey);
      assert.equal(rateLimitEvent.attempt, 1);
    } finally {
      Date.now = realDateNow;
    }
  });

  await record('buster gate dependencies ignore diagnostic gate-state PASS when canonical output_file fails or is missing', async () => {
    const { runtimeRoot: gateRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(gateRuntimeRoot);

    const dependenciesMod = await importRuntimeModule(gateRuntimeRoot, '/app/skills/pipeline/services/dependencies.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-buster-gate-dependencies-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    fs.mkdirSync(path.join(swarmDir, 'gates'), { recursive: true });

    const config = {
      ...platformTestDefaults(),
      project: 'behavior-buster-gate-dependencies',
      _runId: 'run-buster-gate-dependencies-1',
      run_id: 'run-buster-gate-dependencies-1',
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(repoRoot, 'modules'),
      },
    };

    const progress = {
      modules: {
        '02': {
          title: 'After Gate',
          depends_on: ['gate:gate:buster'],
        },
      },
      gates: {
        'gate:buster': {
          type: 'buster',
          title: 'Buster Gate',
          output_file: 'gates/gate-buster-output.json',
        },
      },
    };

    fs.writeFileSync(
      path.join(swarmDir, 'gates', 'gate-buster-output.json'),
      JSON.stringify({ status: 'FAIL', reason: 'stale failure' }, null, 2),
    );
    fs.writeFileSync(
      path.join(swarmDir, 'gate:buster-gate-status.json'),
      JSON.stringify({ status: 'PASS', source: 'gate-status-fallback' }, null, 2),
    );

    assert.deepEqual(dependenciesMod.checkDependencies(config, progress, '02'), {
      met: false,
      reason: "Gate 'gate:buster' has status 'FAIL'",
    });

    fs.unlinkSync(path.join(swarmDir, 'gates', 'gate-buster-output.json'));
    fs.writeFileSync(
      path.join(swarmDir, 'gate:buster-gate-status.json'),
      JSON.stringify({
        status: 'RATE_LIMITED',
        run_id: 'manual-run',
        attempt: 1,
        dispatch_id: 'manual-dispatch',
        session_key: 'manual-session',
      }, null, 2),
    );

    assert.deepEqual(dependenciesMod.checkDependencies(config, progress, '02'), {
      met: false,
      reason: "Gate 'gate:buster' not completed",
    });
  });
}
