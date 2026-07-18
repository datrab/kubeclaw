import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
import { onGateFail, onGatePass, onGateStarted } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { applyGateCompletion, readGateOutput, getLifecycleGateState, readGateCompletionEvidence } from '../services/status-store.ts';
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
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';

type AnyRecord = Record<string, any>;

function objectRecord(value): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requirePositiveAttempt(value, label): number {
  const attempt = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(attempt)), () => (attempt < 1))) throw new Error(`${label}: required positive attempt`);
  return attempt;
}

function formatFromPath(filePath, label) {
  const format = path.extname(filePath).slice(1);
  if (!format) throw new Error(`${label}: file extension required for artifact format`);
  return format;
}

function getGateRunnerDeps(config, overrides = {}) {
  return {
    readGateOutput,
    getLifecycleGateState,
    readGateCompletionEvidence,
    ...selectDeps(overrides, 'gateRunner'),
  };
}

function buildGateStepCorrelation(config, gateId, gateOrIdentity = {}, extra = {}) {
  return {
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null)),
    gate_id: gateId,
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (gateOrIdentity?.type), () => (gateOrIdentity?.gate_type))), () => (gateOrIdentity?.gateType))), () => (null)),
    ...extra,
  };
}

function gateRuntimeTitle(gateOrIdentity = {}, gateId) {
  if (typeof gateOrIdentity?.title === 'string' && gateOrIdentity.title.trim()) return gateOrIdentity.title.trim();
  if (typeof gateId === 'string' && gateId.trim()) return gateId.trim();
  throw new Error('Gate runtime error control requires gate title or gate id');
}

function isTimeoutError(error) {
  const text = [
    error?.code,
    error?.name,
    error?.message,
  ].filter(Boolean).join(' ');
  return /\btimeout\b|timed? out/i.test(text);
}

function activeGateRunnerContext(config) {
  const ctx = getActiveContext();
  if (ctx) return ctx;
  return { config };
}

function terminalActionForGateOutcomeClass(outcomeClass) {
  switch (outcomeClass) {
    case PIPELINE_STEP_OUTCOMES.PASSED:
      return PIPELINE_TERMINAL_ACTIONS.NONE;
    case PIPELINE_STEP_OUTCOMES.NEEDS_NOVA:
    case PIPELINE_STEP_OUTCOMES.TIMEOUT:
      return PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF;
    case PIPELINE_STEP_OUTCOMES.BLOCKED:
      return PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR;
    case PIPELINE_STEP_OUTCOMES.ERROR:
      return PIPELINE_TERMINAL_ACTIONS.STOP;
    case PIPELINE_STEP_OUTCOMES.RATE_LIMITED:
      return PIPELINE_TERMINAL_ACTIONS.RETRY_LATER;
    default:
      return null;
  }
}

function gateCompletionStatusForControlResult(controlResult) {
  if (controlResult?.nextAction === 'pass') return 'PASS';
  if (controlResult?.nextAction !== 'block') return null;
  const outcomeClass = controlResult?.diagnostics?.typed?.gate?.outcomeClass;
  if (outcomeClass === PIPELINE_STEP_OUTCOMES.BLOCKED) return 'BLOCKED';
  if (outcomeClass === PIPELINE_STEP_OUTCOMES.ERROR || outcomeClass === PIPELINE_STEP_OUTCOMES.RATE_LIMITED) return 'ERROR';
  return 'FAIL';
}

function gateCompletionAuthorityForControlResult(controlResult, gate) {
  const metadata = objectRecord(controlResult?.diagnostics?.metadata);
  if (metadata.output_file) return { kind: 'artifact', path: metadata.output_file };
  if (metadata.path) return { kind: 'artifact', path: metadata.path };
  if (metadata.approval_id) return { kind: 'approval', approval_id: metadata.approval_id };
  if (gate?.output_file) return { kind: 'artifact', path: gate.output_file };
  return { kind: 'lifecycle' };
}

function gateControlMetadata(controlResult) {
  return objectRecord(controlResult?.diagnostics?.metadata);
}

