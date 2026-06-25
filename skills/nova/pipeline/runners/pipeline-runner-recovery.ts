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

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveRecoveryAttempt(status: AnyRecord | null, active: AnyRecord | null = null): number | null {
  const value = active?.attempt ?? status?.current_attempt ?? status?.attempt ?? null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolveRecoveryGatewayLabel(status: AnyRecord | null, active: AnyRecord | null = null): string | null {
  return active?.gateway_label ?? status?.gateway_label ?? null;
}

function resolveDiagnosticLabel(active: AnyRecord | null = null): string | null {
  if (!active?.label) return null;
  if (active?.gateway_label && active.label === active.gateway_label) return null;
  return active.label;
}

function diagnosticLabelField(diagnosticLabel: string | null): AnyRecord[] {
  return diagnosticLabel ? [{ name: 'Diagnostic Label', value: diagnosticLabel, inline: true }] : [];
}

function recoveryRunId(config: AnyRecord): string | null {
  return getRunId(config) || null;
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
    run_id: runId || null,
    module_id: moduleId || null,
    gate_id: gateId || null,
    gate_type: gateType || null,
    attempt: attempt ?? null,
    dispatch_id: dispatchId || null,
    gateway_label: gatewayLabel || null,
    session_key: sessionKey || null,
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
    lifecycleActiveSession: active || null,
    gatewayEvidence,
    requireGatewayConfirmation: Boolean(gatewayEvidence),
  } as AnyRecord) as AnyRecord;
}

async function assertRecoverySessionIdentityConfirmed(config: AnyRecord, {
  scope,
  moduleId = null,
  gateId = null,
  gateType = null,
  previousPhase = 'unknown',
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
  previousPhase = 'unknown',
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
    sessionKey: active?.session_key || null,
    diagnosticLabel,
    statusBeforeReset,
    activeSessionPath,
    active,
  });

  const { monitor: mon } = await observeAcpMonitorSurfaces(config, active.session_key, {
    ...monitorIdentity,
    gateway_label: gatewayLabel,
    diagnostic_label: diagnosticLabel,
    session_key: active.session_key || null,
    attempt,
    dispatch_id: dispatchId || null,
    agent_type: previousPhase,
  }, {
    streamLogPath: active.stream_log_path || null,
  });
  const definitelyStopped = isDefinitivelyStoppedMonitorState(mon);
  const sessionAuthority = buildRecoverySessionAuthority(config, active, {
    confirmed: true,
    state: definitelyStopped ? 'terminal' : 'active',
    observed_via: 'session_monitor',
  });

  if (definitelyStopped) {
    const note = describeStaleRecovery(previousPhase, STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL, {
      detail: mon.lastDetail || mon.lastSummary || 'terminal',
    });
    return {
      recoveryAction: STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL,
      note: noteKind === 'session' ? note.replace(' state ', ' session ') : note,
      sessionAuthority,
    };
  }

  const stopResult = await terminateSession(active.session_key, {
    ...sessionLifecyclePolicies(config),
    runtime: active.runtime || null,
    model: active.model || null,
    agentId: active.agent_id || null,
    label: gatewayLabel || diagnosticLabel || null,
    cleanup: async () => {
      if ((active.runtime || '').toLowerCase() !== 'subagent') {
        await (reaperAfterKill as any)(active.agent_id || null, active.session_key, gatewayLabel || diagnosticLabel || null);
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
      sessionKey: active.session_key || null,
      diagnosticLabel,
      statusBeforeReset,
      activeSessionPath,
      stopResult,
      sessionAuthority: buildRecoverySessionAuthority(config, active, {
        confirmed: false,
        state: stopResult?.state || null,
        observed_via: 'kill_confirmation',
      }),
    });
    throw new Error(`${unconfirmedErrorSubject} could not be confirmed stopped (${stopResult?.state || 'unknown'})`);
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
  const recoveryId = `recovery_blocked:${runId || 'no-run-id'}:${scope}:${id || 'unknown'}:${sessionKey || 'no-session'}`;
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
  previousPhase = 'unknown',
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
  const id = moduleId || gateId || 'unknown';
  const reason = explicitReason || `Recovery blocked: stale ${scope} session stop was not confirmed (${stopResult?.state || 'unknown'})`;
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
        stop_state: stopResult?.state || null,
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
  const moduleEntries = Object.entries(progress.modules || {}) as [string, AnyRecord][];
  for (const [moduleId, mod] of moduleEntries) {
    const dir = mod?.dir || moduleId;
    const status = loadStatus(config, dir);
    if (!status) continue;
    if (!['IN_PROGRESS', 'TESTING'].includes(status.status)) continue;
    const oldStatus = status.status;

    let shouldReset = false;
    let note = null;
    let recoveryAction = null;
    let sessionAuthority = null;
    const active = status.active_agent || null;
    const previousPhase = status.current_phase || 'unknown';
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
          dispatchId: active.dispatch_id || null,
          gatewayLabel: recoveryGatewayLabel,
          sessionKey: active.session_key || null,
          diagnosticLabel: recoveryDiagnosticLabel,
          statusBeforeReset: oldStatus,
          active,
          monitorIdentity: { module_id: moduleId },
        });
        shouldReset = true;
        recoveryAction = recovered.recoveryAction;
        note = recovered.note;
        sessionAuthority = recovered.sessionAuthority;
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
    const recoveryDispatchId = active?.dispatch_id ?? resolveStatusDispatchId(status);
    const recoverySessionKey = active?.session_key || resolveStatusSessionKey(status);
    const recoveryTargetStatus = getRetryStatusForPhase(previousPhase);
    appendStaleRecoveryLifecycleEvent(config, {
      moduleId,
      dir,
      status,
      attempt: recoveryAttempt,
      recoveryTargetStatus,
      recoveryAction,
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
        newStatus: status.status || recoveryTargetStatus,
        previousPhase,
        phase: status.current_phase || null,
        now,
        note,
      });
    }
    saveStatus(config, dir, status, recoveryTransition as any);
    onModuleStatusChanged({ config, runId: recoveryRunId(config) || '' }, moduleId, {
      title: mod?.title || null,
      old_status: oldStatus,
      new_status: status.status || null,
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
          { name: 'Recovery Action', value: recoveryAction || STALE_RECOVERY_ACTIONS.RESET_WITHOUT_SESSION, inline: true },
          { name: 'Status Reset To', value: status.status || 'PENDING', inline: true },
          { name: 'Meaning', value: 'No fresh suite result exists yet. This message is recovery from an earlier interrupted child session.', inline: false },
        ], { correlation: recoveryDiscordCorrelation });
    } catch (e) {
      log('DEBUG', `Failed to send stale module recovery Discord notice for ${moduleId}: ${errorMessage(e)}`);
    }
  }
}

