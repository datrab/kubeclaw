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
async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
  const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

await record('approval gates execute through gate stage owners and preserve timeout-continue pass semantics', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const statusStoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
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
                  metadata: {
                    legacy_result: {
                      exit: 0,
                      status: 'TIMED_OUT',
                      continued: true,
                      timeout_policy: 'CONTINUE',
                      gate_id: 'release-approval',
                      gate_type: 'approval',
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

  const config = {
    project: 'behavior-approval-stage-pass',
    telemetry: { enabled: true },
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    _pluginRegistry: testRegistry,
    _logDir: logDir,
    _runLogDir: path.join(logDir, 'pipeline', 'runs', runId),
    _runId: runId,
    run_id: runId,
    _runStats: runtimeCoreMod.createRunStats('2026-04-21T00:00:00.000Z'),
    _testOverrides: {
      gateRunner: {
        runners: {
          approval: async () => {
            throw new Error('legacy approval runner fallback should not run when stage owner is registered');
          },
        },
      },
    },
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

  assert.equal(result.exit, 0);
  assert.equal(result.status, 'TIMED_OUT');
  assert.equal(result.continued, true);
  assert.equal(result.gate_id, 'release-approval');
  assert.equal(result.gate_type, 'approval');
  assert.equal(approvalCalls.length, 1);
  assert.equal(approvalCalls[0].ids.stageId, 'gate:approval');
  assert.equal(approvalCalls[0].ids.gateId, 'release-approval');
  assert.equal(approvalCalls[0].ids.gateType, 'approval');
  assert.equal(approvalCalls[0].refs.gateEvaluationRef, 'gate_evaluation:run-approval-stage-pass-1:release-approval:1');
  assert.equal(approvalCalls[0].refs.waitRef, 'wait:run-approval-stage-pass-1:gate:release-approval:approval');
  assert.equal(approvalCalls[0].stateSnapshot.gate.lifecycle_status, 'TIMED_OUT');
  assert.equal(approvalCalls[0].stateSnapshot.gate.lifecycle_scheduler_consumed, true);
});

await record('approval gate stage-owner block results preserve rejection semantics', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
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
                metadata: {
                  legacy_result: {
                    exit: 10,
                    status: 'REJECTED',
                    reason: "Gate 'release-approval' rejected: Needs changes",
                    decision_by: 'nova',
                    decision_via: 'manual',
                    gate_id: 'release-approval',
                    gate_type: 'approval',
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
    project: 'behavior-approval-stage-block',
    telemetry: { enabled: true },
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    _pluginRegistry: testRegistry,
    _logDir: logDir,
    _runLogDir: path.join(logDir, 'pipeline', 'runs', runId),
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
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await gateRunnerMod.runGate(config, progress, 'release-approval');

  assert.equal(result.exit, 10);
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, "Gate 'release-approval' rejected: Needs changes");
  assert.equal(result.decision_by, 'nova');
  assert.equal(result.decision_via, 'manual');
  assert.equal(result.gate_id, 'release-approval');
  assert.equal(result.gate_type, 'approval');
});

await record('approval gate invalid stage contracts fail closed with authoritative telemetry instead of crashing', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const gateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
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
    project: 'behavior-approval-stage-invalid',
    telemetry: { enabled: true },
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    _pluginRegistry: testRegistry,
    _logDir: logDir,
    _runLogDir: path.join(logDir, 'pipeline', 'runs', runId),
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
      },
    },
    execution_order: ['gate:release-approval'],
  };

  const result = await gateRunnerMod.runGate(config, progress, 'release-approval');
  await flushAsync();

  assert.equal(result.exit, 1);
  assert(result.reason.includes('Approval gate execution failed: Approval gate returned invalid control result:'));
  assert(result.reason.includes("nextAction must be 'pass'"));
  assert(result.reason.includes("'block' for gate:approval"));

  const streamKey = 'pipeline:telemetry:behavior-approval-stage-invalid:run-approval-stage-invalid-1';
  const events = xaddEvents(streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'gate.verdict']);
  assert.equal(events[0].gate_id, 'release-approval');
  assert.equal(events[0].gate_type, 'approval');
  assert.equal(events[1].gate_id, 'release-approval');
  assert.equal(events[1].gate_type, 'approval');
  assert(events[1].reason.includes('Approval gate execution failed: Approval gate returned invalid control result:'));
  assert(events[1].reason.includes("nextAction must be 'pass'"));
  assert(events[1].reason.includes("'block' for gate:approval"));
});

