import fs from 'fs';
import path from 'path';
import { gateActiveSessionPath } from '../core/paths.ts';
import { log } from '../core/logger.ts';
import { loadLifecycleReadModels } from './status-store-lifecycle.ts';
import { inspectContendedLock, requireConfiguredNumber as requireNumber, sleepSync, writeJsonAtomic } from './file-lock-primitives.ts';
import {
  buildActiveSessionConfirmation,
  hasStrongActiveSessionIdentity,
  normalizeActiveSessionIdentity,
} from './session-authority.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const GATE_ACTIVE_SESSION_EVIDENCE_ROLES = Object.freeze({
  LIFECYCLE_AUTHORITY: 'lifecycle_read_model_authority',
  RECOVERY_EVIDENCE: 'gate_active_session_recovery_evidence',
  RUNTIME_EVIDENCE: 'tracked_agent_runtime_evidence',
  ABSENT: 'absent',
});

function errorMessage(error: any) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

function withGateActiveSessionMutationLock(config: any, activeSessionPath: any, fn: any, opts: any = {}) {
  const lockConfig = config?.locks?.gate_active_session;
  const staleMs = opts.staleMs
  const timeoutMs = opts.timeoutMs
  const lockPath = `${activeSessionPath}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const ownerToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({
        pid: process.pid,
        token: ownerToken,
        acquired_at: new Date().toISOString(),
      }) + '\n');
      break;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      const lockState = inspectContendedLock(lockPath, path.join(lockPath, 'owner.json'), staleMs);
      if (lockState === 'missing') continue;
      if (lockState === 'remove') {
        fs.rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`timed out waiting for gate active-session lock: ${lockPath}`);
      }
      sleepSync(25);
    }
  }

  try {
    return fn();
  } finally {
    try {
      const owner = JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
      if (owner?.token === ownerToken) {
        fs.rmSync(lockPath, { recursive: true, force: true });
      }
    } catch { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */}
  }
}

function readJsonIfPresent(filePath: any) {
  if (selectTruthyValue(() => (!filePath), () => (!fs.existsSync(filePath)))) return { exists: false, data: null };
  try {
    return { exists: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (error: any) {
    return { exists: true, data: null, parse_error: errorMessage(error) };
  }
}

function firstDefined(...values: any) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizeGateActiveSessionEntry(entry: any = null, gateId: any = null, { requireStrong = false }: any = {}) {
  if (selectTruthyValue(() => (!entry), () => (typeof entry !== 'object'))) return null;
  const identity = normalizeActiveSessionIdentity(entry);
  if (requireStrong && !hasStrongActiveSessionIdentity(identity)) return null;
  return {
    ...entry,
    gate_id: selectTruthyValue(() => (selectTruthyValue(() => (entry.gate_id), () => (gateId))), () => (null)),
    run_id: identity.run_id,
    attempt: identity.attempt,
    dispatch_id: identity.dispatch_id,
    session_key: identity.session_key,
    gateway_label: identity.gateway_label,
    label: selectTruthyValue(() => (selectTruthyValue(() => (entry.label), () => (identity.diagnostic_label))), () => (null)),
    runtime: identity.runtime,
    model: identity.model,
    stream_log_path: identity.stream_log_path,
    agent_id: selectTruthyValue(() => (selectTruthyValue(() => (entry.agent_id), () => (entry.agentId))), () => (null)),
  };
}

function normalizeGateActiveSessionCleanupIdentity(identity: any = null) {
  if (selectTruthyValue(() => (!identity), () => (typeof identity !== 'object'))) return null;
  return normalizeActiveSessionIdentity({
    run_id: firstDefined(identity.run_id, identity.runId),
    attempt: firstDefined(identity.attempt, identity.telemetry_attempt),
    dispatch_id: selectDefinedValue(() => (identity.dispatch_id), () => (identity.telemetry_dispatch_id)),
    session_key: firstDefined(identity.session_key, identity.sessionKey, identity.childSessionKey),
    gateway_label: firstDefined(identity.gateway_label, identity.gatewayLabel),
  });
}

function hasGateRecoveryEvidence(policy: any, fileRead: any) {
  return Boolean(selectTruthyValue(() => (selectTruthyValue(() => (policy.recovery_identity), () => (policy.gate_active_session_file))), () => (fileRead.parse_error)));
}

function strongGateActiveSessionIdentityMatches(expectedIdentity: any = null, observedIdentity: any = null) {
  const confirmation = buildActiveSessionConfirmation(selectDefinedValue(() => (expectedIdentity), () => ({})), selectDefinedValue(() => (observedIdentity), () => ({})));
  return confirmation.missing_expected_fields.length === 0
    && confirmation.missing_observed_fields.length === 0
    && confirmation.mismatched_fields.length === 0;
}

function getLifecycleGateActiveSession(config: any, gateId: any) {
  if (!gateId) return null;
  return normalizeGateActiveSessionEntry(
    selectTruthyValue(() => (loadLifecycleReadModels(config)?.active_sessions?.gates?.[gateId]), () => (null)),
    gateId,
    { requireStrong: true },
  );
}

export function buildGateActiveSessionRecoveryPolicy({
  gateId = null,
  lifecycleActiveSession = null,
  gateActiveSessionFile = null,
  trackedAgent = null,
}: any = {}) {
  const lifecycleIdentity = normalizeGateActiveSessionEntry(lifecycleActiveSession, gateId, { requireStrong: true });
  const fileIdentity = normalizeGateActiveSessionEntry(gateActiveSessionFile, gateId, { requireStrong: true });
  const trackedIdentity = normalizeGateActiveSessionEntry(trackedAgent, gateId, { requireStrong: true });
  const hasLifecycleAuthority = hasStrongActiveSessionIdentity(selectDefinedValue(() => (lifecycleIdentity), () => ({})));
  const fileConfirmation = activeSessionConfirmation(hasLifecycleAuthority, lifecycleIdentity, fileIdentity);
  const trackedConfirmation = activeSessionConfirmation(hasLifecycleAuthority, lifecycleIdentity, trackedIdentity);
  const fileConflicts = Boolean(fileConfirmation && fileConfirmation.confirmed !== true);
  const trackedConflicts = Boolean(trackedConfirmation && trackedConfirmation.confirmed !== true);

  const code = gateRecoveryCode({ hasLifecycleAuthority, fileConflicts, fileIdentity, trackedIdentity });

  return {
    code,
    gate_id: gateId,
    active_session_authority_source: hasLifecycleAuthority ? 'lifecycle_read_model' : null,
    lifecycle_active_session_role: evidenceRole(hasLifecycleAuthority, GATE_ACTIVE_SESSION_EVIDENCE_ROLES.LIFECYCLE_AUTHORITY),
    gate_active_session_file_role: evidenceRole(fileIdentity, GATE_ACTIVE_SESSION_EVIDENCE_ROLES.RECOVERY_EVIDENCE),
    tracked_agent_role: evidenceRole(trackedIdentity, GATE_ACTIVE_SESSION_EVIDENCE_ROLES.RUNTIME_EVIDENCE),
    allow_status_active_agent_authority: false,
    allow_gate_active_session_file_authority: false,
    allow_tracked_agent_authority: false,
    allow_evidence_hydration: false,
    authoritative_identity: hasLifecycleAuthority ? lifecycleIdentity : null,
    recovery_identity: hasLifecycleAuthority ? lifecycleIdentity : null,
    lifecycle_active_session: lifecycleIdentity,
    gate_active_session_file: fileIdentity,
    tracked_agent: trackedIdentity,
    file_identity_confirmation: fileConfirmation,
    tracked_identity_confirmation: trackedConfirmation,
    gate_active_session_file_conflicts_with_lifecycle: fileConflicts,
    tracked_agent_conflicts_with_lifecycle: trackedConflicts,
  };
}

function activeSessionConfirmation(hasAuthority: boolean, authority: any, candidate: any) {
  return hasAuthority && candidate ? buildActiveSessionConfirmation(authority, candidate) : null;
}

function evidenceRole(present: any, role: string) {
  return present ? role : GATE_ACTIVE_SESSION_EVIDENCE_ROLES.ABSENT;
}

function gateRecoveryCode({ hasLifecycleAuthority, fileConflicts, fileIdentity, trackedIdentity }: any) {
  if (hasLifecycleAuthority && fileConflicts) return 'lifecycle_active_session_overrides_conflicting_gate_file';
  if (hasLifecycleAuthority) return 'lifecycle_active_session_authoritative';
  if (fileIdentity) return 'gate_active_session_file_diagnostic_only';
  if (trackedIdentity) return 'tracked_agent_runtime_evidence_only';
  return 'no_gate_active_session_evidence';
}

export function resolveGateActiveSessionRecoveryEvidence(config: any, gateId: any, { trackedAgent = null }: any = {}) {
  const activeSessionPath = gateActiveSessionPath(config, gateId);
  const fileRead = readJsonIfPresent(activeSessionPath);
  const policy = buildGateActiveSessionRecoveryPolicy({
    gateId,
    lifecycleActiveSession: getLifecycleGateActiveSession(config, gateId),
    gateActiveSessionFile: fileRead.data,
    trackedAgent,
  });
  return {
    gate_id: gateId,
    path: activeSessionPath,
    file_exists: fileRead.exists === true,
    file_parse_error: selectTruthyValue(() => (fileRead.parse_error), () => (null)),
    file: fileRead.data,
    policy,
    active: policy.recovery_identity,
    has_recovery_evidence: hasGateRecoveryEvidence(policy, fileRead),
  };
}

export function persistGateActiveSession(config: any, gateId: any, label: any, entry: any, extra: any = {}) {
  const activeSessionPath = gateActiveSessionPath(config, gateId); if (!activeSessionPath) return false;
  const identity = normalizeActiveSessionIdentity({
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (extra.run_id), () => (entry?.run_id))), () => (config?._runId))), () => (config?.run_id))), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (extra.attempt), () => (entry?.attempt))), () => (entry?.telemetry_attempt))), () => (null)),
    dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (extra.dispatch_id), () => (entry?.dispatch_id))), () => (entry?.telemetry_dispatch_id))), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (entry?.sessionKey), () => (entry?.session_key))), () => (extra.session_key))), () => (null)),
    gateway_label: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (extra.gateway_label), () => (entry?.gatewayLabel))), () => (entry?.gateway_label))), () => (null)),
    runtime: selectTruthyValue(() => (selectTruthyValue(() => (entry?.runtime), () => (extra.runtime))), () => (null)),
    model: selectTruthyValue(() => (selectTruthyValue(() => (entry?.model), () => (extra.model))), () => (null)),
    stream_log_path: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (entry?.streamLogPath), () => (entry?.stream_log_path))), () => (extra.stream_log_path))), () => (null)),
  });
  if (!hasStrongActiveSessionIdentity(identity)) {
    log('DEBUG', `Skipping weak gate active-session evidence for ${gateId}: incomplete identity`);
    return false;
  }
  return withGateActiveSessionMutationLock(config, activeSessionPath, () => {
    writeJsonAtomic(activeSessionPath, {
      ...extra,
      gate_id: gateId,
      label,
      run_id: identity.run_id,
      attempt: identity.attempt,
      dispatch_id: identity.dispatch_id,
      session_key: identity.session_key,
      stream_log_path: identity.stream_log_path,
      gateway_label: identity.gateway_label,
      runtime: identity.runtime,
      model: identity.model,
      agent_id: selectTruthyValue(() => (selectTruthyValue(() => (entry?.agentId), () => (entry?.agent_id))), () => (null)),
      tracked_at: new Date().toISOString(),
    });
    return true;
  });
}

export function clearGateActiveSession(config: any, gateId: any, expectedIdentity: any = null) {
  const activeSessionPath = gateActiveSessionPath(config, gateId); if (!activeSessionPath) return;
  const expected = normalizeGateActiveSessionCleanupIdentity(expectedIdentity);
  if (expectedIdentity && !hasStrongActiveSessionIdentity(expected)) {
    log('DEBUG', `Skipping active gate session cleanup for ${gateId}: incomplete expected identity`);
    return false;
  }
  return withGateActiveSessionMutationLock(config, activeSessionPath, () => {
    if (expectedIdentity) {
      const current = readJsonIfPresent(activeSessionPath);
      if (!current.exists) return false;
      const observed = normalizeGateActiveSessionEntry(current.data, gateId, { requireStrong: true });
      if (!strongGateActiveSessionIdentityMatches(expected, observed)) {
        log('DEBUG', `Skipping active gate session cleanup for ${gateId}: current identity does not match expected session`);
        return false;
      }
    }
    try {
      fs.unlinkSync(activeSessionPath);
      return true;
    } catch (e: any) {
      if (e?.code !== 'ENOENT') log('DEBUG', `Failed to clear active gate session for ${gateId}: ${selectTruthyValue(() => (e?.message), () => (e))}`);
      return false;
    }
  });
}
