export async function registerManyModuleSoakArea({
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
async function buildBuiltInRegistry(runtimeRootForRegistry) {
  const registryMod = await importRuntimeModule(runtimeRootForRegistry, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

function canonicalBusterPolicy(root) {
  return {
    suite_timeout_ms: 300000,
    max_crash_retries: 0,
    runtime: {
      heartbeat_path: path.join(root, 'buster-heartbeat.json'),
      heartbeat_interval_ms: 1000,
      task_poll_interval_ms: 2000,
      task_pending_reclaim_idle_ms: 60000,
      task_stream_max_len: 250,
    },
  };
}

function withIntegratedModuleHappyPathStages(registry, { lifecycleStateMod, fs, behavior = {}, labelPrefix = 'integrated' }) {
  const workerCalls = [];
  const validatorCalls = [];
  const generatorCalls = [];
  const forgeRetryOnceModules = new Set(behavior.forgeRetryOnceModules || []);
  const busterRetryOnceModules = new Set(behavior.busterRetryOnceModules || []);

  function readStatusFromInput(input = {}) {
    return JSON.parse(JSON.stringify(input?.stateSnapshot?.module || {}));
  }

  function validatorPass(stageId, input = {}) {
    validatorCalls.push({ stageId, moduleId: input?.ids?.moduleId, attempt: input?.ids?.attempt });
    return {
      schemaVersion: 'v1',
      producerKind: 'validator',
      producerType: String(stageId).split(':')[1],
      nextAction: 'pass',
      diagnostics: {
        summary: `${stageId} passed for ${input?.ids?.moduleId}`,
        metadata: { outcomeClass: 'passed' },
      },
    };
  }

  return {
    registry: {
      ...registry,
      stageOwners: {
        ...registry.stageOwners,
        'generator.run': {
          ...registry.stageOwners['generator.run'],
          'generator:project_summary': {
            ...registry.stageOwners['generator.run']['generator:project_summary'],
            implementation: {
              run: async () => {
                generatorCalls.push('generator:project_summary');
                return { schemaVersion: 'v1', producerKind: 'generator', producerType: 'project_summary', outputs: { status: 'ok' } };
              },
            },
          },
          'generator:pipeline_review': {
            ...registry.stageOwners['generator.run']['generator:pipeline_review'],
            implementation: {
              run: async () => {
                generatorCalls.push('generator:pipeline_review');
                return { schemaVersion: 'v1', producerKind: 'generator', producerType: 'pipeline_review', outputs: { status: 'ok' } };
              },
            },
          },
          'generator:case_study': {
            ...registry.stageOwners['generator.run']['generator:case_study'],
            implementation: {
              run: async () => {
                generatorCalls.push('generator:case_study');
                return { schemaVersion: 'v1', producerKind: 'generator', producerType: 'case_study', outputs: { status: 'ok' } };
              },
            },
          },
        },
        'validator.run': {
          ...registry.stageOwners['validator.run'],
          'validator:delivery_lint': {
            ...registry.stageOwners['validator.run']['validator:delivery_lint'],
            implementation: {
              run: async ({ input }) => validatorPass('validator:delivery_lint', input),
            },
          },
          'validator:pre_check': {
            ...registry.stageOwners['validator.run']['validator:pre_check'],
            implementation: {
              run: async ({ input }) => validatorPass('validator:pre_check', input),
            },
          },
        },
        'worker.execute': {
          ...registry.stageOwners['worker.execute'],
          'worker:module_forge': {
            ...registry.stageOwners['worker.execute']['worker:module_forge'],
            implementation: {
              execute: async ({ input }, pluginContext) => {
                const moduleId = input?.ids?.moduleId;
                const attempt = input?.ids?.attempt;
                assert.equal(pluginContext.stageId, 'worker:module_forge');
                assert.equal(input?.worker?.workerType, 'module_forge');
                workerCalls.push({ stageId: 'worker:module_forge', moduleId, attempt });
                const status = readStatusFromInput(input);
                if (forgeRetryOnceModules.has(moduleId) && attempt === 1) {
                  return {
                    schemaVersion: 'v1',
                    producerKind: 'worker',
                    producerType: 'module_forge',
                    nextAction: 'request_fix',
                    diagnostics: {
                      summary: `Forge synthetic retry requested for ${moduleId}`,
                      metadata: {
                        final_status: status,
                        reason: 'session_ended_no_changes',
                        status_detail: `mixed many-module Forge retry ${moduleId}`,
                        gateway_label: `${labelPrefix}-forge-${moduleId}-attempt-${attempt}`,
                        session_key: `agent:${labelPrefix}:forge:${moduleId}:attempt:${attempt}`,
                        attempt,
                      },
                      typed: {
                        worker: {
                          schemaVersion: 'v1',
                          outcomeClass: 'fix_requested',
                          backendKind: 'session',
                          dispatchRef: input?.refs?.moduleAttemptRef || null,
                          metadata: { outcomeClass: 'fix_requested', attempt },
                        },
                      },
                    },
                  };
                }
                lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
                  note: `Integrated many-module Forge pass ${moduleId}`,
                  now: new Date().toISOString(),
                });
                return {
                  schemaVersion: 'v1',
                  producerKind: 'worker',
                  producerType: 'module_forge',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: `Forge passed ${moduleId}`,
                    metadata: {
                      final_status: status,
                      reason: 'forge_completion',
                      gateway_label: `${labelPrefix}-forge-${moduleId}`,
                      session_key: `agent:${labelPrefix}:forge:${moduleId}`,
                      attempt,
                    },
                    typed: {
                      worker: {
                        schemaVersion: 'v1',
                        outcomeClass: 'passed',
                        backendKind: 'session',
                        dispatchRef: input?.refs?.moduleAttemptRef || null,
                        metadata: { outcomeClass: 'passed', attempt },
                      },
                    },
                  },
                };
              },
            },
          },
          'worker:module_buster': {
            ...registry.stageOwners['worker.execute']['worker:module_buster'],
            implementation: {
              execute: async ({ input }, pluginContext) => {
                const moduleId = input?.ids?.moduleId;
                const attempt = input?.ids?.attempt;
                const dispatchId = input?.ids?.dispatchId || `integrated-buster-${moduleId}`;
                assert.equal(pluginContext.stageId, 'worker:module_buster');
                assert.equal(input?.worker?.workerType, 'module_buster');
                workerCalls.push({ stageId: 'worker:module_buster', moduleId, attempt });
                const status = readStatusFromInput(input);
                if (busterRetryOnceModules.has(moduleId) && attempt === 1) {
                  lifecycleStateMod.transitionModuleStatus(status, 'FAIL', {
                    note: `Integrated many-module Buster retry trigger ${moduleId}`,
                    now: new Date().toISOString(),
                    completionSummary: `Integrated many-module Buster retry trigger ${moduleId}`,
                  });
                  return {
                    schemaVersion: 'v1',
                    producerKind: 'worker',
                    producerType: 'module_buster',
                    nextAction: 'pass',
                    diagnostics: {
                      summary: `Buster produced retryable FAIL for ${moduleId}`,
		                      metadata: {
		                        final_status: status,
		                        failure_class: 'verdict_fail',
		                        dispatch_id: dispatchId,
                        gateway_label: `${labelPrefix}-buster-${moduleId}-attempt-${attempt}`,
                        session_key: `agent:${labelPrefix}:buster:${moduleId}:attempt:${attempt}`,
                        attempt,
                        run_id: input?.ids?.runId || null,
                      },
                      typed: {
                        worker: {
                          schemaVersion: 'v1',
                          outcomeClass: 'passed',
                          backendKind: 'redis_dispatch',
                          dispatchRef: input?.refs?.workerDispatchRef || dispatchId,
                          metadata: { outcomeClass: 'passed', attempt, dispatch_id: dispatchId },
                        },
                      },
                    },
                  };
                }
                lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
                  note: `Integrated many-module Buster pass ${moduleId}`,
                  now: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  completionSummary: `Integrated many-module Buster pass ${moduleId}`,
                });
                return {
                  schemaVersion: 'v1',
                  producerKind: 'worker',
                  producerType: 'module_buster',
                  nextAction: 'pass',
                  diagnostics: {
                    summary: `Buster passed ${moduleId}`,
                    metadata: {
                      final_status: status,
                      dispatch_id: dispatchId,
                      gateway_label: `${labelPrefix}-buster-${moduleId}`,
                      session_key: `agent:${labelPrefix}:buster:${moduleId}`,
                      attempt,
                      run_id: input?.ids?.runId || null,
                    },
                    typed: {
                      worker: {
                        schemaVersion: 'v1',
                        outcomeClass: 'passed',
                        backendKind: 'redis_dispatch',
                        dispatchRef: input?.refs?.workerDispatchRef || dispatchId,
                        metadata: { outcomeClass: 'passed', attempt, dispatch_id: dispatchId },
                      },
                    },
                  },
                };
              },
            },
          },
        },
      },
    },
    workerCalls,
    validatorCalls,
    generatorCalls,
  };
}

  await record('integrated many-module full-pipeline soak exercises real module runner with typed workers', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-integrated-many-module-soak-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });

    const moduleCount = 10;
    const executionOrder = [];
    const modules = {};
    for (let index = 1; index <= moduleCount; index += 1) {
      const moduleId = String(index).padStart(2, '0');
      const dir = `${moduleId}-integrated-module-${moduleId}`;
      executionOrder.push(moduleId);
      modules[moduleId] = {
        title: `Integrated Module ${moduleId}`,
        dir,
        stages: ['forge', 'buster'],
        test_suites: ['smoke'],
      };
      fs.mkdirSync(path.join(modulesDir, dir), { recursive: true });
    }

    const baseRegistry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const { registry, workerCalls, validatorCalls, generatorCalls } = withIntegratedModuleHappyPathStages(baseRegistry, {
      lifecycleStateMod,
      fs,
    });
    const outputs = [];
    const runId = 'run-integrated-many-module-soak-1';
        const deps = {
        pipelineRunner: {
          discord: async () => {},
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          generateProjectSummary: async () => {},
          generatePipelineReview: async () => {},
          generateCaseStudy: async () => {},
        },
        moduleRunner: {
          checkDependencies: () => ({ met: true }),
          releaseBlueprint: async () => {},
          runPreflightValidation: () => ({ passed: true, failures: [] }),
          resolvePolicy: (_config, _progress, agent) => ({
            model: agent === 'buster' ? 'buster-model' : 'forge-model',
            thinking: agent === 'forge' ? 'high' : null,
            model_source: 'test_integrated_many_module',
            thinking_source: 'test_integrated_many_module',
          }),
          modelToHarness: () => 'forge',
          logEffectivePolicy: () => {},
          buildForgePrompt: async () => ({ prompt: 'integrated forge prompt', recalledMemoryIds: [] }),
          buildBusterModulePrompt: () => ({ prompt: 'integrated buster prompt' }),
          savePrompt: () => {},
          validateBusterConfig: () => {},
          gitSyncBeforeBuster: async () => {},
          gitCommitAndPush: async () => {},
          discord: async () => {},
          setShutdownContext: () => {},
          clearShutdownContext: () => {},
          invalidateHeadHash: () => {},
          headHash: () => 'integrated-head',
          sleep: async () => {},
        },
      };
