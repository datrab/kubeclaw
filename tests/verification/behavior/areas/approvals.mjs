import {
  buildBuiltInRegistry,
  gateRuntimeEvents,
  stepExit,
  stepSummary,
  stepMetadata,
  stepGateStatus,
} from './helpers.mjs';

export async function registerApprovalsArea({
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  startGatewayServer,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  runGateViaRegistry,
  ensureDir,
  writeExecutable,
  runtimeRoot,
  sandboxRuntimeRoot,
  pipelineEntryMod,
  pipelineIndexMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  monitorMod,
  redisLogMod,
  pathsMod,
  busterPipelineMod,
}) {
function platformApprovalDefaults() {
  return {
    default_timeout_minutes: 30,
    locks: {
      lifecycle_append: {
        stale_ms: 300000,
        timeout_ms: 30000,
      },
    },
    telemetry: {
      enabled: true,
      sink_timeout_ms: 5000,
      stream_max_len: 10000,
    },
    event_adapters: {
      approval_signal_debounce_ms: 25,
    },
    pipeline_defaults: {
      timeout_minutes: 300,
      max_fails: 8,
      auto_retry_threshold: 7,
      agent_startup_retry_budget: 3,
      session_nudge_threshold: 0.75,
    },
  };
}

await record('approval gates execute through gate stage owners and preserve timeout-continue pass semantics', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const statusStoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);
  const approvalCalls = [];
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'gate.execute': {
        ...registry.stageOwners['gate.execute'],
        'gate:approval': {
          ...registry.stageOwners['gate.execute']['gate:approval'],
          implementation: {
            execute: async ({ input }) => {
              approvalCalls.push(input);
              return {
                schemaVersion: 'v1',
                producerKind: 'gate',
                producerType: 'approval',
                nextAction: 'pass',
                issueType: 'policy',
                diagnostics: {
                  summary: 'Approval gate timed out and auto-continued',
                  findings: [],
                  metadata: {
                    continued: true,
                    timed_out: true,
                    timeout_policy: 'CONTINUE',
                    gate_id: 'release-approval',
                    gate_type: 'approval',
                  },
                  typed: {
                    gate: {
                      schemaVersion: 'v1',
                      gateRunStatus: 'TIMED_OUT',
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

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-stage-pass-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  const runId = 'run-approval-stage-pass-1';
  const gate = {
    type: 'approval',
    title: 'Release Approval',
    timeout_minutes: 30,
    on_timeout: 'continue',
  };

    const deps = {
      gateRunner: {
        runners: {
          approval: async () => {
            throw new Error('direct approval runner fallback should not run when stage owner is registered');
          },
        },
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-stage-pass',
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    pluginRegistry: testRegistry,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
      };

  const progress = {
    modules: {},
    gates: {
      'release-approval': gate,
    },
    execution_order: ['gate:release-approval'],
  };

  statusStoreMod.syncApprovalWaitState(config, 'release-approval', gate, {
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'PENDING_APPROVAL',
    run_id: runId,
    project: 'behavior-approval-stage-pass',
    requested_at: '2026-04-21T00:00:00.000Z',
    deadline: '2026-04-21T00:30:00.000Z',
    timeout_minutes: 30,
    timeout_policy: 'CONTINUE',
  });
  statusStoreMod.syncApprovalWaitState(config, 'release-approval', gate, {
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'TIMED_OUT',
    run_id: runId,
    project: 'behavior-approval-stage-pass',
    requested_at: '2026-04-21T00:00:00.000Z',
    resolved_at: '2026-04-21T00:30:00.000Z',
    decision_via: 'timeout',
    continued: true,
    timeout_minutes: 30,
    timeout_policy: 'CONTINUE',
    reason: 'No decision received within 30 minutes',
  });

  const result = await gateRunnerMod.runGate(config, progress, 'release-approval');

  assert.equal(stepExit(result), 0);
  assert.equal(stepGateStatus(result), 'TIMED_OUT');
  assert.equal(stepMetadata(result).continued, true);
  assert.equal(result.correlation.gate_id, 'release-approval');
  assert.equal(result.correlation.gate_type, 'approval');
  assert.equal(approvalCalls.length, 1);
  assert.equal(approvalCalls[0].ids.stageId, 'gate:approval');
  assert.equal(approvalCalls[0].ids.gateId, 'release-approval');
  assert.equal(approvalCalls[0].ids.gateType, 'approval');
  assert.equal(approvalCalls[0].refs.gateEvaluationRef, 'gate_evaluation:run-approval-stage-pass-1:release-approval:1');
  assert.equal(approvalCalls[0].refs.waitRef, 'wait:run-approval-stage-pass-1:gate:release-approval:approval');
  assert.equal(approvalCalls[0].stateSnapshot.gate.lifecycle_status, 'TIMED_OUT');
  assert.equal(approvalCalls[0].stateSnapshot.gate.lifecycle_scheduler_consumed, true);
});

await record('approval wait actions execute through the generic runGate wait controller', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-generic-wait-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  const runId = 'run-approval-generic-wait-1';

  let gateState = null;
  let resolved = false;
    const configDeps2 = {
      approvalGate: {
        discord: async () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        saveGateState: (_config, _gateId, state) => { gateState = JSON.parse(JSON.stringify(state)); },
        loadGateState: () => {
          if (gateState?.status === 'PENDING_APPROVAL' && !resolved) {
            resolved = true;
            gateState = {
              ...gateState,
              status: 'APPROVED',
              decision_by: 'nova',
              decision_via: 'manual',
              reason: 'Generic wait approved',
            };
          }
          return gateState;
        },
        sleep: async () => {},
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-generic-wait',
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    pluginRegistry: registry,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
      };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        timeout_minutes: 30,
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await gateRunnerMod.runGate(config, progress, 'release-approval', { deps: configDeps2 });
  await flushAsync();

  assert.equal(stepExit(result), 0);
  assert.equal(stepGateStatus(result), 'PASS');
  assert.equal(result.correlation.gate_id, 'release-approval');
  assert.equal(result.correlation.gate_type, 'approval');
  assert.equal(gateState.status, 'APPROVED');

  const streamKey = 'pipeline:telemetry:behavior-approval-generic-wait:run-approval-generic-wait-1';
  const events = xaddEvents(streamKey).filter((event) => !String(event.type || '').startsWith('plugin.'));
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'approval.requested', 'approval.resolved', 'gate.verdict']);
  assert.equal(events[0].gate_id, 'release-approval');
  assert.equal(events[1].timeout_policy, 'BLOCK');
  assert.equal(events[2].status, 'APPROVED');
  assert.equal(events[3].verdict, 'PASS');
});

await record('approval signal wait reloads persisted deadline before timeout decisions', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-deadline-reload-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  const runId = 'run-approval-deadline-reload-1';
  const gate = {
    type: 'approval',
    title: 'Release Approval',
    timeout_minutes: 1,
    on_timeout: 'block',
  };
  const now = Date.now();
  const stalePending = {
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'PENDING_APPROVAL',
    run_id: runId,
    project: 'behavior-approval-deadline-reload',
    requested_at: new Date(now - 60000).toISOString(),
    deadline: new Date(now - 1000).toISOString(),
    timeout_minutes: 1,
    timeout_policy: 'BLOCK',
  };
  const extendedPending = {
    ...stalePending,
    deadline: new Date(now + 60000).toISOString(),
    reason: 'operator extended deadline',
  };
  const approvedAfterExtension = {
    ...extendedPending,
    status: 'APPROVED',
    decision_by: 'ops',
    decision_via: 'manual',
    reason: 'approved after extension',
    resolved_at: new Date(now + 1000).toISOString(),
  };

  let loadCount = 0;
  const savedStates = [];
  const decisions = [];
  const transitions = [];
    const configDeps3 = {
      approvalGate: {
        discord: async () => {},
        saveGateState: (_config, _gateId, state) => { savedStates.push(JSON.parse(JSON.stringify(state))); },
        loadGateState: () => {
          loadCount += 1;
          if (loadCount === 1) return stalePending;
          if (loadCount === 2) return extendedPending;
          return approvedAfterExtension;
        },
        appendTransition: (_config, _gateId, from, to, reason) => { transitions.push({ from, to, reason }); },
        writeApprovalRequest: () => {},
        writeApprovalDecision: (_config, _gateId, state) => { decisions.push(JSON.parse(JSON.stringify(state))); },
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-deadline-reload',
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
      };
  const progress = {
    modules: {},
    gates: { 'release-approval': gate },
    execution_order: ['gate:release-approval'],
  };

  const result = await approvalGateRunnerMod.waitForApprovalGateSignal(config, progress, 'release-approval', {
    diagnostics: { metadata: { timeout_policy: 'BLOCK' } },
  }, { deps: configDeps3 });
  await flushAsync();

  assert.equal(result.nextAction, 'pass');
  assert.equal(result.diagnostics.typed.gate.gateRunStatus, 'PASS');
  assert.equal(loadCount, 3);
  assert.equal(savedStates.some((state) => state.status === 'TIMED_OUT'), false);
  assert.equal(decisions.some((state) => state.status === 'TIMED_OUT'), false);
  assert.deepEqual(transitions.map((entry) => entry.to), ['APPROVED']);
});

await record('approval gate stage-owner block results preserve rejection semantics', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'gate.execute': {
        ...registry.stageOwners['gate.execute'],
        'gate:approval': {
          ...registry.stageOwners['gate.execute']['gate:approval'],
          implementation: {
            execute: async () => ({
              schemaVersion: 'v1',
              producerKind: 'gate',
              producerType: 'approval',
              nextAction: 'block',
              issueType: 'policy',
              diagnostics: {
                summary: "Gate 'release-approval' rejected: Needs changes",
                findings: [],
                metadata: {
                  reason: "Gate 'release-approval' rejected: Needs changes",
                  decision_by: 'nova',
                  decision_via: 'manual',
                  gate_id: 'release-approval',
                  gate_type: 'approval',
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

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-stage-block-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  const runId = 'run-approval-stage-block-1';
  const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-stage-block',
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    pluginRegistry: testRegistry,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
  };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await gateRunnerMod.runGate(config, progress, 'release-approval');

  assert.equal(stepExit(result), 1);
  assert.equal(stepGateStatus(result), 'FAIL');
  assert.equal(stepSummary(result), "Gate 'release-approval' rejected: Needs changes");
  assert.equal(stepMetadata(result).decision_by, 'nova');
  assert.equal(stepMetadata(result).decision_via, 'manual');
  assert.equal(result.correlation.gate_id, 'release-approval');
  assert.equal(result.correlation.gate_type, 'approval');
});

await record('approval gate invalid stage contracts fail closed with authoritative telemetry instead of crashing', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'gate.execute': {
        ...registry.stageOwners['gate.execute'],
        'gate:approval': {
          ...registry.stageOwners['gate.execute']['gate:approval'],
          implementation: {
            execute: async () => ({
              schemaVersion: 'v1',
              producerKind: 'gate',
              producerType: 'approval',
              nextAction: 'retry',
            }),
          },
        },
      },
    },
  };

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-stage-invalid-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  const runId = 'run-approval-stage-invalid-1';
  const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-stage-invalid',
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    pluginRegistry: testRegistry,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
  };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await gateRunnerMod.runGate(config, progress, 'release-approval');
  await flushAsync();

  assert.equal(stepExit(result), 1);
  assert(stepSummary(result).includes('Approval gate execution failed: Approval gate returned invalid control result:'));
  assert(stepSummary(result).includes("nextAction must be 'pass'"));
  assert(stepSummary(result).includes("'wait'"));
  assert(stepSummary(result).includes("'block' for gate:approval"));

  const streamKey = 'pipeline:telemetry:behavior-approval-stage-invalid:run-approval-stage-invalid-1';
  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
  assert.equal(events[0].gate_id, 'release-approval');
  assert.equal(events[0].gate_type, 'approval');
  assert.equal(events[1].gate_id, 'release-approval');
  assert.equal(events[1].gate_type, 'approval');
  assert(events[1].reason.includes('Approval gate execution failed: Approval gate returned invalid control result:'));
  assert(events[1].reason.includes("nextAction must be 'pass'"));
  assert(events[1].reason.includes("'wait'"));
  assert(events[1].reason.includes("'block' for gate:approval"));
});

await record('approval gate wait control results require typed wait payload', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'gate.execute': {
        ...registry.stageOwners['gate.execute'],
        'gate:approval': {
          ...registry.stageOwners['gate.execute']['gate:approval'],
          implementation: {
            execute: async () => ({
              schemaVersion: 'v1',
              producerKind: 'gate',
              producerType: 'approval',
              nextAction: 'wait',
              issueType: 'policy',
              diagnostics: {
                summary: 'Approval gate waiting without typed wait payload',
                findings: [],
                metadata: {},
                typed: {
                  gate: {
                    schemaVersion: 'v1',
                    gateRunStatus: 'WAIT',
                    outcomeClass: 'waiting',
                  },
                },
              },
            }),
          },
        },
      },
    },
  };

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-wait-missing-payload-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  const runId = 'run-approval-wait-missing-payload-1';
  const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-wait-missing-payload',
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    pluginRegistry: testRegistry,
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-26T00:00:00.000Z'),
  };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await gateRunnerMod.runGate(config, progress, 'release-approval');
  await flushAsync();

  assert.equal(stepExit(result), 1);
  assert.equal(result.outcome, 'error');
  assert.match(stepSummary(result), /wait action requires diagnostics\.typed\.wait/);

  const streamKey = 'pipeline:telemetry:behavior-approval-wait-missing-payload:run-approval-wait-missing-payload-1';
  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.equal(events.some((event) => event.type === 'gate.verdict' && String(event.reason || '').includes('wait action requires diagnostics.typed.wait')), true);
});

await record('pipeline scheduler consumes canonical approval timeout-continue lifecycle state without requiring gate-state files', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pipelineRunnerRuntimeMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner-scheduling.ts');
  const statusStoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-lifecycle-skip-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');

  const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-lifecycle-skip',
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    _runId: 'run-approval-lifecycle-skip-1',
    run_id: 'run-approval-lifecycle-skip-1',
  };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        on_timeout: 'continue',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  statusStoreMod.syncApprovalWaitState(config, 'release-approval', progress.gates['release-approval'], {
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'PENDING_APPROVAL',
    run_id: 'run-approval-lifecycle-skip-1',
    project: 'behavior-approval-lifecycle-skip',
    requested_at: '2026-04-21T00:00:00.000Z',
    deadline: '2026-04-21T00:30:00.000Z',
    timeout_minutes: 30,
    timeout_policy: 'CONTINUE',
  });
  statusStoreMod.syncApprovalWaitState(config, 'release-approval', progress.gates['release-approval'], {
    gate_id: 'release-approval',
    gate_type: 'approval',
    status: 'TIMED_OUT',
    run_id: 'run-approval-lifecycle-skip-1',
    project: 'behavior-approval-lifecycle-skip',
    requested_at: '2026-04-21T00:00:00.000Z',
    resolved_at: '2026-04-21T00:30:00.000Z',
    decision_via: 'timeout',
    continued: true,
    timeout_minutes: 30,
    timeout_policy: 'CONTINUE',
    reason: 'No decision received within 30 minutes',
  });

  assert.deepEqual(pipelineRunnerRuntimeMod.findNextStep(config, progress), { type: 'done' });
  assert.equal(fs.existsSync(pathsMod.gateStatusPath(config, 'release-approval')), false);
});

await record('approval gates emit canonical gate telemetry on operator approval', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  let gateState = null;
  let resolved = false;
    const configDeps4 = {
      approvalGate: {
        discord: async () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        saveGateState: (_config, _gateId, state) => { gateState = JSON.parse(JSON.stringify(state)); },
        loadGateState: () => {
          if (gateState?.status === 'PENDING_APPROVAL' && !resolved) {
            resolved = true;
            gateState = {
              ...gateState,
              status: 'APPROVED',
              decision_by: 'nova',
              decision_via: 'manual',
              reason: 'LGTM',
            };
          }
          return gateState;
        },
        sleep: async () => {},
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-gate',
    telemetry: platformApprovalDefaults().telemetry,
    _runId: 'run-approval-1',
    run_id: 'run-approval-1',
    paths: { swarm_dir: fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-gate-swarm-')) },
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
      };

  const progress = {
    modules: {},
    gates: {
      'midpoint-review': {
        type: 'approval',
        title: 'Midpoint Review',
        on_timeout: 'block',
      },
    },
    execution_order: ['01', 'gate:midpoint-review', '02'],
  };

  const result = await runGateViaRegistry(telemetryRuntimeRoot, config, progress, 'midpoint-review', { deps: configDeps4 });
  await flushAsync();

  assert.equal(stepExit(result), 0);
  assert.equal(stepGateStatus(result), 'PASS');
  assert.equal(gateState.timeout_policy, 'BLOCK');

  const streamKey = 'pipeline:telemetry:behavior-approval-gate:run-approval-1';
  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'approval.requested', 'approval.resolved', 'gate.verdict']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
  assert.equal(events[0].gate_id, 'midpoint-review');
  assert.equal(events[0].gate_type, 'approval');
  assert.equal(events[1].gate_type, 'approval');
  assert.equal(events[1].timeout_policy, 'BLOCK');
  assert.equal(events[2].gate_type, 'approval');
  assert.equal(events[3].verdict, 'PASS');
  assert.equal(events[3].gate_type, 'approval');
});

await record('approval gate timeouts emit canonical failure gate telemetry', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  let gateState = null;
    const configDeps5 = {
      approvalGate: {
        discord: async () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        saveGateState: (_config, _gateId, state) => { gateState = JSON.parse(JSON.stringify(state)); },
        loadGateState: () => gateState,
        sleep: async () => {},
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-timeout',
    telemetry: platformApprovalDefaults().telemetry,
    _runId: 'run-approval-timeout-1',
    run_id: 'run-approval-timeout-1',
    paths: { swarm_dir: fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-timeout-swarm-')) },
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
      };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        timeout_minutes: 0,
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await runGateViaRegistry(telemetryRuntimeRoot, config, progress, 'release-approval', { deps: configDeps5 });
  await flushAsync();

  assert.equal(stepExit(result), 1);
  assert.equal(stepGateStatus(result), 'TIMED_OUT');
  assert.equal(gateState.timeout_policy, 'BLOCK');

  const streamKey = 'pipeline:telemetry:behavior-approval-timeout:run-approval-timeout-1';
  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'approval.requested', 'approval.resolved', 'gate.verdict']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
  assert.equal(events[1].gate_type, 'approval');
  assert.equal(events[1].timeout_policy, 'BLOCK');
  assert.equal(events[2].choice, 'TIMED_OUT');
  assert.equal(events[2].gate_type, 'approval');
  assert.equal(events[3].verdict, 'FAIL');
  assert.equal(events[3].gate_type, 'approval');
  assert.equal(events[3].reason, 'Approval timed out after 0 minutes');
});

await record('approval timeout policies normalize to canonical uppercase in runtime telemetry and gate state', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  let gateState = null;
    const configDeps6 = {
      approvalGate: {
        discord: async () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        saveGateState: (_config, _gateId, state) => { gateState = JSON.parse(JSON.stringify(state)); },
        loadGateState: () => gateState,
        sleep: async () => {},
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-continue',
    telemetry: platformApprovalDefaults().telemetry,
    _runId: 'run-approval-continue-1',
    run_id: 'run-approval-continue-1',
    paths: { swarm_dir: fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-continue-swarm-')) },
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
      };

  const progress = {
    modules: {},
    gates: {
      'ops-approval': {
        type: 'approval',
        title: 'Ops Approval',
        timeout_minutes: 0,
        on_timeout: 'continue',
      },
    },
    execution_order: ['gate:ops-approval'],
  };

  const result = await runGateViaRegistry(telemetryRuntimeRoot, config, progress, 'ops-approval', { deps: configDeps6 });
  await flushAsync();

  assert.equal(stepExit(result), 0);
  assert.equal(stepMetadata(result).continued, true);
  assert.equal(gateState.timeout_policy, 'CONTINUE');

  const streamKey = 'pipeline:telemetry:behavior-approval-continue:run-approval-continue-1';
  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.equal(events[1].timeout_policy, 'CONTINUE');

  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  telemetryMod.onApprovalRequested({ config }, 'manual-approval', 'Manual Approval', 15, 'continue', { gate_type: 'approval' });
  await flushAsync();

  const helperEvents = xaddEvents(streamKey);
  assert.equal(helperEvents.length, 1);
  assert.equal(helperEvents[0].type, 'approval.requested');
  assert.equal(helperEvents[0].gate_type, 'approval');
  assert.equal(helperEvents[0].timeout_policy, 'CONTINUE');
});

await record('approval gate restart-time rejection still emits authoritative resolution telemetry', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.ts');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

    const configDeps7 = {
      approvalGate: {
        discord: async () => {},
        appendTransition: () => {},
        saveGateState: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        loadGateState: () => ({
          gate_id: 'release-approval',
          status: 'REJECTED',
          run_id: 'run-approval-resume-rejected-1',
          project: 'behavior-approval-resume-rejected',
          requested_at: '2026-04-09T00:00:00.000Z',
          resolved_at: '2026-04-09T00:05:00.000Z',
          timeout_policy: 'BLOCK',
          decision_by: 'nova',
          decision_via: 'manual',
          reason: 'Needs changes',
        }),
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-resume-rejected',
    telemetry: platformApprovalDefaults().telemetry,
    _runId: 'run-approval-resume-rejected-1',
    run_id: 'run-approval-resume-rejected-1',
    paths: { swarm_dir: fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-resume-rejected-swarm-')) },
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: registry,
      };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        timeout_minutes: 30,
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  await telemetryMod.onGateStarted({ config }, 'release-approval', progress.gates['release-approval']);
  telemetryMod.onApprovalRequested({ config }, 'release-approval', 'Release Approval', 30, 'block', { gate_type: 'approval' });

  const result = await runGateViaRegistry(telemetryRuntimeRoot, config, progress, 'release-approval', { deps: configDeps7 });
  await flushAsync();

  assert.equal(stepExit(result), 1);
  assert.equal(stepGateStatus(result), 'FAIL');
  assert.equal(stepSummary(result), "Gate 'release-approval' was previously rejected: Needs changes");

  const streamKey = 'pipeline:telemetry:behavior-approval-resume-rejected:run-approval-resume-rejected-1';
  const events = gateRuntimeEvents(xaddEvents, streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'approval.requested', 'approval.resolved', 'gate.verdict']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
  assert.equal(events[1].gate_type, 'approval');
  assert.equal(events[2].gate_id, 'release-approval');
  assert.equal(events[2].gate_type, 'approval');
  assert.equal(events[2].choice, 'REJECTED');
  assert.equal(events[2].resolved_by, 'nova');
  assert.equal(events[3].gate_id, 'release-approval');
  assert.equal(events[3].gate_type, 'approval');
  assert.equal(events[3].verdict, 'FAIL');
  assert.equal(events[3].reason, 'Needs changes');
});

await record('approval gate corrupted persisted state fails closed instead of reopening a fresh wait', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-corrupted-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'gates'));

  const discordCalls = [];
    const configDeps8 = {
      approvalGate: {
        discord: async (...args) => { discordCalls.push(args); },
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-corrupted',
    repo_root: repoRoot,
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _runId: 'run-approval-corrupted-1',
    run_id: 'run-approval-corrupted-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
      };

  fs.mkdirSync(config.paths.swarm_dir, { recursive: true });
  fs.writeFileSync(
    pathsMod.gateStatusPath(config, 'release-approval'),
    '{"status":"PENDING_APPROVAL", bad-json\n',
  );

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        timeout_minutes: 30,
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await runGateViaRegistry(telemetryRuntimeRoot, config, progress, 'release-approval', { deps: configDeps8 });

  assert.equal(stepExit(result), 1);
  assert.equal(stepGateStatus(result), 'FAIL');
  assert.equal(stepMetadata(result).corrupted_state, true);
  assert.match(stepSummary(result), /corrupted persisted state/i);
  assert.equal(discordCalls.length, 1);
  assert.equal(discordCalls[0][1], 'CRITICAL');
  assert.equal(fs.existsSync(path.join(logDir, 'gates', 'release-approval', 'approval-request.json')), false);

  const persisted = fs.readFileSync(pathsMod.gateStatusPath(config, 'release-approval'), 'utf8');
  assert.match(persisted, /bad-json/);
});

await record('approval gate unknown persisted status fails closed instead of reopening a fresh wait', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.ts');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-unknown-state-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'gates'));

  const discordCalls = [];
    const configDeps9 = {
      approvalGate: {
        discord: async (...args) => { discordCalls.push(args); },
      },
    };
const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-unknown-state',
    repo_root: repoRoot,
    telemetry: platformApprovalDefaults().telemetry,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _runId: 'run-approval-unknown-state-1',
    run_id: 'run-approval-unknown-state-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-26T00:00:00.000Z'),
    pluginRegistry: await buildBuiltInRegistry(telemetryRuntimeRoot),
      };

  fs.mkdirSync(config.paths.swarm_dir, { recursive: true });
  fs.writeFileSync(
    pathsMod.gateStatusPath(config, 'release-approval'),
    JSON.stringify({
      status: 'WAITING_FOR_MAYBE',
      gate_id: 'release-approval',
      gate_type: 'approval',
      requested_at: '2026-04-26T00:00:00.000Z',
      timeout_minutes: 30,
      timeout_policy: 'BLOCK',
    }, null, 2) + '\n',
  );

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        timeout_minutes: 30,
        on_timeout: 'block',
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await runGateViaRegistry(telemetryRuntimeRoot, config, progress, 'release-approval', { deps: configDeps9 });

  assert.equal(stepExit(result), 1);
  assert.equal(stepGateStatus(result), 'FAIL');
  assert.equal(stepMetadata(result).invalid_state, true);
  assert.match(stepSummary(result), /invalid persisted state status 'WAITING_FOR_MAYBE'/);
  assert.equal(discordCalls.length, 1);
  assert.equal(discordCalls[0][1], 'CRITICAL');
  assert.equal(fs.existsSync(path.join(logDir, 'gates', 'release-approval', 'approval-request.json')), false);

  const persisted = JSON.parse(fs.readFileSync(pathsMod.gateStatusPath(config, 'release-approval'), 'utf8'));
  assert.equal(persisted.status, 'WAITING_FOR_MAYBE');
});