export async function reconcileStaleGateSessions(config: AnyRecord, progress: AnyRecord): Promise<void> {
  if (!ensureProjectLogDir(config)) return;

  for (const gateId of Object.keys(progress.gates || {})) {
    const recoveryEvidence = resolveGateActiveSessionRecoveryEvidence(config, gateId);
    const activePath = recoveryEvidence.path;
    if (!recoveryEvidence.has_recovery_evidence) continue;

    const active = recoveryEvidence.active;
    if (!active?.session_key) {
      const weakLifecycle = recoveryEvidence.policy?.lifecycle_active_session || null;
      if (weakLifecycle) {
        await recordUnconfirmedRecoveryBlock(config, {
          scope: 'gate',
          gateId,
          gateType: getProgressGateType(progress, gateId),
          previousPhase: weakLifecycle.phase || 'gate',
          attempt: weakLifecycle.attempt ?? null,
          dispatchId: weakLifecycle.dispatch_id || null,
          gatewayLabel: weakLifecycle.gateway_label || null,
          sessionKey: weakLifecycle.session_key || null,
          diagnosticLabel: resolveDiagnosticLabel(weakLifecycle),
          activeSessionPath: activePath,
          stopResult: { requested: false, confirmed: false, state: recoveryEvidence.policy?.code || 'identity_unconfirmed' },
          recoveryAction: 'identity_unconfirmed',
          reason: `Recovery blocked: stale gate session identity was not confirmed (${recoveryEvidence.policy?.code || 'identity_unconfirmed'})`,
          sessionAuthority: recoveryEvidence.policy,
        });
        throw new Error(`stale gate session identity was not confirmed (${recoveryEvidence.policy?.code || 'identity_unconfirmed'})`);
      }
      continue;
    }

    const previousPhase = active.phase || 'gate';
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
        attempt: active.attempt ?? null,
        dispatchId: active.dispatch_id || null,
        gatewayLabel: gateRecoveryGatewayLabel,
        sessionKey: active.session_key || null,
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

      appendStaleRecoveryLifecycleEvent(config, {
        gateId,
        gateType,
        attempt: active.attempt ?? null,
        recoveryTargetStatus: 'PENDING',
        recoveryAction: recoveryAction || STALE_RECOVERY_ACTIONS.KILLED_ORPHAN,
        reason: note,
        sessionKey: active.session_key || null,
        dispatchId: active.dispatch_id || null,
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
          attempt: active.attempt ?? null,
          dispatchId: active.dispatch_id || null,
          gatewayLabel: gateRecoveryGatewayLabel,
          sessionKey: active.session_key || null,
        });
        await discord(config, 'WARN', `Gate ${gateId} — Recovered stale ${previousPhase} session`, note, [
          ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, { run_id: recoveryRunId(config), gate_id: gateId, gate_type: gateType, attempt: active.attempt ?? null, dispatch_id: active.dispatch_id || null, gateway_label: gateRecoveryGatewayLabel, session_key: active.session_key || null }),
          ...diagnosticLabelField(gateRecoveryDiagnosticLabel),
          { name: 'Previous Phase', value: previousPhase, inline: true },
          { name: 'Recovery Action', value: recoveryAction || STALE_RECOVERY_ACTIONS.KILLED_ORPHAN, inline: true },
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