const config = {
      project: 'behavior-integrated-many-module-soak',
      repo_root: repoRoot,
      default_timeout_minutes: 30,
      default_max_fails: 3,
      telemetry: { enabled: true },
      fallback_model: 'anthropic/claude-sonnet-4-6',
      auto_retry_threshold: 2,
      rate_limit: { cooldown_hours: 0, max_pauses_per_module: 3 },
      buster: canonicalBusterPolicy(repoRoot),
      review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-29T00:00:00.000Z'),
      pluginRegistry: registry,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
          };

    const progress = { execution_order: executionOrder, modules, gates: {} };
    const exitCode = await pipelineRunnerMod.runPipeline(config, progress, { deps, skipArchValidation: true }, { deps });
    await flushAsync();

    assert.equal(exitCode, 0);
    assert.equal(outputs.some((payload) => payload?.exit === 0 && payload?.status === 'PIPELINE_COMPLETE'), true);
    assert.deepEqual(workerCalls.filter((call) => call.stageId === 'worker:module_forge').map((call) => call.moduleId), executionOrder);
    assert.deepEqual(workerCalls.filter((call) => call.stageId === 'worker:module_buster').map((call) => call.moduleId), executionOrder);
    assert.equal(validatorCalls.filter((call) => call.stageId === 'validator:delivery_lint').length, moduleCount);
    assert.equal(validatorCalls.filter((call) => call.stageId === 'validator:pre_check').length, moduleCount);
    assert.deepEqual(generatorCalls, ['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']);

    for (const moduleId of executionOrder) {
      const status = statusStoreMod.loadStatus(config, modules[moduleId].dir);
      assert.equal(status.status, 'PASS');
      assert.equal(status.current_phase, null);
      assert.equal(status.fail_count, 0);
      assert.equal(status.validation.delivery_lint_passed, true);
      assert.equal(status.validation.pre_check_passed, true);
      assert.equal(status.completion_summary, `Integrated many-module Buster pass ${moduleId}`);
      assert.equal(status.history.some((entry) => entry.to === 'READY_FOR_TESTING'), true);
      assert.equal(status.history.some((entry) => entry.to === 'PASS'), true);
    }

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const modulePassEvents = events.filter((event) => event.type === 'module.status_changed' && event.new_status === 'PASS');
    assert.deepEqual(modulePassEvents.map((event) => event.module_id), executionOrder);
    const pipelineCompleted = events.find((event) => event.type === 'pipeline.completed');
    assert.equal(Boolean(pipelineCompleted), true);
    assert.equal(pipelineCompleted.run_id, runId);
  });

  await record('integrated many-module mixed retry soak exercises real module runner retry flow', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-integrated-many-module-mixed-soak-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });

    const moduleCount = 8;
    const executionOrder = [];
    const modules = {};
    for (let index = 1; index <= moduleCount; index += 1) {
      const moduleId = String(index).padStart(2, '0');
      const dir = `${moduleId}-mixed-integrated-module-${moduleId}`;
      executionOrder.push(moduleId);
      modules[moduleId] = {
        title: `Mixed Integrated Module ${moduleId}`,
        dir,
        stages: ['forge', 'buster'],
        test_suites: ['smoke'],
        max_fails: 3,
      };
      fs.mkdirSync(path.join(modulesDir, dir), { recursive: true });
    }

    const forgeRetryModule = '03';
    const busterRetryModule = '06';
    const baseRegistry = await buildBuiltInRegistry(pipelineRuntimeRoot);
    const { registry, workerCalls, validatorCalls, generatorCalls } = withIntegratedModuleHappyPathStages(baseRegistry, {
      lifecycleStateMod,
      fs,
      behavior: {
        forgeRetryOnceModules: [forgeRetryModule],
        busterRetryOnceModules: [busterRetryModule],
      },
      labelPrefix: 'mixed-integrated',
    });
    const outputs = [];
    const runId = 'run-integrated-many-module-mixed-soak-1';
        const configDeps2 = {
        pipelineRunner: {
          discord: async () => {},
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          generateProjectSummary: async () => {},
          generatePipelineReview: async () => {},
          generateCaseStudy: async () => {},
        },
        moduleRunner: {
          checkDependencies: () => ({ met: true }),
          releaseBlueprint: async () => {},
          runPreflightValidation: () => ({ passed: true, failures: [] }),
          resolvePolicy: (_config, _progress, agent) => ({
            model: agent === 'buster' ? 'buster-model' : 'forge-model',
            thinking: agent === 'forge' ? 'high' : null,
            model_source: 'test_integrated_many_module_mixed',
            thinking_source: 'test_integrated_many_module_mixed',
          }),
          modelToHarness: () => 'forge',
          logEffectivePolicy: () => {},
          buildForgePrompt: async () => ({ prompt: 'mixed integrated forge prompt', recalledMemoryIds: [] }),
          buildBusterModulePrompt: () => ({ prompt: 'mixed integrated buster prompt' }),
          savePrompt: () => {},
          validateBusterConfig: () => {},
          gitSyncBeforeBuster: async () => {},
          gitCommitAndPush: async () => {},
          discord: async () => {},
          setShutdownContext: () => {},
          clearShutdownContext: () => {},
          invalidateHeadHash: () => {},
          headHash: () => 'mixed-integrated-head',
          sleep: async () => {},
        },
      };
