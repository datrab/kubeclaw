// runners/gate-runner.js — Gate dispatch layer
//
// Gate stage ownership is resolved through the startup-frozen plugin registry.
// GATE_RUNNERS remains a static built-in implementation table used by the
// registry's built-in manifest entries, not a competing runtime owner map.
//
// Dispatch table:
//   buster  → runBusterGate  (spawn Buster agent, optional fix-and-retest loop)
//   review  → runReviewGate  (lint report + Echo reviewer, optional fix-and-rereview loop)
//   approval → runApprovalGate (persisted state + operator-mediated approval loop)

import fs from 'fs';
import path from 'path';
import { log, getActiveContext } from '../core/logger.js';
import { EXIT_ERROR } from '../core/constants.js';
import { getRunId } from '../core/runtime.js';
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.js';
import { requireStageHandler } from '../core/registry.js';
import { pipelineRunLogDir, swarmRoot, gateStatusPath, gateActiveSessionPath } from '../core/paths.js';
import { onGateFail, onGateStarted } from '../services/telemetry.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';
import { readGateOutput, readGateStatusJson, getLifecycleGateState, readBusterGateCompletion } from '../services/status-store.js';
import {
  runBusterGate,
  runBusterGateEvaluation,
  runBusterGateFixAttempt,
  buildBusterRemediationExhaustedLegacyResult,
} from './buster-gate-runner.js';
import {
  coerceBusterGateControlResult,
  extractBusterGateLegacyResult,
} from './buster-gate-runner.js';
import {
  runReviewGate,
  runReviewGateEvaluation,
  coerceReviewGateControlResult,
  extractReviewGateLegacyResult,
  buildReviewRemediationExhaustedLegacyResult,
  runReviewGateFixAttempt,
} from './review-gate-runner.js';
import {
  runApprovalGate,
  coerceApprovalGateControlResult,
  extractApprovalGateLegacyResult,
} from './approval-gate-runner.js';
import { runScheduledRemediableGate } from './remediable-gate-engine.js';
import {
  buildStagePluginInvocation,
  buildStageRefs,
  collectExistingArtifactRefs,
} from './stage-envelope-primitives.js';
import { normalizeRemediableTypedGateControlResult, normalizeTypedGateControlResult } from '../services/gate-control-result.js';

/**
 * Built-in gate implementation table.
 * Registry manifests point here so built-ins still execute through one startup
 * ownership seam instead of runner-local dispatch fallback.
 */
export const GATE_RUNNERS = {
  buster:   runBusterGate,
  review:   runReviewGate,
  approval: runApprovalGate,
};

function getGateRunners(config) {
  return { ...GATE_RUNNERS, ...(config?._testOverrides?.gateRunner?.runners || {}) };
}

function getDeps(config) {
  return {
    readGateOutput,
    readGateStatusJson,
    getLifecycleGateState,
    readBusterGateCompletion,
  };
}

function buildGateDispatchDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
  ], extra);
}

async function emitGateDispatchFailure(deps, config, ctx, gateId, reason, identity = {}) {
  await onGateStarted(ctx, gateId, {
    title: identity.title || gateId,
    type: identity.gate_type || identity.gateType || null,
    reviewers: null,
  });
  onGateFail(ctx, gateId, {
    gate_type: identity.gate_type || identity.gateType || null,
    reason,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Gate Dispatch Failed: ${identity.title || gateId}`,
        description: reason,
        fields: buildGateDispatchDiscordFields({
          run_id: config?._runId || config?.run_id || 'unknown',
          gate_id: gateId,
          gate_type: identity.gate_type || identity.gateType || null,
        }),
      },
    },
  });
  return { exit: EXIT_ERROR, reason };
}

async function emitGateExecutionFailure(config, ctx, gateId, gate, reason) {
  await onGateStarted(ctx, gateId, {
    title: gate?.title || gateId,
    type: gate?.type || null,
    reviewers: Array.isArray(gate?.reviewers) ? gate.reviewers : null,
  });
  onGateFail(ctx, gateId, {
    gate_type: gate?.type || null,
    reason,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Gate Execution Failed: ${gate?.title || gateId}`,
        description: reason,
        fields: buildGateDispatchDiscordFields({
          run_id: config?._runId || config?.run_id || 'unknown',
          gate_id: gateId,
          gate_type: gate?.type || null,
        }),
      },
    },
  });
  return { exit: EXIT_ERROR, reason };
}

