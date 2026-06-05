// runners/gate-runner.ts — Gate dispatch layer
//
// Gate type ownership and execution stage resolution are both resolved through
// the startup-frozen plugin registry. This layer remains core-owned: it builds
// the invocation envelope, validates generic gate control results, and maps
// plugin output into canonical pipeline step results for CLI/Nova/Discord output.

import path from 'path';
import { log, getActiveContext } from '../core/logger.ts';
import { selectDeps } from '../core/deps.ts';
import { getRunId } from '../core/runtime.ts';
import { requireGateTypeOwner } from '../core/registry.ts';
import { gateOutputPath, gateInstructionsPath, gateStatusPath, gateActiveSessionPath } from '../core/paths.ts';
import { onGateFail, onGateStarted } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { readGateOutput, readGateStatusJson, getLifecycleGateState, readGateCompletionEvidence } from '../services/status-store.ts';
import { runScheduledRemediableGate } from './remediable-gate-engine.ts';
import { runScheduledWaitableGate } from './waitable-gate-engine.ts';
import { ensureScheduledGatePluginLogDirs, runScheduledGateInvocation } from './scheduled-gate-invocation.ts';
import {
  buildStagePluginInvocation,
  buildStageRefs,
  collectExistingArtifactRefs,
} from './stage-envelope-primitives.ts';
import { normalizeRemediableTypedGateControlResult, normalizeTypedGateControlResult } from '../services/contracts/gate-control-result.ts';
import {
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_TYPES,
  buildPipelineStepResult,
  buildPipelineStepResultFromControlResult,
} from '../services/contracts/pipeline-step-result.ts';

type AnyRecord = Record<string, any>;

function getGateRunnerDeps(config, overrides = {}) {
  return {
    readGateOutput,
    readGateStatusJson,
    getLifecycleGateState,
    readGateCompletionEvidence,
    ...selectDeps(overrides, 'gateRunner'),
  };
}

function buildGateStepCorrelation(config, gateId, gateOrIdentity = {}, extra = {}) {
  return {
    run_id: config?._runId || config?.run_id || getRunId(config) || null,
    gate_id: gateId,
    gate_type: gateOrIdentity?.type || gateOrIdentity?.gate_type || gateOrIdentity?.gateType || null,
    ...extra,
  };
}

function buildGateStepResultFromControl(config, gateId, gate, controlResult, extra = {}) {
  return buildPipelineStepResultFromControlResult(controlResult, {
    stepType: PIPELINE_STEP_TYPES.GATE,
    stepId: gateId,
    outcome: controlResult?.diagnostics?.typed?.gate?.outcomeClass,
    correlation: buildGateStepCorrelation(config, gateId, gate, extra.correlation || {}),
    remediation: controlResult?.diagnostics?.typed?.remediation || null,
    wait: controlResult?.diagnostics?.typed?.wait || null,
  });
}

async function buildGateRuntimeErrorControl(config, ctx, gateId, gateOrIdentity = {}, {
  reason,
  diagnostics = {},
  titlePrefix = 'Gate Execution Failed',
  emitStarted = false,
  reviewers = null,
}: AnyRecord = {}) {
  const gateType = gateOrIdentity?.type || gateOrIdentity?.gate_type || gateOrIdentity?.gateType || null;
  const title = gateOrIdentity?.title || gateId;
  if (emitStarted === true) {
    await onGateStarted(ctx, gateId, {
      title,
      type: gateType,
      reviewers,
    });
  }
  onGateFail(ctx, gateId, {
    gate_type: gateType,
    reason,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `${titlePrefix}: ${title}`,
        description: reason,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_DISPATCH, {
          run_id: config?._runId || config?.run_id || 'unknown',
          gate_id: gateId,
          gate_type: gateType,
        }),
      },
    },
  });
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.GATE,
    stepId: gateId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'environment',
    reason,
    diagnostics,
    correlation: buildGateStepCorrelation(config, gateId, gateOrIdentity),
  });
}

