export async function registerSeqRestartArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  xaddEvents,
  flushAsync,
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

    const busterTelemetryA = await importRuntimeModule(bootA.sandbox, '/app/skills/pipeline/services/telemetry.js');
    const runtimeCoreA = await importRuntimeModule(bootA.general, '/app/skills/pipeline/core/runtime.js');
    const novaTelemetryA = await importRuntimeModule(bootA.general, '/app/skills/pipeline/services/telemetry.js');
    const runId = 'run-restart-safe-seq-1';
    const project = 'behavior-restart-safe-seq';
    const streamKey = `pipeline:telemetry:${project}:${runId}`;
    const seqKey = `pipeline:telemetry:seq:${project}:${runId}`;

    const busterCtxA = busterTelemetryA.createTelemetryContext({
      project,
      module: '01',
      runId,
      enabled: true,
    });
    const novaConfigA = {
      project,
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreA.createRunStats('2026-04-17T00:00:00.000Z'),
    };

    await busterTelemetryA.emitEvent(busterCtxA, 'buster.task_started', { module_id: '01', attempt: 1 });
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

    const busterTelemetryB = await importRuntimeModule(bootB.sandbox, '/app/skills/pipeline/services/telemetry.js');
    const runtimeCoreB = await importRuntimeModule(bootB.general, '/app/skills/pipeline/core/runtime.js');
    const novaTelemetryB = await importRuntimeModule(bootB.general, '/app/skills/pipeline/services/telemetry.js');

    const busterCtxB = busterTelemetryB.createTelemetryContext({
      project,
      module: '01',
      runId,
      enabled: true,
    });
    const novaConfigB = {
      project,
      resume: true,
      telemetry: { enabled: true },
      _runId: runId,
      run_id: runId,
      _runStats: runtimeCoreB.createRunStats('2026-04-17T00:01:00.000Z'),
    };

    await novaTelemetryB.emitEvent({ config: novaConfigB }, 'module.resumed', { module_id: '01', attempt: 1 });
    await busterTelemetryB.emitEvent(busterCtxB, 'buster.task_completed', { module_id: '01', attempt: 1, outcome: 'PASS' });
    await flushAsync();
    await busterTelemetryB.closeTelemetry(busterCtxB);
    await novaTelemetryB.closeTelemetryRedis();

    const events = xaddEvents(streamKey);
    assert.deepEqual(events.map((event) => event.type), [
      'buster.task_started',
      'module.started',
      'module.resumed',
      'buster.task_completed',
    ]);
    assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
    assert.equal(new Set(events.map((event) => event.seq)).size, 4);
    assert.equal(globalThis.__fakeRedisCounters[seqKey], 4);
  });
}