const config = {
      project: 'behavior-integrated-many-module-mixed-soak',
      repo_root: repoRoot,
      default_timeout_minutes: 30,
      default_max_fails: 3,
      telemetry: { enabled: true },
      fallback_model: 'anthropic/claude-sonnet-4-6',
      auto_retry_threshold: 2,
      rate_limit: { cooldown_hours: 0, max_pauses_per_module: 3 },
      buster: canonicalBusterPolicy(repoRoot),
      review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-29T00:30:00.000Z'),
      pluginRegistry: registry,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
          };

    const progress = { execution_order: executionOrder, modules, gates: {} };
    const exitCode = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps2, skipArchValidation: true }, { deps: configDeps2 });
    await flushAsync();

    assert.equal(exitCode, 0);
    assert.equal(outputs.some((payload) => payload?.exit === 0 && payload?.status === 'PIPELINE_COMPLETE'), true);

    const forgeCallsByModule = Map.groupBy(
      workerCalls.filter((call) => call.stageId === 'worker:module_forge'),
      (call) => call.moduleId,
    );
    const busterCallsByModule = Map.groupBy(
      workerCalls.filter((call) => call.stageId === 'worker:module_buster'),
      (call) => call.moduleId,
    );
    for (const moduleId of executionOrder) {
      const expectedForgeAttempts = moduleId === forgeRetryModule || moduleId === busterRetryModule ? [1, 2] : [1];
      const expectedBusterAttempts = moduleId === forgeRetryModule ? [2] : moduleId === busterRetryModule ? [1, 2] : [1];
      assert.deepEqual((forgeCallsByModule.get(moduleId) || []).map((call) => call.attempt), expectedForgeAttempts);
      assert.deepEqual((busterCallsByModule.get(moduleId) || []).map((call) => call.attempt), expectedBusterAttempts);
    }
    assert.equal(validatorCalls.filter((call) => call.stageId === 'validator:delivery_lint').length, moduleCount + 1);
    assert.equal(validatorCalls.filter((call) => call.stageId === 'validator:pre_check').length, moduleCount + 1);
    assert.deepEqual(generatorCalls, ['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']);

    for (const moduleId of executionOrder) {
      const status = statusStoreMod.loadStatus(config, modules[moduleId].dir);
      assert.equal(status.status, 'PASS');
      assert.equal(status.current_phase, null);
      assert.equal(status.validation.delivery_lint_passed, true);
      assert.equal(status.validation.pre_check_passed, true);
      assert.equal(status.completion_summary, `Integrated many-module Buster pass ${moduleId}`);
      assert.equal(status.history.some((entry) => entry.to === 'READY_FOR_TESTING'), true);
      assert.equal(status.history.some((entry) => entry.to === 'PASS'), true);
      if (moduleId === forgeRetryModule || moduleId === busterRetryModule) {
        assert.equal(status.fail_count, 1);
        assert.equal((status.fail_summaries || []).length, 1);
      } else {
        assert.equal(status.fail_count, 0);
      }
    }

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const retryEvents = events.filter((event) => event.type === 'retry.scheduled');
    assert.deepEqual(retryEvents.map((event) => event.module_id), [forgeRetryModule, busterRetryModule]);
    const modulePassEvents = events.filter((event) => event.type === 'module.status_changed' && event.new_status === 'PASS');
    assert.deepEqual(modulePassEvents.map((event) => event.module_id), executionOrder);
    assert.equal(Boolean(events.find((event) => event.type === 'pipeline.completed')), true);
  });

  await record('hermetic many-module full-pipeline soak completes all modules exactly once in execution order', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const pipelineStepResultMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/contracts/pipeline-step-result.ts');
    const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-many-module-soak-'));
    const swarmDir = path.join(repoRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });

    const moduleCount = 12;
    const executionOrder = [];
    const modules = {};
    for (let index = 1; index <= moduleCount; index += 1) {
      const moduleId = String(index).padStart(2, '0');
      const dir = `${moduleId}-module-${moduleId}`;
      executionOrder.push(moduleId);
      modules[moduleId] = {
        title: `Module ${moduleId}`,
        dir,
        stages: ['forge', 'buster'],
      };
      fs.mkdirSync(path.join(modulesDir, dir), { recursive: true });
    }

    const visited = [];
    const outputs = [];
    const runId = 'run-many-module-soak-1';
        const configDeps3 = {
        pipelineRunner: {
          discord: async () => {},
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
          generateProjectSummary: async () => {},
          generatePipelineReview: async () => {},
          generateCaseStudy: async () => {},
          runModule: async (configArg, progress, moduleId) => {
            const mod = progress.modules[moduleId];
            const now = new Date().toISOString();
            const dispatchId = `soak-dispatch-${moduleId}`;
            const status = statusStoreMod.loadStatus(configArg, mod.dir)
              || statusStoreMod.initStatus(moduleId, { title: mod.title });
	            visited.push(moduleId);
	            if (!status.current_phase) {
	              const startedTransition = lifecycleStateMod.startModulePhase(status, 'forge', `Many-module soak started ${moduleId}`, {
	                now,
	              });
	              statusStoreMod.saveStatus(configArg, mod.dir, status, startedTransition);
	            }
	            const passTransition = lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
	              agent: 'forge',
	              note: `Many-module soak pass OK for ${moduleId}`,
	              now,
              completedAt: now,
            });
	            status.active_agent = {
	              attempt: 1,
	              dispatch_id: dispatchId,
              gateway_label: dispatchId,
              session_key: `agent:main:acp:${dispatchId}`,
	            };
	            status.completion_summary = `Many-module soak pass OK for ${moduleId}`;
	            status.cost = { total_duration_seconds: 1 };
	            statusStoreMod.saveStatus(configArg, mod.dir, status, passTransition);
	            return pipelineStepResultMod.buildPipelineStepResult({
              stepType: pipelineStepResultMod.PIPELINE_STEP_TYPES.MODULE,
              stepId: moduleId,
              nextAction: pipelineStepResultMod.PIPELINE_STEP_ACTIONS.CONTINUE,
              outcome: pipelineStepResultMod.PIPELINE_STEP_OUTCOMES.PASSED,
              reason: `Many-module soak pass OK for ${moduleId}`,
              correlation: {
                module_id: moduleId,
	                attempt: 1,
	                dispatch_id: dispatchId,
	                gateway_label: dispatchId,
	                session_key: `agent:main:acp:${dispatchId}`,
	              },
              terminalAction: 'none',
              terminalScope: 'module',
	            });
          },
        },
      };
