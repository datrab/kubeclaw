
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { requireStageHandler } from '../core/registry.ts';
import { ensurePipelineRunLogDir } from '../core/paths.ts';

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    const messages = {
      stageId: 'scheduled gate invocation requires explicit stageId',
      gateId: 'scheduled gate invocation requires explicit gateId',
      runId: 'scheduled gate invocation requires explicit runId',
      gateType: 'scheduled gate invocation requires explicit gateType',
    };
    throw new Error(messages[label] || `scheduled gate invocation requires explicit ${label}`);
  }
  return value.trim();
}

function requirePositiveAttempt(value) {
  const attempt = Number(value);
  if (!Number.isFinite(attempt) || attempt < 1) {
    throw new Error('scheduled gate invocation requires explicit positive attempt');
  }
  return attempt;
}

function assertOptionalIdentityMatch(actual, expected, message) {
  if (actual == null) return;
  if (actual !== expected) {
    throw new Error(message);
  }
}

function assertOptionalAttemptMatch(actual, expected) {
  if (actual == null) return;
  if (Number(actual) !== expected) {
    throw new Error('scheduled gate invocation plugin attempt must match gate input ids.attempt');
  }
}

export function ensureScheduledGatePluginLogDirs(config) {
  ensurePipelineRunLogDir(config);
}

export function assertScheduledGateInvocationIdentity({
  stageId,
  gateId,
  gateInput,
  pluginInvocation,
}) {
  const ids = gateInput?.ids || {};
  const explicitStageId = requireNonEmptyString(stageId, 'stageId');
  const explicitGateId = requireNonEmptyString(gateId, 'gateId');
  const runId = requireNonEmptyString(ids.runId, 'runId');
  const gateType = requireNonEmptyString(ids.gateType, 'gateType');
  const attempt = requirePositiveAttempt(ids.attempt);

  if (ids.stageId !== explicitStageId) {
    throw new Error('scheduled gate invocation stageId must match gate input ids.stageId');
  }
  if (ids.gateId !== explicitGateId) {
    throw new Error('scheduled gate invocation gateId must match gate input ids.gateId');
  }
  if (pluginInvocation?.stageId !== explicitStageId) {
    throw new Error('scheduled gate invocation plugin stageId must match explicit stageId');
  }
  assertOptionalIdentityMatch(pluginInvocation.gateId, explicitGateId, 'scheduled gate invocation plugin gateId must match explicit gateId');
  assertOptionalIdentityMatch(pluginInvocation.runId, runId, 'scheduled gate invocation plugin runId must match gate input ids.runId');
  assertOptionalIdentityMatch(pluginInvocation.gateType, gateType, 'scheduled gate invocation plugin gateType must match gate input ids.gateType');
  assertOptionalAttemptMatch(pluginInvocation.attempt, attempt);

  return { stageId: explicitStageId, gateId: explicitGateId, runId, gateType, attempt };
}

export async function runScheduledGateInvocation({
  config,
  progress,
  gateId,
  gate,
  opts = {},
  stageId,
  gateInput,
  pluginInvocation,
}) {
  const identity = assertScheduledGateInvocationIdentity({
    stageId,
    gateId,
    gateInput,
    pluginInvocation,
  });
  ensureScheduledGatePluginLogDirs(config);
  const { handler: executeGate, record } = requireStageHandler(config, 'gate.execute', identity.stageId, 'execute');
  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'gate.execute',
    stageId: identity.stageId,
    record,
    invocation: pluginInvocation,
    stateSnapshot: async () => gateInput.stateSnapshot,
    environmentMetadata: {
      gateId: identity.gateId,
      gateType: identity.gateType,
      novaPromptProvided: Boolean(opts?.novaPrompt),
    },
    injectedDeps: opts.deps || null,
  });

  const rawResult = await executeGate(
    buildPluginInvocationEnvelope(gateInput, pluginContext),
    pluginContext,
  );

  return { rawResult, pluginContext, record, identity };
}
