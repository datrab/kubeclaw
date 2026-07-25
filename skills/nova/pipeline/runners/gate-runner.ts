import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/gate-runner.ts — Gate dispatch layer
//
// Gate type ownership and execution stage resolution are both resolved through
// the startup-frozen plugin registry. This layer remains core-owned: it builds
// the invocation envelope, validates generic gate control results, and maps
// plugin output into canonical pipeline step results for CLI/Nova/Discord output.

import { log } from '../core/logger.ts';
import { selectDeps } from '../core/deps.ts';
import { getRunId } from '../core/runtime.ts';
import { requireGateTypeOwner } from '../core/registry-access.ts';
import { onGateFail, onGatePass } from '../services/telemetry.ts';
import { applyGateCompletion, readGateOutput, getLifecycleGateState, readGateCompletionEvidence } from '../services/status-store.ts';
import { runScheduledRemediableGate } from './remediable-gate-engine.ts';
import { runScheduledWaitableGate } from './waitable-gate-engine.ts';
import { ensureScheduledGatePluginLogDirs, runScheduledGateInvocation } from './scheduled-gate-invocation.ts';
import {
  buildStagePluginInvocation,
} from './stage-envelope-primitives.ts';
import { buildGateRunInput } from './gate-run-input.ts';
import { normalizeGateControlResultForAdapter, requireGateControlAdapter } from './gate-control-adapter.ts';
import {
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
  buildPipelineStepResultFromControlResult,
} from '../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';
import { activeGateRunnerContext, buildGateExecutionErrorControl, buildGateRuntimeErrorControl } from './gate-runtime-error.ts';

type AnyRecord = Record<string, any>;

function objectRecord(value: any): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requirePositiveAttempt(value: any, label: any): number {
  const attempt = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(attempt)), () => (attempt < 1))) throw new Error(`${label}: required positive attempt`);
  return attempt;
}


function getGateRunnerDeps(config: any, overrides: any = {}) {
  return {
    readGateOutput,
    getLifecycleGateState,
    readGateCompletionEvidence,
    ...selectDeps(overrides, 'gateRunner'),
  };
}

function buildGateStepCorrelation(config: any, gateId: any, gateOrIdentity: any = {}, extra: any = {}) {
  return {
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null)),
    gate_id: gateId,
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (gateOrIdentity?.type), () => (gateOrIdentity?.gate_type))), () => (gateOrIdentity?.gateType))), () => (null)),
    ...extra,
  };
}


function terminalActionForGateOutcomeClass(outcomeClass: any) {
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

function gateCompletionStatusForControlResult(controlResult: any) {
  if (controlResult?.nextAction === 'pass') return 'PASS';
  if (controlResult?.nextAction !== 'block') return null;
  const outcomeClass = controlResult?.diagnostics?.typed?.gate?.outcomeClass;
  if (outcomeClass === PIPELINE_STEP_OUTCOMES.BLOCKED) return 'BLOCKED';
  if (outcomeClass === PIPELINE_STEP_OUTCOMES.ERROR || outcomeClass === PIPELINE_STEP_OUTCOMES.RATE_LIMITED) return 'ERROR';
  return 'FAIL';
}

function gateCompletionAuthorityForControlResult(controlResult: any, gate: any) {
  const metadata = objectRecord(controlResult?.diagnostics?.metadata);
  if (metadata.output_file) return { kind: 'artifact', path: metadata.output_file };
  if (metadata.path) return { kind: 'artifact', path: metadata.path };
  if (metadata.approval_id) return { kind: 'approval', approval_id: metadata.approval_id };
  if (gate?.output_file) return { kind: 'artifact', path: gate.output_file };
  return { kind: 'lifecycle' };
}

function gateControlMetadata(controlResult: any) {
  return objectRecord(controlResult?.diagnostics?.metadata);
}

function consistentControlValue(label: any, primary: any, secondary: any, absent: any = null) {
  const primaryPresent = primary !== undefined && primary !== null && primary !== '';
  const secondaryPresent = secondary !== undefined && secondary !== null && secondary !== '';
  if (primaryPresent && secondaryPresent && primary !== secondary) {
    throw new Error(`${label} conflicts between gate context and typed control result`);
  }
  if (primaryPresent) return primary;
  if (secondaryPresent) return secondary;
  return absent;
}

function applyAcceptedGateControl(config: any, gateId: any, gate: any, controlResult: any) {
  const status = gateCompletionStatusForControlResult(controlResult);
  if (!status) return null;
  const metadata = gateControlMetadata(controlResult);
  const typedGate = objectRecord(controlResult?.diagnostics?.typed?.gate);
  const metrics = objectRecord(typedGate.metrics);
  const gateType = consistentControlValue('gate_type', gate?.type, controlResult?.producerType, 'gate');
  const attempt = consistentControlValue('attempt', metadata.attempt, metrics.attempt, 1);
  return applyGateCompletion(config, gateId, gate, buildAcceptedGateCompletion({ gate, controlResult, status, metadata, typedGate, metrics, gateType, attempt }));
}

function buildAcceptedGateCompletion({ gate, controlResult, status, metadata, typedGate, gateType, attempt }: any) {
  return {
    phase: gateType,
    attempt,
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
      gate_type: gateType,
      issue_type: controlResult?.issueType || null,
      outcome_class: typedGate.outcomeClass || null,
      findings: Array.isArray(controlResult?.diagnostics?.findings) ? controlResult.diagnostics.findings : [],
    },
  };
}

