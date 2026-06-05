export async function registerShutdownIntegrationArea({
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
await record('Nova shutdown/reaper integration stays wired through orchestration', async () => {
  const orchestrationRuntimeRoot = materializeRuntimeTree(sourceRoot, overlayRoot, 'general').runtimeRoot;
  const shutdownTestMod = await importRuntimeModule(orchestrationRuntimeRoot, '/app/skills/pipeline/agents/shutdown.ts');
  const orchestrationText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/agents/orchestration.ts');
  const shutdownText = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/agents/shutdown.ts');
  const lifecycleText = readOverlayText(sourceRoot, overlayRoot, 'skills/common/pipeline/agents/lifecycle.ts');
  assert(orchestrationText.includes("import { reaperAfterKill } from './shutdown.ts';"));
  assert(orchestrationText.includes("import { getTrackedAgent, spawnSession, trackAgent, untrackAgent } from './lifecycle.ts';"));
  assert(orchestrationText.includes("import { terminateSession } from './session-termination.ts';"));
  assert(orchestrationText.includes('cleanup: async () => reaperAfterKill(entry.agentId, sessionKey, entry.gatewayLabel),'));
  assert(orchestrationText.includes('trackAgent(config, trackingKey, sessionData.childSessionKey'));
  assert(shutdownText.includes("import { getTrackedAgent, listTrackedAgents, trackAgent, untrackAgent } from './lifecycle.ts';"));
  assert(shutdownText.includes("import { terminateSession } from './session-termination.ts';"));
  assert(shutdownText.includes("import { resolveGatewayInvokeUrl, resolveGatewayToken } from '../integrations/gateway.ts';"));
  assert(shutdownText.includes('const gatewayUrl = resolveGatewayInvokeUrl();'));
  assert(shutdownText.includes('const gatewayToken = resolveGatewayToken();'));
  assert(shutdownText.includes('await terminateSession(sessionKey, {'));
  assert(shutdownText.includes('const trackedAgents = listTrackedAgents();'));
  assert.equal(shutdownText.includes('activeSessions: new Map()'), false);
  assert.equal(shutdownText.includes('export function trackAgent'), false);
  assert.equal(shutdownText.includes('export function untrackAgent'), false);
  assert.equal(shutdownText.includes('export function getTrackedAgent'), false);
  assert.equal(shutdownText.includes('export function getTrackedAgentCount'), false);
  assert.equal(shutdownText.includes('export function gatewayKillSync'), false);
  assert.equal(shutdownText.includes('export function acpxCleanupSync'), false);
  assert.equal(shutdownText.includes('export async function acpxCleanup'), false);
  assert.equal(shutdownText.includes('export function reaperAfterKillSync'), false);
  assert.equal(shutdownText.includes('export function getShutdownState'), false);
  assert.equal(shutdownText.includes("execFileSync('curl'"), false);
  assert(lifecycleText.includes("from './tracked-agents.ts';"));
  assert.equal(typeof lifecycleMod.getTrackedAgent, 'function');
  assert.equal(typeof lifecycleMod.trackAgent, 'function');
  assert.equal(typeof lifecycleMod.untrackAgent, 'function');
  assert.equal(typeof lifecycleMod.listTrackedAgents, 'function');
  assert.equal(typeof shutdownTestMod.reaperAfterKill, 'function');
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'trackAgent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'untrackAgent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'getTrackedAgent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'getTrackedAgentCount'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'gatewayKillSync'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'acpxCleanupSync'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'acpxCleanup'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'reaperAfterKillSync'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shutdownTestMod, 'getShutdownState'), false);
  assert.equal(shutdownText.includes('GATEWAY_URL'), false);
  assert.equal(shutdownText.includes('GATEWAY_TOKEN'), false);
});
}