function applyAcceptedGateControl(config, gateId, gate, controlResult) {
  const status = gateCompletionStatusForControlResult(controlResult);
  if (!status) return null;
  const metadata = gateControlMetadata(controlResult);
  const typedGate = objectRecord(controlResult?.diagnostics?.typed?.gate);
  return applyGateCompletion(config, gateId, gate, {
    phase: gate?.type || controlResult?.producerType || 'gate',
    attempt: metadata.attempt || typedGate.metrics?.attempt || 1,
    status,
    authority: gateCompletionAuthorityForControlResult(controlResult, gate),
    reason_code: typedGate.outcomeClass || null,
    summary: controlResult?.diagnostics?.summary || null,
    observed: {
      session_key: metadata.session_key || null,
      dispatch_id: metadata.dispatch_id || null,
      gateway_label: metadata.gateway_label || null,
    },
    metadata: {
      ...metadata,
      gate_type: gate?.type || controlResult?.producerType || null,
      issue_type: controlResult?.issueType || null,
      outcome_class: typedGate.outcomeClass || null,
      findings: Array.isArray(controlResult?.diagnostics?.findings) ? controlResult.diagnostics.findings : [],
    },
  });
}

function emitAcceptedGateControl(ctx, gateId, gate, controlResult) {
  const status = gateCompletionStatusForControlResult(controlResult);
  if (!status) return null;
  const metadata = gateControlMetadata(controlResult);
  const typedGate = objectRecord(controlResult?.diagnostics?.typed?.gate);
  const attempt = metadata.attempt || typedGate.metrics?.attempt || null;
  const payload = {
    gate_type: gate?.type || controlResult?.producerType || null,
    attempt,
    issues_count: typedGate.metrics?.issues_count ?? null,
    blockers_count: typedGate.metrics?.blockers_count ?? null,
    fix_cycle: typedGate.metrics?.fix_cycles ?? metadata.fix_cycles ?? null,
    duration_seconds: typedGate.metrics?.duration_seconds ?? null,
    reason: controlResult?.diagnostics?.summary || null,
    dispatch_id: metadata.dispatch_id || null,
    gateway_label: metadata.gateway_label || null,
    session_key: metadata.session_key || null,
  };
  if (status === 'PASS') return onGatePass(ctx, gateId, payload);
  return onGateFail(ctx, gateId, payload);
}

export function buildGateStepResultFromControl(config, gateId, gate, controlResult, extra = {}) {
  const outcome = controlResult?.diagnostics?.typed?.gate?.outcomeClass;
  applyAcceptedGateControl(config, gateId, gate, controlResult);
  emitAcceptedGateControl(activeGateRunnerContext(config), gateId, gate, controlResult);
  return buildPipelineStepResultFromControlResult(controlResult, {
    stepType: PIPELINE_STEP_TYPES.GATE,
    stepId: gateId,
    outcome,
    correlation: buildGateStepCorrelation(config, gateId, gate, objectRecord(extra.correlation)),
    remediation: selectTruthyValue(() => (controlResult?.diagnostics?.typed?.remediation), () => (null)),
    wait: selectTruthyValue(() => (controlResult?.diagnostics?.typed?.wait), () => (null)),
    rateLimit: selectTruthyValue(() => (controlResult?.diagnostics?.typed?.rateLimit), () => (null)),
    terminalAction: terminalActionForGateOutcomeClass(outcome),
    terminalScope: PIPELINE_TERMINAL_SCOPES.GATE,
    terminalReasonCode: outcome,
    terminalSource: 'gate_control_result',
  });
}

async function buildGateRuntimeErrorControl(config, ctx, gateId, gateOrIdentity = {}, {
  reason,
  diagnostics = {},
  titlePrefix = 'Gate Execution Failed',
  emitStarted = false,
  reviewers = null,
}: AnyRecord = {}) {
  const gateType = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (gateOrIdentity?.type), () => (gateOrIdentity?.gate_type))), () => (gateOrIdentity?.gateType))), () => (null));
  const title = gateRuntimeTitle(gateOrIdentity, gateId);
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
          run_id: selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => ('missing_run_id')),
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
    outcome: diagnostics?.timed_out === true ? PIPELINE_STEP_OUTCOMES.TIMEOUT : PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'environment',
    reason,
    diagnostics,
    correlation: buildGateStepCorrelation(config, gateId, gateOrIdentity),
    terminalAction: diagnostics?.timed_out === true ? PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF : PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: PIPELINE_TERMINAL_SCOPES.GATE,
    terminalReasonCode: diagnostics?.timed_out === true ? 'timeout' : (diagnostics?.contract_invalid === true ? 'gate_control_result_invalid' : 'gate_execution_error'),
    terminalSource: 'gate_runner',
    terminalMetadata: diagnostics,
  });
}

