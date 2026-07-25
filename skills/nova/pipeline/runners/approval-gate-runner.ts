import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/approval-gate-runner.ts — Human-in-the-loop approval gate
//
// Pauses pipeline execution at defined decision points until an operator
// explicitly approves, rejects, or the configured timeout elapses.
//
// V1 interaction model:
//   Pipeline posts a structured Discord embed via existing webhook.
//   Operator responds via OpenClaw/Nova with explicit commands:
//     APPROVE gate:<id>
//     REJECT gate:<id> reason: <reason>
//   Nova writes operator decision evidence to the gate-status file.
//   Pipeline resumes after that evidence is synced into approval wait lifecycle
//   state — Discord is the UI, not the source of truth.
//
// Operator evidence:    .swarm/<gate-id>-gate-status.json
// Lifecycle authority:  approval wait lifecycle/read-model state
// Audit artifacts:      .swarm/logs/gates/<gate-id>/
//   approval-request.json       — normalized request payload
//   approval-request.md         — operator-facing summary
//   approval-transitions.jsonl  — append-only transition log
//   approval-decision.json      — final resolved decision record

import { selectDeps } from '../core/deps.ts';
import { log } from '../core/logger.ts';
import { getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
import { syncApprovalWaitState } from '../services/status-store.ts';
import { recordApprovalGateOutcome } from '../services/governance-context.ts';
import { onApprovalRequested, onApprovalResolved, onGateStarted, onGatePass, onGateFail } from '../services/telemetry.ts';
import { GATE_CONTROL_ACTIONS } from '../services/contracts/gate-control-result.ts';
import {
  APPROVAL_STATUS,
  APPROVAL_TIMEOUT_POLICY,
  APPROVAL_TERMINAL_OR_WAIT_STATUSES,
  buildApprovalIdentity,
  isApprovalTimeoutContinue,
  normalizeApprovalGateState,
  normalizeApprovalTimeoutPolicy,
  resolveApprovalTimeoutPolicyFromGate,
  resolveApprovalTimeoutPolicyFromState,
} from './approval-gate-shared.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import {
  buildApprovalGateControlResult,
  buildApprovalGateWaitControlResult,
  coerceApprovalGateControlResult,
  isApprovalGateControlResult,
} from './approval-gate-control.ts';
import {
  DEFAULT_APPROVAL_GATE_DEPS,
  failClosedOnCorruptedApprovalState,
  failClosedOnInvalidApprovalState,
} from './approval-gate-state.ts';
import { createPipelineEventBus, waitForAny } from '../services/pipeline-event-contract.ts';
import { createRedisApprovalSignalEventAdapter } from '../services/approval-signal-event-adapter.ts';
import { buildApprovalEmbed } from './approval-gate-presentation.ts';
import { approvalDecisionVia, approvalGateType, approvalRunId, approvalStatusValue, approvalTextOrReason, emitApprovalGateVerdict, optionalApprovalText, replayResolvedApprovalTelemetry, requireApprovalRunId } from './approval-gate-telemetry.ts';
import { resolveApprovalTimeout } from './approval-gate-timeout.ts';
import { failClosedOnApprovalStateNormalizationError, observedTimedOutState } from './approval-gate-observation.ts';
import { waitForApprovalSignalFlow } from './approval-gate-wait.ts';

export {
  APPROVAL_STATUS,
  APPROVAL_TIMEOUT_POLICY,
  buildApprovalGateControlResult,
  buildApprovalGateWaitControlResult,
  coerceApprovalGateControlResult,
  isApprovalGateControlResult,
  normalizeApprovalTimeoutPolicy,
  buildApprovalEmbed,
};

function eventAdapterNumber(config: any, field: any) {
  const value = Number(config?.event_adapters?.[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`config.event_adapters.${field}: required number in swarm.config.json`);
  }
  return value;
}

