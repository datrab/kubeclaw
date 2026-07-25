import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';
import { syncApprovalWaitState } from '../services/status-store.ts';
import { recordApprovalGateOutcome } from '../services/governance-context.ts';
import { onApprovalResolved } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { APPROVAL_STATUS, APPROVAL_TIMEOUT_POLICY, buildApprovalIdentity, normalizeApprovalGateState, resolveApprovalTimeoutPolicyFromState } from './approval-gate-shared.ts';
import { buildApprovalGateControlResult } from './approval-gate-control.ts';
import { failClosedOnCorruptedApprovalState, failClosedOnInvalidApprovalState } from './approval-gate-state.ts';
import { createPipelineEventBus, waitForAny } from '../services/pipeline-event-contract.ts';
import { createRedisApprovalSignalEventAdapter } from '../services/approval-signal-event-adapter.ts';
import { approvalDecisionVia, approvalGateType, approvalRunId, approvalStatusValue, approvalTextOrReason, emitApprovalGateVerdict, optionalApprovalText } from './approval-gate-telemetry.ts';
import { resolveApprovalTimeout } from './approval-gate-timeout.ts';

function eventAdapterNumber(config: any, field: any) {
  const value = Number(config?.event_adapters?.[field]);
  if (!Number.isFinite(value)) throw new Error(`config.event_adapters.${field}: required number in swarm.config.json`);
  return value;
}

function approvalStateIdentityChanged(current: any, previous: any) {
  if (selectTruthyValue(() => !current, () => !previous)) return false;
  return ['timeout_policy', 'gate_id', 'gate_type', 'project'].some((field) => current[field] !== previous[field]);
}

function deadlineRemainingMs(state: any = {}) {
  const deadlineMs = new Date(state?.deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, deadlineMs - Date.now());
}

