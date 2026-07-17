// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import {
  loadStatus,
  saveStatus,
  appendLifecycleEvent,
  appendStaleRecoveryLifecycleEvent,
} from '../services/status-store.ts';
import { resolveGateActiveSessionRecoveryEvidence } from '../services/gate-active-session.ts';
import { discord } from '../integrations/discord.ts';
import { appendDurableOperatorAlert, onModuleStatusChanged } from '../services/telemetry.ts';
import { observeAcpMonitorSurfaces } from '../services/acp-observability.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { reaperAfterKill } from '../agents/shutdown.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { getRetryStatusForPhase, markModuleLifecycleIntent, transitionModuleStatus } from '../lifecycle-state.ts';
import {
  STALE_RECOVERY_ACTIONS,
  isDefinitivelyStoppedMonitorState,
  describeStaleRecovery,
} from '../services/failure-semantics.ts';
import {
  getProgressGateType,
} from './pipeline-runner-shared.ts';
import {
  resolveStatusDispatchId,
  resolveStatusSessionKey,
} from '../services/correlation.ts';
import {
  buildActiveSessionAuthorityPolicy,
} from '../services/session-authority.ts';
import { ensureProjectLogDir } from '../core/paths.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
const TERMINAL_MONITOR_DETAIL = 'terminal';
const IDENTITY_UNCONFIRMED_STATE = 'identity_unconfirmed';
const GATE_RECOVERY_PHASE = 'gate';
const MODULE_BUSTER_PHASE = 'buster';
const PENDING_STATUS = 'PENDING';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function objectRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function firstTextValue(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = textValue(value);
    if (normalized) return normalized;
  }
  return null;
}

export function shouldPreserveTerminalModuleRecovery({ previousPhase, recoveryAction }: AnyRecord): boolean {
  return textValue(previousPhase) === MODULE_BUSTER_PHASE && recoveryAction === STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL;
}

function runtimeName(active: AnyRecord): string | null {
  return textValue(active.runtime);
}

function identityUnconfirmedCode(recoveryEvidence: AnyRecord): string {
  return selectDefinedValue(() => (textValue(recoveryEvidence?.policy?.code)), () => (IDENTITY_UNCONFIRMED_STATE));
}

function resolveRecoveryAttempt(status: AnyRecord | null, active: AnyRecord | null = null): number | null {
  const value = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (active?.attempt), () => (status?.current_attempt))), () => (status?.attempt))), () => (null));
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveRecoveryGatewayLabel(status: AnyRecord | null, active: AnyRecord | null = null): string | null {
  return selectDefinedValue(() => (selectDefinedValue(() => (active?.gateway_label), () => (status?.gateway_label))), () => (null));
}

function resolveDiagnosticLabel(active: AnyRecord | null = null): string | null {
  if (!active?.label) return null;
  if (active?.gateway_label && active.label === active.gateway_label) return null;
  return active.label;
}

function recoveryModuleDir(moduleId: string, mod: AnyRecord): string {
  const dir = firstTextValue(mod?.dir, moduleId);
  if (!dir) throw new Error(`module ${moduleId}: recovery requires module dir authority`);
  return dir;
}

function recoveryDispatchIdValue(active: AnyRecord | null, status: AnyRecord | null): string | null {
  return firstTextValue(active?.dispatch_id, resolveStatusDispatchId(status));
}

function recoverySessionKeyValue(active: AnyRecord | null, status: AnyRecord | null): string | null {
  return firstTextValue(active?.session_key, resolveStatusSessionKey(status));
}

function requireRecoveryAction(recoveryAction: unknown, scope: string, id: string): string {
  const action = textValue(recoveryAction);
  if (!action) throw new Error(`${scope} ${id}: stale recovery selected without recovery action authority`);
  return action;
}

function recoveryTransitionStatus(status: AnyRecord, recoveryTargetStatus: string | null): string {
  const statusValue = textValue(status?.status);
  if (statusValue) return statusValue;
  const targetStatus = textValue(recoveryTargetStatus);
  if (targetStatus) return targetStatus;
  throw new Error('stale recovery transition requires status authority');
}