function approvalStateIdentityChanged(current: any, previous: any) {
  if (selectTruthyValue(() => (!current), () => (!previous))) return false;
  return [
    'timeout_policy',
    'gate_id',
    'gate_type',
    'project',
  ].some((field: any) => current[field] !== previous[field]);
}

// ─── Deps injection ───────────────────────────────────────────────────────────

function getApprovalGateRunnerDeps(config: any, overrides: any = {}) {
  return { ...DEFAULT_APPROVAL_GATE_DEPS, ...selectDeps(overrides, 'approvalGate') };
}

// ─── Timeout resolution ───────────────────────────────────────────────────────

async function resolveTimeout(config: any, gateId: any, gate: any, state: any, timeoutPolicy: any, deps: any) {
  return resolveApprovalTimeout(config, gateId, gate, state, timeoutPolicy, deps);
}

// ─── Event-driven approval signal wait ────────────────────────────────────────

// ─── Main gate runner ─────────────────────────────────────────────────────────

async function loadApprovalGateState(context: any) {
  const { config, gateId, gate, deps, opts } = context;
  const loaded = deps.loadGateState(config, gateId);
  if (loaded?._corrupted_gate_state) {
    const failure = await failClosedOnCorruptedApprovalState(config, gateId, gate, loaded, deps);
    return { result: buildApprovalGateControlResult(config, gateId, gate, failure, { ...opts, approvalState: loaded }), state: loaded };
  }
  let state;
  try {
    state = normalizeApprovalGateState(loaded, buildApprovalIdentity(config, gateId, gate, loaded));
  } catch (error: unknown) {
    return { result: await failClosedOnApprovalStateNormalizationError(config, gateId, gate, loaded, deps, opts, error), state: loaded };
  }
  if (state && !APPROVAL_TERMINAL_OR_WAIT_STATUSES.has(approvalStatusValue(state))) {
    const failure = await failClosedOnInvalidApprovalState(config, gateId, gate, state, deps);
    return { result: buildApprovalGateControlResult(config, gateId, gate, failure, { ...opts, approvalState: state }), state };
  }
  state = normalizeApprovalGateState(
    syncApprovalWaitState(config, gateId, gate, state),
    buildApprovalIdentity(config, gateId, gate, state),
  ) ?? state;
  if (approvalStateIdentityChanged(state, loaded)) deps.saveGateState(config, gateId, state);
  return { result: null, state };
}

function replayExistingApproval(context: any, state: any, status: any) {
  const { config, gateId, gate, deps, opts } = context;
  const approved = status === APPROVAL_STATUS.APPROVED;
  log(approved ? 'OK' : 'WARN', `Approval gate '${gateId}' already ${status} — restoring resolved telemetry${approved ? '' : ' before halting'}`);
  replayResolvedApprovalTelemetry(config, gateId, gate, state, {
    verdict: approved ? 'PASS' : 'FAIL',
    fallbackReason: approved ? 'Approved by operator' : status === APPROVAL_STATUS.REJECTED ? 'Rejected by operator' : 'Approval cancelled',
  });
  deps.writeApprovalDecision(config, gateId, state);
  const reason = status === APPROVAL_STATUS.REJECTED
    ? `Gate '${gateId}' was previously rejected: ${approvalTextOrReason(state.reason, 'rejection_reason_missing')}`
    : `Gate '${gateId}' cancelled`;
  return buildApprovalGateControlResult(config, gateId, gate, {
    status,
    outcome_class: approved ? 'passed' : 'needs_nova',
    ...(approved ? {} : { reason }),
    gate_id: gateId,
  }, { ...opts, approvalState: state });
}