function ensureGatePluginLogDirs(config) {
  if (!config?._logDir && config?.paths?.swarm_dir) {
    config._logDir = path.join(config.paths.swarm_dir, 'logs');
  }
  if (config?._logDir && !config?._runLogDir) {
    config._runLogDir = pipelineRunLogDir(config);
    fs.mkdirSync(config._runLogDir, { recursive: true });
  }
}

function buildGateArtifactRefs(config, gateId, gate) {
  const refs = [];
  if (gate?.output_file) {
    const outputPath = path.join(swarmRoot(config), gate.output_file);
    refs.push({ type: 'gate_output', role: 'output', format: path.extname(outputPath).slice(1) || 'json', path: outputPath });
  }

  const gateStatePath = gateStatusPath(config, gateId);
  refs.push({ type: 'gate_status', role: 'state', format: 'json', path: gateStatePath });

  const activeSessionPath = gateActiveSessionPath(config, gateId);
  refs.push({ type: 'gate_active_session', role: 'recovery', format: 'json', path: activeSessionPath });

  if (gate?.instructions_file) {
    const instructionsPath = path.join(swarmRoot(config), gate.instructions_file);
    refs.push({ type: 'gate_instructions', role: 'input', format: path.extname(instructionsPath).slice(1) || 'md', path: instructionsPath });
  }

  return collectExistingArtifactRefs(refs);
}

function buildGateStateSnapshot(config, progress, gateId, gate, deps = getDeps(config)) {
  const gateOutput = deps.readGateOutput(config, gate);
  const gateStatus = deps.readGateStatusJson(config, gateId);
  const lifecycleGate = deps.getLifecycleGateState(config, gateId);
  const busterCompletion = gate?.type === 'buster'
    ? deps.readBusterGateCompletion(config, gateId, gate)
    : null;

  return {
    pipeline: {
      project: config?.project || null,
      run_id: getRunId(config),
    },
    gate: {
      gate_id: gateId,
      gate_type: gate?.type || null,
      title: gate?.title || null,
      output_exists: gateOutput.exists === true,
      output_is_pass: gateOutput.isPass === true,
      output_status: gateOutput?.data?.status || null,
      gate_status_exists: gateStatus.exists === true,
      gate_status: gateStatus?.data?.status || null,
      gate_status_is_pass: gateStatus.isPass === true,
      gate_status_continued: gateStatus?.data?.continued === true,
      gate_status_timeout_policy: gateStatus?.data?.timeout_policy || null,
      lifecycle_status: lifecycleGate?.status || null,
      lifecycle_wait_status: lifecycleGate?.wait_status || null,
      lifecycle_scheduler_consumed: lifecycleGate?.scheduler_consumed === true,
      lifecycle_wait_ref: lifecycleGate?.wait_ref || null,
      buster_completion_is_pass: busterCompletion?.isPass === true,
      buster_completion_source: busterCompletion?.source || null,
    },
  };
}

function buildGateRunInput(config, progress, gateId, gate, opts = {}, deps = getDeps(config)) {
  const runId = getRunId(config);
  const stageId = `gate:${gate?.type || 'unknown'}`;
  const attempt = Number(opts?.attempt || 1);
  const artifacts = buildGateArtifactRefs(config, gateId, gate);
  const instructionsRef = artifacts.find((artifact) => artifact.type === 'gate_instructions') || null;
  const stateSnapshot = buildGateStateSnapshot(config, progress, gateId, gate, deps);
  const refs = buildStageRefs({
    runRef: { prefix: 'run', parts: [runId] },
    gateRef: { prefix: 'gate', parts: [gateId] },
    gateEvaluationRef: { prefix: 'gate_evaluation', parts: [runId, gateId, attempt] },
  });
  if (stateSnapshot?.gate?.lifecycle_wait_ref) refs.waitRef = stateSnapshot.gate.lifecycle_wait_ref;

  return {
    refs,
    ids: {
      runId,
      gateId,
      gateType: gate?.type || null,
      attempt,
      stageId,
    },
    gate: {
      config: { ...(gate || {}) },
      ...(instructionsRef ? { instructionsRef } : {}),
    },
    artifacts,
    priorResults: artifacts.filter((artifact) => artifact.type === 'gate_output' || artifact.type === 'gate_status'),
    stateSnapshot,
    executionContext: {
      novaPrompt: opts?.novaPrompt || null,
      novaPromptProvided: Boolean(opts?.novaPrompt),
    },
    deadline: gate?.timeout_minutes
      ? { timeoutMs: Number(gate.timeout_minutes) * 60 * 1000 }
      : undefined,
  };
}