function diagnosticLabelField(diagnosticLabel: string | null): AnyRecord[] {
  return diagnosticLabel ? [{ name: 'Diagnostic Label', value: diagnosticLabel, inline: true }] : [];
}

function recoveryRunId(config: AnyRecord): string | null {
  return selectTruthyValue(() => (getRunId(config)), () => (null));
}

function buildRecoveryDiscordCorrelation({
  runId = null,
  moduleId = null,
  gateId = null,
  gateType = null,
  attempt = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
}: AnyRecord = {}): AnyRecord {
  return {
    run_id: selectTruthyValue(() => (runId), () => (null)),
    module_id: selectTruthyValue(() => (moduleId), () => (null)),
    gate_id: selectTruthyValue(() => (gateId), () => (null)),
    gate_type: selectTruthyValue(() => (gateType), () => (null)),
    attempt: selectDefinedValue(() => (attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (dispatchId), () => (null)),
    gateway_label: selectTruthyValue(() => (gatewayLabel), () => (null)),
    session_key: selectTruthyValue(() => (sessionKey), () => (null)),
  };
}

function removeFileIfPresent(filePath: string | null): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if ((err as AnyRecord).code !== 'ENOENT') throw err;
  }
}

function buildRecoverySessionAuthority(_config: AnyRecord, active: AnyRecord | null = null, gatewayEvidence: AnyRecord | null = null): AnyRecord {
  return buildActiveSessionAuthorityPolicy({
    lifecycleActiveSession: selectTruthyValue(() => (active), () => (null)),
    gatewayEvidence,
    requireGatewayConfirmation: Boolean(gatewayEvidence),
  } as AnyRecord) as AnyRecord;
}

async function assertRecoverySessionIdentityConfirmed(config: AnyRecord, {
  scope,
  moduleId = null,
  gateId = null,
  gateType = null,
  previousPhase = 'missing_previous_phase',
  attempt = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
  diagnosticLabel = null,
  statusBeforeReset = null,
  activeSessionPath = null,
  active = null,
} : AnyRecord = {}): Promise<AnyRecord> {
  const sessionAuthority = buildRecoverySessionAuthority(config, active);
  if (sessionAuthority.identity_confirmed === true) return sessionAuthority;

  const reason = `Recovery blocked: stale ${scope} session identity was not confirmed (${sessionAuthority.code})`;
  await recordUnconfirmedRecoveryBlock(config, {
    scope,
    moduleId,
    gateId,
    gateType,
    previousPhase,
    attempt,
    dispatchId,
    gatewayLabel,
    sessionKey,
    diagnosticLabel,
    statusBeforeReset,
    activeSessionPath,
    stopResult: { requested: false, confirmed: false, state: sessionAuthority.code },
    recoveryAction: 'identity_unconfirmed',
    reason,
    sessionAuthority,
  });
  throw new Error(reason);
}