async function resolveRestartedPendingApproval(context: any, state: any) {
  const { config, gateId, gate, deps, opts } = context;
  const requestedMs = new Date(state.requested_at).getTime();
  const timeoutMinutes = Number(state.timeout_minutes);
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    const failure = await failClosedOnInvalidApprovalState(config, gateId, gate, state, deps);
    return buildApprovalGateControlResult(config, gateId, gate, failure, { ...opts, approvalState: state });
  }
  if (Date.now() < requestedMs + timeoutMinutes * 60 * 1000) {
    log('INFO', `Resuming PENDING_APPROVAL for gate '${gateId}' (no duplicate request posted)`);
    return buildApprovalGateWaitControlResult(config, gateId, gate, state, opts);
  }
  log('WARN', `Approval gate '${gateId}' timeout elapsed during restart — marking TIMED_OUT`);
  const timeoutPolicy = resolveApprovalTimeoutPolicyFromState(state, gateId);
  const timedOut = observedTimedOutState(state, timeoutPolicy, 'Timeout elapsed during pipeline restart');
  syncApprovalWaitState(config, gateId, gate, timedOut);
  deps.saveGateState(config, gateId, timedOut);
  deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason, buildApprovalIdentity(config, gateId, gate, timedOut));
  deps.writeApprovalDecision(config, gateId, timedOut);
  return resolveTimeout(config, gateId, gate, timedOut, timeoutPolicy, deps);
}

async function resolveExistingApprovalState(context: any, state: any) {
  if (!state) return null;
  const status = approvalStatusValue(state);
  if ([APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.CANCELLED].includes(status)) {
    return replayExistingApproval(context, state, status);
  }
  if (status === APPROVAL_STATUS.TIMED_OUT) {
    log('WARN', `Approval gate '${context.gateId}' already TIMED_OUT — re-resolving`);
    return resolveTimeout(context.config, context.gateId, context.gate, state, state.timeout_policy, context.deps);
  }
  if (status === APPROVAL_STATUS.PENDING_APPROVAL) return resolveRestartedPendingApproval(context, state);
  const failure = await failClosedOnInvalidApprovalState(context.config, context.gateId, context.gate, state, context.deps);
  return buildApprovalGateControlResult(context.config, context.gateId, context.gate, failure, { ...context.opts, approvalState: state });
}

async function initializeApprovalGate(context: any) {
  const { config, progress, gateId, gate, timeoutMinutes, timeoutPolicy, deps, opts } = context;
  const state: any = {
    gate_id: gateId, gate_type: approvalGateType(gate, gateId), status: APPROVAL_STATUS.PENDING_APPROVAL,
    run_id: requireApprovalRunId(config, gateId), project: config.project, requested_at: new Date().toISOString(),
    deadline: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(), timeout_minutes: timeoutMinutes,
    timeout_policy: timeoutPolicy, resolved_at: null, decision_by: null, decision_via: null,
    continued: null, reason: null, request_message_ref: null,
  };
  const projected = syncApprovalWaitState(config, gateId, gate, state);
  if (projected?.wait_ref) state.wait_ref = projected.wait_ref;
  deps.saveGateState(config, gateId, state);
  deps.appendTransition(config, gateId, null, APPROVAL_STATUS.PENDING_APPROVAL, 'Gate initialized', buildApprovalIdentity(config, gateId, gate, state));
  deps.writeApprovalRequest(config, gateId, gate, state);
  log('INFO', `Approval gate '${gateId}' → PENDING_APPROVAL (deadline: ${state.deadline})`);
  const embed = buildApprovalEmbed(config, gateId, gate, state, progress);
  await onGateStarted({ config, deps: opts.deps }, gateId, gate, { presentation: { discord: {
    level: 'WARN', title: `⏸️ Approval Required: ${gate.title}`, description: embed.description,
    status: APPROVAL_STATUS.PENDING_APPROVAL, next_action: 'approve_or_reject', action: 'approve_or_reject',
    fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: state.run_id, gate_id: gateId, gate_type: gate.type }, embed.fields),
  } } });
  onApprovalRequested({ config }, gateId, gate.title, timeoutMinutes, timeoutPolicy, { gate_type: state.gate_type });
  return buildApprovalGateWaitControlResult(config, gateId, gate, state, opts);
}

