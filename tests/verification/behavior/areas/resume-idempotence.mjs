import {
  buildBuiltInRegistry,
  gateRuntimeEvents,
} from './helpers.mjs';

export async function registerResumeIdempotenceArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
  fs,
  os,
  path,
  assert,
  materializeRuntimeTree,
  importRuntimeModule,
  runGateViaRegistry,
}) {
  async function loadRuntimeModules() {
    const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(runtimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    return {
      runtimeRoot,
      pipelineRunnerMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts'),
      statusStoreMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts'),
      runtimeCoreMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts'),
      lifecycleStateMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.ts'),
      telemetryMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/telemetry.ts'),
      pathsMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/paths.ts'),
      constantsMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/constants.ts'),
      pipelineStepResultMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/contracts/pipeline-step-result.ts'),
    };
  }

  function createBaseRepoRoot(prefix) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    fs.mkdirSync(path.join(modulesDir, '01-scaffold'), { recursive: true });
    return { repoRoot, swarmDir, modulesDir };
  }

  async function buildResumeHarness() {
    const {
      runtimeRoot,
      pipelineRunnerMod,
      statusStoreMod,
      runtimeCoreMod,
      lifecycleStateMod,
      telemetryMod,
      pathsMod,
      pipelineStepResultMod,
    } = await loadRuntimeModules();
    const registry = await buildBuiltInRegistry(runtimeRoot);

    const { repoRoot, swarmDir, modulesDir } = createBaseRepoRoot('behavior-resume-idempotent-');
    const progress = {
      project: 'behavior-resume-idempotent',
      execution_order: ['01', 'gate:release-approval'],
      modules: {
        '01': { title: 'Scaffold', dir: '01-scaffold' },
      },
      gates: {
        'release-approval': {
          type: 'approval',
          title: 'Release Approval',
          timeout_minutes: 30,
          on_timeout: 'block',
        },
      },
    };

    const runId = 'run-resume-idempotent-1';
    const streamKey = `pipeline:telemetry:behavior-resume-idempotent:${runId}`;
    const moduleDispatchId = 'dispatch-module-01-attempt-1';
    const moduleSessionKey = 'agent:main:acp:resume-module-01';
    const approvalInterruptError = 'resume verifier simulated restart';

    const discordCalls = [];
    const moduleRunCalls = [];
    const archValidatorCalls = [];
    let interruptApprovalSignal = true;
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:architecture': {
            ...registry.stageOwners['validator.run']['validator:architecture'],
            implementation: {
              ...registry.stageOwners['validator.run']['validator:architecture'].implementation,
              run: async () => {
                archValidatorCalls.push('called');
                throw new Error('resume after module start should skip arch validation');
              },
            },
          },
        },
      },
    };

    const deps = {
      pipelineRunner: {
        discord: async (...args) => { discordCalls.push(args); },
        injectNeedsNova: async () => {},
        output: () => {},
        writeSummary: () => {},
        generateProjectSummary: async () => {},
        generatePipelineReview: async () => {},
        generateCaseStudy: async () => {},
        releaseGateFiles: async () => {},
        syncControlFiles: async () => {},
        runModule: async () => {
          moduleRunCalls.push({ module_id: '01', dispatch_id: moduleDispatchId });
          const status = statusStoreMod.loadStatus(config, '01-scaffold')
            || statusStoreMod.initStatus('01', progress.modules['01']);
          const oldStatus = status.status || 'PENDING';
          if (!status.current_phase) {
            const startTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Repeated resume verifier started module', {
              now: '2026-04-17T00:00:30.000Z',
            });
            statusStoreMod.saveStatus(config, '01-scaffold', status, startTransition);
          }
          const passTransition = lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
            agent: 'forge',
            note: 'Repeated resume verifier completed module once',
            now: '2026-04-17T00:01:00.000Z',
            completedAt: '2026-04-17T00:01:00.000Z',
          });
          status.active_agent = {
            attempt: 1,
            dispatch_id: moduleDispatchId,
            gateway_label: moduleDispatchId,
            session_key: moduleSessionKey,
          };
          statusStoreMod.saveStatus(config, '01-scaffold', status, passTransition);
          telemetryMod.onModuleStatusChanged({ config }, '01', {
            title: 'Scaffold',
            old_status: oldStatus,
            new_status: 'PASS',
            phase: 'forge',
            attempt: 1,
            dispatch_id: moduleDispatchId,
            gateway_label: moduleDispatchId,
            session_key: moduleSessionKey,
            reason: 'Repeated resume verifier completed module once',
          });
          return pipelineStepResultMod.buildPipelineStepResult({
            stepType: pipelineStepResultMod.PIPELINE_STEP_TYPES.MODULE,
            stepId: '01',
            nextAction: pipelineStepResultMod.PIPELINE_STEP_ACTIONS.CONTINUE,
            outcome: pipelineStepResultMod.PIPELINE_STEP_OUTCOMES.PASSED,
            reason: 'Repeated resume verifier completed module once',
            correlation: {
              module_id: '01',
              attempt: 1,
              dispatch_id: moduleDispatchId,
              gateway_label: moduleDispatchId,
              session_key: moduleSessionKey,
            },
            terminalAction: 'none',
            terminalScope: 'module',
          });
        },
        runGate: async (...args) => {
          const [gateConfig, gateProgress, gateId, gateOpts] = args;
          return runGateViaRegistry(runtimeRoot, gateConfig, gateProgress, gateId, gateOpts || {});
        },
      },
      approvalGate: {
        discord: async (...args) => { discordCalls.push(args); },
        createSignalAdapter: (_config, { eventBus, gateId }) => ({
          start: () => {
            if (interruptApprovalSignal) {
              interruptApprovalSignal = false;
              throw new Error(approvalInterruptError);
            }
            const gateStatePath = pathsMod.gateStatusPath(config, 'release-approval');
            const current = JSON.parse(fs.readFileSync(gateStatePath, 'utf8'));
            const approved = {
              ...current,
              status: 'APPROVED',
              resolved_at: '2026-04-17T00:02:00.000Z',
              decision_by: 'Nova Test',
              decision_via: 'resume-verifier',
              reason: 'Approved during repeated resume verification',
            };
            fs.writeFileSync(gateStatePath, JSON.stringify(approved, null, 2) + '\n');
            eventBus.emit({
              type: 'approval.signal',
              source: 'local_fs',
              identity: { gate_id: gateId, run_id: config._runId },
              payload: {
                gate_id: gateId,
                gate_type: 'approval',
                run_id: config._runId,
                project: config.project,
                wait_ref: current.wait_ref || null,
                status: 'APPROVED',
                signal_kind: 'approve',
                requested_at: current.requested_at || null,
                deadline: current.deadline || null,
                timeout_minutes: current.timeout_minutes ?? null,
                timeout_policy: current.timeout_policy || 'BLOCK',
                resolved_at: approved.resolved_at,
                decision_by: approved.decision_by,
                decision_via: approved.decision_via,
                continued: approved.continued ?? null,
                reason: approved.reason,
                state_path: gateStatePath,
                updated_at: approved.updated_at || null,
              },
            });
            return { watching: 0, path: gateStatePath };
          },
          stop: () => {},
        }),
      },
    };
    const config = {
      project: 'behavior-resume-idempotent',
      repo_root: repoRoot,
      resume: true,
      telemetry: { enabled: true },
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
      pluginRegistry: testRegistry,
    };

    statusStoreMod.initLogDir(config, { config, runId });
    statusStoreMod.saveStatus(config, '01-scaffold', statusStoreMod.initStatus('01', progress.modules['01']));

    return {
      pipelineRunnerMod,
      progress,
      config,
      deps,
      streamKey,
      discordCalls,
      moduleRunCalls,
      archValidatorCalls,
      approvalInterruptError,
      gateStatusPath: pathsMod.gateStatusPath(config, 'release-approval'),
      gateTransitionPath: path.join(swarmDir, 'logs', 'gates', 'release-approval', 'approval-transitions.jsonl'),
    };
  }

  async function runRepeatedResumeScenario() {
    const harness = await buildResumeHarness();
    let firstExit = null;
    try {
      firstExit = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { skipArchValidation: true, deps: harness.deps });
    } catch (error) {
      assert.match(error.message, new RegExp(harness.approvalInterruptError));
      firstExit = 1;
    }
    assert.equal(firstExit, 1, `first gate-phase interrupt should halt the generic gate runner; moduleRunCalls=${harness.moduleRunCalls.length}; discordCalls=${harness.discordCalls.length}; gateExists=${fs.existsSync(harness.gateStatusPath)}`);

    const secondExit = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true, deps: harness.deps });
    const thirdExit = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true, deps: harness.deps });
    await flushAsync();

    return { ...harness, secondExit, thirdExit, events: xaddEvents(harness.streamKey) };
  }

  async function buildArchValidationResumeHarness({ seedStartedModule }) {
    const {
      runtimeRoot,
      pipelineRunnerMod,
      statusStoreMod,
      runtimeCoreMod,
      lifecycleStateMod,
      constantsMod,
      pipelineStepResultMod,
    } = await loadRuntimeModules();
    const registry = await buildBuiltInRegistry(runtimeRoot);

    const { repoRoot, swarmDir, modulesDir } = createBaseRepoRoot(`behavior-resume-arch-${seedStartedModule ? 'started' : 'fresh'}-`);
    const progress = {
      project: seedStartedModule ? 'behavior-resume-arch-started' : 'behavior-resume-arch-fresh',
      execution_order: ['01'],
      modules: {
        '01': { title: 'Scaffold', dir: '01-scaffold' },
      },
    };

    const runId = seedStartedModule ? 'run-resume-arch-started-1' : 'run-resume-arch-fresh-1';
    const archValidatorCalls = [];
    const moduleRunCalls = [];
    const testRegistry = {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:architecture': {
            ...registry.stageOwners['validator.run']['validator:architecture'],
            implementation: {
              ...registry.stageOwners['validator.run']['validator:architecture'].implementation,
              run: async () => {
                archValidatorCalls.push('called');
                return {
                  schemaVersion: 'v1', producerKind: 'validator', producerType: 'architecture',
                  nextAction: 'block', issueType: 'code',
                  diagnostics: { summary: 'Synthetic arch block' },
                };
              },
            },
          },
        },
      },
    };

        const configDeps2 = {
        pipelineRunner: {
          discord: async () => {},
          injectNeedsNova: async () => {},
          output: () => {},
          writeSummary: () => {},
          generateProjectSummary: async () => {},
          generatePipelineReview: async () => {},
          generateCaseStudy: async () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          runModule: async () => {
            moduleRunCalls.push('01');
            const status = statusStoreMod.loadStatus(config, '01-scaffold')
              || statusStoreMod.initStatus('01', progress.modules['01']);
            if (!status.current_phase) {
              const startTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Resume arch-validation verifier started module', {
                now: '2026-04-17T00:04:00.000Z',
              });
              statusStoreMod.saveStatus(config, '01-scaffold', status, startTransition);
            }
            const passTransition = lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
              agent: 'forge',
              note: 'Resume arch-validation verifier completed module',
              now: '2026-04-17T00:05:00.000Z',
              completedAt: '2026-04-17T00:05:00.000Z',
            });
            statusStoreMod.saveStatus(config, '01-scaffold', status, passTransition);
            return pipelineStepResultMod.buildPipelineStepResult({
              stepType: pipelineStepResultMod.PIPELINE_STEP_TYPES.MODULE,
              stepId: '01',
              nextAction: pipelineStepResultMod.PIPELINE_STEP_ACTIONS.CONTINUE,
              outcome: pipelineStepResultMod.PIPELINE_STEP_OUTCOMES.PASSED,
              reason: 'Resume arch-validation verifier completed module',
              correlation: { module_id: '01' },
              terminalAction: 'none',
              terminalScope: 'module',
            });
          },
        },
      };
    const config = {
      project: progress.project,
      repo_root: repoRoot,
      resume: true,
      telemetry: { enabled: true },
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
      pluginRegistry: testRegistry,
    };

    statusStoreMod.initLogDir(config, { config, runId });
    const status = statusStoreMod.initStatus('01', progress.modules['01']);
    let seedTransition = null;
    if (seedStartedModule) {
      seedTransition = lifecycleStateMod.startModulePhase(status, 'forge', 'Synthetic started module for resume arch-validation verifier', {
        now: '2026-04-17T00:03:00.000Z',
      });
    }
    statusStoreMod.saveStatus(config, '01-scaffold', status, seedTransition);

    return {
      pipelineRunnerMod,
      progress,
      config,
      deps: configDeps2,
      archValidatorCalls,
      moduleRunCalls,
      constantsMod,
    };
  }

  await record('repeated full --resume does not redispatch an already-completed module or duplicate its PASS transition after a gate-phase interrupt', async () => {
    const result = await runRepeatedResumeScenario();

    assert.equal(result.secondExit, 0);
    assert.equal(result.thirdExit, 0);
    assert.equal(result.moduleRunCalls.length, 1);
    assert.equal(result.archValidatorCalls.length, 0);

    const passEvents = result.events.filter((event) =>
      event.type === 'module.status_changed'
      && event.module_id === '01'
      && event.new_status === 'PASS'
    );
    assert.equal(passEvents.length, 1);
    assert.equal(passEvents[0].dispatch_id, 'dispatch-module-01-attempt-1');
    assert.equal(passEvents[0].gateway_label, 'dispatch-module-01-attempt-1');
    assert.equal(passEvents[0].session_key, 'agent:main:acp:resume-module-01');

    const finalStatus = result.config && result.pipelineRunnerMod
      ? (await loadRuntimeModules()).statusStoreMod.loadStatus(result.config, '01-scaffold')
      : null;
    assert.equal(finalStatus.status, 'PASS');
    assert.equal(finalStatus.history.filter((entry) => entry.to === 'PASS').length, 1);
  });

  await record('repeated full --resume reuses pending approval state without duplicate request telemetry, duplicate Discord sink delivery, or transitions', async () => {
    const result = await runRepeatedResumeScenario();

    assert.equal(result.secondExit, 0);
    assert.equal(result.thirdExit, 0);
    assert.equal(result.archValidatorCalls.length, 0);
    assert.equal(fs.existsSync(result.gateStatusPath), true);

    const gateStartedEvents = result.events.filter((event) => event.type === 'gate.started' && event.gate_id === 'release-approval');
    const approvalRequestedEvents = result.events.filter((event) => event.type === 'approval.requested' && event.gate_id === 'release-approval');
    const approvalResolvedEvents = result.events.filter((event) => event.type === 'approval.resolved' && event.gate_id === 'release-approval');
    const gateGoVerdictEvents = result.events.filter((event) => event.type === 'gate.verdict' && event.gate_id === 'release-approval' && event.verdict === 'GO');

    assert.equal(gateStartedEvents.length, 1);
    assert.equal(approvalRequestedEvents.length, 1);
    assert.equal(approvalResolvedEvents.length, 1);
    assert.equal(gateGoVerdictEvents.length, 1);

    const approvalRequestPosts = result.discordCalls.filter(([, , title]) => title === '⏸️ Approval Required: Release Approval');
    assert.equal(approvalRequestPosts.length, 1);

    const transitionLines = fs.readFileSync(result.gateTransitionPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(transitionLines.map((entry) => entry.to), ['PENDING_APPROVAL', 'APPROVED']);

    const finalGateState = JSON.parse(fs.readFileSync(result.gateStatusPath, 'utf8'));
    assert.equal(finalGateState.status, 'APPROVED');
    assert.equal(finalGateState.reason, 'Approved during repeated resume verification');
  });

  await record('resume skips pre-pipeline arch validation once a module has already started', async () => {
    const harness = await buildArchValidationResumeHarness({ seedStartedModule: true });
    const exitCode = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true, deps: harness.deps });

    assert.equal(exitCode, 0);
    assert.equal(harness.archValidatorCalls.length, 0);
    assert.equal(harness.moduleRunCalls.length, 1);
  });

  await record('resume still runs pre-pipeline arch validation when no module has started yet', async () => {
    const harness = await buildArchValidationResumeHarness({ seedStartedModule: false });
    const exitCode = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true, deps: harness.deps });

    assert.equal(exitCode, harness.constantsMod.EXIT_ERROR);
    assert.equal(harness.archValidatorCalls.length, 1);
    assert.equal(harness.moduleRunCalls.length, 0);
  });
}