async function reconcileActiveStaleSession(config: AnyRecord, {
  scope,
  moduleId = null,
  gateId = null,
  gateType = null,
  previousPhase = 'missing_previous_phase',
  active = null,
  attempt = null,
  dispatchId = null,
  gatewayLabel = null,
  diagnosticLabel = null,
  statusBeforeReset = null,
  activeSessionPath = null,
  monitorIdentity = {},
  noteKind = 'state',
  unconfirmedErrorSubject = 'orphaned child session',
}: AnyRecord = {}): Promise<AnyRecord> {
  await assertRecoverySessionIdentityConfirmed(config, {
    scope,
    moduleId,
    gateId,
    gateType,
    previousPhase,
    attempt,
    dispatchId,
    gatewayLabel,
    sessionKey: selectTruthyValue(() => (active?.session_key), () => (null)),
    diagnosticLabel,
    statusBeforeReset,
    activeSessionPath,
    active,
  });

  const { monitor: mon } = await observeAcpMonitorSurfaces(config, active.session_key, {
    ...monitorIdentity,
    gateway_label: gatewayLabel,
    diagnostic_label: diagnosticLabel,
    session_key: selectDefinedValue(() => (active.session_key), () => (null)),
    attempt,
    dispatch_id: selectTruthyValue(() => (dispatchId), () => (null)),
    agent_type: previousPhase,
  }, {
    streamLogPath: selectTruthyValue(() => (active.stream_log_path), () => (null)),
  });
  const definitelyStopped = isDefinitivelyStoppedMonitorState(mon);
  const sessionAuthority = buildRecoverySessionAuthority(config, active, {
    confirmed: true,
    state: definitelyStopped ? 'terminal' : 'active',
    observed_via: 'session_monitor',
  });

  if (definitelyStopped) {
    const note = describeStaleRecovery(previousPhase, STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL, {
      detail: selectDefinedValue(() => (firstTextValue(mon.lastDetail, mon.lastSummary)), () => (TERMINAL_MONITOR_DETAIL)),
    });
    return {
      recoveryAction: STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL,
      note: noteKind === 'session' ? note.replace(' state ', ' session ') : note,
      sessionAuthority,
    };
  }

  const stopResult = await terminateSession(active.session_key, {
    ...sessionLifecyclePolicies(config),
    runtime: runtimeName(active),
    model: selectTruthyValue(() => (active.model), () => (null)),
    agentId: selectTruthyValue(() => (active.agent_id), () => (null)),
    label: selectTruthyValue(() => (selectTruthyValue(() => (gatewayLabel), () => (diagnosticLabel))), () => (null)),
    cleanup: async () => {
      if (runtimeName(active)?.toLowerCase() !== 'subagent') {
        await (reaperAfterKill as any)(selectTruthyValue(() => (active.agent_id), () => (null)), active.session_key, selectTruthyValue(() => (selectTruthyValue(() => (gatewayLabel), () => (diagnosticLabel))), () => (null)));
      }
    },
  }) as AnyRecord;

  if (stopResult.unconfirmed) {
    await recordUnconfirmedRecoveryBlock(config, {
      scope,
      moduleId,
      gateId,
      gateType,
      previousPhase,
      attempt,
      dispatchId,
      gatewayLabel,
      sessionKey: selectDefinedValue(() => (active.session_key), () => (null)),
      diagnosticLabel,
      statusBeforeReset,
      activeSessionPath,
      stopResult,
      sessionAuthority: buildRecoverySessionAuthority(config, active, {
        confirmed: false,
        state: selectTruthyValue(() => (stopResult?.state), () => (null)),
        observed_via: 'kill_confirmation',
      }),
    });
    throw new Error(`${unconfirmedErrorSubject} could not be confirmed stopped (${selectTruthyValue(() => (stopResult?.state), () => ('stop_confirmation_state_missing'))})`);
  }

  const note = describeStaleRecovery(previousPhase, STALE_RECOVERY_ACTIONS.KILLED_ORPHAN, {
    sessionKey: active.session_key,
  });
  return {
    recoveryAction: STALE_RECOVERY_ACTIONS.KILLED_ORPHAN,
    note: noteKind === 'session' ? note.replace(' state ', ' session ') : note,
    sessionAuthority,
  };
}

function runRefs(config: AnyRecord, scope: string, id: string, sessionKey: string | null): AnyRecord {
  const runId = recoveryRunId(config);
  const recoveryId = `recovery_blocked:${selectTruthyValue(() => (runId), () => ('no-run-id'))}:${scope}:${selectTruthyValue(() => (id), () => ('missing_recovery_target_id'))}:${selectTruthyValue(() => (sessionKey), () => ('no-session'))}`;
  return {
    primary_ref: { kind: 'recovery_blocked', id: recoveryId },
    run_id: runId,
    run_ref: runId ? `run:${runId}` : null,
  };
}

