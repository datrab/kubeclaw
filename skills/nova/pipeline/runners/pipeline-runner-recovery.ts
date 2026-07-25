import fs from 'fs';
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
import { errorMessage, firstNonEmptyText as firstTextValue, nonEmptyText as textValue } from '../services/text-values.ts';
import { objectRecord } from '../value-boundary.ts';
import { recordUnconfirmedRecoveryBlock } from './pipeline-runner-recovery-block.ts';
import { shouldPreserveTerminalModuleRecovery, identityUnconfirmedCode, resolveRecoveryAttempt, resolveRecoveryGatewayLabel, resolveDiagnosticLabel, recoveryModuleDir, recoveryDispatchIdValue, recoverySessionKeyValue, requireRecoveryAction, recoveryTransitionStatus, diagnosticLabelField, recoveryRunId, buildRecoveryDiscordCorrelation, removeFileIfPresent, reconcileActiveStaleSession } from './pipeline-runner-recovery-session.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
const TERMINAL_MONITOR_DETAIL = 'terminal';
const IDENTITY_UNCONFIRMED_STATE = 'identity_unconfirmed';
const GATE_RECOVERY_PHASE = 'gate';
const MODULE_BUSTER_PHASE = 'buster';
const PENDING_STATUS = 'PENDING';

export { PIPELINE_RUN_CONCURRENCY_LIMIT, acquirePipelineRunLock, releasePipelineRunLock } from './pipeline-runner-lock.ts';

async function recoverModuleSession(config: AnyRecord, context: AnyRecord) {
  const { moduleId, status, active, previousPhase, oldStatus } = context;
  if (!active?.session_key) {
    if (status.updated_at) {
      const ageMs = Date.now() - new Date(status.updated_at).getTime();
      if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) {
        const note = `Stale ${previousPhase} status for module ${moduleId} has no typed active session evidence; refusing age-only reset`;
        appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
          reason: 'stale_module_recovery_requires_session_evidence', module_id: moduleId,
          previous_phase: previousPhase, status_before_reset: oldStatus,
          inactivity_minutes: Math.round(ageMs / 60000),
          recovery_action: STALE_RECOVERY_ACTIONS.RESET_WITHOUT_SESSION, status_reset_to: 'unchanged',
        }, { severity: 'WARN', source: 'stale_module_recovery', emitter: 'nova/pipeline/runners/pipeline-runner-recovery' });
        log('WARN', `[stale-reconcile] ${moduleId}: ${note}`);
      }
    }
    return null;
  }
  const recovered = await reconcileActiveStaleSession(config, {
    scope: 'module', moduleId, previousPhase, attempt: context.attempt,
    dispatchId: active.dispatch_id ?? null, gatewayLabel: context.gatewayLabel,
    diagnosticLabel: context.diagnosticLabel, statusBeforeReset: oldStatus,
    active, monitorIdentity: { module_id: moduleId },
  });
  return recovered;
}

function preserveBusterRecovery(config: AnyRecord, context: AnyRecord, recovered: AnyRecord) {
  if (!shouldPreserveTerminalModuleRecovery({ previousPhase: context.previousPhase, recoveryAction: recovered.recoveryAction })) return false;
  appendStaleRecoveryLifecycleEvent(config, {
    moduleId: context.moduleId, dir: context.dir, status: context.status, attempt: context.attempt,
    recoveryTargetStatus: context.oldStatus, recoveryTargetPhase: context.previousPhase,
    recoveryAction: recovered.recoveryAction, reason: recovered.note,
    sessionKey: recoverySessionKeyValue(context.active, context.status),
    dispatchId: recoveryDispatchIdValue(context.active, context.status), gatewayLabel: context.gatewayLabel,
    staleEvidence: {
      previous_phase: context.previousPhase, observed_via: 'session_monitor',
      status_before_reset: context.oldStatus, diagnostic_label: context.diagnosticLabel,
      session_authority: recovered.sessionAuthority, preserve_for_completion_polling: true,
    }, occurredAt: context.now,
  });
  log('INFO', `[stale-reconcile] ${context.moduleId}: ${recovered.note}; preserving active Buster dispatch for phase-owned completion polling`);
  return true;
}

