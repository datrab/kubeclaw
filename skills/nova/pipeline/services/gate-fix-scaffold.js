import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { gateLogDir } from '../core/paths.js';
import { copyRedactedTranscriptArtifact, writeRedactedPromptArtifact } from '../../../common/pipeline/redaction.js';
import { clearGateActiveSession, persistGateActiveSession } from './gate-active-session.js';

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
} = {}) {
  const forgeFixPolicy = deps.resolvePolicy(config, progress, 'forge', {
    scopeModel: gate?.forge_model || null,
    scopeThinking: gate?.forge_thinking_level || null,
    dispatchPath: 'acp',
  });
  const forgeModel = forgeFixPolicy.model;
  deps.logEffectivePolicy(config, { scope: policyScope, agent: 'forge', gateId, ...forgeFixPolicy });

  const fixLabel = `${fixLabelPrefix}-${gateId}-${cycle}`;
  const fixAcpLabel = deps.acpLabel('forge', fixLabel);
  const correlation = {
    sessionKey: initialCorrelation.sessionKey || null,
    gatewayLabel: initialCorrelation.gatewayLabel || null,
    dispatchId: initialCorrelation.dispatchId || null,
  };

  try {
    const logDir = gateLogDir(config, gateId);
    writeRedactedPromptArtifact(path.join(logDir, `forge-fix-prompt-cycle-${cycle}.md`), fixPrompt, {
      gate_id: gateId,
      attempt: cycle,
      agent_type: 'forge',
    });
  } catch { /* non-critical */ }

  try {
    if (clearActiveSessionBeforeSpawn) clearGateActiveSession(config, gateId);
    await deps.spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt, {
      thinking: forgeFixPolicy.thinking,
      module_id: null,
      gate_id: gateId,
      gate_type: gate?.type,
      attempt: cycle,
    });

    const trackedFixAgent = deps.getTrackedAgent(fixAcpLabel);
    correlation.sessionKey = trackedFixAgent?.sessionKey || correlation.sessionKey;
    correlation.gatewayLabel = trackedFixAgent?.gatewayLabel || correlation.gatewayLabel;
    correlation.dispatchId = trackedFixAgent?.telemetry_dispatch_id || trackedFixAgent?.dispatch_id || correlation.dispatchId;

    persistGateActiveSession(config, gateId, fixAcpLabel, trackedFixAgent, buildActiveSessionExtra({
      correlation: { ...correlation },
      trackedAgent: trackedFixAgent,
      cycle,
      fixLabel,
      fixAcpLabel,
    }));
  } catch (error) {
    return {
      ok: false,
      stage: 'spawn',
      error,
      fixLabel,
      fixAcpLabel,
      correlation,
    };
  }

  if (!(await deps.verifyAgentAlive(config, 'forge', fixLabel))) {
    const killed = await deps.killAgent(config, 'forge', fixLabel);
    if (killed) clearGateActiveSession(config, gateId);
    return {
      ok: false,
      stage: 'health_check',
      fixLabel,
      fixAcpLabel,
      correlation,
    };
  }

  return {
    ok: true,
    fixLabel,
    fixAcpLabel,
    correlation,
  };
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
} = {}) {
  const sessionResult = await deps.pollForSessionEnd(config, fixAcpLabel, timeoutMinutes, fixLabel, {
    moduleId: gateId,
    gateId,
    gateType: gate?.type,
    attempt: cycle,
    agentType: 'forge',
  });

  const fixStreamPath = deps.getTrackedAgent(fixAcpLabel)?.streamLogPath;
  if (fixStreamPath) {
    try {
      if (fs.existsSync(fixStreamPath)) {
        const logDir = gateLogDir(config, gateId);
        const destPath = path.join(logDir, `forge-fix-transcript-cycle-${cycle}.jsonl`);
        copyRedactedTranscriptArtifact(fixStreamPath, destPath);
        log('OK', `${artifactLogLabel} stream metadata saved: gates/${gateId}/forge-fix-transcript-cycle-${cycle}.jsonl`);
      }
    } catch (error) {
      log('DEBUG', `${artifactLogLabel} stream log save failed (non-critical): ${error.message}`);
    }
  }

  const killed = await deps.killAgent(config, 'forge', fixLabel, sessionResult.hasChanges);
  if (killed) clearGateActiveSession(config, gateId);

  return { sessionResult };
}