async function recordUnconfirmedRecoveryBlock(config: AnyRecord, {
  scope,
  moduleId = null,
  gateId = null,
  gateType = null,
  previousPhase = 'missing_previous_phase',
  attempt = null,
  dispatchId = null,
  gatewayLabel = null,
  sessionKey = null,
  diagnosticLabel = null,
  statusBeforeReset = null,
  activeSessionPath = null,
  stopResult = null,
  recoveryAction = 'kill_unconfirmed',
  reason: explicitReason = null,
  sessionAuthority = null,
} : AnyRecord = {}): Promise<void> {
  const id = selectTruthyValue(() => (selectTruthyValue(() => (moduleId), () => (gateId))), () => ('missing_recovery_target_id'));
  const reason = selectTruthyValue(() => (explicitReason), () => (`Recovery blocked: stale ${scope} session stop was not confirmed (${selectTruthyValue(() => (stopResult?.state), () => ('stop_confirmation_state_missing'))})`));
  try {
    appendLifecycleEvent(config, {
      type: 'recovery.stale_blocked',
      refs: runRefs(config, scope, id, sessionKey),
      data: {
        scope,
        module_id: moduleId,
        gate_id: gateId,
        gate_type: gateType,
        previous_phase: previousPhase,
        attempt,
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
        diagnostic_label: diagnosticLabel,
        status_before_reset: statusBeforeReset,
        active_session_path: activeSessionPath,
        recovery_action: recoveryAction,
        recovery_target_status: 'unchanged',
        stop_requested: stopResult?.requested === true,
        stop_confirmed: stopResult?.confirmed === true,
        stop_state: selectTruthyValue(() => (stopResult?.state), () => (null)),
        session_authority: sessionAuthority,
        cleanup_attempted: stopResult?.cleanupAttempted === true,
        reason,
      },
    });
  } catch (eventError) {
    log('WARN', `[stale-reconcile] failed to append recovery blocked event for ${scope} ${id}: ${errorMessage(eventError)}`);
  }

  try {
    const title = scope === 'gate'
      ? `Gate ${gateId} — Stale ${previousPhase} recovery blocked`
      : `Module ${moduleId} — Stale ${previousPhase} recovery blocked`;
    const fields = scope === 'gate'
      ? buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: recoveryRunId(config), gate_id: gateId, gate_type: gateType, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey })
      : buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: recoveryRunId(config), module_id: moduleId, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey });
    const correlation = buildRecoveryDiscordCorrelation({
      runId: recoveryRunId(config),
      moduleId,
      gateId,
      gateType,
      attempt,
      dispatchId,
      gatewayLabel,
      sessionKey,
    });
    await discord(config, 'CRITICAL', title, `${reason}. Recovery state was left intact; manual intervention is required before retry.`, [
      ...fields,
      ...diagnosticLabelField(diagnosticLabel),
      { name: 'Previous Phase', value: previousPhase, inline: true },
      { name: 'Recovery Action', value: recoveryAction, inline: true },
      { name: 'Status Reset To', value: 'unchanged', inline: true },
      { name: 'Action', value: 'Manually stop or verify the stale child session, then resume.', inline: false },
    ], { correlation });
  } catch (discordError) {
    log('WARN', `[stale-reconcile] failed to emit recovery blocked Discord for ${scope} ${id}: ${errorMessage(discordError)}`);
  }
}

export { PIPELINE_RUN_CONCURRENCY_LIMIT, acquirePipelineRunLock, releasePipelineRunLock } from './pipeline-runner-lock.ts';

