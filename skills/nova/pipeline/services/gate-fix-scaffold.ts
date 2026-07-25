import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { gateLogDir } from '../core/paths.ts';
import { canonicalizeModelId, modelToHarness, resolveRuntime } from '../agents/runtime.ts';
import { copyTranscriptArtifact, writePromptArtifact } from '../egress.ts';
import { clearGateActiveSession, persistGateActiveSession } from './gate-active-session.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function requiredSpawnIdentifier(value: any, name: any) {
  if (typeof value === 'string' && /^[A-Za-z0-9._:-]+$/.test(value)) return value;
  throw new Error(`Gate fix Forge spawn ${name} is invalid`);
}

function selectPresentValue(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function promptText(value: any) {
  if (typeof value === 'string') return value;
  if (typeof value?.prompt === 'string') return value.prompt;
  const text = String(value || '');
  if (text) return text;
  throw new Error('Gate fix Forge spawn requires explicit prompt text');
}

function resolvedForgeFixModel(model: any) {
  return selectPresentValue(canonicalizeModelId(model), model);
}

function forgeFixAgentId(config: any, resolvedModel: any) {
  if (typeof config?.agents?.forge?.acp_agent_id === 'string' && config.agents.forge.acp_agent_id.trim()) {
    return config.agents.forge.acp_agent_id;
  }
  return modelToHarness(resolvedModel);
}

function mergeTrackedFixCorrelation(correlation: any, trackedFixAgent: any) {
  correlation.sessionKey = selectPresentValue(trackedFixAgent?.sessionKey, correlation.sessionKey);
  correlation.gatewayLabel = selectPresentValue(trackedFixAgent?.gatewayLabel, correlation.gatewayLabel);
  correlation.dispatchId = selectPresentValue(trackedFixAgent?.telemetry_dispatch_id, trackedFixAgent?.dispatch_id, correlation.dispatchId);
}

export function validateGateForgeFixSpawnContract(config: any = {}, {
  model = null,
  fixLabel = null,
  fixAcpLabel = null,
  gateId = null,
  cycle = null,
}: any = {}) {
  if (selectTruthyValue(() => (!config?.agents?.forge), () => (typeof config.agents.forge !== 'object'))) {
    throw new Error('Gate fix Forge spawn requires config.agents.forge');
  }
  const resolvedModel = resolvedForgeFixModel(model);
  if (!resolvedModel) throw new Error('Gate fix Forge spawn requires a resolved Forge model');
  const agentId = forgeFixAgentId(config, resolvedModel);
  if (!agentId) throw new Error(`Gate fix Forge spawn requires explicit acp_agent_id or model harness mapping for '${resolvedModel}'`);
  const runtime = config.agents.forge.dispatch === 'acp' ? 'acp' : resolveRuntime({ model: resolvedModel });
  if (runtime !== 'acp' && runtime !== 'subagent') throw new Error(`Review fix Forge spawn runtime is invalid: ${runtime}`);
  validateSpawnIdentifiers({ fixLabel, fixAcpLabel, gateId });
  const numericCycle = Number(cycle);
  if (selectTruthyValue(() => (!Number.isInteger(numericCycle)), () => (numericCycle < 1))) throw new Error('Review fix Forge spawn cycle must be a positive integer');
  return { model: resolvedModel, agentId, runtime };
}

function validateSpawnIdentifiers(values: any) {
  for (const [name, value] of Object.entries(values)) requiredSpawnIdentifier(value, name);
}

export async function startGateForgeFixCycleScaffold({
  config,
  progress,
  deps,
  gateId,
  gate,
  cycle,
  fixPrompt,
  fixLabelPrefix,
  policyScope,
  initialCorrelation = {},
  clearActiveSessionBeforeSpawn = false,
  buildActiveSessionExtra = () => ({}),
}: any = {}) {
  const forgeFixPolicy = deps.resolvePolicy(config, progress, 'forge', {
    scopeModel: selectTruthyValue(() => (gate?.forge_model), () => (null)),
    scopeThinking: selectTruthyValue(() => (gate?.forge_thinking_level), () => (null)),
    dispatchPath: 'acp',
  });
  const forgeModel = forgeFixPolicy.model;
  deps.logEffectivePolicy(config, { scope: policyScope, agent: 'forge', gateId, ...forgeFixPolicy });

  const fixLabel = `${fixLabelPrefix}-${gateId}-${cycle}`;
  const fixAcpLabel = deps.acpLabel('forge', fixLabel);
  validateGateForgeFixSpawnContract(config, { model: forgeModel, fixLabel, fixAcpLabel, gateId, cycle });
  const correlation = {
    sessionKey: selectTruthyValue(() => (initialCorrelation.sessionKey), () => (null)),
    gatewayLabel: selectTruthyValue(() => (initialCorrelation.gatewayLabel), () => (null)),
    dispatchId: selectTruthyValue(() => (initialCorrelation.dispatchId), () => (null)),
  };
  const fixPromptText = promptText(fixPrompt);

  writeFixPrompt(config, gateId, cycle, fixPromptText);
  const context = { config, progress, deps, gateId, gate, cycle, fixLabel, fixAcpLabel, forgeModel, fixPromptText, forgeFixPolicy, correlation, clearActiveSessionBeforeSpawn, buildActiveSessionExtra };
  const spawned = await spawnGateFixAgent(context);
  if (!spawned.ok) return spawned;
  if (!(await deps.verifyAgentAlive(config, 'forge', fixLabel))) return failedGateFixHealthCheck(context);
  return { ok: true, fixLabel, fixAcpLabel, correlation };
}

function writeFixPrompt(config: any, gateId: any, cycle: any, prompt: string) {
  try {
    const logDir = gateLogDir(config, gateId);
    if (!logDir) throw new Error(`Gate '${gateId}' requires a canonical log directory`);
    writePromptArtifact(path.join(logDir, `forge-fix-prompt-cycle-${cycle}.md`), prompt, { gate_id: gateId, attempt: cycle, agent_type: 'forge' });
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): prompt persistence is diagnostic. */ }
}