function buildGateExecutionErrorControl(config, ctx, gateId, gate, label, error, { emitStarted = true } = {}) {
  const gateLabel = selectDefinedValue(() => (selectDefinedValue(() => (label), () => (gate?.type))), () => ('Gate'));
  const reason = `${gateLabel} gate execution failed: ${error.message}`;
  log('ERROR', reason);
  return buildGateRuntimeErrorControl(config, ctx, gateId, gate, {
    reason,
    diagnostics: {
      ...(error?.diagnostics ? { contract_invalid: true, contract_diagnostic: error.diagnostics } : {}),
      ...(isTimeoutError(error) ? { timed_out: true } : {}),
    },
    emitStarted,
    reviewers: Array.isArray(gate?.reviewers) ? gate.reviewers : null,
  });
}

function buildGateArtifactRefs(config, gateId, gate) {
  const refs = [];
  if (gate?.output_file) {
    const outputPath = gateOutputPath(config, gate);
    refs.push({ type: 'gate_output', role: 'output', format: formatFromPath(outputPath, 'gate.output_file'), path: outputPath });
  }

  refs.push({ type: 'gate_status', role: 'diagnostic', format: 'json', path: gateStatusPath(config, gateId) });

  refs.push({ type: 'gate_active_session', role: 'recovery', format: 'json', path: gateActiveSessionPath(config, gateId) });

  if (gate?.instructions_file) {
    const instructionsPath = gateInstructionsPath(config, gate);
    refs.push({ type: 'gate_instructions', role: 'input', format: formatFromPath(instructionsPath, 'gate.instructions_file'), path: instructionsPath });
  }

  return collectExistingArtifactRefs(refs);
}

