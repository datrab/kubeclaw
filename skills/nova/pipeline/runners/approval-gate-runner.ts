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
import { recordApprovalGateOutcome, buildGovernanceEmbedFields } from '../services/governance-context.ts';
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

export {
  APPROVAL_STATUS,
  APPROVAL_TIMEOUT_POLICY,
  buildApprovalGateControlResult,
  buildApprovalGateWaitControlResult,
  coerceApprovalGateControlResult,
  isApprovalGateControlResult,
  normalizeApprovalTimeoutPolicy,
};

function eventAdapterNumber(config, field) {
  const value = Number(config?.event_adapters?.[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`config.event_adapters.${field}: required number in swarm.config.json`);
  }
  return value;
}

function approvalGateType(gate, gateId) {
  if (selectTruthyValue(() => (typeof gate?.type !== 'string'), () => (!gate.type.trim()))) {
    throw new Error(`approval gate '${gateId}' requires progress.gates.${gateId}.type`);
  }
  return gate.type.trim();
}

function approvalStateIdentityChanged(current, previous) {
  if (selectTruthyValue(() => (!current), () => (!previous))) return false;
  return [
    'timeout_policy',
    'gate_id',
    'gate_type',
    'project',
  ].some((field) => current[field] !== previous[field]);
}

function approvalStatusValue(state) {
  return String(selectDefinedValue(() => (state?.status), () => (''))).trim().toUpperCase();
}

function optionalApprovalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function approvalTextOrReason(value, missingReason) {
  return selectDefinedValue(() => (optionalApprovalText(value)), () => (missingReason));
}

function approvalRunId(config, state = null) {
  return selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (optionalApprovalText(state?.run_id)), () => (optionalApprovalText(config._runId)))), () => (optionalApprovalText(config.run_id)))), () => (null));
}

function requireApprovalRunId(config, gateId) {
  const runId = approvalRunId(config);
  if (!runId) {
    throw new Error(`approval gate '${gateId}' requires config._runId or config.run_id`);
  }
  return runId;
}

function approvalDecisionVia(state) {
  return optionalApprovalText(state?.decision_via);
}

function approvalGateDescription(gate, gateId) {
  return selectDefinedValue(() => (optionalApprovalText(gate.description)), () => (`Pipeline paused at approval gate \`${gateId}\`. Explicit operator decision required to continue.`));
}

function emitApprovalGateVerdict(config, gateId, gate, verdict, reason = null, options = {}) {
  const payload = {
    gate_type: approvalGateType(gate, gateId),
    duration_seconds: null,
    reason,
    presentation: selectDefinedValue(() => (options.presentation), () => ({})),
  };

  if (verdict === 'PASS') onGatePass({ config }, gateId, payload);
  else onGateFail({ config }, gateId, payload);
}

function replayResolvedApprovalTelemetry(config, gateId, gate, state, { verdict, fallbackReason = null } = {}) {
  const gateType = approvalGateType(gate, gateId);
  const resolutionStatus = optionalApprovalText(approvalStatusValue(state));
  const resolvedBy = optionalApprovalText(state?.decision_by);
  const reason = selectDefinedValue(() => (optionalApprovalText(state?.reason)), () => (fallbackReason));

  recordApprovalGateOutcome(config, gateId, gate?.title, resolutionStatus, resolvedBy, reason, {
    gate_type: gateType,
    run_id: approvalRunId(config, state),
    project: optionalApprovalText(config.project),
    decision_via: approvalDecisionVia(state),
    timeout_policy: selectDefinedValue(() => (state?.timeout_policy), () => (null)),
    continued: state?.continued,
  });
  onApprovalResolved({ config }, gateId, resolutionStatus, resolvedBy, { gate_type: gateType });
  emitApprovalGateVerdict(config, gateId, gate, verdict, reason);
}

// ─── Discord embed builder ────────────────────────────────────────────────────

/**
 * Build a decision-ready Discord embed with enough pipeline context for the
 * operator to approve or reject without opening multiple files.
 */
