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
}) {
  async function buildBuiltInRegistry(runtimeRoot) {
    const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
    const { registry, errors } = registryMod.buildPluginRegistry({}, { throwOnError: false });
    assert.equal(errors.length, 0);
    const generatorStageOwners = {};
    for (const stageId of ['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']) {
      generatorStageOwners[stageId] = {
        ...registry.stageOwners['generator.run'][stageId],
        implementation: {
          ...registry.stageOwners['generator.run'][stageId].implementation,
          run: async () => ({
            schemaVersion: 'v1',
            producerKind: 'generator',
            producerType: String(stageId).split(':')[1] || 'unknown',
            outputs: { status: 'passed' },
          }),
        },
      };
    }
    return {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'generator.run': {
          ...registry.stageOwners['generator.run'],
          ...generatorStageOwners,
        },
      },
    };
  }

  async function loadRuntimeModules() {
    const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(runtimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    return {
      runtimeRoot,
      pipelineRunnerMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js'),
      approvalGateRunnerMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js'),
      statusStoreMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.js'),
      runtimeCoreMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.js'),
      lifecycleStateMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.js'),
      telemetryMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/telemetry.js'),
      pathsMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/paths.js'),
      constantsMod: await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/constants.js'),
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
      approvalGateRunnerMod,
      statusStoreMod,
      runtimeCoreMod,
      lifecycleStateMod,
      telemetryMod,
      pathsMod,
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
    let interruptApprovalPolling = true;
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
      _approvalPollIntervalMs: 0,
      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
      _pluginRegistry: testRegistry,
      _testOverrides: {
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
              lifecycleStateMod.startModulePhase(status, 'forge', 'Repeated resume verifier started module', {
                now: '2026-04-17T00:00:30.000Z',
              });
              statusStoreMod.saveStatus(config, '01-scaffold', status);
            }
            lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
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
            statusStoreMod.saveStatus(config, '01-scaffold', status);
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
            return {
              exit: 0,
              module: '01',
              attempt: 1,
              dispatch_id: moduleDispatchId,
              gateway_label: moduleDispatchId,
              session_key: moduleSessionKey,
            };
          },
          runGate: async (...args) => approvalGateRunnerMod.runApprovalGate(...args),
        },
        approvalGate: {
          discord: async (...args) => { discordCalls.push(args); },
          sleep: async () => {
            if (interruptApprovalPolling) {
              interruptApprovalPolling = false;
              throw new Error(approvalInterruptError);
            }
            const gateStatePath = pathsMod.gateStatusPath(config, 'release-approval');
            const current = JSON.parse(fs.readFileSync(gateStatePath, 'utf8'));
            fs.writeFileSync(gateStatePath, JSON.stringify({
              ...current,
              status: 'APPROVED',
              resolved_at: '2026-04-17T00:02:00.000Z',
              decision_by: 'Nova Test',
              decision_via: 'resume-verifier',
              reason: 'Approved during repeated resume verification',
            }, null, 2) + '\n');
          },
        },
      },
    };

    statusStoreMod.initLogDir(config, { config, runId });
    statusStoreMod.saveStatus(config, '01-scaffold', statusStoreMod.initStatus('01', progress.modules['01']));

    return {
      pipelineRunnerMod,
      progress,
      config,
      streamKey,
      discordCalls,
      moduleRunCalls,
      archValidatorCalls,
      approvalInterruptError,
      gateStatusPath: pathsMod.gateStatusPath(config, 'release-approval'),
      gateTransitionPath: path.join(config._logDir, 'gates', 'release-approval', 'approval-transitions.jsonl'),
      statusPath: pathsMod.statusPath(config, '01-scaffold'),
    };
  }

  async function runRepeatedResumeScenario() {
    const harness = await buildResumeHarness();
    await assert.rejects(
      async () => harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { skipArchValidation: true }),
      new RegExp(harness.approvalInterruptError)
    );

    const secondExit = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true });
    const thirdExit = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true });
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
                  blocked: true,
                  findings: [{ id: 'TEST_BLOCK', severity: 'blocking', explanation: 'Synthetic arch block' }],
                };
              },
            },
          },
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
      _pluginRegistry: testRegistry,
      _testOverrides: {
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
              lifecycleStateMod.startModulePhase(status, 'forge', 'Resume arch-validation verifier started module', {
                now: '2026-04-17T00:04:00.000Z',
              });
              statusStoreMod.saveStatus(config, '01-scaffold', status);
            }
            lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
              agent: 'forge',
              note: 'Resume arch-validation verifier completed module',
              now: '2026-04-17T00:05:00.000Z',
              completedAt: '2026-04-17T00:05:00.000Z',
            });
            statusStoreMod.saveStatus(config, '01-scaffold', status);
            return { exit: 0, module: '01' };
          },
        },
      },
    };

    statusStoreMod.initLogDir(config, { config, runId });
    const status = statusStoreMod.initStatus('01', progress.modules['01']);
    if (seedStartedModule) {
      lifecycleStateMod.startModulePhase(status, 'forge', 'Synthetic started module for resume arch-validation verifier', {
        now: '2026-04-17T00:03:00.000Z',
      });
    }
    statusStoreMod.saveStatus(config, '01-scaffold', status);

    return {
      pipelineRunnerMod,
      progress,
      config,
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

    const finalStatus = JSON.parse(fs.readFileSync(result.statusPath, 'utf8'));
    assert.equal(finalStatus.status, 'PASS');
    assert.equal(finalStatus.history.filter((entry) => entry.to === 'PASS').length, 1);
  });

  await record('repeated full --resume reuses pending approval state without duplicate request telemetry, direct Discord fallback, or transitions', async () => {
    const result = await runRepeatedResumeScenario();

    assert.equal(result.secondExit, 0);
    assert.equal(result.thirdExit, 0);
    assert.equal(result.archValidatorCalls.length, 0);
    assert.equal(fs.existsSync(result.gateStatusPath), true);

    const gateStartedEvents = result.events.filter((event) => event.type === 'gate.started' && event.gate_id === 'release-approval');
    const approvalRequestedEvents = result.events.filter((event) => event.type === 'approval.requested' && event.gate_id === 'release-approval');
    const approvalResolvedEvents = result.events.filter((event) => event.type === 'approval.resolved' && event.gate_id === 'release-approval');
    const gateVerdictEvents = result.events.filter((event) => event.type === 'gate.verdict' && event.gate_id === 'release-approval');

    assert.equal(gateStartedEvents.length, 1);
    assert.equal(approvalRequestedEvents.length, 1);
    assert.equal(approvalResolvedEvents.length, 1);
    assert.equal(gateVerdictEvents.length, 1);
    assert.equal(gateVerdictEvents[0].verdict, 'GO');

    const approvalRequestPosts = result.discordCalls.filter(([, , title]) => title === '⏸️ Approval Required: Release Approval');
    assert.equal(approvalRequestPosts.length, 0);

    const transitionLines = fs.readFileSync(result.gateTransitionPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.deepEqual(transitionLines.map((entry) => entry.to), ['PENDING_APPROVAL', 'APPROVED']);

    const finalGateState = JSON.parse(fs.readFileSync(result.gateStatusPath, 'utf8'));
    assert.equal(finalGateState.status, 'APPROVED');
    assert.equal(finalGateState.reason, 'Approved during repeated resume verification');
  });

  await record('resume skips pre-pipeline arch validation once a module has already started', async () => {
    const harness = await buildArchValidationResumeHarness({ seedStartedModule: true });
    const exitCode = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true });

    assert.equal(exitCode, 0);
    assert.equal(harness.archValidatorCalls.length, 0);
    assert.equal(harness.moduleRunCalls.length, 1);
  });

  await record('resume still runs pre-pipeline arch validation when no module has started yet', async () => {
    const harness = await buildArchValidationResumeHarness({ seedStartedModule: false });
    const exitCode = await harness.pipelineRunnerMod.runPipeline(harness.config, harness.progress, { resume: true });

    assert.equal(exitCode, harness.constantsMod.EXIT_BLOCKED);
    assert.equal(harness.archValidatorCalls.length, 1);
    assert.equal(harness.moduleRunCalls.length, 0);
  });
}