await record('approval gate dependencies ignore diagnostic gate-state files and consume canonical approval read models', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);

  const dependenciesMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/dependencies.ts');
  const statusStoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-dependencies-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });

  const config = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-dependencies',
    _runId: 'run-approval-dependencies-1',
    run_id: 'run-approval-dependencies-1',
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
  };

  const progress = {
    modules: {
      '02': {
        title: 'After Approval',
        depends_on: ['gate:release-approval'],
      },
    },
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
        output_file: 'gates/release-approval-output.json',
        on_timeout: 'continue',
      },
    },
  };

  fs.writeFileSync(
    pathsMod.gateStatusPath(config, 'release-approval'),
    JSON.stringify({ status: 'APPROVED' }, null, 2),
  );
  assert.deepEqual(
    dependenciesMod.checkDependencies(config, progress, '02'),
    { met: false, reason: "Gate 'release-approval' not completed" },
    'diagnostic approval state must not satisfy scheduler dependencies',
  );

  statusStoreMod.syncApprovalWaitState(config, 'release-approval', progress.gates['release-approval'], {
    status: 'APPROVED',
    resolved_at: '2026-06-07T00:00:00.000Z',
    reason: 'Approved by operator',
  });
  assert.deepEqual(dependenciesMod.checkDependencies(config, progress, '02'), { met: true });

  const timeoutRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-dependencies-timeout-'));
  const timeoutSwarmDir = path.join(timeoutRepoRoot, '.swarm');
  fs.mkdirSync(timeoutSwarmDir, { recursive: true });
  const timeoutConfig = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-dependencies-timeout',
    _runId: 'run-approval-dependencies-timeout-1',
    run_id: 'run-approval-dependencies-timeout-1',
    paths: {
      swarm_dir: timeoutSwarmDir,
      modules_dir: path.join(timeoutRepoRoot, 'modules'),
    },
  };
  statusStoreMod.syncApprovalWaitState(timeoutConfig, 'release-approval', progress.gates['release-approval'], {
    status: 'TIMED_OUT',
    continued: true,
    resolved_at: '2026-06-07T00:01:00.000Z',
    reason: 'Approval timed out and continued',
  });
  assert.deepEqual(
    dependenciesMod.checkDependencies(timeoutConfig, progress, '02'),
    { met: true },
    'canonical timeout-continue approval read model should satisfy dependencies',
  );

  fs.writeFileSync(
    pathsMod.gateStatusPath(config, 'release-approval'),
    JSON.stringify({ status: 'REJECTED', continued: false }, null, 2),
  );
  assert.deepEqual(
    dependenciesMod.checkDependencies(config, progress, '02'),
    { met: true },
    'closed canonical approval read model should ignore later stale gate-state drift',
  );

  const rejectedRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-dependencies-rejected-'));
  const rejectedSwarmDir = path.join(rejectedRepoRoot, '.swarm');
  fs.mkdirSync(rejectedSwarmDir, { recursive: true });
  const rejectedConfig = {
    ...platformApprovalDefaults(),
    project: 'behavior-approval-dependencies-rejected',
    _runId: 'run-approval-dependencies-rejected-1',
    run_id: 'run-approval-dependencies-rejected-1',
    paths: {
      swarm_dir: rejectedSwarmDir,
      modules_dir: path.join(rejectedRepoRoot, 'modules'),
    },
  };

  fs.writeFileSync(
    pathsMod.gateStatusPath(rejectedConfig, 'release-approval'),
    JSON.stringify({ status: 'REJECTED', continued: false }, null, 2),
  );
  const diagnosticRejected = dependenciesMod.checkDependencies(rejectedConfig, progress, '02');
  assert.equal(diagnosticRejected.met, false);
  assert.equal(diagnosticRejected.reason, "Gate 'release-approval' not completed");

  statusStoreMod.syncApprovalWaitState(rejectedConfig, 'release-approval', progress.gates['release-approval'], {
    status: 'REJECTED',
    continued: false,
    resolved_at: '2026-06-07T00:02:00.000Z',
    reason: 'Needs changes',
  });
  const canonicalRejected = dependenciesMod.checkDependencies(rejectedConfig, progress, '02');
  assert.equal(canonicalRejected.met, false);
  assert.equal(canonicalRejected.reason, "Approval gate 'release-approval' is REJECTED");
});
}