await record('pipeline scheduler consumes canonical approval timeout-continue lifecycle state without requiring gate-state files', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const pipelineRunnerRuntimeMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
  const statusStoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/status-store.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-lifecycle-skip-'));
  const swarmDir = path.join(root, '.swarm');
  const logDir = path.join(swarmDir, 'logs');

  const config = {
    project: 'behavior-approval-lifecycle-skip',
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(root, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-approval-lifecycle-skip-1',
    run_id: 'run-approval-lifecycle-skip-1',
  };

  const progress = {
    modules: {},
    gates: {
      'release-approval': {
        type: 'approval',
        title: 'Release Approval',
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

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  let gateState = null;
  let resolved = false;
  const config = {
    project: 'behavior-approval-gate',
    telemetry: { enabled: true },
    _runId: 'run-approval-1',
    run_id: 'run-approval-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _approvalPollIntervalMs: 0,
    _pluginRegistry: registry,
    _testOverrides: {
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
    },
  };

  const progress = {
    modules: {},
    gates: {
      'midpoint-review': {
        type: 'approval',
        title: 'Midpoint Review',
      },
    },
    execution_order: ['01', 'gate:midpoint-review', '02'],
  };

  const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'midpoint-review');
  await flushAsync();

  assert.equal(result.exit, 0);
  assert.equal(result.status, 'APPROVED');
  assert.equal(gateState.timeout_policy, 'BLOCK');

  const streamKey = 'pipeline:telemetry:behavior-approval-gate:run-approval-1';
  const events = xaddEvents(streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'approval.requested', 'approval.resolved', 'gate.verdict']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
  assert.equal(events[0].gate_id, 'midpoint-review');
  assert.equal(events[0].gate_type, 'approval');
  assert.equal(events[1].gate_type, 'approval');
  assert.equal(events[1].timeout_policy, 'BLOCK');
  assert.equal(events[2].gate_type, 'approval');
  assert.equal(events[3].verdict, 'GO');
  assert.equal(events[3].gate_type, 'approval');
});

await record('approval gate timeouts emit canonical failure gate telemetry', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  let gateState = null;
  const config = {
    project: 'behavior-approval-timeout',
    telemetry: { enabled: true },
    _runId: 'run-approval-timeout-1',
    run_id: 'run-approval-timeout-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _approvalPollIntervalMs: 0,
    _pluginRegistry: registry,
    _testOverrides: {
      approvalGate: {
        discord: async () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        saveGateState: (_config, _gateId, state) => { gateState = JSON.parse(JSON.stringify(state)); },
        loadGateState: () => gateState,
        sleep: async () => {},
      },
    },
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

  const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'release-approval');
  await flushAsync();

  assert.equal(result.exit, 10);
  assert.equal(result.status, 'TIMED_OUT');
  assert.equal(gateState.timeout_policy, 'BLOCK');

  const streamKey = 'pipeline:telemetry:behavior-approval-timeout:run-approval-timeout-1';
  const events = xaddEvents(streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'approval.requested', 'approval.resolved', 'gate.verdict']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
  assert.equal(events[1].gate_type, 'approval');
  assert.equal(events[1].timeout_policy, 'BLOCK');
  assert.equal(events[2].choice, 'TIMED_OUT');
  assert.equal(events[2].gate_type, 'approval');
  assert.equal(events[3].verdict, 'NO-GO');
  assert.equal(events[3].gate_type, 'approval');
  assert.equal(events[3].reason, 'Approval timed out after 0 minutes');
});

await record('approval timeout policies normalize to canonical uppercase in runtime telemetry and gate state', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.js');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  let gateState = null;
  const config = {
    project: 'behavior-approval-continue',
    telemetry: { enabled: true },
    _runId: 'run-approval-continue-1',
    run_id: 'run-approval-continue-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _approvalPollIntervalMs: 0,
    _pluginRegistry: registry,
    _testOverrides: {
      approvalGate: {
        discord: async () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        saveGateState: (_config, _gateId, state) => { gateState = JSON.parse(JSON.stringify(state)); },
        loadGateState: () => gateState,
        sleep: async () => {},
      },
    },
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

  const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'ops-approval');
  await flushAsync();

  assert.equal(result.exit, 0);
  assert.equal(result.continued, true);
  assert.equal(gateState.timeout_policy, 'CONTINUE');

  const streamKey = 'pipeline:telemetry:behavior-approval-continue:run-approval-continue-1';
  const events = xaddEvents(streamKey);
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

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  const telemetryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/telemetry.js');
  const registry = await buildBuiltInRegistry(telemetryRuntimeRoot);

  const config = {
    project: 'behavior-approval-resume-rejected',
    telemetry: { enabled: true },
    _runId: 'run-approval-resume-rejected-1',
    run_id: 'run-approval-resume-rejected-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _approvalPollIntervalMs: 0,
    _pluginRegistry: registry,
    _testOverrides: {
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
          decision_by: 'nova',
          decision_via: 'manual',
          reason: 'Needs changes',
        }),
      },
    },
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

  const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'release-approval');
  await flushAsync();

  assert.equal(result.exit, 10);
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, "Gate 'release-approval' was previously rejected: Needs changes");

  const streamKey = 'pipeline:telemetry:behavior-approval-resume-rejected:run-approval-resume-rejected-1';
  const events = xaddEvents(streamKey);
  assert.deepEqual(events.map((event) => event.type), ['gate.started', 'approval.requested', 'approval.resolved', 'gate.verdict']);
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
  assert.equal(events[1].gate_type, 'approval');
  assert.equal(events[2].gate_id, 'release-approval');
  assert.equal(events[2].gate_type, 'approval');
  assert.equal(events[2].choice, 'REJECTED');
  assert.equal(events[2].resolved_by, 'nova');
  assert.equal(events[3].gate_id, 'release-approval');
  assert.equal(events[3].gate_type, 'approval');
  assert.equal(events[3].verdict, 'NO-GO');
  assert.equal(events[3].reason, 'Needs changes');
});