function resetRecoveredModule(config: AnyRecord, context: AnyRecord, recovered: AnyRecord) {
  const { moduleId, dir, status, active, previousPhase, now } = context;
  const dispatchId = recoveryDispatchIdValue(active, status);
  const sessionKey = recoverySessionKeyValue(active, status);
  const targetStatus = getRetryStatusForPhase(previousPhase);
  const action = requireRecoveryAction(recovered.recoveryAction, 'module', moduleId);
  appendStaleRecoveryLifecycleEvent(config, {
    moduleId, dir, status, attempt: context.attempt, recoveryTargetStatus: targetStatus,
    recoveryAction: action, reason: recovered.note, sessionKey, dispatchId, gatewayLabel: context.gatewayLabel,
    staleEvidence: {
      previous_phase: previousPhase, observed_via: 'session_monitor', status_before_reset: context.oldStatus,
      diagnostic_label: context.diagnosticLabel, session_authority: recovered.sessionAuthority,
    }, occurredAt: now,
  });
  let transition = transitionModuleStatus(status, targetStatus, { now, note: recovered.note, clearActiveAgent: true });
  if (targetStatus === 'PENDING') transition = markModuleLifecycleIntent(status, 'stale_recovery_reset_for_retry', {
    oldStatus: context.oldStatus, newStatus: recoveryTransitionStatus(status, targetStatus),
    previousPhase, phase: status.current_phase || null, now, note: recovered.note,
  });
  saveStatus(config, dir, status, transition as any);
  return { dispatchId, sessionKey, action };
}

