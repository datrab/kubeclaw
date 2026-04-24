export async function registerBusterRuntimeNormalizationArea({
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
await record('Buster runtime imports, token resolution, and telemetry guard stay normalized', async () => {
  const busterPipelineText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.js');
  const busterPipelineHelpersText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline-helpers.js');
  const busterSessionMonitorText = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-session-monitor.js');

  assert(busterPipelineText.includes("from '../common/pipeline/agents/lifecycle.js'"));
  assert(busterPipelineText.includes("from '../common/pipeline/integrations/gateway.js'"));
  assert(busterPipelineHelpersText.includes("from '../common/pipeline/lifecycle-state.js'"));
  assert(busterSessionMonitorText.includes("from '../common/pipeline/agents/acp-monitor.js'"));
  assert(busterSessionMonitorText.includes("from '../common/pipeline/agents/lifecycle.js'"));
  assert(busterSessionMonitorText.includes("from '../common/pipeline/integrations/gateway.js'"));
  assert(busterPipelineText.includes('resolveGatewayHealthUrl'));
  assert(busterPipelineText.includes('resolveGatewayInvokeUrl'));
  assert(busterSessionMonitorText.includes('resolveGatewayBaseUrl'));
  assert(busterSessionMonitorText.includes('resolveGatewayToken'));
  assert(!busterPipelineText.includes('process.env.GATEWAY_TOKEN'));
  assert(!busterSessionMonitorText.includes('process.env.GATEWAY_TOKEN'));
  assert(!busterPipelineText.includes("const GATEWAY_URL            = 'http://127.0.0.1:18789/tools/invoke'"));
  assert(!busterPipelineText.includes("const GATEWAY_HEALTH_URL     = 'http://127.0.0.1:18789/health'"));
  assert(!busterSessionMonitorText.includes("const GATEWAY_URL            = 'http://127.0.0.1:18789/tools/invoke'"));
  assert(!busterSessionMonitorText.includes("const GATEWAY_HEALTH_URL     = 'http://127.0.0.1:18789/health'"));

  execFileSync('node', [
    path.join(overlayRoot || sourceRoot, 'tests/verification/runtime/check-runtime-collisions.mjs'),
    '--source-root', sourceRoot,
    ...(overlayRoot ? ['--overlay-root', overlayRoot] : []),
  ], { stdio: 'pipe' });

  execFileSync('node', [
    path.join(overlayRoot || sourceRoot, 'tests/verification/contracts/check-telemetry-contract.mjs'),
    '--source-root', sourceRoot,
    ...(overlayRoot ? ['--overlay-root', overlayRoot] : []),
    '--contract', contractPath,
  ], { stdio: 'pipe' });
});
}