export async function reconcileStaleModuleState(config: AnyRecord, progress: AnyRecord): Promise<void> {
  const now = new Date().toISOString();
  const moduleEntries = Object.entries(objectRecord(progress.modules)) as [string, AnyRecord][];
  for (const [moduleId, mod] of moduleEntries) {
    const dir = recoveryModuleDir(moduleId, mod);
    const status = loadStatus(config, dir);
    if (!status) continue;
    if (!['IN_PROGRESS', 'TESTING'].includes(status.status)) continue;
    const oldStatus = status.status;

    let shouldReset = false;
    let note = null;
    let recoveryAction = null;
    let sessionAuthority = null;
    const active = selectTruthyValue(() => (status.active_agent), () => (null));
    const previousPhase = selectTruthyValue(() => (status.current_phase), () => ('missing_phase'));
    const recoveryAttempt = resolveRecoveryAttempt(status, active);
    const recoveryGatewayLabel = resolveRecoveryGatewayLabel(status, active);
    const recoveryDiagnosticLabel = resolveDiagnosticLabel(active);

    if (active?.session_key) {
      try {
        const recovered = await reconcileActiveStaleSession(config, {
          scope: 'module',
          moduleId,
          previousPhase,
          attempt: recoveryAttempt,
          dispatchId: selectDefinedValue(() => (active.dispatch_id), () => (null)),
          gatewayLabel: recoveryGatewayLabel,
          sessionKey: selectDefinedValue(() => (active.session_key), () => (null)),
          diagnosticLabel: recoveryDiagnosticLabel,
          statusBeforeReset: oldStatus,
          active,
          monitorIdentity: { module_id: moduleId },
        });
        shouldReset = true;
        recoveryAction = recovered.recoveryAction;
        note = recovered.note;
        sessionAuthority = recovered.sessionAuthority;
        if (shouldPreserveTerminalModuleRecovery({ previousPhase, recoveryAction })) {
          const recoveryDispatchId = recoveryDispatchIdValue(active, status);
          const recoverySessionKey = recoverySessionKeyValue(active, status);
          appendStaleRecoveryLifecycleEvent(config, {
            moduleId,
            dir,
            status,
            attempt: recoveryAttempt,
            recoveryTargetStatus: oldStatus,
            recoveryTargetPhase: previousPhase,
            recoveryAction,
            reason: note,
            sessionKey: recoverySessionKey,
            dispatchId: recoveryDispatchId,
            gatewayLabel: recoveryGatewayLabel,
            staleEvidence: {
              previous_phase: previousPhase,
              observed_via: 'session_monitor',
              status_before_reset: oldStatus,
              diagnostic_label: recoveryDiagnosticLabel,
              session_authority: sessionAuthority,
              preserve_for_completion_polling: true,
            },
            occurredAt: now,
          });
          shouldReset = false;
          log('INFO', `[stale-reconcile] ${moduleId}: ${note}; preserving active Buster dispatch for phase-owned completion polling`);
        }
      } catch (e) {
        throw new Error(`Failed to reconcile stale ${previousPhase} session for module ${moduleId}: ${errorMessage(e)}`);
      }
    } else if (status.updated_at) {
      const ageMs = Date.now() - new Date(status.updated_at).getTime();
      if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
        recoveryAction = STALE_RECOVERY_ACTIONS.RESET_WITHOUT_SESSION;
        note = `Stale ${previousPhase} status for module ${moduleId} has no typed active session evidence; refusing age-only reset`;
        appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
          reason: 'stale_module_recovery_requires_session_evidence',
          module_id: moduleId,
          previous_phase: previousPhase,
          status_before_reset: oldStatus,
          inactivity_minutes: Math.round(ageMs / 60000),
          recovery_action: recoveryAction,
          status_reset_to: 'unchanged',
        }, {
          severity: 'WARN',
          source: 'stale_module_recovery',
          emitter: 'nova/pipeline/runners/pipeline-runner-recovery',
        });
        log('WARN', `[stale-reconcile] ${moduleId}: ${note}`);
      }
    }

    if (!shouldReset) continue;
    const recoveryDispatchId = recoveryDispatchIdValue(active, status);
    const recoverySessionKey = recoverySessionKeyValue(active, status);
    const recoveryTargetStatus = getRetryStatusForPhase(previousPhase);
    const recoveryActionForReset = requireRecoveryAction(recoveryAction, 'module', moduleId);
    appendStaleRecoveryLifecycleEvent(config, {
      moduleId,
      dir,
      status,
      attempt: recoveryAttempt,
      recoveryTargetStatus,
      recoveryAction: recoveryActionForReset,
      reason: note,
      sessionKey: recoverySessionKey,
      dispatchId: recoveryDispatchId,
      gatewayLabel: recoveryGatewayLabel,
      staleEvidence: {
        previous_phase: previousPhase,
        observed_via: active?.session_key ? 'session_monitor' : 'status_age',
        status_before_reset: oldStatus,
        diagnostic_label: recoveryDiagnosticLabel,
        session_authority: sessionAuthority,
      },
      occurredAt: now,
    });
    let recoveryTransition = transitionModuleStatus(status, recoveryTargetStatus, {
      now,
      note,
      clearActiveAgent: true,
    });
    if (recoveryTargetStatus === 'PENDING') {
      recoveryTransition = markModuleLifecycleIntent(status, 'stale_recovery_reset_for_retry', {
        oldStatus,
        newStatus: recoveryTransitionStatus(status, recoveryTargetStatus),
        previousPhase,
        phase: selectTruthyValue(() => (status.current_phase), () => (null)),
        now,
        note,
      });
    }
    saveStatus(config, dir, status, recoveryTransition as any);
    onModuleStatusChanged({ config, runId: selectDefinedValue(() => (recoveryRunId(config)), () => ('')) }, moduleId, {
      title: selectTruthyValue(() => (mod?.title), () => (null)),
      old_status: oldStatus,
      new_status: selectTruthyValue(() => (status.status), () => (null)),
      phase: previousPhase,
      attempt: recoveryAttempt,
      dispatch_id: recoveryDispatchId,
      gateway_label: recoveryGatewayLabel,
      session_key: recoverySessionKey,
      reason: note,
    });
    log('WARN', `[stale-reconcile] ${moduleId}: ${note}`);
    try {
      const recoveryDiscordCorrelation = buildRecoveryDiscordCorrelation({
        runId: recoveryRunId(config),
        moduleId,
        attempt: recoveryAttempt,
        dispatchId: recoveryDispatchId,
        gatewayLabel: recoveryGatewayLabel,
        sessionKey: recoverySessionKey,
      });
      await discord(config, 'WARN', `Module ${moduleId} — Recovered stale ${previousPhase} state`,
        `${note}. No new Buster suite ran yet; the pipeline only cleared old interrupted state before retrying.`, [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: recoveryRunId(config), module_id: moduleId, attempt: recoveryAttempt, dispatch_id: recoveryDispatchId, gateway_label: recoveryGatewayLabel, session_key: recoverySessionKey }),
          ...diagnosticLabelField(recoveryDiagnosticLabel),
          { name: 'Previous Phase', value: previousPhase, inline: true },
          { name: 'Recovery Action', value: recoveryActionForReset, inline: true },
          { name: 'Status Reset To', value: selectDefinedValue(() => (textValue(status.status)), () => (PENDING_STATUS)), inline: true },
          { name: 'Meaning', value: 'No fresh suite result exists yet. This message is recovery from an earlier interrupted child session.', inline: false },
        ], { correlation: recoveryDiscordCorrelation });
    } catch (e) {
      log('DEBUG', `Failed to send stale module recovery Discord notice for ${moduleId}: ${errorMessage(e)}`);
    }
  }
}