await record('approval gate corrupted persisted state fails closed instead of reopening a fresh wait', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);
  globalThis.__fakeRedisCalls = [];
  globalThis.__fakeRedisCounters = Object.create(null);

  const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
  const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-corrupted-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  const logDir = path.join(swarmDir, 'logs');
  ensureDir(path.join(logDir, 'pipeline'));
  ensureDir(path.join(logDir, 'gates'));

  const discordCalls = [];
  const config = {
    project: 'behavior-approval-corrupted',
    repo_root: repoRoot,
    telemetry: { enabled: true },
    paths: {
      swarm_dir: swarmDir,
      modules_dir: path.join(repoRoot, 'modules'),
    },
    _logDir: logDir,
    _runId: 'run-approval-corrupted-1',
    run_id: 'run-approval-corrupted-1',
    _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
    _approvalPollIntervalMs: 0,
    _testOverrides: {
      approvalGate: {
        discord: async (...args) => { discordCalls.push(args); },
      },
    },
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

  const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'release-approval');

  assert.equal(result.exit, 10);
  assert.equal(result.status, 'CORRUPTED_STATE');
  assert.equal(result.corrupted_state, true);
  assert.match(result.reason, /corrupted persisted state/i);
  assert.equal(discordCalls.length, 1);
  assert.equal(discordCalls[0][1], 'CRITICAL');
  assert.equal(fs.existsSync(path.join(logDir, 'gates', 'release-approval', 'approval-request.json')), false);

  const persisted = fs.readFileSync(pathsMod.gateStatusPath(config, 'release-approval'), 'utf8');
  assert.match(persisted, /bad-json/);
});

await record('approval gate dependencies trust persisted approval state and accept timeout-continue without requiring output files', async () => {
  const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
  installFakeRedis(telemetryRuntimeRoot);

  const dependenciesMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/dependencies.js');

  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-dependencies-'));
  const swarmDir = path.join(repoRoot, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });

  const config = {
    project: 'behavior-approval-dependencies',
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
      },
    },
  };

  fs.writeFileSync(
    pathsMod.gateStatusPath(config, 'release-approval'),
    JSON.stringify({ status: 'APPROVED' }, null, 2),
  );
  assert.deepEqual(dependenciesMod.checkDependencies(config, progress, '02'), { met: true });

  fs.writeFileSync(
    pathsMod.gateStatusPath(config, 'release-approval'),
    JSON.stringify({ status: 'TIMED_OUT', continued: true }, null, 2),
  );
  assert.deepEqual(dependenciesMod.checkDependencies(config, progress, '02'), { met: true });

  fs.writeFileSync(
    pathsMod.gateStatusPath(config, 'release-approval'),
    JSON.stringify({ status: 'REJECTED', continued: false }, null, 2),
  );
  const rejected = dependenciesMod.checkDependencies(config, progress, '02');
  assert.equal(rejected.met, false);
  assert.equal(rejected.reason, "Approval gate 'release-approval' is REJECTED");
});
}