function buildGatePluginInvocation(gateId, gate, opts = {}) {
  return buildStagePluginInvocation(`gate:${gate?.type || 'unknown'}`, {
    gateId,
    novaPromptProvided: Boolean(opts?.novaPrompt),
  });
}

function normalizeReviewGateControlResult(config, gateId, gate, rawResult, opts = {}) {
  return normalizeRemediableTypedGateControlResult(rawResult, {
    producerType: 'review',
    label: 'Review',
    coerce: (result) => coerceReviewGateControlResult(config, gateId, gate, result, opts),
  });
}

function normalizeApprovalGateControlResult(config, gateId, gate, rawResult, opts = {}) {
  return normalizeTypedGateControlResult(rawResult, {
    producerType: 'approval',
    label: 'Approval',
    allowedNextActions: ['pass', 'block'],
    coerce: (result) => coerceApprovalGateControlResult(config, gateId, gate, result, opts),
    extraValidate: (controlResult) => {
      const errors = [];
      const metadata = controlResult?.diagnostics?.metadata || controlResult?.diagnostics?.typed?.gate?.metadata || {};
      if (metadata?.legacy_status === 'TIMED_OUT' && metadata?.continued === true && controlResult.nextAction !== 'pass') {
        errors.push('approval timeout-continue must map to nextAction=pass');
      }
      return errors;
    },
  });
}

function normalizeBusterGateControlResult(config, gateId, gate, rawResult, opts = {}) {
  return normalizeRemediableTypedGateControlResult(rawResult, {
    producerType: 'buster',
    label: 'Buster',
    coerce: (result) => coerceBusterGateControlResult(config, gateId, gate, result, opts),
  });
}

async function runScheduledReviewGate(config, progress, gateId, gate, opts = {}) {
  const stageId = 'gate:review';
  const gateInput = buildGateRunInput(config, progress, gateId, gate, opts);
  const gateStartedAt = Date.now();
  const reviewFixHistory = [];
  return runScheduledRemediableGate({
    config,
    progress,
    gateId,
    gate,
    opts,
    stageId,
    gateInput,
    pluginInvocation: buildGatePluginInvocation(gateId, gate, opts),
    normalizeControlResult: (rawResult, normalizeOpts) =>
      normalizeReviewGateControlResult(config, gateId, gate, rawResult, normalizeOpts),
    buildRemediationHandlers: () => ({
      evaluateGate: ({ attempt, controlResult: remediationControlResult, remediation }) => runReviewGateEvaluation(config, progress, gateId, {
        attempt,
        gateStartedAt,
        skipStartedTelemetry: true,
        controlResult: remediationControlResult,
        remediation,
      }),
      performFix: ({ controlResult: remediationControlResult, cycle }) => runReviewGateFixAttempt(config, progress, gateId, remediationControlResult, {
        cycle,
        novaPrompt: opts?.novaPrompt || null,
        gateStartedAt,
        fixHistory: reviewFixHistory,
      }),
      extractLegacyResult: extractReviewGateLegacyResult,
      buildExhaustedLegacyResult: ({ controlResult: remediationControlResult }) =>
        buildReviewRemediationExhaustedLegacyResult(config, gateId, gate, remediationControlResult, { gateStartedAt }),
    }),
  });
}