export function buildApprovalEmbed(config, gateId, gate, state, progress) {
  state = normalizeApprovalGateState(state);
  const deadline = state.deadline ? new Date(state.deadline).toUTCString()  : 'approval_deadline_missing';
  const timeoutNote = isApprovalTimeoutContinue(state.timeout_policy)
    ? `AUTO-CONTINUE after ${state.timeout_minutes}min`
    : `BLOCK after ${state.timeout_minutes}min`;

  // Gather execution context from progress
  const execOrder = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  const gateIdx = execOrder.indexOf(`gate:${gateId}`);

  const completedSteps = gateIdx > 0
    ? execOrder.slice(0, gateIdx).filter(s => !s.startsWith('gate:'))
    : [];
  const remainingSteps = gateIdx >= 0
    ? execOrder.slice(gateIdx + 1).filter(s => !s.startsWith('gate:'))
    : [];

  const completedSummary = completedSteps.length > 0
    ? completedSteps.slice(-3).join(', ') + (completedSteps.length > 3 ? ` (+${completedSteps.length - 3} earlier)` : '')
    : 'none';

  const remainingSummary = remainingSteps.length > 0
    ? remainingSteps.slice(0, 3).join(', ') + (remainingSteps.length > 3 ? ` (+${remainingSteps.length - 3} more)` : '')
    : 'none (gate is near end of pipeline)';

  const description = approvalGateDescription(gate, gateId);

  const fields = [
    { name: 'Gate',        value: `\`${gateId}\` — ${gate.title}`, inline: false },
    { name: 'Project',     value: selectDefinedValue(() => (selectDefinedValue(() => (optionalApprovalText(state.project)), () => (optionalApprovalText(config.project)))), () => ('project_missing')), inline: true },
    { name: 'Run ID',      value: selectDefinedValue(() => (optionalApprovalText(state.run_id)), () => ('recovery_target_id_missing')), inline: true },
    { name: 'Deadline',    value: deadline, inline: false },
    { name: 'On Timeout',  value: timeoutNote, inline: true },
    { name: 'Completed Steps', value: completedSummary, inline: false },
    { name: 'Remaining Steps', value: remainingSummary, inline: false },
    ...buildGovernanceEmbedFields(config),
    { name: 'To Approve',  value: `\`APPROVE gate:${gateId}\``, inline: true },
    { name: 'To Reject',   value: `\`REJECT gate:${gateId} reason: ...\``, inline: true },
    { name: 'Artifacts',   value: `\`.swarm/logs/gates/${gateId}/\``, inline: false },
  ];

  return { description, fields };
}

// ─── Deps injection ───────────────────────────────────────────────────────────

function getApprovalGateRunnerDeps(config, overrides = {}) {
  return { ...DEFAULT_APPROVAL_GATE_DEPS, ...selectDeps(overrides, 'approvalGate') };
}

// ─── Timeout resolution ───────────────────────────────────────────────────────

async function resolveTimeout(config, gateId, gate, state, timeoutPolicy, deps) {
  const normalizedTimeoutPolicy = resolveApprovalTimeoutPolicyFromState(state, gateId);
  const gateType = approvalGateType(gate, gateId);
  recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.TIMED_OUT, null,
    `No decision received within ${state.timeout_minutes} minutes`, {
      gate_type: gateType,
      run_id: approvalRunId(config, state),
      project: optionalApprovalText(config.project),
      decision_via: selectDefinedValue(() => (approvalDecisionVia(state)), () => ('timeout')),
      timeout_policy: normalizedTimeoutPolicy,
      continued: normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE,
  });
  onApprovalResolved({ config }, gateId, APPROVAL_STATUS.TIMED_OUT, null, { gate_type: gateType });

  if (normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE) {
    emitApprovalGateVerdict(config, gateId, gate, 'PASS', `Approval timed out after ${state.timeout_minutes} minutes; auto-continued`, {
      presentation: {
        discord: {
          level: 'WARN',
          title: `Approval Timeout (auto-continue): ${gate.title}`,
          description: `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Configured to auto-continue.`,
          action: 'continue',
          next_action: 'continue',
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: state.run_id, gate_id: gateId, gate_type: gateType }, [
            { name: 'Gate ID', value: gateId },
            { name: 'Policy', value: APPROVAL_TIMEOUT_POLICY.CONTINUE },
            { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
          ]),
        },
      },
    });
    log('WARN', `Approval gate '${gateId}' timed out — timeout_policy=${APPROVAL_TIMEOUT_POLICY.CONTINUE}, proceeding`);
    return buildApprovalGateControlResult(config, gateId, gate, {
      status: APPROVAL_STATUS.TIMED_OUT,
      outcome_class: 'passed',
      timed_out: true,
      continued: true,
      gate_id: gateId,
    }, { approvalState: state });
  }

  emitApprovalGateVerdict(config, gateId, gate, 'FAIL', `Approval timed out after ${state.timeout_minutes} minutes`, {
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Approval Timeout (blocked): ${gate.title}`,
        description: `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Pipeline halted — operator approval required.`,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: state.run_id, gate_id: gateId, gate_type: gateType }, [
          { name: 'Gate ID', value: gateId },
          { name: 'Policy', value: APPROVAL_TIMEOUT_POLICY.BLOCK },
          { name: 'To Approve', value: `\`APPROVE gate:${gateId}\`` },
          { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
        ]),
      },
    },
  });
  log('ERROR', `Approval gate '${gateId}' timed out — timeout_policy=${APPROVAL_TIMEOUT_POLICY.BLOCK}, halting pipeline`);
  return buildApprovalGateControlResult(config, gateId, gate, {
    status:    APPROVAL_STATUS.TIMED_OUT,
    outcome_class: 'needs_nova',
    reason:    `Approval gate '${gateId}' timed out after ${state.timeout_minutes} minutes`,
    gate_id:   gateId,
    timed_out: true,
  }, { approvalState: state });
}

