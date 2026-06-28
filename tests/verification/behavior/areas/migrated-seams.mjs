import {
  platformTestDefaults,
  stepExit,
} from './helpers.mjs';

export async function registerMigratedSeamsArea({
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
  function stepReason(result) {
    return result?.diagnostics?.summary ?? result?.reason;
  }

  function canonicalBusterPolicy(root) {
    return {
      runtime: {
        task_stream: 'swarm:buster:tasks',
        heartbeat_path: path.join(root, 'buster-heartbeat.json'),
        heartbeat_interval_ms: 1000,
        task_poll_interval_ms: 2000,
        task_pending_reclaim_idle_ms: 60000,
        completion_event_block_ms: 0,
        completion_recovery_scan_interval_ms: 5000,
        task_stream_max_len: 250,
        suite_timeout_ms: 300000,
        max_crash_retries: 0,
      },
    };
  }

  async function buildRegistryWithFakeModuleWorkers(runtimeRoot, {
    lifecycleStateMod,
    expectedModuleIds = null,
    labelPrefix = 'migrated-seam',
    includeNoopGenerators = false,
    forgeMode = 'pass',
    busterMode = 'pass',
    omitForgeOwner = false,
    omitBusterOwner = false,
  } = {}) {
    const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
    const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
    assert.equal(errors.length, 0);

    const expectedSet = expectedModuleIds ? new Set(expectedModuleIds) : null;
    const workerCalls = [];
    const generatorCalls = [];

    function assertExpectedModule(moduleId) {
      if (expectedSet) assert.equal(expectedSet.has(moduleId), true);
    }

    function readStatusFromInput(input = {}) {
      return JSON.parse(JSON.stringify(input?.stateSnapshot?.module || {}));
    }

    function generatorOwner(stageId, producerType) {
      return {
        ...registry.stageOwners['generator.run'][stageId],
        implementation: {
          run: async () => {
            generatorCalls.push(stageId);
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

    const stageOwners = {
      ...registry.stageOwners,
      'worker.execute': {
        ...registry.stageOwners['worker.execute'],
        'worker:module_forge': {
          ...registry.stageOwners['worker.execute']['worker:module_forge'],
          implementation: {
            execute: async ({ input }, pluginContext) => {
              const moduleId = input?.ids?.moduleId;
              const attempt = input?.ids?.attempt;
              assertExpectedModule(moduleId);
              assert.equal(pluginContext.stageId, 'worker:module_forge');
              assert.equal(pluginContext.hookFamily, 'worker.execute');
              assert.equal(input?.worker?.workerType, 'module_forge');
              assert.equal(attempt, 1);
              workerCalls.push({ stageId: 'worker:module_forge', moduleId, attempt });

              const status = readStatusFromInput(input);
              assert.equal(status.status, 'IN_PROGRESS');
              if (forgeMode === 'invalid_backend_result') {
                return {
                  ok: true,
                  status,
                  legacy_metadata: { ok: true },
                  gateway_label: `${labelPrefix}-legacy-forge-${moduleId}`,
                  session_key: `agent:${labelPrefix}:legacy-forge:${moduleId}`,
                };
              }
              lifecycleStateMod.transitionModuleStatus(status, 'READY_FOR_TESTING', {
                note: `Migrated seam Forge worker completed ${moduleId}`,
                now: '2026-04-29T07:10:00.000Z',
              });

              return {
                schemaVersion: 'v1',
                producerKind: 'worker',
                producerType: 'module_forge',
                nextAction: 'pass',
                diagnostics: {
                  summary: `Migrated seam Forge pass ${moduleId}`,
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
                      backendKind: 'redis_dispatch',
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
              const dispatchId = input?.ids?.dispatchId || `${labelPrefix}-buster-${moduleId}`;
              assertExpectedModule(moduleId);
              assert.equal(pluginContext.stageId, 'worker:module_buster');
              assert.equal(pluginContext.hookFamily, 'worker.execute');
              assert.equal(input?.worker?.workerType, 'module_buster');
              assert.equal(attempt, 1);
              workerCalls.push({ stageId: 'worker:module_buster', moduleId, attempt, dispatchId });

              const status = readStatusFromInput(input);
              assert.equal(status.status, 'TESTING');
              lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
                note: `Migrated seam Buster worker completed ${moduleId}`,
                now: '2026-04-29T07:10:01.000Z',
                completedAt: '2026-04-29T07:10:01.000Z',
                completionSummary: `Migrated seam Buster pass ${moduleId}`,
              });

              return {
                schemaVersion: 'v1',
                producerKind: 'worker',
                producerType: 'module_buster',
                nextAction: 'pass',
                diagnostics: {
                  summary: `Migrated seam Buster pass ${moduleId}`,
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
    };

    if (omitForgeOwner) delete stageOwners['worker.execute']['worker:module_forge'];
    if (omitBusterOwner) delete stageOwners['worker.execute']['worker:module_buster'];

    if (includeNoopGenerators) {
      stageOwners['generator.run'] = {
        ...registry.stageOwners['generator.run'],
        'generator:project_summary': generatorOwner('generator:project_summary', 'project_summary'),
        'generator:pipeline_review': generatorOwner('generator:pipeline_review', 'pipeline_review'),
        'generator:case_study': generatorOwner('generator:case_study', 'case_study'),
      };
    }

    return {
      workerCalls,
      generatorCalls,
      registry: {
        ...registry,
        stageOwners,
      },
    };
  }

  function writeModuleInstructions(moduleRoot, title) {
    fs.mkdirSync(moduleRoot, { recursive: true });
    fs.writeFileSync(path.join(moduleRoot, 'FORGE.md'), `# Forge\n\nCreate ${title}.\n`);
    fs.writeFileSync(path.join(moduleRoot, 'BUSTER.md'), `# Buster\n\nVerify ${title}.\n`);
  }

  function moduleRunnerNoExternalOverrides(label) {
    return {
      releaseBlueprint: async () => ({ status: 'skipped', reason: 'test fixture already materialized' }),
      gitSyncBeforeBuster: async () => {},
      gitCommitAndPush: async () => {},
      discord: async () => {},
      validateBusterConfig: () => {},
      setShutdownContext: () => {},
      clearShutdownContext: () => {},
      headHash: () => `${label}-head`,
      invalidateHeadHash: () => {},
      sleep: async () => {},
    };
  }

  function createSingleModuleFixture(label, title = 'Migrated Ugly Seam') {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `behavior-${label}-`));
    const srcRoot = path.join(repoRoot, 'src');
    const swarmDir = path.join(srcRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = '01-migrated-ugly-seam';
    const moduleRoot = path.join(modulesDir, moduleDir);
    const logDir = path.join(swarmDir, 'logs');
    writeModuleInstructions(moduleRoot, title);
    fs.mkdirSync(logDir, { recursive: true });
    const progress = {
      execution_order: ['01'],
      modules: {
        '01': {
          title,
          dir: moduleDir,
          stages: ['forge', 'buster'],
          test_suites: ['smoke'],
        },
      },
      gates: {},
    };
    return { repoRoot, swarmDir, modulesDir, moduleDir, logDir, progress };
  }

  function buildModuleConfig({ label, fixture, registry, runtimeCoreMod, runId }) {
    const deps = { moduleRunner: moduleRunnerNoExternalOverrides(label) };
    const config = {
      ...platformTestDefaults(),
      project: `behavior-${label}`,
      repo_root: fixture.repoRoot,
      default_timeout_minutes: 30,
      default_max_fails: 3,
      buster: canonicalBusterPolicy(fixture.repoRoot),
      telemetry: platformTestDefaults().telemetry,
      pre_check: { enabled: false },
      fallback_model: 'anthropic/claude-sonnet-4-6',
      auto_retry_threshold: 2,
      rate_limit: { ...platformTestDefaults().rate_limit, cooldown_hours: 0, max_pauses_per_module: 3 },
      review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-29T07:47:00.000Z'),
      pluginRegistry: registry,
      paths: {
        swarm_dir: fixture.swarmDir,
        modules_dir: fixture.modulesDir,
      },
    };
    return { config, deps };
  }

  await record('module happy seam traversal composes validators workers status-store and telemetry', async () => {
    const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(runtimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const moduleRunnerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/module-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const lifecycleStateMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-migrated-module-happy-seam-'));
    const srcRoot = path.join(repoRoot, 'src');
    const swarmDir = path.join(srcRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const moduleDir = '01-migrated-happy-seam';
    const moduleRoot = path.join(modulesDir, moduleDir);
    const logDir = path.join(swarmDir, 'logs');
    writeModuleInstructions(moduleRoot, 'the migrated seam fixture');
    fs.mkdirSync(logDir, { recursive: true });

    const { registry, workerCalls } = await buildRegistryWithFakeModuleWorkers(runtimeRoot, {
      lifecycleStateMod,
      expectedModuleIds: ['01'],
    });
    const runId = 'run-migrated-module-happy-seam-1';
        const deps = {
        moduleRunner: moduleRunnerNoExternalOverrides('migrated-seam'),
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-migrated-module-happy-seam',
      repo_root: repoRoot,
      default_timeout_minutes: 30,
      default_max_fails: 3,
      buster: canonicalBusterPolicy(repoRoot),
      telemetry: platformTestDefaults().telemetry,
      pre_check: { enabled: false },
      fallback_model: 'anthropic/claude-sonnet-4-6',
      auto_retry_threshold: 2,
      rate_limit: { ...platformTestDefaults().rate_limit, cooldown_hours: 0, max_pauses_per_module: 3 },
      review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-29T06:36:00.000Z'),
      pluginRegistry: registry,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
          };
    const progress = {
      execution_order: ['01'],
      modules: {
        '01': {
          title: 'Migrated Happy Seam',
          dir: moduleDir,
          stages: ['forge', 'buster'],
          test_suites: ['smoke'],
        },
      },
      gates: {},
    };

    const result = await moduleRunnerMod.runModule(config, progress, '01', { deps });
    await flushAsync();

	    assert.equal(result.kind, 'pipeline_step_result');
	    assert.equal(result.stepType, 'module');
	    assert.equal(result.stepId, '01');
	    assert.equal(result.nextAction, 'continue');
	    assert.equal(result.outcome, 'passed');
	    assert.equal(stepExit(result), 0);
    assert.deepEqual(workerCalls.map((call) => call.stageId), ['worker:module_forge', 'worker:module_buster']);

    const status = statusStoreMod.loadStatus(config, moduleDir);
    assert.equal(status.status, 'PASS');
    assert.equal(status.current_phase, null);
    assert.equal(status.fail_count, 0);
    assert.equal(status.validation.delivery_lint_passed, true);
    assert.equal(status.validation.pre_check_passed, true);
    assert.equal(status.completion_summary, 'Migrated seam Buster pass 01');
    assert.equal(status.history.some((entry) => entry.to === 'READY_FOR_TESTING'), true);
    assert.equal(status.history.some((entry) => entry.to === 'TESTING'), true);
    assert.equal(status.history.some((entry) => entry.to === 'PASS'), true);

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(events.some((event) => event.type === 'phase.started' && event.module_id === '01' && event.phase === 'forge'), true);
    assert.equal(events.some((event) => event.type === 'phase.completed' && event.module_id === '01' && event.phase === 'forge'), true);
    assert.equal(events.some((event) => event.type === 'phase.started' && event.module_id === '01' && event.phase === 'buster'), true);
    assert.equal(events.some((event) => event.type === 'phase.completed' && event.module_id === '01' && event.phase === 'buster'), true);
    assert.equal(events.some((event) => event.type === 'module.status_changed' && event.module_id === '01' && event.new_status === 'PASS'), true);
  });

  await record('many-module migrated seam traversal reuses typed workers through real pipeline runner', async () => {
    const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(runtimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const lifecycleStateMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-migrated-many-module-seam-'));
    const srcRoot = path.join(repoRoot, 'src');
    const swarmDir = path.join(srcRoot, '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });

    const moduleCount = 9;
    const executionOrder = [];
    const modules = {};
    for (let index = 1; index <= moduleCount; index += 1) {
      const moduleId = String(index).padStart(2, '0');
      const dir = `${moduleId}-migrated-many-seam`;
      executionOrder.push(moduleId);
      modules[moduleId] = {
        title: `Migrated Many Seam ${moduleId}`,
        dir,
        stages: ['forge', 'buster'],
        test_suites: ['smoke'],
      };
      writeModuleInstructions(path.join(modulesDir, dir), `migrated many-module seam fixture ${moduleId}`);
    }

    const { registry, workerCalls, generatorCalls } = await buildRegistryWithFakeModuleWorkers(runtimeRoot, {
      lifecycleStateMod,
      expectedModuleIds: executionOrder,
      labelPrefix: 'migrated-many-seam',
      includeNoopGenerators: true,
    });
    const outputs = [];
    const runId = 'run-migrated-many-module-seam-1';
        const configDeps2 = {
        pipelineRunner: {
          discord: async () => {},
          output: (payload) => { outputs.push(payload); },
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          writeSummary: () => {},
        },
        moduleRunner: moduleRunnerNoExternalOverrides('migrated-many-seam'),
      };
const config = {
      ...platformTestDefaults(),
      project: 'behavior-migrated-many-module-seam',
      repo_root: repoRoot,
      default_timeout_minutes: 30,
      default_max_fails: 3,
      buster: canonicalBusterPolicy(repoRoot),
      telemetry: platformTestDefaults().telemetry,
      pre_check: { enabled: false },
      fallback_model: 'anthropic/claude-sonnet-4-6',
      auto_retry_threshold: 2,
      rate_limit: { ...platformTestDefaults().rate_limit, cooldown_hours: 0, max_pauses_per_module: 3 },
      review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-29T07:10:00.000Z'),
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
    assert.deepEqual(
      workerCalls.filter((call) => call.stageId === 'worker:module_forge').map((call) => call.moduleId),
      executionOrder,
    );
    assert.deepEqual(
      workerCalls.filter((call) => call.stageId === 'worker:module_buster').map((call) => call.moduleId),
      executionOrder,
    );
    assert.deepEqual(generatorCalls, ['generator:project_summary', 'generator:pipeline_review', 'generator:case_study']);

    for (const moduleId of executionOrder) {
      const status = statusStoreMod.loadStatus(config, modules[moduleId].dir);
      assert.equal(status.status, 'PASS');
      assert.equal(status.current_phase, null);
      assert.equal(status.fail_count, 0);
      assert.equal(status.validation.delivery_lint_passed, true);
      assert.equal(status.validation.pre_check_passed, true);
      assert.equal(status.completion_summary, `Migrated seam Buster pass ${moduleId}`);
      assert.equal(status.history.some((entry) => entry.to === 'READY_FOR_TESTING'), true);
      assert.equal(status.history.some((entry) => entry.to === 'TESTING'), true);
      assert.equal(status.history.some((entry) => entry.to === 'PASS'), true);
    }

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const passEvents = events.filter((event) => event.type === 'module.status_changed' && event.new_status === 'PASS');
    assert.deepEqual(passEvents.map((event) => event.module_id), executionOrder);
    assert.equal(events.some((event) => event.type === 'pipeline.completed' && event.run_id === runId), true);
  });

  await record('ugly migrated seam rejects compatibility-shaped worker output fail-closed', async () => {
    const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(runtimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const moduleRunnerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/module-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const lifecycleStateMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');

    const fixture = createSingleModuleFixture('migrated-invalid-worker-seam', 'Migrated Invalid Worker Seam');
    const { registry, workerCalls } = await buildRegistryWithFakeModuleWorkers(runtimeRoot, {
      lifecycleStateMod,
      expectedModuleIds: ['01'],
      labelPrefix: 'migrated-invalid-worker-seam',
      forgeMode: 'invalid_backend_result',
    });
    const runId = 'run-migrated-invalid-worker-seam-1';
    const { config, deps } = buildModuleConfig({
      label: 'migrated-invalid-worker-seam',
      fixture,
      registry,
      runtimeCoreMod,
      runId,
    });

    const result = await moduleRunnerMod.runModule(config, fixture.progress, '01', { deps });
    await flushAsync();

	    assert.equal(result.kind, 'pipeline_step_result');
	    assert.equal(result.nextAction, 'halt');
	    assert.equal(result.outcome, 'error');
	    assert.equal(stepExit(result), 1);
	    assert.equal(result.diagnostics.contract_invalid, true);
	    assert.match(stepReason(result), /typed worker control result|invalid control result/i);
    assert.deepEqual(workerCalls.map((call) => call.stageId), ['worker:module_forge']);

    const status = statusStoreMod.loadStatus(config, fixture.moduleDir);
    assert.notEqual(status.status, 'PASS');
    assert.equal(status.history.some((entry) => entry.to === 'PASS'), false);
    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(events.some((event) => event.type === 'module.status_changed' && event.new_status === 'PASS'), false);
  });

  await record('ugly migrated seam blocks missing registry owner instead of falling back', async () => {
    const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(runtimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const moduleRunnerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/module-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
    const lifecycleStateMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
    const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');

    const fixture = createSingleModuleFixture('migrated-missing-owner-seam', 'Migrated Missing Owner Seam');
    const { registry, workerCalls } = await buildRegistryWithFakeModuleWorkers(runtimeRoot, {
      lifecycleStateMod,
      expectedModuleIds: ['01'],
      labelPrefix: 'migrated-missing-owner-seam',
      omitForgeOwner: true,
    });
    const runId = 'run-migrated-missing-owner-seam-1';
    const { config, deps } = buildModuleConfig({
      label: 'migrated-missing-owner-seam',
      fixture,
      registry,
      runtimeCoreMod,
      runId,
    });

    const result = await moduleRunnerMod.runModule(config, fixture.progress, '01', { deps });
    await flushAsync();

	    assert.equal(result.kind, 'pipeline_step_result');
	    assert.equal(result.nextAction, 'halt');
	    assert.equal(result.outcome, 'error');
	    assert.equal(stepExit(result), 1);
	    assert.match(stepReason(result), /No registered plugin owner found/);
    assert.deepEqual(workerCalls, []);

    const status = statusStoreMod.loadStatus(config, fixture.moduleDir);
    assert.notEqual(status.status, 'PASS');
    assert.equal(status.history.some((entry) => entry.to === 'PASS'), false);
    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    assert.equal(events.some((event) => event.type === 'module.status_changed' && event.new_status === 'PASS'), false);
  });

}
