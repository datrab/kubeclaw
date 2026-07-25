import fs from 'fs';
import { getRunId } from '../core/runtime.ts';
import { observeAcpMonitorSurfaces } from '../services/acp-observability.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { reaperAfterKill } from '../agents/shutdown.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { STALE_RECOVERY_ACTIONS, isDefinitivelyStoppedMonitorState, describeStaleRecovery } from '../services/failure-semantics.ts';
import { resolveStatusDispatchId, resolveStatusSessionKey } from '../services/correlation.ts';
import { buildActiveSessionAuthorityPolicy } from '../services/session-authority.ts';
import { firstNonEmptyText as firstTextValue, nonEmptyText as textValue } from '../services/text-values.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { recordUnconfirmedRecoveryBlock } from './pipeline-runner-recovery-block.ts';

type AnyRecord = Record<string, any>;
const TERMINAL_MONITOR_DETAIL = 'terminal';
const IDENTITY_UNCONFIRMED_STATE = 'identity_unconfirmed';
const MODULE_BUSTER_PHASE = 'buster';

export function shouldPreserveTerminalModuleRecovery({ previousPhase, recoveryAction }: AnyRecord): boolean {
  return textValue(previousPhase) === MODULE_BUSTER_PHASE && recoveryAction === STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL;
}

export function runtimeName(active: AnyRecord): string | null {
  return textValue(active.runtime);
}

export function identityUnconfirmedCode(recoveryEvidence: AnyRecord): string {
  return textValue(recoveryEvidence?.policy?.code) ?? IDENTITY_UNCONFIRMED_STATE;
}

export function resolveRecoveryAttempt(status: AnyRecord | null, active: AnyRecord | null = null): number | null {
  const value = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (active?.attempt), () => (status?.current_attempt))), () => (status?.attempt))), () => (null));
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function resolveRecoveryGatewayLabel(status: AnyRecord | null, active: AnyRecord | null = null): string | null {
  return selectDefinedValue(() => (selectDefinedValue(() => (active?.gateway_label), () => (status?.gateway_label))), () => (null));
}

export function resolveDiagnosticLabel(active: AnyRecord | null = null): string | null {
  if (!active?.label) return null;
  if (active?.gateway_label && active.label === active.gateway_label) return null;
  return active.label;
}

export function recoveryModuleDir(moduleId: string, mod: AnyRecord): string {
  const dir = firstTextValue(mod?.dir, moduleId);
  if (!dir) throw new Error(`module ${moduleId}: recovery requires module dir authority`);
  return dir;
}

export function recoveryDispatchIdValue(active: AnyRecord | null, status: AnyRecord | null): string | null {
  return firstTextValue(active?.dispatch_id, resolveStatusDispatchId(status));
}

export function recoverySessionKeyValue(active: AnyRecord | null, status: AnyRecord | null): string | null {
  return firstTextValue(active?.session_key, resolveStatusSessionKey(status));
}

export function requireRecoveryAction(recoveryAction: unknown, scope: string, id: string): string {
  const action = textValue(recoveryAction);
  if (!action) throw new Error(`${scope} ${id}: stale recovery selected without recovery action authority`);
  return action;
}

export function recoveryTransitionStatus(status: AnyRecord, recoveryTargetStatus: string | null): string {
  const statusValue = textValue(status?.status);
  if (statusValue) return statusValue;
  const targetStatus = textValue(recoveryTargetStatus);
  if (targetStatus) return targetStatus;
  throw new Error('stale recovery transition requires status authority');
}

export function diagnosticLabelField(diagnosticLabel: string | null): AnyRecord[] {
  return diagnosticLabel ? [{ name: 'Diagnostic Label', value: diagnosticLabel, inline: true }] : [];
}

export function recoveryRunId(config: AnyRecord): string | null {
  return selectTruthyValue(() => (getRunId(config)), () => (null));
}

export function buildRecoveryDiscordCorrelation({
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

export function removeFileIfPresent(filePath: string | null): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err: any) {
    if ((err as AnyRecord).code !== 'ENOENT') throw err;
  }
}

export function buildRecoverySessionAuthority(_config: AnyRecord, active: AnyRecord | null = null, gatewayEvidence: AnyRecord | null = null): AnyRecord {
  return buildActiveSessionAuthorityPolicy({
    lifecycleActiveSession: selectTruthyValue(() => (active), () => (null)),
    gatewayEvidence,
    requireGatewayConfirmation: Boolean(gatewayEvidence),
  } as AnyRecord) as AnyRecord;
}