export async function runApprovalGateEvaluation(config: any, progress: any, gateId: any, opts: any = {}) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Approval gate '${gateId}' not found`);
  const timeoutMinutes = gate.timeout_minutes;
  const timeoutPolicy = resolveApprovalTimeoutPolicyFromGate(gate, gateId);
  const deps = getApprovalGateRunnerDeps(config, opts.deps);
  log('STEP', '═'.repeat(52));
  log('STEP', `  APPROVAL GATE: ${gate.title}`);
  log('STEP', `  timeout: ${timeoutMinutes}min | on_timeout: ${gate.on_timeout} | timeout_policy: ${timeoutPolicy}`);
  log('STEP', '═'.repeat(52));
  const context = { config, progress, gateId, gate, timeoutMinutes, timeoutPolicy, deps, opts };
  const loaded = await loadApprovalGateState(context);
  if (loaded.result) return loaded.result;
  const existing = await resolveExistingApprovalState(context, loaded.state);
  if (existing) return existing;
  return initializeApprovalGate(context);
}

export async function waitForApprovalGateSignal(config: any, progress: any, gateId: any, controlResult: any, opts: any = {}) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Approval gate '${gateId}' not found`);

  const deps = getApprovalGateRunnerDeps(config, opts.deps);
  const rawState = deps.loadGateState(config, gateId);
  if (rawState?._corrupted_gate_state) {
    return buildApprovalGateControlResult(config, gateId, gate, await failClosedOnCorruptedApprovalState(config, gateId, gate, rawState, deps), { ...opts, approvalState: rawState });
  }
  let state;
  try {
    state = normalizeApprovalGateState(rawState, buildApprovalIdentity(config, gateId, gate, rawState));
  } catch (error: any) {
    return failClosedOnApprovalStateNormalizationError(config, gateId, gate, rawState, deps, opts, error);
  }
  if (!state) {
    throw new Error(`Approval gate '${gateId}' cannot wait because no persisted approval state exists`);
  }
  const status = approvalStatusValue(state);
  if (!APPROVAL_TERMINAL_OR_WAIT_STATUSES.has(status)) {
    return buildApprovalGateControlResult(config, gateId, gate, await failClosedOnInvalidApprovalState(config, gateId, gate, state, deps), { ...opts, approvalState: state });
  }
  const timeoutPolicy = resolveApprovalTimeoutPolicyFromState(state, gateId);
  return waitForApprovalSignalFlow({ config, gateId, gate, state, progress, timeoutPolicy, deps, opts });
}

export function createApprovalGateWaitController({ config, progress, gateId, controlResult, opts = {} }: any) {
  return {
    waitForSignal: () => waitForApprovalGateSignal(config, progress, gateId, controlResult, opts),
  };
}


export async function runApprovalGateStage(config: any, progress: any, gateId: any, opts: any = {}) {
  return runApprovalGateEvaluation(config, progress, gateId, opts);
}

export function getApprovalGateControlAdapter() {
  return Object.freeze({
    mode: 'waitable',
    label: 'Approval',
    allowedNextActions: [GATE_CONTROL_ACTIONS.PASS, GATE_CONTROL_ACTIONS.WAIT, GATE_CONTROL_ACTIONS.BLOCK],
    coerce: coerceApprovalGateControlResult,
    createWaitController: createApprovalGateWaitController,
    extraValidate: (controlResult: any) => {
      const errors: any[] = [];
      const metadata = selectDefinedValue(() => (selectDefinedValue(() => (controlResult?.diagnostics?.metadata), () => (controlResult?.diagnostics?.typed?.gate?.metadata))), () => ({}));
      const gateRunStatus = selectDefinedValue(() => (controlResult?.diagnostics?.typed?.gate?.gateRunStatus), () => (null));
      if (gateRunStatus === APPROVAL_STATUS.TIMED_OUT && metadata?.continued === true && controlResult.nextAction !== GATE_CONTROL_ACTIONS.PASS) {
        errors.push('timeout-continue must map to nextAction=pass');
      }
      return errors;
    },
  });
}