async function spawnGateFixAgent(context: any) {
  const { config, progress, deps, gateId, gate, cycle, fixLabel, fixAcpLabel, forgeModel, fixPromptText, forgeFixPolicy, correlation } = context;
  try {
    if (context.clearActiveSessionBeforeSpawn) clearGateActiveSession(config, gateId);
    await deps.spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPromptText, { thinking: forgeFixPolicy.thinking, module_id: null, gate_id: gateId, gate_type: gate?.type, attempt: cycle });
    const trackedFixAgent = deps.getTrackedAgent(fixAcpLabel);
    mergeTrackedFixCorrelation(correlation, trackedFixAgent);
    persistGateActiveSession(config, gateId, fixAcpLabel, trackedFixAgent, context.buildActiveSessionExtra({ correlation: { ...correlation }, trackedAgent: trackedFixAgent, cycle, fixLabel, fixAcpLabel }));
    return { ok: true };
  } catch (error: any) {
    return { ok: false, stage: 'spawn', error, fixLabel, fixAcpLabel, correlation };
  }
}

async function failedGateFixHealthCheck(context: any) {
  const { config, deps, gateId, cycle, fixLabel, fixAcpLabel, correlation } = context;
  const expectedIdentity = { run_id: selectPresentValue(config?._runId, config?.run_id), attempt: cycle, dispatch_id: correlation.dispatchId, gateway_label: correlation.gatewayLabel, session_key: correlation.sessionKey };
  const killed = await deps.killAgent(config, 'forge', fixLabel);
  if (killed) clearGateActiveSession(config, gateId, expectedIdentity);
  return { ok: false, stage: 'health_check', fixLabel, fixAcpLabel, correlation };
}

export async function finishGateForgeFixCycleScaffold({
  config,
  deps,
  gateId,
  gate,
  cycle,
  fixLabel,
  fixAcpLabel,
  timeoutMinutes,
  artifactLogLabel,
}: any = {}) {
  let sessionResult = null;
  let completionError = null;
  try {
    try {
      sessionResult = await deps.pollForSessionEnd(config, fixAcpLabel, timeoutMinutes, fixLabel, {
        moduleId: gateId,
        gateId,
        gateType: gate?.type,
        attempt: cycle,
        agentType: 'forge',
      });

      saveFixTranscript({ config, deps, gateId, cycle, fixAcpLabel, artifactLogLabel });

      return { sessionResult };
    } catch (error: any) {
      completionError = error;
      throw error;
    }
  } finally {
    try {
      const trackedFixAgent = deps.getTrackedAgent(fixAcpLabel);
      const killed = await deps.killAgent(config, 'forge', fixLabel, sessionResult?.hasChanges === true);
      if (killed) clearGateActiveSession(config, gateId, trackedFixAgent);
    } catch (error: any) {
      if (completionError) log('DEBUG', `${artifactLogLabel} Forge cleanup failed (non-critical): ${error.message}`);
      if (!completionError) throw error;
    }
  }
}

function saveFixTranscript({ config, deps, gateId, cycle, fixAcpLabel, artifactLogLabel }: any) {
  const source = deps.getTrackedAgent(fixAcpLabel)?.streamLogPath;
  if (!source) return;
  try {
    if (!fs.existsSync(source)) return;
    const logDir = gateLogDir(config, gateId);
    if (!logDir) throw new Error(`Gate '${gateId}' requires a canonical log directory`);
    copyTranscriptArtifact(source, path.join(logDir, `forge-fix-transcript-cycle-${cycle}.jsonl`));
    log('OK', `${artifactLogLabel} stream metadata saved: gates/${gateId}/forge-fix-transcript-cycle-${cycle}.jsonl`);
  } catch (error: any) {
    log('DEBUG', `${artifactLogLabel} stream log save failed (non-critical): ${error.message}`);
  }
}
