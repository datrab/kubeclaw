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
  await record('hermetic many-module full-pipeline soak completes all modules exactly once in execution order', async () => {
    const { runtimeRoot: pipelineRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(pipelineRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const pipelineRunnerMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
    const runtimeCoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const lifecycleStateMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/lifecycle-state.js');
    const statusStoreMod = await importRuntimeModule(pipelineRuntimeRoot, '/app/skills/pipeline/services/status-store.js');

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
    const config = {
      project: 'behavior-many-module-soak',
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreMod.createRunStats('2026-04-17T00:00:00.000Z'),
      _logDir: logDir,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
      },
      _testOverrides: {
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
              lifecycleStateMod.startModulePhase(status, 'forge', `Many-module soak started ${moduleId}`, {
                now,
              });
              statusStoreMod.saveStatus(configArg, mod.dir, status);
            }
            lifecycleStateMod.transitionModuleStatus(status, 'PASS', {
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
            statusStoreMod.saveStatus(configArg, mod.dir, status);
            return {
              exit: 0,
              module_id: moduleId,
              attempt: 1,
              dispatch_id: dispatchId,
              gateway_label: dispatchId,
            };
          },
        },
      },
    };

    const progress = { execution_order: executionOrder, modules, gates: {} };
    const exitCode = await pipelineRunnerMod.runPipeline(config, progress, { skipArchValidation: true });
    await flushAsync();

    assert.equal(exitCode, 0);
    assert.deepEqual(visited, executionOrder);
    assert.equal(outputs.some((payload) => payload?.exit === 0 && payload?.status === 'PIPELINE_COMPLETE'), true);

    for (const moduleId of executionOrder) {
      const status = JSON.parse(fs.readFileSync(path.join(modulesDir, modules[moduleId].dir, 'status.json'), 'utf8'));
      assert.equal(status.status, 'PASS');
      assert.equal(status.completion_summary, `Many-module soak pass OK for ${moduleId}`);
    }

    const events = xaddEvents(`pipeline:telemetry:${config.project}:${runId}`);
    const signalEvents = events.filter((event) => event.type !== 'observability.degraded' && event.type !== 'observability.restored');
    assert.deepEqual(signalEvents.map((event) => event.type), [
      'pipeline.started',
      'pipeline.completed',
      'summary.started',
      'summary.completed',
    ]);
    assert.equal(signalEvents[0].run_id, runId);
    assert.equal(signalEvents[1].run_id, runId);
    assert.equal(signalEvents[2].summary_type, 'pipeline');
    assert.equal(signalEvents[3].summary_type, 'pipeline');
    assert.equal(signalEvents[3].status, 'ok');
  });
}
