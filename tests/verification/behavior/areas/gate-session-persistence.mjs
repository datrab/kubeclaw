export async function registerGateSessionPersistenceArea({
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
await record('Buster gate fix cycles persist gate active-session markers for restart recovery', async () => {
  const gateActiveSessionText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/gate-active-session.js');
  const gateFixScaffoldText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/gate-fix-scaffold.js');
  const busterGateText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/buster-gate-runner.js');

  assert(gateActiveSessionText.includes('gateActiveSessionPath(config, gateId)'));
  assert(gateFixScaffoldText.includes('persistGateActiveSession(config, gateId, fixAcpLabel'));
  assert(gateFixScaffoldText.includes('buildActiveSessionExtra({'));
  assert(gateFixScaffoldText.includes('if (killed) clearGateActiveSession(config, gateId);'));
  assert(busterGateText.includes("clearActiveSessionBeforeSpawn: true,"));
  assert(busterGateText.includes("phase: 'buster_gate_fix',"));
});

await record('Review and Buster gate restart markers preserve retry correlation for stale recovery', async () => {
  const reviewGateText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/review-gate-runner.js');
  const busterGateText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/runners/buster-gate-runner.js');
  const gateFixScaffoldText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/services/gate-fix-scaffold.js');

  assert(reviewGateText.includes("phase: 'review_fix',"));
  assert(reviewGateText.includes("gate_type: gate.type,"));
  assert(reviewGateText.includes("cycle,"));
  assert(busterGateText.includes("dispatchId: gateDispatchId,"));
  assert(busterGateText.includes("attempt: cycle,"));
  assert(busterGateText.includes("dispatch_id: correlation.dispatchId || null,"));
  assert(gateFixScaffoldText.includes('dispatchId: initialCorrelation.dispatchId || null,'));
});
}