export async function reconcileStaleGateSessions(config: AnyRecord, progress: AnyRecord): Promise<void> {
  if (!ensureProjectLogDir(config)) return;

  for (const gateId of Object.keys(objectRecord(progress.gates))) {
    const recoveryEvidence = resolveGateActiveSessionRecoveryEvidence(config, gateId);
    const activePath = recoveryEvidence.path;
    if (!recoveryEvidence.has_recovery_evidence) continue;

    const active = recoveryEvidence.active;
    if (!active?.session_key) {
      const weakLifecycle = selectTruthyValue(() => (recoveryEvidence.policy?.lifecycle_active_session), () => (null));
      if (weakLifecycle) {
        await recordUnconfirmedRecoveryBlock(config, {
          scope: 'gate',
          gateId,
          gateType: getProgressGateType(progress, gateId),
          previousPhase: selectDefinedValue(() => (textValue(weakLifecycle.phase)), () => (GATE_RECOVERY_PHASE)),
          attempt: selectDefinedValue(() => (weakLifecycle.attempt), () => (null)),
          dispatchId: selectTruthyValue(() => (weakLifecycle.dispatch_id), () => (null)),
          gatewayLabel: selectTruthyValue(() => (weakLifecycle.gateway_label), () => (null)),
          sessionKey: selectTruthyValue(() => (weakLifecycle.session_key), () => (null)),
          diagnosticLabel: resolveDiagnosticLabel(weakLifecycle),
          activeSessionPath: activePath,
          stopResult: { requested: false, confirmed: false, state: identityUnconfirmedCode(recoveryEvidence) },
          recoveryAction: 'identity_unconfirmed',
          reason: `Recovery blocked: stale gate session identity was not confirmed (${identityUnconfirmedCode(recoveryEvidence)})`,
          sessionAuthority: recoveryEvidence.policy,
        });
        throw new Error(`stale gate session identity was not confirmed (${identityUnconfirmedCode(recoveryEvidence)})`);
      }
      continue;
    }

    const previousPhase = selectDefinedValue(() => (textValue(active.phase)), () => (GATE_RECOVERY_PHASE));
    const gateType = getProgressGateType(progress, gateId);
    const gateRecoveryGatewayLabel = resolveRecoveryGatewayLabel(null, active);
    const gateRecoveryDiagnosticLabel = resolveDiagnosticLabel(active);
    let note = null;
    let recoveryAction = null;
    let sessionAuthority = null;
    try {
      const recovered = await reconcileActiveStaleSession(config, {
        scope: 'gate',
        gateId,
        gateType,
        previousPhase,
        attempt: selectDefinedValue(() => (active.attempt), () => (null)),
        dispatchId: selectDefinedValue(() => (active.dispatch_id), () => (null)),
        gatewayLabel: gateRecoveryGatewayLabel,
        sessionKey: selectDefinedValue(() => (active.session_key), () => (null)),
        diagnosticLabel: gateRecoveryDiagnosticLabel,
        activeSessionPath: activePath,
        active,
        monitorIdentity: { gate_id: gateId, gate_type: gateType },
        noteKind: 'session',
        unconfirmedErrorSubject: 'orphaned gate session',
      });
      recoveryAction = recovered.recoveryAction;
      note = recovered.note;
      sessionAuthority = recovered.sessionAuthority;
      const gateRecoveryAction = requireRecoveryAction(recoveryAction, 'gate', gateId);

      appendStaleRecoveryLifecycleEvent(config, {
        gateId,
        gateType,
        attempt: selectDefinedValue(() => (active.attempt), () => (null)),
        recoveryTargetStatus: 'PENDING',
        recoveryAction: gateRecoveryAction,
        reason: note,
        sessionKey: selectDefinedValue(() => (active.session_key), () => (null)),
        dispatchId: selectDefinedValue(() => (active.dispatch_id), () => (null)),
        gatewayLabel: gateRecoveryGatewayLabel,
        staleEvidence: {
          previous_phase: previousPhase,
          observed_via: 'session_monitor',
          active_session_path: activePath,
          diagnostic_label: gateRecoveryDiagnosticLabel,
          gate_active_session_recovery_policy: recoveryEvidence.policy,
          gate_active_session_file_parse_error: recoveryEvidence.file_parse_error,
          session_authority: sessionAuthority,
        },
      });
      removeFileIfPresent(activePath);
      log('WARN', `[stale-reconcile] gate ${gateId}: ${note}`);
      try {
        const recoveryDiscordCorrelation = buildRecoveryDiscordCorrelation({
          runId: recoveryRunId(config),
          gateId,
          gateType,
          attempt: selectDefinedValue(() => (active.attempt), () => (null)),
          dispatchId: selectDefinedValue(() => (active.dispatch_id), () => (null)),
          gatewayLabel: gateRecoveryGatewayLabel,
          sessionKey: selectDefinedValue(() => (active.session_key), () => (null)),
        });
        await discord(config, 'WARN', `Gate ${gateId} — Recovered stale ${previousPhase} session`, note, [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: recoveryRunId(config), gate_id: gateId, gate_type: gateType, attempt: selectDefinedValue(() => (active.attempt), () => (null)), dispatch_id: selectDefinedValue(() => (active.dispatch_id), () => (null)), gateway_label: gateRecoveryGatewayLabel, session_key: selectDefinedValue(() => (active.session_key), () => (null)) }),
          ...diagnosticLabelField(gateRecoveryDiagnosticLabel),
          { name: 'Previous Phase', value: previousPhase, inline: true },
          { name: 'Recovery Action', value: gateRecoveryAction, inline: true },
          { name: 'Action', value: 'Cleared stale gate session state', inline: true },
        ], { correlation: recoveryDiscordCorrelation });
      } catch (e) {
        log('DEBUG', `Failed to send stale gate recovery Discord notice for ${gateId}: ${errorMessage(e)}`);
      }
    } catch (e) {
      throw new Error(`Failed to reconcile stale ${previousPhase} session for gate ${gateId}: ${errorMessage(e)}`);
    }
  }
}