function buildGateStateSnapshot(config, progress, gateId, gate, deps = getGateRunnerDeps(config)) {
  const gateOutput = deps.readGateOutput(config, gate);
  const lifecycleGate = deps.getLifecycleGateState(config, gateId);
  const completionEvidence = deps.readGateCompletionEvidence(config, gateId, gate);

  return {
    pipeline: {
      project: selectTruthyValue(() => (config?.project), () => (null)),
      run_id: getRunId(config),
    },
    gate: {
      gate_id: gateId,
      gate_type: selectTruthyValue(() => (gate?.type), () => (null)),
      title: selectTruthyValue(() => (gate?.title), () => (null)),
      output_exists: gateOutput.exists === true,
      output_is_pass: gateOutput.isPass === true,
      output_status: selectTruthyValue(() => (gateOutput?.data?.status), () => (null)),
      timeout_policy: selectTruthyValue(() => (lifecycleGate?.timeout_policy), () => (null)),
      lifecycle_status: selectTruthyValue(() => (lifecycleGate?.status), () => (null)),
      lifecycle_wait_status: selectTruthyValue(() => (lifecycleGate?.wait_status), () => (null)),
      lifecycle_scheduler_consumed: lifecycleGate?.scheduler_consumed === true,
      lifecycle_wait_ref: selectTruthyValue(() => (lifecycleGate?.wait_ref), () => (null)),
      gate_completion_is_pass: completionEvidence?.isPass === true,
      gate_completion_source: selectTruthyValue(() => (completionEvidence?.source), () => (null)),
    },
    diagnostics: {},
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
  if (selectTruthyValue(() => (!Number.isFinite(attempt)), () => (attempt < 1))) throw new Error('gate run input requires explicit positive attempt');
  const artifacts = buildGateArtifactRefs(config, gateId, gate);
  const instructionsRef = selectTruthyValue(() => (artifacts.find((artifact) => artifact.type === 'gate_instructions')), () => (null));
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
      config: { ...objectRecord(gate) },
      ...(instructionsRef ? { instructionsRef } : {}),
    },
    artifacts,
    priorResults: artifacts.filter((artifact) => artifact.type === 'gate_output'),
    stateSnapshot,
    executionContext: {
      novaPrompt: selectTruthyValue(() => (opts?.novaPrompt), () => (null)),
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
  const gateType = selectTruthyValue(() => (gateTypeEntry?.gateType), () => ('missing_gate_type'));
  const moduleId = selectTruthyValue(() => (selectTruthyValue(() => (gateTypeEntry?.moduleId), () => (gateTypeEntry?.owner?.manifest?.moduleId))), () => ('missing_module_id'));
  const adapter = selectTruthyValue(() => (gateTypeEntry?.owner?.implementation?.gateControl), () => (null));

  if (selectTruthyValue(() => (!adapter), () => (typeof adapter !== 'object'))) {
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
  if (adapter.mode !== 'remediable' && (!Array.isArray(adapter.allowedNextActions) || adapter.allowedNextActions.length === 0)) {
    throw new Error(`Registered ${adapter.mode} gate type '${gateType}' owner '${moduleId}' must declare gateControl.allowedNextActions.`);
  }

  return adapter;
}

function normalizeGateControlResultForAdapter(config, gateId, gate, rawResult, adapter, opts = {}) {
  const gateType = selectTruthyValue(() => (selectTruthyValue(() => (gate?.type), () => (opts?.gateType))), () => ('missing_gate_type'));
  const stageId = typeof opts?.stageId === 'string' && opts.stageId.trim() ? opts.stageId.trim() : null;
  if (!stageId) throw new Error('gate control normalization requires explicit stageId');
  const label = selectTruthyValue(() => (adapter?.label), () => (gateType));
  const coerce = (result) => adapter.coerce(config, gateId, gate, result, opts);

  if (adapter.mode === 'remediable') {
    return normalizeRemediableTypedGateControlResult(rawResult, {
      producerType: gateType,
      label,
      stageId,
      moduleId: selectTruthyValue(() => (opts?.moduleId), () => (null)),
      input: selectTruthyValue(() => (opts?.input), () => (null)),
      invocation: selectTruthyValue(() => (opts?.pluginInvocation), () => (null)),
      coerce,
    });
  }

  return normalizeTypedGateControlResult(rawResult, {
    producerType: gateType,
    label,
    allowedNextActions: selectTruthyValue(() => (adapter.allowedNextActions), () => ([])),
    stageId,
    moduleId: selectTruthyValue(() => (opts?.moduleId), () => (null)),
    input: selectTruthyValue(() => (opts?.input), () => (null)),
    invocation: selectTruthyValue(() => (opts?.pluginInvocation), () => (null)),
    coerce,
    extraValidate: (controlResult) => {
      if (typeof adapter.extraValidate !== 'function') return [];
      return selectTruthyValue(() => (adapter.extraValidate(controlResult, { config, gateId, gate, opts })), () => ([]));
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
  const attempt = requirePositiveAttempt(opts?.attempt, 'gate attempt');
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
      return buildGateExecutionErrorControl(config, selectTruthyValue(() => (ctx), () => (activeGateRunnerContext(config))), gateId, gate, adapter?.label, scheduledResult.error, {
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
  const gates = selectTruthyValue(() => (progress?.gates), () => (null));
  const gate = gates?.[gateId];
  const ctx = activeGateRunnerContext(config);

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
    const missingOwner = /No registered gate type owner found/.test(selectDefinedValue(() => (error?.message), () => ('')));
    const reason = missingOwner
      ? `Unknown gate type '${gate.type}' for gate '${gateId}'`
      : `Gate type '${gate.type}' registry resolution failed: ${error.message}`;
    log('ERROR', reason);
    return buildGateRuntimeErrorControl(config, ctx, gateId, { title: selectTruthyValue(() => (gate.title), () => (gateId)), gate_type: selectTruthyValue(() => (gate.type), () => (null)) }, {
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
