import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/session-authority.js — active session authority policy helpers
//
// Event-sourced lifecycle read models own active-session authority. Persisted
// status.active_agent, active-session JSON files, and process-local tracked
// agents are diagnostic evidence only and must never rehydrate authority.

export const STRONG_ACTIVE_SESSION_IDENTITY_FIELDS = Object.freeze([
  'run_id',
  'attempt',
  'dispatch_id',
  'session_key',
]);

const OPTIONAL_ACTIVE_SESSION_IDENTITY_FIELDS = Object.freeze([
  'gateway_label',
]);

const ACTIVE_SESSION_EVIDENCE_ROLES = Object.freeze({
  LIFECYCLE_AUTHORITY: 'lifecycle_read_model_authority',
  CONFIRMED_DIAGNOSTIC_EVIDENCE: 'confirmed_diagnostic_evidence',
  DIAGNOSTIC_EVIDENCE: 'diagnostic_evidence',
  ABSENT: 'absent',
});

function normalizeText(value: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeAttempt(value: any) {
  if (typeof value === 'number' && Number.isFinite(value)) return normalizeText(value);
  return typeof value === 'string' ? normalizeText(value) : null;
}

function identityAttempt(identity: any = {}, defaults: any = {}) {
  return normalizeAttempt(selectDefinedValue(() => (identity?.attempt), () => (defaults?.attempt)));
}

function identityRuntime(identity: any = {}, defaults: any = {}) {
  return normalizeText(selectDefinedValue(() => (identity?.runtime), () => (defaults?.runtime)));
}

function identityModel(identity: any = {}, defaults: any = {}) {
  return normalizeText(selectDefinedValue(() => (identity?.model), () => (defaults?.model)));
}

function hasAnySessionEvidence(identity: any = {}) {
  if (selectTruthyValue(() => (!identity), () => (typeof identity !== 'object'))) return false;
  return [
    ...STRONG_ACTIVE_SESSION_IDENTITY_FIELDS,
    ...OPTIONAL_ACTIVE_SESSION_IDENTITY_FIELDS,
    'diagnostic_label',
    'label',
    'runtime',
    'model',
    'stream_log_path',
  ].some((field: any) => normalizeText(identity[field]) !== null);
}

export function normalizeActiveSessionIdentity(identity: any = {}, defaults: any = {}) {
  return {
    run_id: normalizeText(identity?.run_id),
    attempt: identityAttempt(identity, defaults),
    dispatch_id: normalizeText(identity?.dispatch_id),
    session_key: normalizeText(identity?.session_key),
    gateway_label: normalizeText(identity?.gateway_label),
    diagnostic_label: normalizeText(identity?.diagnostic_label),
    runtime: identityRuntime(identity, defaults),
    model: identityModel(identity, defaults),
    stream_log_path: normalizeText(identity?.stream_log_path),
  };
}

export function getMissingActiveSessionIdentityFields(identity: any = {}) {
  const normalized = normalizeActiveSessionIdentity(identity);
  return STRONG_ACTIVE_SESSION_IDENTITY_FIELDS.filter((field: any) => !normalized[field]);
}

export function hasStrongActiveSessionIdentity(identity: any = {}) {
  return getMissingActiveSessionIdentityFields(identity).length === 0;
}

export function buildActiveSessionConfirmation(expectedIdentity: any = {}, observedIdentity: any = {}) {
  const expected = normalizeActiveSessionIdentity(expectedIdentity);
  const observed = normalizeActiveSessionIdentity(observedIdentity);
  const missingExpected = getMissingActiveSessionIdentityFields(expected);
  const missingObserved = STRONG_ACTIVE_SESSION_IDENTITY_FIELDS.filter((field: any) => !observed[field]);
  const mismatched = STRONG_ACTIVE_SESSION_IDENTITY_FIELDS.filter((field: any) => (
    expected[field]
      && observed[field]
      && expected[field] !== observed[field]
  ));
  const optionalMismatched = OPTIONAL_ACTIVE_SESSION_IDENTITY_FIELDS.filter((field: any) => (
    expected[field]
      && observed[field]
      && expected[field] !== observed[field]
  ));

  return {
    confirmed: missingExpected.length === 0
      && missingObserved.length === 0
      && mismatched.length === 0
      && optionalMismatched.length === 0,
    expected,
    observed,
    required_fields: [...STRONG_ACTIVE_SESSION_IDENTITY_FIELDS],
    optional_fields: [...OPTIONAL_ACTIVE_SESSION_IDENTITY_FIELDS],
    missing_expected_fields: missingExpected,
    missing_observed_fields: missingObserved,
    mismatched_fields: mismatched,
    optional_mismatched_fields: optionalMismatched,
  };
}

function gatewayEvidenceConfirmed(gatewayEvidence: any) {
  return gatewayEvidence?.confirmed === true;
}

export function buildActiveSessionAuthorityPolicy({
  lifecycleActiveSession = null,
  evidenceActiveSession = null,
  gatewayEvidence = null,
  monitorEvidence = null,
  requireGatewayConfirmation = false,
}: any = {}) {
  const lifecycle = normalizeActiveSessionIdentity(selectDefinedValue(() => (lifecycleActiveSession), () => ({})));
  const evidence = normalizeActiveSessionIdentity(selectDefinedValue(() => (evidenceActiveSession), () => ({})));
  const hasLifecycleEvidence = hasStrongActiveSessionIdentity(lifecycleActiveSession);
  const hasDiagnosticEvidence = hasAnySessionEvidence(evidenceActiveSession);
  const missingLifecycleFields = getMissingActiveSessionIdentityFields(lifecycle);
  const lifecycleAuthoritative = hasLifecycleEvidence;
  const evidenceConfirmation = hasDiagnosticEvidence
    ? buildActiveSessionConfirmation(lifecycle, evidence)
    : null;
  const identityConfirmed = lifecycleAuthoritative;
  const effectiveGatewayEvidence = selectTruthyValue(() => (selectTruthyValue(() => (gatewayEvidence), () => (monitorEvidence))), () => (null));
  const gatewayConfirmed = requireGatewayConfirmation
    ? gatewayEvidenceConfirmed(effectiveGatewayEvidence)
    : null;
  const confirmed = lifecycleAuthoritative
    && (selectTruthyValue(() => (!requireGatewayConfirmation), () => (gatewayConfirmed === true)));

  let code = 'lifecycle_active_session_authoritative';
  if (!hasLifecycleEvidence) code = 'no_lifecycle_active_session';
  else if (requireGatewayConfirmation && gatewayConfirmed !== true) code = 'lifecycle_active_session_requires_gateway_confirmation';
  else if (hasDiagnosticEvidence && evidenceConfirmation?.confirmed !== true) code = 'diagnostic_active_session_identity_mismatch';

  return {
    code,
    confirmed,
    identity_confirmed: identityConfirmed,
    requires_gateway_confirmation: requireGatewayConfirmation === true,
    gateway_confirmed: gatewayConfirmed,
    monitor_confirmed: gatewayConfirmed,
    gateway_evidence: effectiveGatewayEvidence,
    monitor_evidence: effectiveGatewayEvidence,
    active_session_authority_source: lifecycleAuthoritative ? 'lifecycle_read_model' : null,
    allow_status_active_agent_authority: false,
    allow_active_session_file_authority: false,
    allow_tracked_agent_authority: false,
    allow_evidence_hydration: false,
    lifecycle_active_session_role: lifecycleAuthoritative
      ? ACTIVE_SESSION_EVIDENCE_ROLES.LIFECYCLE_AUTHORITY
      : ACTIVE_SESSION_EVIDENCE_ROLES.ABSENT,
    diagnostic_active_session_role: hasDiagnosticEvidence
      ? (evidenceConfirmation?.confirmed === true
        ? ACTIVE_SESSION_EVIDENCE_ROLES.CONFIRMED_DIAGNOSTIC_EVIDENCE
        : ACTIVE_SESSION_EVIDENCE_ROLES.DIAGNOSTIC_EVIDENCE)
      : ACTIVE_SESSION_EVIDENCE_ROLES.ABSENT,
    authoritative_identity: lifecycleAuthoritative ? lifecycle : null,
    lifecycle_identity: lifecycle,
    evidence_identity: hasDiagnosticEvidence ? evidence : null,
    required_fields: [...STRONG_ACTIVE_SESSION_IDENTITY_FIELDS],
    missing_lifecycle_fields: missingLifecycleFields,
    evidence_identity_confirmation: evidenceConfirmation,
  };
}