// ─── Event-driven approval signal wait ────────────────────────────────────────

function deadlineRemainingMs(state = {}) {
  const deadlineMs = new Date(state?.deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, deadlineMs - Date.now());
}

function isPipelineEventWaitTimeout(error) {
  return selectTruthyValue(() => (error?.name === 'PipelineEventWaitTimeoutError'), () => (error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'));
}

async function failClosedOnApprovalStateNormalizationError(config, gateId, gate, rawState, deps, opts = {}, normalizationError = null) {
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

async function resolveObservedApprovalState(config, gateId, gate, rawCurrent, timeoutPolicy, deps, opts = {}) {
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
  } catch (error) {
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

  const status = approvalStatusValue(current);

  if (status === APPROVAL_STATUS.APPROVED) {
    const gateType = approvalGateType(gate, gateId);
    const decisionActor = approvalTextOrReason(current.decision_by, 'decision_actor_missing');
    const decisionReason = approvalTextOrReason(current.reason, 'approval_reason_not_provided');
    log('OK', `Approval gate '${gateId}' APPROVED by ${decisionActor}`);
    syncApprovalWaitState(config, gateId, gate, current);
    deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.APPROVED, decisionReason, buildApprovalIdentity(config, gateId, gate, current));
    deps.writeApprovalDecision(config, gateId, current);
    recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.APPROVED, current.decision_by, current.reason, {
      gate_type: gateType,
      run_id: approvalRunId(config, current),
      project: optionalApprovalText(config.project),
      decision_via: approvalDecisionVia(current),
      timeout_policy: selectDefinedValue(() => (current?.timeout_policy), () => (null)),
      continued: current?.continued,
    });
    onApprovalResolved({ config }, gateId, APPROVAL_STATUS.APPROVED, current.decision_by, { gate_type: gateType });
    emitApprovalGateVerdict(config, gateId, gate, 'PASS', decisionReason, {
      presentation: {
        discord: {
          level: 'OK',
          title: `Approved: ${gate.title}`,
          description: `Gate \`${gateId}\` approved. Pipeline resuming.`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: selectDefinedValue(() => (approvalRunId(config, current)), () => ('run_id_missing')), gate_id: gateId, gate_type: gateType }, [
            { name: 'Approved by', value: decisionActor },
            { name: 'Decision via', value: selectDefinedValue(() => (approvalDecisionVia(current)), () => ('decision_channel_missing')) },
            { name: 'Reason', value: decisionReason },
          ]),
        },
      },
    });
    return {
      result: buildApprovalGateControlResult(config, gateId, gate, {
        status: APPROVAL_STATUS.APPROVED,
        outcome_class: 'passed',
        gate_id: gateId,
        decision_by: optionalApprovalText(current.decision_by),
        decision_via: approvalDecisionVia(current),
      }, { ...opts, approvalState: current }),
      state: current,
      timeoutPolicy,
    };
  }

  if (status === APPROVAL_STATUS.REJECTED) {
    const gateType = approvalGateType(gate, gateId);
    const decisionActor = approvalTextOrReason(current.decision_by, 'decision_actor_missing');
    const rejectionReason = approvalTextOrReason(current.reason, 'rejection_reason_missing');
    log('WARN', `Approval gate '${gateId}' REJECTED by ${decisionActor}`);
    syncApprovalWaitState(config, gateId, gate, current);
    deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.REJECTED, rejectionReason, buildApprovalIdentity(config, gateId, gate, current));
    deps.writeApprovalDecision(config, gateId, current);
    recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.REJECTED, current.decision_by, current.reason, {
      gate_type: gateType,
      run_id: approvalRunId(config, current),
      project: optionalApprovalText(config.project),
      decision_via: approvalDecisionVia(current),
      timeout_policy: selectDefinedValue(() => (current?.timeout_policy), () => (null)),
      continued: current?.continued,
    });
    onApprovalResolved({ config }, gateId, APPROVAL_STATUS.REJECTED, current.decision_by, { gate_type: gateType });
    emitApprovalGateVerdict(config, gateId, gate, 'FAIL', rejectionReason, {
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Rejected: ${gate.title}`,
          description: `Gate \`${gateId}\` rejected. Pipeline halted — operator intervention required.`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: selectDefinedValue(() => (approvalRunId(config, current)), () => ('run_id_missing')), gate_id: gateId, gate_type: gateType }, [
            { name: 'Rejected by', value: decisionActor },
            { name: 'Reason', value: rejectionReason.slice(0, 200) },
            { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
          ]),
        },
      },
    });
    return {
      result: buildApprovalGateControlResult(config, gateId, gate, {
        status: APPROVAL_STATUS.REJECTED,
        outcome_class: 'needs_nova',
        reason: `Gate '${gateId}' rejected: ${rejectionReason}`,
        gate_id: gateId,
        decision_by: optionalApprovalText(current.decision_by),
        decision_via: approvalDecisionVia(current),
      }, { ...opts, approvalState: current }),
      state: current,
      timeoutPolicy,
    };
  }

  if (status === APPROVAL_STATUS.CANCELLED) {
    const gateType = approvalGateType(gate, gateId);
    const cancellationReason = approvalTextOrReason(current?.reason, 'cancellation_reason_missing');
    log('WARN', `Approval gate '${gateId}' CANCELLED`);
    syncApprovalWaitState(config, gateId, gate, current);
    deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.CANCELLED, cancellationReason, buildApprovalIdentity(config, gateId, gate, current));
    deps.writeApprovalDecision(config, gateId, current);
    recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.CANCELLED, null, current?.reason, {
      gate_type: gateType,
      run_id: approvalRunId(config, current),
      project: optionalApprovalText(config.project),
      decision_via: approvalDecisionVia(current),
      timeout_policy: selectDefinedValue(() => (current?.timeout_policy), () => (null)),
      continued: current?.continued,
    });
    onApprovalResolved({ config }, gateId, APPROVAL_STATUS.CANCELLED, null, { gate_type: gateType });
    emitApprovalGateVerdict(config, gateId, gate, 'FAIL', cancellationReason);
    return {
      result: buildApprovalGateControlResult(config, gateId, gate, {
        status: APPROVAL_STATUS.CANCELLED,
        outcome_class: 'needs_nova',
        reason: `Gate '${gateId}' cancelled`,
        gate_id: gateId,
        decision_via: approvalDecisionVia(current),
      }, { ...opts, approvalState: current }),
      state: current,
      timeoutPolicy,
    };
  }

  if (status === APPROVAL_STATUS.TIMED_OUT) {
    const nextTimeoutPolicy = resolveApprovalTimeoutPolicyFromState(current, gateId);
    const timeoutReason = approvalTextOrReason(current.reason, `No decision received within ${current.timeout_minutes} minutes`);
    const timedOut = {
      ...current,
      status: APPROVAL_STATUS.TIMED_OUT,
      timeout_policy: nextTimeoutPolicy,
      resolved_at: selectDefinedValue(() => (current.resolved_at), () => (new Date().toISOString())),
      decision_via: selectDefinedValue(() => (approvalDecisionVia(current)), () => ('timeout')),
      continued: nextTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE,
      reason: timeoutReason,
    };
    log('WARN', `Approval gate '${gateId}' TIMED_OUT via approval signal`);
    syncApprovalWaitState(config, gateId, gate, timedOut);
    deps.saveGateState(config, gateId, timedOut);
    deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason, buildApprovalIdentity(config, gateId, gate, timedOut));
    deps.writeApprovalDecision(config, gateId, timedOut);
    return {
      result: await resolveTimeout(config, gateId, gate, timedOut, nextTimeoutPolicy, deps),
      state: timedOut,
      timeoutPolicy: nextTimeoutPolicy,
    };
  }

  if (status !== APPROVAL_STATUS.PENDING_APPROVAL) {
    return {
      result: buildApprovalGateControlResult(config, gateId, gate, await failClosedOnInvalidApprovalState(config, gateId, gate, current, deps), { ...opts, approvalState: current }),
      state: current,
      timeoutPolicy,
    };
  }

  const nextTimeoutPolicy = resolveApprovalTimeoutPolicyFromState(current, gateId);
  const deadlineMs = new Date(current?.deadline).getTime();
  if (!Number.isFinite(deadlineMs)) {
    return {
      result: buildApprovalGateControlResult(config, gateId, gate, await failClosedOnInvalidApprovalState(config, gateId, gate, current, deps), { ...opts, approvalState: current }),
      state: current,
      timeoutPolicy: nextTimeoutPolicy,
    };
  }

  if (Date.now() >= deadlineMs) {
    log('WARN', `Approval gate '${gateId}' timed out (${current.timeout_minutes}min elapsed)`);
    const timedOut = {
      ...current,
      status: APPROVAL_STATUS.TIMED_OUT,
      timeout_policy: nextTimeoutPolicy,
      resolved_at: new Date().toISOString(),
      decision_via: 'timeout',
      continued: nextTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE,
      reason: `No decision received within ${current.timeout_minutes} minutes`,
    };
    syncApprovalWaitState(config, gateId, gate, timedOut);
    deps.saveGateState(config, gateId, timedOut);
    deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason, buildApprovalIdentity(config, gateId, gate, timedOut));
    deps.writeApprovalDecision(config, gateId, timedOut);
    return {
      result: await resolveTimeout(config, gateId, gate, timedOut, nextTimeoutPolicy, deps),
      state: timedOut,
      timeoutPolicy: nextTimeoutPolicy,
    };
  }

  return { result: null, state: current, timeoutPolicy: nextTimeoutPolicy };
}

