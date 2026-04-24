import fs from 'fs';
import path from 'path';

import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.js';
import { requireStageHandler } from '../core/registry.js';
import { pipelineRunLogDir } from '../core/paths.js';
import { runGateRemediationHandoff } from '../services/remediation-handoff.js';

function ensureGatePluginLogDirs(config) {
  if (!config?._logDir && config?.paths?.swarm_dir) {
    config._logDir = path.join(config.paths.swarm_dir, 'logs');
  }
  if (config?._logDir && !config?._runLogDir) {
    config._runLogDir = pipelineRunLogDir(config);
    fs.mkdirSync(config._runLogDir, { recursive: true });
  }
}

export function finalizeLegacyGateResult(result, gateId, gate) {
  return {
    ...result,
    gate: result?.gate || gateId,
    gate_id: result?.gate_id || gateId,
    gate_type: result?.gate_type || gate?.type || null,
  };
}

export async function runRemediableGateControlLoop({
  initialControlResult,
  evaluateGate,
  performFix,
  extractLegacyResult,
  buildExhaustedLegacyResult,
  gateId,
  gate,
}) {
  if (initialControlResult?.nextAction !== 'request_fix') {
    return extractLegacyResult(initialControlResult, gateId, gate);
  }

  return runGateRemediationHandoff({
    initialControlResult,
    evaluateGate,
    performFix,
    extractLegacyResult,
    buildExhaustedLegacyResult,
    gateId,
    gate,
  });
}

export async function runScheduledRemediableGate({
  config,
  progress,
  gateId,
  gate,
  opts = {},
  stageId,
  gateInput,
  pluginInvocation,
  normalizeControlResult,
  buildRemediationHandlers,
}) {
  ensureGatePluginLogDirs(config);
  const { handler: executeGate, record } = requireStageHandler(config, 'gate.execute', stageId, 'execute');
  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'gate.execute',
    stageId,
    record,
    invocation: pluginInvocation,
    stateSnapshot: async () => gateInput.stateSnapshot,
    environmentMetadata: {
      gateId,
      gateType: gate?.type || null,
      novaPromptProvided: Boolean(opts?.novaPrompt),
    },
  });

  const rawResult = await executeGate(
    buildPluginInvocationEnvelope(gateInput, pluginContext),
    pluginContext,
  );

  const controlResult = normalizeControlResult(rawResult, { input: gateInput, stageId });
  const legacyResult = await runRemediableGateControlLoop({
    initialControlResult: controlResult,
    ...buildRemediationHandlers(controlResult),
    gateId,
    gate,
  });

  return finalizeLegacyGateResult(legacyResult, gateId, gate);
}