export async function assertRecoverySessionIdentityConfirmed(config: AnyRecord, {
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

export async function observeRecoverySession(config: AnyRecord, context: AnyRecord) {
  const { active, monitorIdentity, gatewayLabel, diagnosticLabel, attempt, dispatchId, previousPhase } = context;
  const { monitor } = await observeAcpMonitorSurfaces(config, active.session_key, {
    ...monitorIdentity, gateway_label: gatewayLabel, diagnostic_label: diagnosticLabel,
    session_key: active.session_key, attempt, dispatch_id: dispatchId, agent_type: previousPhase,
  }, { streamLogPath: selectTruthyValue(() => active.stream_log_path, () => null) });
  const stopped = isDefinitivelyStoppedMonitorState(monitor);
  return {
    monitor, stopped,
    authority: buildRecoverySessionAuthority(config, active, {
      confirmed: true, state: stopped ? 'terminal' : 'active', observed_via: 'session_monitor',
    }),
  };
}

export async function terminateRecoverySession(config: AnyRecord, context: AnyRecord) {
  const { active, gatewayLabel, diagnosticLabel } = context;
  const label = selectTruthyValue(() => gatewayLabel, () => diagnosticLabel);
  return terminateSession(active.session_key, {
    ...sessionLifecyclePolicies(config), runtime: runtimeName(active),
    model: selectTruthyValue(() => active.model, () => null), agentId: selectTruthyValue(() => active.agent_id, () => null), label,
    cleanup: async () => {
      if (runtimeName(active)?.toLowerCase() === 'subagent') return;
      await (reaperAfterKill as any)(selectTruthyValue(() => active.agent_id, () => null), active.session_key, label);
    },
  }) as AnyRecord;
}

export async function reconcileActiveStaleSession(config: AnyRecord, context: AnyRecord = {}): Promise<AnyRecord> {
  const normalized: AnyRecord = Object.assign({
    moduleId: null, gateId: null, gateType: null, previousPhase: 'missing_previous_phase',
    active: null, attempt: null, dispatchId: null, gatewayLabel: null, diagnosticLabel: null,
    statusBeforeReset: null, activeSessionPath: null, noteKind: 'state',
    unconfirmedErrorSubject: 'orphaned child session',
  }, context);
  const {
    scope, moduleId, gateId, gateType, previousPhase, active, attempt, dispatchId,
    gatewayLabel, diagnosticLabel, statusBeforeReset, activeSessionPath, noteKind,
    unconfirmedErrorSubject,
  } = normalized;
  await assertRecoverySessionIdentityConfirmed(config, {
    scope, moduleId, gateId, gateType, previousPhase, attempt, dispatchId, gatewayLabel,
    sessionKey: selectTruthyValue(() => active?.session_key, () => null), diagnosticLabel, statusBeforeReset, activeSessionPath, active,
  });
  const observed = await observeRecoverySession(config, normalized);
  if (observed.stopped) {
    const detail = selectTruthyValue(() => firstTextValue(observed.monitor.lastDetail, observed.monitor.lastSummary), () => TERMINAL_MONITOR_DETAIL);
    const note = describeStaleRecovery(previousPhase, STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL, { detail });
    return {
      recoveryAction: STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL,
      note: noteKind === 'session' ? note.replace(' state ', ' session ') : note,
      sessionAuthority: observed.authority,
    };
  }
  const stopResult = await terminateRecoverySession(config, { active, gatewayLabel, diagnosticLabel });
  if (stopResult.unconfirmed) {
    await recordUnconfirmedRecoveryBlock(config, {
      scope, moduleId, gateId, gateType, previousPhase, attempt, dispatchId, gatewayLabel,
      sessionKey: active.session_key, diagnosticLabel, statusBeforeReset, activeSessionPath, stopResult,
      sessionAuthority: buildRecoverySessionAuthority(config, active, {
        confirmed: false, state: selectTruthyValue(() => stopResult?.state, () => null), observed_via: 'kill_confirmation',
      }),
    });
    throw new Error(`${unconfirmedErrorSubject} could not be confirmed stopped (${selectTruthyValue(() => stopResult?.state, () => 'stop_confirmation_state_missing')})`);
  }
  const note = describeStaleRecovery(previousPhase, STALE_RECOVERY_ACTIONS.KILLED_ORPHAN, { sessionKey: active.session_key });
  return {
    recoveryAction: STALE_RECOVERY_ACTIONS.KILLED_ORPHAN,
    note: noteKind === 'session' ? note.replace(' state ', ' session ') : note,
    sessionAuthority: observed.authority,
  };
}