function buildGateExecutionErrorControl(config, ctx, gateId, gate, label, error, { emitStarted = true } = {}) {
  const reason = `${label || gate?.type || 'Gate'} gate execution failed: ${error.message}`;
  log('ERROR', reason);
  return buildGateRuntimeErrorControl(config, ctx, gateId, gate, { reason, diagnostics: error?.diagnostics ? { contract_invalid: true, contract_diagnostic: error.diagnostics } : {}, emitStarted, reviewers: Array.isArray(gate?.reviewers) ? gate.reviewers : null });
}

function buildGateArtifactRefs(config, gateId, gate) {
  const refs = [];
  if (gate?.output_file) {
    const outputPath = gateOutputPath(config, gate);
    refs.push({ type: 'gate_output', role: 'output', format: path.extname(outputPath).slice(1) || 'json', path: outputPath });
  }

  refs.push({ type: 'gate_status', role: 'diagnostic', format: 'json', path: gateStatusPath(config, gateId) });

  refs.push({ type: 'gate_active_session', role: 'recovery', format: 'json', path: gateActiveSessionPath(config, gateId) });

  if (gate?.instructions_file) {
    const instructionsPath = gateInstructionsPath(config, gate);
    refs.push({ type: 'gate_instructions', role: 'input', format: path.extname(instructionsPath).slice(1) || 'md', path: instructionsPath });
  }

  return collectExistingArtifactRefs(refs);
}

function buildGateStateSnapshot(config, progress, gateId, gate, deps = getGateRunnerDeps(config)) {
  const gateOutput = deps.readGateOutput(config, gate);
  const gateStatus = deps.readGateStatusJson(config, gateId);
  const lifecycleGate = deps.getLifecycleGateState(config, gateId);
  const completionEvidence = deps.readGateCompletionEvidence(config, gateId, gate);

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
      timeout_policy: lifecycleGate?.timeout_policy || null,
      lifecycle_status: lifecycleGate?.status || null,
      lifecycle_wait_status: lifecycleGate?.wait_status || null,
      lifecycle_scheduler_consumed: lifecycleGate?.scheduler_consumed === true,
      lifecycle_wait_ref: lifecycleGate?.wait_ref || null,
      gate_completion_is_pass: completionEvidence?.isPass === true,
      gate_completion_source: completionEvidence?.source || null,
    },
    diagnostics: { gate_status: { exists: gateStatus.exists === true, status: gateStatus?.data?.status || null, is_pass: gateStatus.isPass === true, continued: gateStatus?.data?.continued === true, timeout_policy: gateStatus?.data?.timeout_policy || null } },
  };
}

function buildGateRunInput(config, progress, gateId, gate, opts = {}, deps = getGateRunnerDeps(config)) {
  const runId = getRunId(config);
  const stageId = typeof opts?.stageId === 'string' && opts.stageId.trim() ? opts.stageId.trim() : null;
  const gateType = typeof gate?.type === 'string' && gate.type.trim() ? gate.type.trim() : null;
  const attempt = Number(opts?.attempt);
  if (!runId) throw new Error('gate run input requires explicit runId');
  if (!stageId) throw new Error('gate run input requires explicit stageId');
  if (!gateType) throw new Error('gate run input requires explicit gateType');
  if (!Number.isFinite(attempt) || attempt < 1) throw new Error('gate run input requires explicit positive attempt');
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
      gateType,
      attempt,
      stageId,
    },
    gate: {
      config: { ...(gate || {}) },
      ...(instructionsRef ? { instructionsRef } : {}),
    },
    artifacts,
    priorResults: artifacts.filter((artifact) => artifact.type === 'gate_output'),
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
  const stageId = typeof opts?.stageId === 'string' && opts.stageId.trim() ? opts.stageId.trim() : null;
  if (!stageId) throw new Error('gate plugin invocation requires explicit stageId');
  return buildStagePluginInvocation(stageId, {
    gateId,
    novaPromptProvided: Boolean(opts?.novaPrompt),
  });
}