async function waitForApprovalSignalFlow(config, gateId, gate, state, progress, timeoutPolicy, deps, opts = {}) {
  const initialObservedState = selectDefinedValue(() => (deps.loadGateState(config, gateId)), () => (state));
  let observed = await resolveObservedApprovalState(config, gateId, gate, initialObservedState, timeoutPolicy, deps, opts);
  if (observed.result) return observed.result;

  const eventBus = selectDefinedValue(() => (opts.eventBus), () => (createPipelineEventBus()));
  const adapter = selectDefinedValue(() => (opts.approvalSignalAdapter), () => (createRedisApprovalSignalEventAdapter(config, {
    eventBus,
    gateId,
    gate,
    blockMs: eventAdapterNumber(config, 'approval_signal_debounce_ms'),
    debounceMs: eventAdapterNumber(config, 'approval_signal_debounce_ms'),
    loadState: deps.loadGateState,
    waitRef: selectDefinedValue(() => (selectDefinedValue(() => (observed.state?.wait_ref), () => (opts?.input?.refs?.waitRef))), () => (null)),
    emitExisting: true,
    stopOnTerminal: true,
})));
  const runId = approvalRunId(config);
  const identity = { gate_id: gateId, ...(runId ? { run_id: runId } : {}) };

  try {
    let adapterStarted = false;
    while (true) {
      const remainingMs = deadlineRemainingMs(observed.state);
      log('INFO', `Gate '${gateId}' PENDING_APPROVAL — waiting for approval.signal until deadline.`);
      let event;
      let waiter;
      const waitController = new AbortController();
      try {
        waiter = waitForAny(eventBus, ['approval.signal', 'fatal.error'], identity, {
          signal: waitController.signal,
          timeoutMs: remainingMs,
        });
        if (!adapterStarted) {
          adapter.start();
          adapterStarted = true;
        }
        event = await waiter;
      } catch (error) {
        if (waiter) void waiter.catch(() => {});
        if (!isPipelineEventWaitTimeout(error)) throw error;
        observed = await resolveObservedApprovalState(config, gateId, gate, deps.loadGateState(config, gateId), observed.timeoutPolicy, deps, opts);
        if (observed.result) return observed.result;
        continue;
      } finally {
        waitController.abort('approval_signal_wait_complete');
      }

      if (event.type === 'fatal.error') {
        observed = await resolveObservedApprovalState(config, gateId, gate, deps.loadGateState(config, gateId), observed.timeoutPolicy, deps, opts);
        if (observed.result) return observed.result;
        throw new Error(`Approval signal adapter failed for gate '${gateId}': ${selectDefinedValue(() => (event.payload?.reason), () => ('approval_signal_reason_missing'))}`);
      }

      observed = await resolveObservedApprovalState(config, gateId, gate, deps.loadGateState(config, gateId), observed.timeoutPolicy, deps, opts);
      if (observed.result) return observed.result;
    }
  } finally {
    adapter.stop?.('approval_wait_complete');
  }
}