async function notifyModuleRecovery(config: AnyRecord, context: AnyRecord, recovered: AnyRecord, reset: AnyRecord) {
  onModuleStatusChanged({ config, runId: recoveryRunId(config) || '' }, context.moduleId, {
    title: context.mod?.title || null, old_status: context.oldStatus, new_status: context.status.status || null,
    phase: context.previousPhase, attempt: context.attempt, dispatch_id: reset.dispatchId,
    gateway_label: context.gatewayLabel, session_key: reset.sessionKey, reason: recovered.note,
  });
  log('WARN', `[stale-reconcile] ${context.moduleId}: ${recovered.note}`);
  const correlation = buildRecoveryDiscordCorrelation({
    runId: recoveryRunId(config), moduleId: context.moduleId, attempt: context.attempt,
    dispatchId: reset.dispatchId, gatewayLabel: context.gatewayLabel, sessionKey: reset.sessionKey,
  });
  await discord(config, 'WARN', `Module ${context.moduleId} — Recovered stale ${context.previousPhase} state`,
    `${recovered.note}. No new Buster suite ran yet; the pipeline only cleared old interrupted state before retrying.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, correlation),
      ...diagnosticLabelField(context.diagnosticLabel),
      { name: 'Previous Phase', value: context.previousPhase, inline: true },
      { name: 'Recovery Action', value: reset.action, inline: true },
      { name: 'Status Reset To', value: textValue(context.status.status) || PENDING_STATUS, inline: true },
      { name: 'Meaning', value: 'No fresh suite result exists yet. This message is recovery from an earlier interrupted child session.', inline: false },
    ], { correlation });
}

async function reconcileModuleEntry(config: AnyRecord, moduleId: string, mod: AnyRecord, now: string) {
  const dir = recoveryModuleDir(moduleId, mod);
  const status = loadStatus(config, dir);
  if (!status || !['IN_PROGRESS', 'TESTING'].includes(status.status)) return;
  const active = status.active_agent || null;
  const context = {
    moduleId, mod, dir, status, active, now, oldStatus: status.status,
    previousPhase: status.current_phase || 'missing_phase', attempt: resolveRecoveryAttempt(status, active),
    gatewayLabel: resolveRecoveryGatewayLabel(status, active), diagnosticLabel: resolveDiagnosticLabel(active),
  };
  let recovered: AnyRecord | null;
  try { recovered = await recoverModuleSession(config, context); }
  catch (error: unknown) { throw new Error(`Failed to reconcile stale ${context.previousPhase} session for module ${moduleId}: ${errorMessage(error)}`); }
  if (!recovered || preserveBusterRecovery(config, context, recovered)) return;
  const reset = resetRecoveredModule(config, context, recovered);
  try { await notifyModuleRecovery(config, context, recovered, reset); }
  catch (error: unknown) { log('DEBUG', `Failed to send stale module recovery Discord notice for ${moduleId}: ${errorMessage(error)}`); }
}

export async function reconcileStaleModuleState(config: AnyRecord, progress: AnyRecord): Promise<void> {
  const now = new Date().toISOString();
  const entries = Object.entries(objectRecord(progress.modules)) as [string, AnyRecord][];
  for (const [moduleId, mod] of entries) await reconcileModuleEntry(config, moduleId, mod, now);
}

async function blockWeakGateRecovery(config: AnyRecord, progress: AnyRecord, gateId: string, evidence: AnyRecord) {
  const active = evidence.policy?.lifecycle_active_session;
  if (!active) return false;
  const code = identityUnconfirmedCode(evidence);
  await recordUnconfirmedRecoveryBlock(config, {
    scope: 'gate', gateId, gateType: getProgressGateType(progress, gateId),
    previousPhase: textValue(active.phase) || GATE_RECOVERY_PHASE,
    attempt: active.attempt ?? null, dispatchId: active.dispatch_id || null,
    gatewayLabel: active.gateway_label || null, sessionKey: active.session_key || null,
    diagnosticLabel: resolveDiagnosticLabel(active), activeSessionPath: evidence.path,
    stopResult: { requested: false, confirmed: false, state: code }, recoveryAction: 'identity_unconfirmed',
    reason: `Recovery blocked: stale gate session identity was not confirmed (${code})`, sessionAuthority: evidence.policy,
  });
  throw new Error(`stale gate session identity was not confirmed (${code})`);
}

async function notifyGateRecovery(config: AnyRecord, context: AnyRecord, recovered: AnyRecord, action: string) {
  const correlation = buildRecoveryDiscordCorrelation({
    runId: recoveryRunId(config), gateId: context.gateId, gateType: context.gateType,
    attempt: context.active.attempt ?? null, dispatchId: context.active.dispatch_id ?? null,
    gatewayLabel: context.gatewayLabel, sessionKey: context.active.session_key,
  });
  await discord(config, 'WARN', `Gate ${context.gateId} — Recovered stale ${context.previousPhase} session`, recovered.note, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, correlation),
    ...diagnosticLabelField(context.diagnosticLabel),
    { name: 'Previous Phase', value: context.previousPhase, inline: true },
    { name: 'Recovery Action', value: action, inline: true },
    { name: 'Action', value: 'Cleared stale gate session state', inline: true },
  ], { correlation });
}

async function reconcileGateEntry(config: AnyRecord, progress: AnyRecord, gateId: string) {
  const evidence = resolveGateActiveSessionRecoveryEvidence(config, gateId);
  if (!evidence.has_recovery_evidence) return;
  const active = evidence.active;
  if (!active?.session_key) { await blockWeakGateRecovery(config, progress, gateId, evidence); return; }
  const context = {
    gateId, gateType: getProgressGateType(progress, gateId), active,
    previousPhase: textValue(active.phase) || GATE_RECOVERY_PHASE,
    gatewayLabel: resolveRecoveryGatewayLabel(null, active), diagnosticLabel: resolveDiagnosticLabel(active),
  };
  try {
    const recovered = await reconcileActiveStaleSession(config, {
      scope: 'gate', ...context, attempt: active.attempt ?? null, dispatchId: active.dispatch_id ?? null,
      activeSessionPath: evidence.path, monitorIdentity: { gate_id: gateId, gate_type: context.gateType },
      noteKind: 'session', unconfirmedErrorSubject: 'orphaned gate session',
    });
    const action = requireRecoveryAction(recovered.recoveryAction, 'gate', gateId);
    appendStaleRecoveryLifecycleEvent(config, {
      gateId, gateType: context.gateType, attempt: active.attempt ?? null,
      recoveryTargetStatus: 'PENDING', recoveryAction: action, reason: recovered.note,
      sessionKey: active.session_key, dispatchId: active.dispatch_id ?? null, gatewayLabel: context.gatewayLabel,
      staleEvidence: {
        previous_phase: context.previousPhase, observed_via: 'session_monitor', active_session_path: evidence.path,
        diagnostic_label: context.diagnosticLabel, gate_active_session_recovery_policy: evidence.policy,
        gate_active_session_file_parse_error: evidence.file_parse_error, session_authority: recovered.sessionAuthority,
      },
    });
    removeFileIfPresent(evidence.path);
    log('WARN', `[stale-reconcile] gate ${gateId}: ${recovered.note}`);
    try { await notifyGateRecovery(config, context, recovered, action); }
    catch (error: unknown) { log('DEBUG', `Failed to send stale gate recovery Discord notice for ${gateId}: ${errorMessage(error)}`); }
  } catch (error: unknown) {
    throw new Error(`Failed to reconcile stale ${context.previousPhase} session for gate ${gateId}: ${errorMessage(error)}`);
  }
}
export async function reconcileStaleGateSessions(config: AnyRecord, progress: AnyRecord): Promise<void> {
  if (!ensureProjectLogDir(config)) return;
  for (const gateId of Object.keys(objectRecord(progress.gates))) {
    await reconcileGateEntry(config, progress, gateId);
  }
}