function requireGateControlAdapter(gateTypeEntry) {
  const gateType = gateTypeEntry?.gateType || 'unknown';
  const moduleId = gateTypeEntry?.moduleId || gateTypeEntry?.owner?.manifest?.moduleId || 'unknown';
  const adapter = gateTypeEntry?.owner?.implementation?.gateControl || null;

  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`Registered gate type '${gateType}' owner '${moduleId}' is missing a gateControl adapter.`);
  }
  if (!['standard', 'remediable', 'waitable'].includes(adapter.mode)) {
    throw new Error(`Registered gate type '${gateType}' owner '${moduleId}' has invalid gateControl mode '${adapter.mode}'.`);
  }
  if (typeof adapter.coerce !== 'function') {
    throw new Error(`Registered gate type '${gateType}' owner '${moduleId}' does not implement gateControl.coerce.`);
  }
  if (adapter.mode === 'remediable' && typeof adapter.createRemediationController !== 'function') {
    throw new Error(`Registered remediable gate type '${gateType}' owner '${moduleId}' does not implement gateControl.createRemediationController.`);
  }
  if (adapter.mode === 'waitable' && typeof adapter.createWaitController !== 'function') {
    throw new Error(`Registered waitable gate type '${gateType}' owner '${moduleId}' does not implement gateControl.createWaitController.`);
  }

  return adapter;
}

function normalizeGateControlResultForAdapter(config, gateId, gate, rawResult, adapter, opts = {}) {
  const gateType = gate?.type || opts?.gateType || 'unknown';
  const stageId = typeof opts?.stageId === 'string' && opts.stageId.trim() ? opts.stageId.trim() : null;
  if (!stageId) throw new Error('gate control normalization requires explicit stageId');
  const label = adapter?.label || gateType;
  const coerce = (result) => adapter.coerce(config, gateId, gate, result, opts);

  if (adapter.mode === 'remediable') {
    return normalizeRemediableTypedGateControlResult(rawResult, {
      producerType: gateType,
      label,
      stageId,
      moduleId: opts?.moduleId || null,
      input: opts?.input || null,
      invocation: opts?.pluginInvocation || null,
      coerce,
    });
  }

  return normalizeTypedGateControlResult(rawResult, {
    producerType: gateType,
    label,
    allowedNextActions: adapter.allowedNextActions || [],
    stageId,
    moduleId: opts?.moduleId || null,
    input: opts?.input || null,
    invocation: opts?.pluginInvocation || null,
    coerce,
    extraValidate: (controlResult) => {
      if (typeof adapter.extraValidate !== 'function') return [];
      return adapter.extraValidate(controlResult, { config, gateId, gate, opts }) || [];
    },
  });
}

async function runScheduledStandardGate({
  config,
  progress,
  gateId,
  gate,
  opts = {},
  stageId,
  gateInput,
  pluginInvocation,
  adapter,
}) {
  const { rawResult, record } = await runScheduledGateInvocation({
    config,
    progress,
    gateId,
    gate,
    opts,
    stageId,
    gateInput,
    pluginInvocation,
  });

  const controlResult = normalizeGateControlResultForAdapter(config, gateId, gate, rawResult, adapter, { ...opts, input: gateInput, stageId, moduleId: record.manifest.moduleId, pluginInvocation });
  return buildGateStepResultFromControl(config, gateId, gate, controlResult);
}