const config = {
      project: 'behavior-many-module-soak',
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(pipelineRuntimeRoot),
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
          };

    const progress = { execution_order: executionOrder, modules, gates: {} };
    const exitCode = await pipelineRunnerMod.runPipeline(config, progress, { deps: configDeps3, skipArchValidation: true }, { deps: configDeps3 });
    await flushAsync();

    assert.equal(exitCode, 0);
    assert.deepEqual(visited, executionOrder);
    assert.equal(outputs.some((payload) => payload?.exit === 0 && payload?.status === 'PIPELINE_COMPLETE'), true);

    for (const moduleId of executionOrder) {
      const status = statusStoreMod.loadStatus(config, modules[moduleId].dir);
      assert.equal(status.status, 'PASS');
      assert.equal(status.completion_summary, `Many-module soak pass OK for ${moduleId}`);
    }

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const signalEvents = events.filter((event) => event.type !== 'observability.degraded' && event.type !== 'observability.restored');
    const pipelineSignals = signalEvents.filter((event) => event.type.startsWith('pipeline.') || event.summary_type === 'pipeline');
    assert.deepEqual(pipelineSignals.map((event) => event.type), [
      'pipeline.started',
      'pipeline.completed',
      'summary.started',
      'summary.completed',
    ]);
    assert.equal(pipelineSignals[0].run_id, runId);
    assert.equal(pipelineSignals[1].run_id, runId);
    assert.equal(pipelineSignals[2].summary_type, 'pipeline');
    assert.equal(pipelineSignals[3].summary_type, 'pipeline');
    assert.equal(pipelineSignals[3].status, 'ok');

    const generatorBridgeEvents = signalEvents.filter((event) => event.type.startsWith('plugin.generator.'));
    assert.deepEqual(generatorBridgeEvents.map((event) => event.type), [
      'plugin.generator.project_summary.bridge_invoked',
      'plugin.generator.pipeline_review.bridge_invoked',
      'plugin.generator.case_study.bridge_invoked',
    ]);
  });
}
