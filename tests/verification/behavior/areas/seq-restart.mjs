import {
  buildBuiltInRegistry,
} from './helpers.mjs';

export async function registerSeqRestartArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  fs,
  os,
  path,
  assert,
  materializeRuntimeTree,
  importRuntimeModule,
}) {
  await record('telemetry seq stays monotonic across emitter restart and resume on the same run id', async () => {
    const bootA = {
      general: materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot,
      sandbox: materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox').runtimeRoot,
    };
    installFakeRedis(bootA.general);
    installFakeRedis(bootA.sandbox);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const busterTelemetryA = await importRuntimeModule(bootA.sandbox, '/app/skills/pipeline/services/telemetry.ts');
    const runtimeCoreA = await importRuntimeModule(bootA.general, '/app/skills/pipeline/core/runtime.ts');
    const novaTelemetryA = await importRuntimeModule(bootA.general, '/app/skills/pipeline/services/telemetry.ts');
    const runId = 'run-restart-safe-seq-1';
    const project = 'behavior-restart-safe-seq';
    const streamKey = `pipeline:telemetry:${project}:${runId}`;
    const seqKey = `pipeline:telemetry:seq:${project}:${runId}`;

    const busterCtxA = busterTelemetryA.createTelemetryContext({
      project,
      module_id: '01',
      run_id: runId,
      enabled: true,
    });
    const novaConfigA = {
      project,
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreA.createRunStats('2026-04-17T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(bootA.general),
    };

    await busterTelemetryA.emitPluginEvent(busterCtxA, 'task_started', { module_id: '01', attempt: 1 });
    await novaTelemetryA.emitEvent({ config: novaConfigA }, 'module.started', { module_id: '01', attempt: 1 });
    await flushAsync();
    await busterTelemetryA.closeTelemetry(busterCtxA);
    await novaTelemetryA.closeTelemetryRedis();

    assert.equal(globalThis.__fakeRedisCounters[seqKey], 2);

    const bootB = {
      general: materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot,
      sandbox: materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox').runtimeRoot,
    };
    installFakeRedis(bootB.general);
    installFakeRedis(bootB.sandbox);

    const busterTelemetryB = await importRuntimeModule(bootB.sandbox, '/app/skills/pipeline/services/telemetry.ts');
    const runtimeCoreB = await importRuntimeModule(bootB.general, '/app/skills/pipeline/core/runtime.ts');
    const novaTelemetryB = await importRuntimeModule(bootB.general, '/app/skills/pipeline/services/telemetry.ts');

    const busterCtxB = busterTelemetryB.createTelemetryContext({
      project,
      module_id: '01',
      run_id: runId,
      enabled: true,
    });
    const novaConfigB = {
      project,
      resume: true,
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreB.createRunStats('2026-04-17T00:01:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(bootB.general),
    };

    await novaTelemetryB.emitEvent({ config: novaConfigB }, 'module.status_changed', { module_id: '01', new_status: 'RESUMED', attempt: 1 });
    await busterTelemetryB.emitPluginEvent(busterCtxB, 'task_completed', { module_id: '01', attempt: 1, outcome: 'PASS' });
    await flushAsync();
    await busterTelemetryB.closeTelemetry(busterCtxB);
    await novaTelemetryB.closeTelemetryRedis();

    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), [
      'plugin.event',
      'module.started',
      'module.status_changed',
      'plugin.event',
    ]);
    assert.deepEqual(events.filter((event) => event.type === 'plugin.event').map((event) => event.plugin_event), ['task_started', 'task_completed']);
    assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
    assert.equal(new Set(events.map((event) => event.seq)).size, 4);
    assert.equal(globalThis.__fakeRedisCounters[seqKey], 4);
  });

  await record('durable pipeline artifacts mirror Redis-owned seq for capped stream replay', async () => {
    const boot = {
      general: materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot,
      sandbox: materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox').runtimeRoot,
    };
    installFakeRedis(boot.general);
    installFakeRedis(boot.sandbox);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-telemetry-retention-'));
    const logDir = path.join(root, '.swarm', 'logs');
    const pipelineLogPath = path.join(logDir, 'pipeline', 'pipeline.jsonl');
    const pipelineRunLogPath = path.join(logDir, 'pipeline', 'runs', 'run-telemetry-retention-1', 'pipeline.jsonl');

    const busterTelemetry = await importRuntimeModule(boot.sandbox, '/app/skills/pipeline/services/telemetry.ts');
    const runtimeCore = await importRuntimeModule(boot.general, '/app/skills/pipeline/core/runtime.ts');
    const novaTelemetry = await importRuntimeModule(boot.general, '/app/skills/pipeline/services/telemetry.ts');
    const project = 'behavior-telemetry-retention';
    const runId = 'run-telemetry-retention-1';
    const streamKey = `pipeline:telemetry:${project}:${runId}`;
    const seqKey = `pipeline:telemetry:seq:${project}:${runId}`;

    const busterCtx = busterTelemetry.createTelemetryContext({
      project,
      module_id: '01',
      run_id: runId,
      enabled: true,
      pipeline_log_path: pipelineLogPath,
      pipeline_run_log_path: pipelineRunLogPath,
    });
    const novaConfig = {
      project,
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCore.createRunStats('2026-04-17T00:00:00.000Z'),
      pluginRegistry: await buildBuiltInRegistry(boot.general),
      paths: { swarm_dir: path.join(root, '.swarm') },
    };

    await busterTelemetry.emitPluginEvent(busterCtx, 'task_started', { module_id: '01', attempt: 1 });
    await novaTelemetry.emitEvent({ config: novaConfig }, 'module.started', { module_id: '01', attempt: 1 });
    await flushAsync();
    await busterTelemetry.closeTelemetry(busterCtx);
    await novaTelemetry.closeTelemetryRedis();

    const runArtifactEvents = fs.readFileSync(pipelineRunLogPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const retainedTypes = runArtifactEvents.map((event) => event.type);
    assert.deepEqual(retainedTypes, ['plugin.event', 'module.started']);
    assert.equal(runArtifactEvents[0].plugin_event, 'task_started');
    assert.deepEqual(runArtifactEvents.map((event) => event.seq), [1, 2]);
    assert.equal(globalThis.__fakeRedisCounters[seqKey], 2);

    const streamXadds = (globalThis.__fakeRedisCalls || []).filter((entry) => entry.op === 'xadd' && entry.args?.[0] === streamKey);
    assert.equal(streamXadds.length, 2);
    assert.deepEqual(streamXadds.map((entry) => entry.args[entry.args.indexOf('~') + 1]), ['10000', '10000']);
    assert.deepEqual(xaddEvents(streamKey).map((event) => event.seq), [1, 2]);
  });

  await record('Nova telemetry stream rejects weak identity instead of using local seq fallback', async () => {
    const runtimeRootForWeakIdentity = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
    installFakeRedis(runtimeRootForWeakIdentity);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const telemetryStreamMod = await importRuntimeModule(runtimeRootForWeakIdentity, '/app/skills/pipeline/services/telemetry-stream.ts');

    const missingRun = await telemetryStreamMod.emitTelemetryStreamEvent({
      project: 'behavior-weak-telemetry-identity',
      telemetry: { enabled: true },
    }, 'module.started', { module_id: '01' });
    const missingProject = await telemetryStreamMod.emitTelemetryStreamEvent({
      _runId: 'run-weak-telemetry-identity-1',
      run_id: 'run-weak-telemetry-identity-1',
      telemetry: { enabled: true },
    }, 'module.started', { module_id: '01' });

    assert.equal(missingRun.ok, false);
    assert.equal(missingRun.skipped, false);
    assert.equal(missingRun.reason, 'missing_identity');
    assert.equal(missingRun.streamKey, null);
    assert.equal(missingProject.ok, false);
    assert.equal(missingProject.reason, 'missing_identity');
    assert.deepEqual(globalThis.__fakeRedisCalls, []);
    assert.deepEqual(Object.keys(globalThis.__fakeRedisCounters), []);
    assert.equal(xaddEvents('pipeline:telemetry:unknown:unknown').length, 0);
  });

  await record('Buster telemetry rejects weak identity instead of publishing unknown streams', async () => {
    const runtimeRootForWeakIdentity = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox').runtimeRoot;
    installFakeRedis(runtimeRootForWeakIdentity);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const busterTelemetryMod = await importRuntimeModule(runtimeRootForWeakIdentity, '/app/skills/pipeline/services/telemetry.ts');

    const missingRunCtx = busterTelemetryMod.createTelemetryContext({
      project: 'behavior-buster-weak-telemetry-identity',
      module: '01',
      enabled: true,
    });
    const missingProjectCtx = busterTelemetryMod.createTelemetryContext({
      module: '01',
      runId: 'run-buster-weak-telemetry-identity-1',
      enabled: true,
    });

    assert.equal(missingRunCtx.streamKey, null);
    assert.equal(missingRunCtx.seqKey, null);
    assert.equal(missingRunCtx.redis, null);
    assert.equal(missingRunCtx._health.redis.reason, 'missing_identity');
    assert.equal(missingProjectCtx.streamKey, null);
    assert.equal(missingProjectCtx.seqKey, null);
    assert.equal(missingProjectCtx.redis, null);
    assert.equal(missingProjectCtx._health.redis.reason, 'missing_identity');

    await busterTelemetryMod.emitPluginEvent(missingRunCtx, 'task_started', { module_id: '01', attempt: 1 });
    await busterTelemetryMod.emitPluginEvent(missingProjectCtx, 'task_started', { module_id: '01', attempt: 1 });
    await flushAsync();

    assert.deepEqual(globalThis.__fakeRedisCalls, []);
    assert.deepEqual(Object.keys(globalThis.__fakeRedisCounters), []);
    assert.equal(xaddEvents('pipeline:telemetry:unknown:unknown').length, 0);
  });
}