async function runScheduledApprovalGate(config, progress, gateId, gate, opts = {}) {
  ensureGatePluginLogDirs(config);
  const stageId = 'gate:approval';
  const { handler: executeGate, record } = requireStageHandler(config, 'gate.execute', stageId, 'execute');
  const gateInput = buildGateRunInput(config, progress, gateId, gate, opts);
  const pluginContext = createPluginContext({
    config,
    progress,
    hookFamily: 'gate.execute',
    stageId,
    record,
    invocation: buildGatePluginInvocation(gateId, gate, opts),
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

  const controlResult = normalizeApprovalGateControlResult(config, gateId, gate, rawResult, { input: gateInput, stageId });
  const legacyResult = extractApprovalGateLegacyResult(controlResult, gateId, gate);
  return {
    ...legacyResult,
    gate: legacyResult?.gate || gateId,
    gate_id: legacyResult?.gate_id || gateId,
    gate_type: legacyResult?.gate_type || gate?.type || 'approval',
  };
}

async function runScheduledBusterGate(config, progress, gateId, gate, opts = {}) {
  const stageId = 'gate:buster';
  const gateInput = buildGateRunInput(config, progress, gateId, gate, opts);
  const gateStartedAt = Date.now();
  const busterFixHistory = [];
  return runScheduledRemediableGate({
    config,
    progress,
    gateId,
    gate,
    opts,
    stageId,
    gateInput,
    pluginInvocation: buildGatePluginInvocation(gateId, gate, opts),
    normalizeControlResult: (rawResult, normalizeOpts) =>
      normalizeBusterGateControlResult(config, gateId, gate, rawResult, normalizeOpts),
    buildRemediationHandlers: () => ({
      evaluateGate: ({ attempt, controlResult: remediationControlResult, remediation }) => runBusterGateEvaluation(config, progress, gateId, {
        attempt,
        gateStartedAt,
        skipStartedTelemetry: true,
        remediation,
        controlResult: remediationControlResult,
      }),
      performFix: ({ controlResult: remediationControlResult, cycle }) => runBusterGateFixAttempt(config, progress, gateId, remediationControlResult, {
        cycle,
        gateStartedAt,
        fixHistory: busterFixHistory,
      }),
      extractLegacyResult: extractBusterGateLegacyResult,
      buildExhaustedLegacyResult: ({ controlResult: remediationControlResult }) =>
        buildBusterRemediationExhaustedLegacyResult(config, gateId, gate, remediationControlResult, { gateStartedAt }),
    }),
  });
}

/**
 * Dispatch gate execution to the appropriate runner based on gate.type.
 *
 * @param {object} config   - Pipeline config
 * @param {object} progress - Project progress
 * @param {string} gateId   - Gate identifier
 * @param {object} opts     - Options (novaPrompt, etc.)
 * @returns {Promise<{ exit: number, [key: string]: any }>}
 */
export async function runGate(config, progress, gateId, { novaPrompt } = {}) {
  const gates = progress?.gates || null;
  const gate = gates?.[gateId];
  const ctx = getActiveContext() || { config };
  const deps = getDeps(config);

  if (!gates) {
    const reason = `Gate registry missing in progress.json while dispatching '${gateId}'`;
    log('ERROR', reason);
    return emitGateDispatchFailure(deps, config, ctx, gateId, reason, { title: gateId, gate_type: null });
  }

  if (!gate) {
    const reason = `Gate '${gateId}' not found in progress.json`;
    log('ERROR', reason);
    return emitGateDispatchFailure(deps, config, ctx, gateId, reason, { title: gateId, gate_type: null });
  }

  if (!getGateRunners(config)[gate.type]) {
    const reason = `Unknown gate type '${gate.type}' for gate '${gateId}'`;
    log('ERROR', reason);
    return emitGateDispatchFailure(deps, config, ctx, gateId, reason, { title: gate.title || gateId, gate_type: gate.type || null });
  }

  if (gate.type === 'review') {
    try {
      return await runScheduledReviewGate(config, progress, gateId, gate, { novaPrompt });
    } catch (error) {
      const reason = `Review gate execution failed: ${error.message}`;
      log('ERROR', reason);
      return emitGateExecutionFailure(config, ctx, gateId, gate, reason);
    }
  }

  if (gate.type === 'approval') {
    try {
      return await runScheduledApprovalGate(config, progress, gateId, gate, { novaPrompt });
    } catch (error) {
      const reason = `Approval gate execution failed: ${error.message}`;
      log('ERROR', reason);
      return emitGateExecutionFailure(config, ctx, gateId, gate, reason);
    }
  }

  if (gate.type === 'buster') {
    try {
      return await runScheduledBusterGate(config, progress, gateId, gate, { novaPrompt });
    } catch (error) {
      const reason = `Buster gate execution failed: ${error.message}`;
      log('ERROR', reason);
      return emitGateExecutionFailure(config, ctx, gateId, gate, reason);
    }
  }

  return emitGateDispatchFailure(deps, config, ctx, gateId, `Gate type '${gate.type}' has no registry-backed dispatch path`, { title: gate.title || gateId, gate_type: gate.type || null });
}

export default runGate;