function emitAcceptedGateControl(ctx: any, gateId: any, gate: any, controlResult: any) {
  const status = gateCompletionStatusForControlResult(controlResult);
  if (!status) return null;
  const metadata = gateControlMetadata(controlResult);
  const typedGate = objectRecord(controlResult?.diagnostics?.typed?.gate);
  const metrics = objectRecord(typedGate.metrics);
  const gateType = consistentControlValue('gate_type', gate?.type, controlResult?.producerType);
  const attempt = consistentControlValue('attempt', metadata.attempt, metrics.attempt);
  const fixCycle = consistentControlValue('fix_cycle', metrics.fix_cycles, metadata.fix_cycles);
  const payload = buildAcceptedGateTelemetry({ controlResult, metadata, typedGate, gateType, attempt, fixCycle });
  if (status === 'PASS') return onGatePass(ctx, gateId, payload);
  return onGateFail(ctx, gateId, payload);
}

function buildAcceptedGateTelemetry({ controlResult, metadata, typedGate, gateType, attempt, fixCycle }: any) {
  return {
    gate_type: gateType,
    attempt,
    issues_count: typedGate.metrics?.issues_count ?? null,
    blockers_count: typedGate.metrics?.blockers_count ?? null,
    fix_cycle: fixCycle,
    duration_seconds: typedGate.metrics?.duration_seconds ?? null,
    reason: controlResult?.diagnostics?.summary || null,
    dispatch_id: metadata.dispatch_id || null,
    gateway_label: metadata.gateway_label || null,
    session_key: metadata.session_key || null,
  };
}

export function buildGateStepResultFromControl(config: any, gateId: any, gate: any, controlResult: any, extra: any = {}) {
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

function buildGatePluginInvocation(gateId: any, gate: any, opts: any = {}) {
  const stageId = typeof opts?.stageId === 'string' && opts.stageId.trim() ? opts.stageId.trim() : null;
  if (!stageId) throw new Error('gate plugin invocation requires explicit stageId');
  return buildStagePluginInvocation(stageId, {
    gateId,
    novaPromptProvided: Boolean(opts?.novaPrompt),
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
}: any) {
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

async function runScheduledRegistryGate(config: any, progress: any, gateId: any, gate: any, gateTypeEntry: any, opts: any = {}, ctx: any = null) {
  ensureScheduledGatePluginLogDirs(config);
  const adapter = requireGateControlAdapter(gateTypeEntry);
  const stageId = gateTypeEntry.stageId;
  const attempt = requirePositiveAttempt(opts?.attempt, 'gate attempt');
  const gateInput = buildGateRunInput(config, progress, gateId, gate, { ...opts, stageId, attempt }, getGateRunnerDeps(config));
  const pluginInvocation = buildGatePluginInvocation(gateId, gate, { ...opts, stageId, attempt });

  if (adapter.mode === 'remediable') {
    return runRemediableRegistryGate({ config, progress, gateId, gate, opts, stageId, gateInput, pluginInvocation, adapter });
  }

  if (adapter.mode === 'waitable') {
    return runWaitableRegistryGate({ config, progress, gateId, gate, opts, stageId, gateInput, pluginInvocation, adapter, ctx });
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

async function runRemediableRegistryGate(input: AnyRecord) {
  const { config, progress, gateId, gate, opts, stageId, adapter } = input;
  const gateStartedAt = Date.now();
  const scheduled = await runScheduledRemediableGate({ ...input,
    normalizeControlResult: (rawResult: any, normalizeOpts: any) => normalizeGateControlResultForAdapter(config, gateId, gate, rawResult, adapter, { ...opts, ...normalizeOpts, stageId }),
    createRemediationController: (controlResult: any) => adapter.createRemediationController({ config, progress, gateId, gate, opts, gateStartedAt, controlResult }),
  });
  return buildGateStepResultFromControl(config, gateId, gate, scheduled.controlResult);
}

async function runWaitableRegistryGate(input: AnyRecord) {
  const { config, gateId, gate, opts, stageId, adapter } = input;
  const scheduled = await runScheduledWaitableGate({ ...input,
    normalizeControlResult: (rawResult: any, normalizeOpts: any) => normalizeGateControlResultForAdapter(config, gateId, gate, rawResult, adapter, { ...opts, ...normalizeOpts, stageId }),
    createWaitController: (controlResult: any) => adapter.createWaitController({ config, progress: input.progress, gateId, gate, opts, controlResult }),
  });
  if (scheduled.error) {
    const ctx = input.ctx || activeGateRunnerContext(config);
    return buildGateExecutionErrorControl(config, ctx, gateId, gate, adapter?.label, scheduled.error, { emitStarted: scheduled.stageStarted !== true });
  }
  return buildGateStepResultFromControl(config, gateId, gate, scheduled.controlResult);
}

export async function runGate(config: any, progress: any, gateId: any, opts: any = {}) {
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
  } catch (error: any) {
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
  } catch (error: any) {
    return buildGateExecutionErrorControl(config, ctx, gateId, gate, gateTypeEntry?.owner?.implementation?.gateControl?.label, error);
  }
}

export default runGate;