// ─── Main gate runner ─────────────────────────────────────────────────────────

export async function runApprovalGateEvaluation(config, progress, gateId, opts = {}) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Approval gate '${gateId}' not found`);

  const timeoutMinutes  = gate.timeout_minutes
  const timeoutPolicy   = resolveApprovalTimeoutPolicyFromGate(gate, gateId);
  const deps            = getApprovalGateRunnerDeps(config, opts.deps);

  log('STEP', `════════════════════════════════════════════════════`);
  log('STEP', `  APPROVAL GATE: ${gate.title}`);
  log('STEP', `  timeout: ${timeoutMinutes}min | on_timeout: ${gate.on_timeout} | timeout_policy: ${timeoutPolicy}`);
  log('STEP', `════════════════════════════════════════════════════`);

  // ── 1. Check existing state (resume safety) ──────────────────────────────
  const loadedGateState = deps.loadGateState(config, gateId);
  if (loadedGateState?._corrupted_gate_state) {
    return buildApprovalGateControlResult(config, gateId, gate, await failClosedOnCorruptedApprovalState(config, gateId, gate, loadedGateState, deps), { ...opts, approvalState: loadedGateState });
  }
  let gateState;
  try {
    gateState = normalizeApprovalGateState(loadedGateState, buildApprovalIdentity(config, gateId, gate, loadedGateState));
  } catch (error) {
    return failClosedOnApprovalStateNormalizationError(config, gateId, gate, loadedGateState, deps, opts, error);
  }
  if (gateState) {
    const loadedStatus = approvalStatusValue(gateState);
    if (!APPROVAL_TERMINAL_OR_WAIT_STATUSES.has(loadedStatus)) {
      return buildApprovalGateControlResult(config, gateId, gate, await failClosedOnInvalidApprovalState(config, gateId, gate, gateState, deps), { ...opts, approvalState: gateState });
    }
  }
  gateState = selectDefinedValue(() => (normalizeApprovalGateState(syncApprovalWaitState(config, gateId, gate, gateState), buildApprovalIdentity(config, gateId, gate, gateState))), () => (gateState));
  if (approvalStateIdentityChanged(gateState, loadedGateState)) {
    deps.saveGateState(config, gateId, gateState);
  }

  if (gateState) {
    const s = approvalStatusValue(gateState);

    if (s === APPROVAL_STATUS.APPROVED) {
      log('OK', `Approval gate '${gateId}' already APPROVED — restoring resolved telemetry`);
      replayResolvedApprovalTelemetry(config, gateId, gate, gateState, {
        verdict: 'PASS',
        fallbackReason: 'Approved by operator',
      });
      deps.writeApprovalDecision(config, gateId, gateState);
      return buildApprovalGateControlResult(config, gateId, gate, { status: APPROVAL_STATUS.APPROVED, outcome_class: 'passed', gate_id: gateId }, { ...opts, approvalState: gateState });
    }

    if (s === APPROVAL_STATUS.REJECTED) {
      log('WARN', `Approval gate '${gateId}' already REJECTED — restoring resolved telemetry before halting`);
      replayResolvedApprovalTelemetry(config, gateId, gate, gateState, {
        verdict: 'FAIL',
        fallbackReason: 'Rejected by operator',
      });
      deps.writeApprovalDecision(config, gateId, gateState);
      return buildApprovalGateControlResult(config, gateId, gate, {
        status:  APPROVAL_STATUS.REJECTED,
        outcome_class: 'needs_nova',
        reason:  `Gate '${gateId}' was previously rejected: ${approvalTextOrReason(gateState.reason, 'rejection_reason_missing')}`,
        gate_id: gateId,
      }, { ...opts, approvalState: gateState });
    }

    if (s === APPROVAL_STATUS.CANCELLED) {
      log('WARN', `Approval gate '${gateId}' already CANCELLED — restoring resolved telemetry before halting`);
      replayResolvedApprovalTelemetry(config, gateId, gate, gateState, {
        verdict: 'FAIL',
        fallbackReason: 'Approval cancelled',
      });
      deps.writeApprovalDecision(config, gateId, gateState);
      return buildApprovalGateControlResult(config, gateId, gate, {
        status:  APPROVAL_STATUS.CANCELLED,
        outcome_class: 'needs_nova',
        reason:  `Gate '${gateId}' cancelled`,
        gate_id: gateId,
      }, { ...opts, approvalState: gateState });
    }

    if (s === APPROVAL_STATUS.TIMED_OUT) {
      log('WARN', `Approval gate '${gateId}' already TIMED_OUT — re-resolving`);
      return resolveTimeout(config, gateId, gate, gateState, gateState.timeout_policy, deps);
    }

    if (s === APPROVAL_STATUS.PENDING_APPROVAL) {
      // Resume — check if timeout already elapsed
      const requestedMs    = new Date(gateState.requested_at).getTime();
      const stateTimeoutMinutes = Number(gateState.timeout_minutes);
      if (selectTruthyValue(() => (!Number.isFinite(stateTimeoutMinutes)), () => (stateTimeoutMinutes <= 0))) {
        return buildApprovalGateControlResult(config, gateId, gate, await failClosedOnInvalidApprovalState(config, gateId, gate, gateState, deps), { ...opts, approvalState: gateState });
      }
      const stateTimeoutMs = stateTimeoutMinutes * 60 * 1000;

      if (Date.now() >= requestedMs + stateTimeoutMs) {
        log('WARN', `Approval gate '${gateId}' timeout elapsed during restart — marking TIMED_OUT`);
        const timedOut = {
          ...gateState,
          status:       APPROVAL_STATUS.TIMED_OUT,
          timeout_policy: resolveApprovalTimeoutPolicyFromState(gateState, gateId),
          resolved_at:  new Date().toISOString(),
          decision_via: 'timeout',
          continued:    resolveApprovalTimeoutPolicyFromState(gateState, gateId) === APPROVAL_TIMEOUT_POLICY.CONTINUE,
          reason:       `Timeout elapsed during pipeline restart`,
        };
        syncApprovalWaitState(config, gateId, gate, timedOut);
        deps.saveGateState(config, gateId, timedOut);
        deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason, buildApprovalIdentity(config, gateId, gate, timedOut));
        deps.writeApprovalDecision(config, gateId, timedOut);
        return resolveTimeout(config, gateId, gate, timedOut, timedOut.timeout_policy, deps);
      }

      // Still within window — return a generic wait control result without re-posting the request.
      log('INFO', `Resuming PENDING_APPROVAL for gate '${gateId}' (no duplicate request posted)`);
      return buildApprovalGateWaitControlResult(config, gateId, gate, gateState, opts);
    }

    if (!APPROVAL_TERMINAL_OR_WAIT_STATUSES.has(s)) {
      return buildApprovalGateControlResult(config, gateId, gate, await failClosedOnInvalidApprovalState(config, gateId, gate, gateState, deps), { ...opts, approvalState: gateState });
    }
  }

  // ── 2. Fresh start — initialize PENDING_APPROVAL ──────────────────────────
  const nowIso      = new Date().toISOString();
  const deadlineIso = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();
  const gateType = approvalGateType(gate, gateId);
  const runId = requireApprovalRunId(config, gateId);

  gateState = {
    gate_id:             gateId,
    gate_type:           gateType,
    status:              APPROVAL_STATUS.PENDING_APPROVAL,
    run_id:              runId,
    project:             config.project,
    requested_at:        nowIso,
    deadline:            deadlineIso,
    timeout_minutes:     timeoutMinutes,
    timeout_policy:      timeoutPolicy,
    resolved_at:         null,
    decision_by:         null,
    decision_via:        null,
    continued:           null,
    reason:              null,
    request_message_ref: null,
  };

  const projectedState = syncApprovalWaitState(config, gateId, gate, gateState);
  if (projectedState?.wait_ref) gateState.wait_ref = projectedState.wait_ref;
  deps.saveGateState(config, gateId, gateState);
  deps.appendTransition(config, gateId, null, APPROVAL_STATUS.PENDING_APPROVAL, 'Gate initialized', buildApprovalIdentity(config, gateId, gate, gateState));
  deps.writeApprovalRequest(config, gateId, gate, gateState);

  log('INFO', `Approval gate '${gateId}' → PENDING_APPROVAL (deadline: ${deadlineIso})`);
  const embed = buildApprovalEmbed(config, gateId, gate, gateState, progress);
  const requestPresentation = {
    level: 'WARN',
    title: `⏸️ Approval Required: ${gate.title}`,
    description: embed.description,
    status: APPROVAL_STATUS.PENDING_APPROVAL,
    next_action: 'approve_or_reject',
    action: 'approve_or_reject',
    fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: gateState.run_id, gate_id: gateId, gate_type: gate.type }, embed.fields),
  };
  await onGateStarted({ config, deps: opts.deps }, gateId, gate, {
    presentation: {
      discord: requestPresentation,
    },
  });
  onApprovalRequested({ config }, gateId, gate.title, timeoutMinutes, timeoutPolicy, { gate_type: gateType });

  // ── 3. Post Discord approval request ──────────────────────────────────────
  // ── 4. Return wait control result for core-owned wait handling ────────────
  return buildApprovalGateWaitControlResult(config, gateId, gate, gateState, opts);
}

export async function waitForApprovalGateSignal(config, progress, gateId, controlResult, opts = {}) {
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
  } catch (error) {
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
  return waitForApprovalSignalFlow(config, gateId, gate, state, progress, timeoutPolicy, deps, opts);
}

export function createApprovalGateWaitController({ config, progress, gateId, controlResult, opts = {} }) {
  return {
    waitForSignal: () => waitForApprovalGateSignal(config, progress, gateId, controlResult, opts),
  };
}


export async function runApprovalGateStage(config, progress, gateId, opts = {}) {
  return runApprovalGateEvaluation(config, progress, gateId, opts);
}

export function getApprovalGateControlAdapter() {
  return Object.freeze({
    mode: 'waitable',
    label: 'Approval',
    allowedNextActions: [GATE_CONTROL_ACTIONS.PASS, GATE_CONTROL_ACTIONS.WAIT, GATE_CONTROL_ACTIONS.BLOCK],
    coerce: coerceApprovalGateControlResult,
    createWaitController: createApprovalGateWaitController,
    extraValidate: (controlResult) => {
      const errors = [];
      const metadata = selectDefinedValue(() => (selectDefinedValue(() => (controlResult?.diagnostics?.metadata), () => (controlResult?.diagnostics?.typed?.gate?.metadata))), () => ({}));
      const gateRunStatus = selectDefinedValue(() => (controlResult?.diagnostics?.typed?.gate?.gateRunStatus), () => (null));
      if (gateRunStatus === APPROVAL_STATUS.TIMED_OUT && metadata?.continued === true && controlResult.nextAction !== GATE_CONTROL_ACTIONS.PASS) {
        errors.push('timeout-continue must map to nextAction=pass');
      }
      return errors;
    },
  });
}