function isPipelineEventWaitTimeout(error: any) {
  return selectTruthyValue(() => (error?.name === 'PipelineEventWaitTimeoutError'), () => (error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'));
}

export async function failClosedOnApprovalStateNormalizationError(config: any, gateId: any, gate: any, rawState: any, deps: any, opts: any = {}, normalizationError: any = null) {
  const invalidStateError = selectDefinedValue(() => (normalizationError?.message), () => ((normalizationError ? String(normalizationError) : 'approval_state_normalization_failed')));
  const invalidState = rawState && typeof rawState === 'object'
    ? { ...rawState, invalid_state_error: invalidStateError }
    : { status: null, invalid_state_error: invalidStateError };
  return buildApprovalGateControlResult(
    config,
    gateId,
    gate,
    await failClosedOnInvalidApprovalState(config, gateId, gate, invalidState, deps),
    { ...opts, approvalState: invalidState },
  );
}

async function invalidObservedApprovalResolution(config: any, gateId: any, gate: any, current: any, timeoutPolicy: any, deps: any, opts: any) {
  const failure = await failClosedOnInvalidApprovalState(config, gateId, gate, current, deps);
  return {
    result: buildApprovalGateControlResult(config, gateId, gate, failure, { ...opts, approvalState: current }),
    state: current,
    timeoutPolicy,
  };
}

async function finalizeObservedApprovalTimeout(config: any, gateId: any, gate: any, timedOut: any, timeoutPolicy: any, deps: any) {
  syncApprovalWaitState(config, gateId, gate, timedOut);
  deps.saveGateState(config, gateId, timedOut);
  deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason, buildApprovalIdentity(config, gateId, gate, timedOut));
  deps.writeApprovalDecision(config, gateId, timedOut);
  return {
    result: await resolveApprovalTimeout(config, gateId, gate, timedOut, timeoutPolicy, deps),
    state: timedOut,
    timeoutPolicy,
  };
}

type ObservedApprovalContext = {
  config: any;
  gateId: any;
  gate: any;
  timeoutPolicy: any;
  deps: any;
  opts: any;
};

function observedApprovalResult(context: ObservedApprovalContext, current: any, fields: any) {
  return {
    result: buildApprovalGateControlResult(
      context.config,
      context.gateId,
      context.gate,
      fields,
      { ...context.opts, approvalState: current },
    ),
    state: current,
    timeoutPolicy: context.timeoutPolicy,
  };
}

function recordObservedApprovalOutcome(context: ObservedApprovalContext, current: any, status: any, actor: any) {
  const { config, gateId, gate } = context;
  const gateType = approvalGateType(gate, gateId);
  recordApprovalGateOutcome(config, gateId, gate.title, status, actor, current.reason, {
    gate_type: gateType,
    run_id: approvalRunId(config, current),
    project: optionalApprovalText(config.project),
    decision_via: approvalDecisionVia(current),
    timeout_policy: selectDefinedValue(() => (current?.timeout_policy), () => (null)),
    continued: current?.continued,
  });
  onApprovalResolved({ config }, gateId, status, actor, { gate_type: gateType });
  return gateType;
}

function persistObservedApprovalTransition(
  context: ObservedApprovalContext,
  current: any,
  status: any,
  reason: string,
) {
  const { config, gateId, gate, deps } = context;
  syncApprovalWaitState(config, gateId, gate, current);
  deps.appendTransition(
    config,
    gateId,
    APPROVAL_STATUS.PENDING_APPROVAL,
    status,
    reason,
    buildApprovalIdentity(config, gateId, gate, current),
  );
  deps.writeApprovalDecision(config, gateId, current);
}

function resolveObservedApproved(context: ObservedApprovalContext, current: any) {
  const { config, gateId, gate } = context;
  const decisionActor = approvalTextOrReason(current.decision_by, 'decision_actor_missing');
  const decisionReason = approvalTextOrReason(current.reason, 'approval_reason_not_provided');
  log('OK', `Approval gate '${gateId}' APPROVED by ${decisionActor}`);
  persistObservedApprovalTransition(context, current, APPROVAL_STATUS.APPROVED, decisionReason);
  const gateType = recordObservedApprovalOutcome(context, current, APPROVAL_STATUS.APPROVED, current.decision_by);
  emitApprovalGateVerdict(config, gateId, gate, 'PASS', decisionReason, {
    presentation: { discord: {
      level: 'OK',
      title: `Approved: ${gate.title}`,
      description: `Gate \`${gateId}\` approved. Pipeline resuming.`,
      fields: buildDiscordIdentitySurfaceFields(
        DISCORD_IDENTITY_SURFACES.APPROVAL_GATE,
        { run_id: approvalRunId(config, current) ?? 'run_id_missing', gate_id: gateId, gate_type: gateType },
        [
          { name: 'Approved by', value: decisionActor },
          { name: 'Decision via', value: approvalDecisionVia(current) ?? 'decision_channel_missing' },
          { name: 'Reason', value: decisionReason },
        ],
      ),
    } },
  });
  return observedApprovalResult(context, current, {
    status: APPROVAL_STATUS.APPROVED,
    outcome_class: 'passed',
    gate_id: gateId,
    decision_by: optionalApprovalText(current.decision_by),
    decision_via: approvalDecisionVia(current),
  });
}

function resolveObservedRejected(context: ObservedApprovalContext, current: any) {
  const { config, gateId, gate } = context;
  const decisionActor = approvalTextOrReason(current.decision_by, 'decision_actor_missing');
  const rejectionReason = approvalTextOrReason(current.reason, 'rejection_reason_missing');
  log('WARN', `Approval gate '${gateId}' REJECTED by ${decisionActor}`);
  persistObservedApprovalTransition(context, current, APPROVAL_STATUS.REJECTED, rejectionReason);
  const gateType = recordObservedApprovalOutcome(context, current, APPROVAL_STATUS.REJECTED, current.decision_by);
  emitApprovalGateVerdict(config, gateId, gate, 'FAIL', rejectionReason, {
    presentation: { discord: {
      level: 'CRITICAL',
      title: `Rejected: ${gate.title}`,
      description: `Gate \`${gateId}\` rejected. Pipeline halted — operator intervention required.`,
      fields: buildDiscordIdentitySurfaceFields(
        DISCORD_IDENTITY_SURFACES.APPROVAL_GATE,
        { run_id: approvalRunId(config, current) ?? 'run_id_missing', gate_id: gateId, gate_type: gateType },
        [
          { name: 'Rejected by', value: decisionActor },
          { name: 'Reason', value: rejectionReason.slice(0, 200) },
          { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
        ],
      ),
    } },
  });
  return observedApprovalResult(context, current, {
    status: APPROVAL_STATUS.REJECTED,
    outcome_class: 'needs_nova',
    reason: `Gate '${gateId}' rejected: ${rejectionReason}`,
    gate_id: gateId,
    decision_by: optionalApprovalText(current.decision_by),
    decision_via: approvalDecisionVia(current),
  });
}

function resolveObservedCancelled(context: ObservedApprovalContext, current: any) {
  const { config, gateId, gate } = context;
  const reason = approvalTextOrReason(current?.reason, 'cancellation_reason_missing');
  log('WARN', `Approval gate '${gateId}' CANCELLED`);
  persistObservedApprovalTransition(context, current, APPROVAL_STATUS.CANCELLED, reason);
  recordObservedApprovalOutcome(context, current, APPROVAL_STATUS.CANCELLED, null);
  emitApprovalGateVerdict(config, gateId, gate, 'FAIL', reason);
  return observedApprovalResult(context, current, {
    status: APPROVAL_STATUS.CANCELLED,
    outcome_class: 'needs_nova',
    reason: `Gate '${gateId}' cancelled`,
    gate_id: gateId,
    decision_via: approvalDecisionVia(current),
  });
}

export function observedTimedOutState(current: any, timeoutPolicy: any, reason: string) {
  return {
    ...current,
    status: APPROVAL_STATUS.TIMED_OUT,
    timeout_policy: timeoutPolicy,
    resolved_at: current.resolved_at ?? new Date().toISOString(),
    decision_via: approvalDecisionVia(current) ?? 'timeout',
    continued: timeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE,
    reason,
  };
}

async function resolveObservedPending(context: ObservedApprovalContext, current: any) {
  const { config, gateId, gate, deps, opts } = context;
  const timeoutPolicy = resolveApprovalTimeoutPolicyFromState(current, gateId);
  const deadlineMs = new Date(current?.deadline).getTime();
  if (!Number.isFinite(deadlineMs)) {
    return invalidObservedApprovalResolution(config, gateId, gate, current, timeoutPolicy, deps, opts);
  }
  if (Date.now() < deadlineMs) return { result: null, state: current, timeoutPolicy };
  log('WARN', `Approval gate '${gateId}' timed out (${current.timeout_minutes}min elapsed)`);
  const timedOut = observedTimedOutState(
    current,
    timeoutPolicy,
    `No decision received within ${current.timeout_minutes} minutes`,
  );
  return finalizeObservedApprovalTimeout(config, gateId, gate, timedOut, timeoutPolicy, deps);
}

export async function resolveObservedApprovalState(config: any, gateId: any, gate: any, rawCurrent: any, timeoutPolicy: any, deps: any, opts: any = {}) {
  if (rawCurrent?._corrupted_gate_state) {
    return {
      result: buildApprovalGateControlResult(config, gateId, gate, await failClosedOnCorruptedApprovalState(config, gateId, gate, rawCurrent, deps), { ...opts, approvalState: rawCurrent }),
      state: rawCurrent,
      timeoutPolicy,
    };
  }

  let current;
  try {
    current = normalizeApprovalGateState(rawCurrent, buildApprovalIdentity(config, gateId, gate, rawCurrent));
  } catch (error: any) {
    return {
      result: await failClosedOnApprovalStateNormalizationError(config, gateId, gate, rawCurrent, deps, opts, error),
      state: rawCurrent,
      timeoutPolicy,
    };
  }
  if (!current) {
    throw new Error(`Approval gate '${gateId}' cannot wait because no persisted approval state exists`);
  }

  if (approvalStateIdentityChanged(current, rawCurrent)) {
    deps.saveGateState(config, gateId, current);
  }

  const context = { config, gateId, gate, timeoutPolicy, deps, opts };
  const status = approvalStatusValue(current);
  if (status === APPROVAL_STATUS.APPROVED) return resolveObservedApproved(context, current);
  if (status === APPROVAL_STATUS.REJECTED) return resolveObservedRejected(context, current);
  if (status === APPROVAL_STATUS.CANCELLED) return resolveObservedCancelled(context, current);
  if (status === APPROVAL_STATUS.TIMED_OUT) {
    const nextPolicy = resolveApprovalTimeoutPolicyFromState(current, gateId);
    const reason = approvalTextOrReason(current.reason, `No decision received within ${current.timeout_minutes} minutes`);
    log('WARN', `Approval gate '${gateId}' TIMED_OUT via approval signal`);
    return finalizeObservedApprovalTimeout(config, gateId, gate, observedTimedOutState(current, nextPolicy, reason), nextPolicy, deps);
  }
  if (status !== APPROVAL_STATUS.PENDING_APPROVAL) {
    return invalidObservedApprovalResolution(config, gateId, gate, current, timeoutPolicy, deps, opts);
  }
  return resolveObservedPending(context, current);
}
