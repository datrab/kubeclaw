const COMPLETION_IDENTITY_FIELDS = Object.freeze(['run_id', 'attempt', 'dispatch_id', 'session_key']);
export const STRONG_COMPLETION_IDENTITY_FIELDS = Object.freeze(['run_id', 'attempt', 'dispatch_id']);

function normalizeIdentityValue(value: any) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function normalizeCompletionIdentity(identity: any = {}) {
  const normalized = {
    run_id: normalizeIdentityValue(firstDefined(identity.run_id, identity.runId)),
    attempt: normalizeIdentityValue(identity.attempt),
    dispatch_id: normalizeIdentityValue(firstDefined(identity.dispatch_id, identity.dispatchId)),
    session_key: normalizeIdentityValue(firstDefined(identity.session_key, identity.sessionKey)),
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== null));
}

export function getMissingCompletionIdentityFields(identity: any = {}, requiredFields: readonly string[] = STRONG_COMPLETION_IDENTITY_FIELDS) {
  const normalized = normalizeCompletionIdentity(identity);
  return requiredFields.filter((field) => !normalized[field]);
}

export function hasStrongCompletionIdentity(identity: any = {}) {
  return getMissingCompletionIdentityFields(identity).length === 0;
}

export function buildCompletionIdentityDiagnostics(identity: any = {}) {
  const normalized = normalizeCompletionIdentity(identity);
  const missing = getMissingCompletionIdentityFields(normalized);
  return { identity: normalized, strong: missing.length === 0, missing_fields: missing };
}

export function buildActiveDispatchConfirmation(expectedIdentity: any = {}, completionIdentity: any = {}) {
  const expected = normalizeCompletionIdentity(expectedIdentity);
  const observed = normalizeCompletionIdentity(completionIdentity);
  const missingExpected = getMissingCompletionIdentityFields(expected);
  const missingObserved = STRONG_COMPLETION_IDENTITY_FIELDS.filter((field) => !observed[field]);
  const mismatched = STRONG_COMPLETION_IDENTITY_FIELDS.filter((field) => expected[field] && observed[field] && expected[field] !== observed[field]);
  const optionalMismatched = COMPLETION_IDENTITY_FIELDS.filter((field) => !STRONG_COMPLETION_IDENTITY_FIELDS.includes(field) && expected[field] && observed[field] && expected[field] !== observed[field]);
  return {
    confirmed: missingExpected.length === 0 && missingObserved.length === 0 && mismatched.length === 0 && optionalMismatched.length === 0,
    expected, observed, required_fields: STRONG_COMPLETION_IDENTITY_FIELDS,
    missing_expected_fields: missingExpected, missing_observed_fields: missingObserved,
    mismatched_fields: mismatched, optional_mismatched_fields: optionalMismatched,
  };
}