async function runScheduledRegistryGate(config, progress, gateId, gate, gateTypeEntry, opts = {}, ctx = null) {
  ensureScheduledGatePluginLogDirs(config);
  const adapter = requireGateControlAdapter(gateTypeEntry);
  const stageId = gateTypeEntry.stageId;
  const attempt = Number(opts?.attempt ?? 1);
  const gateInput = buildGateRunInput(config, progress, gateId, gate, { ...opts, stageId, attempt });
  const pluginInvocation = buildGatePluginInvocation(gateId, gate, { ...opts, stageId, attempt });

  if (adapter.mode === 'remediable') {
    const gateStartedAt = Date.now();
    const scheduledResult = await runScheduledRemediableGate({
      config,
      progress,
      gateId,
      gate,
      opts,
      stageId,
      gateInput,
      pluginInvocation,
      normalizeControlResult: (rawResult, normalizeOpts) =>
        normalizeGateControlResultForAdapter(config, gateId, gate, rawResult, adapter, { ...opts, ...normalizeOpts, stageId }),
      createRemediationController: (controlResult) => adapter.createRemediationController({
        config,
        progress,
        gateId,
        gate,
        opts,
        gateStartedAt,
        controlResult,
      }),
    });
    return buildGateStepResultFromControl(config, gateId, gate, scheduledResult.controlResult);
  }

  if (adapter.mode === 'waitable') {
    const scheduledResult = await runScheduledWaitableGate({
      config,
      progress,
      gateId,
      gate,
      opts,
      stageId,
      gateInput,
      pluginInvocation,
      normalizeControlResult: (rawResult, normalizeOpts) =>
        normalizeGateControlResultForAdapter(config, gateId, gate, rawResult, adapter, { ...opts, ...normalizeOpts, stageId }),
      createWaitController: (controlResult) => adapter.createWaitController({
        config,
        progress,
        gateId,
        gate,
        opts,
        controlResult,
      }),
    });
    if (scheduledResult.error) {
      return buildGateExecutionErrorControl(config, ctx || getActiveContext() || { config }, gateId, gate, adapter?.label, scheduledResult.error, {
        emitStarted: scheduledResult.stageStarted !== true,
      });
    }
    return buildGateStepResultFromControl(config, gateId, gate, scheduledResult.controlResult);
  }

  return runScheduledStandardGate({
    config,
    progress,
    gateId,
    gate,
    opts,
    stageId,
    gateInput,
    pluginInvocation,
    adapter,
  });
}

export async function runGate(config, progress, gateId, opts = {}) {
  const { novaPrompt } = opts;
  const gates = progress?.gates || null;
  const gate = gates?.[gateId];
  const ctx = getActiveContext() || { config };

  if (!gates) {
    const reason = `Gate registry missing in progress.json while dispatching '${gateId}'`;
    log('ERROR', reason);
    return buildGateRuntimeErrorControl(config, ctx, gateId, { title: gateId, gate_type: null }, {
      reason,
      titlePrefix: 'Gate Dispatch Failed',
      emitStarted: true,
    });
  }

  if (!gate) {
    const reason = `Gate '${gateId}' not found in progress.json`;
    log('ERROR', reason);
    return buildGateRuntimeErrorControl(config, ctx, gateId, { title: gateId, gate_type: null }, {
      reason,
      titlePrefix: 'Gate Dispatch Failed',
      emitStarted: true,
    });
  }

  let gateTypeEntry;
  try {
    gateTypeEntry = requireGateTypeOwner(config, gate.type);
  } catch (error) {
    const missingOwner = /No registered gate type owner found/.test(error?.message || '');
    const reason = missingOwner
      ? `Unknown gate type '${gate.type}' for gate '${gateId}'`
      : `Gate type '${gate.type}' registry resolution failed: ${error.message}`;
    log('ERROR', reason);
    return buildGateRuntimeErrorControl(config, ctx, gateId, { title: gate.title || gateId, gate_type: gate.type || null }, {
      reason,
      titlePrefix: 'Gate Dispatch Failed',
      emitStarted: true,
    });
  }

  try {
    return await runScheduledRegistryGate(config, progress, gateId, gate, gateTypeEntry, { ...opts, novaPrompt }, ctx);
  } catch (error) {
    return buildGateExecutionErrorControl(config, ctx, gateId, gate, gateTypeEntry?.owner?.implementation?.gateControl?.label, error);
  }
}

export default runGate;
