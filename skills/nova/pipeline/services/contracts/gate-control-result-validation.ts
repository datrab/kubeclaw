type UnknownRecord = Record<string, any>;

const CANONICAL_GATE_RUN_STATUSES = new Set(['PASS', 'FAIL', 'WAIT', 'TIMED_OUT']);
const CANONICAL_OUTCOME_CLASSES = new Set([
  'passed', 'fix_requested', 'waiting', 'retrying', 'needs_nova',
  'blocked', 'error', 'timeout', 'rate_limited',
]);

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function producerLabel(result: UnknownRecord): string {
  const label = textValue(result.producerType);
  return label ? label : 'gate';
}

function validateTypedGate(typedGate: UnknownRecord | null, status: string, errors: string[]): void {
  if (!typedGate) {
    errors.push('diagnostics.typed.gate must be an object');
    return;
  }
  if (typedGate.schemaVersion !== 'v1') errors.push("diagnostics.typed.gate.schemaVersion must be 'v1'");
  if (status && !CANONICAL_GATE_RUN_STATUSES.has(status)) {
    errors.push('diagnostics.typed.gate.gateRunStatus must be PASS, FAIL, WAIT, or TIMED_OUT');
  }
  if (!CANONICAL_OUTCOME_CLASSES.has(textValue(typedGate.outcomeClass))) {
    errors.push('diagnostics.typed.gate.outcomeClass must be a canonical pipeline step outcome');
  }
}

function validateTerminalAction(result: UnknownRecord, status: string, metadata: UnknownRecord, errors: string[]): void {
  if (result.nextAction === 'pass' && status === 'FAIL') {
    errors.push(`pass for ${producerLabel(result)} cannot report failing gateRunStatus '${status}'`);
  }
  if (result.nextAction === 'pass' && status === 'TIMED_OUT' && metadata.continued !== true) {
    errors.push('pass with gateRunStatus TIMED_OUT requires diagnostics.metadata.continued=true');
  }
  const rejects = result.nextAction === 'block' || result.nextAction === 'request_fix';
  const passing = status === 'PASS'
    ? true
    : status === 'TIMED_OUT' && metadata.continued === true;
  if (rejects && passing) {
    errors.push(`${result.nextAction} for ${producerLabel(result)} cannot report passing gateRunStatus '${status}'`);
  }
}

function validateWaitAction(result: UnknownRecord, typed: UnknownRecord | null, status: string, errors: string[]): void {
  if (result.nextAction !== 'wait') return;
  const wait = isPlainObject(typed?.wait) ? typed.wait : null;
  if (!wait) errors.push('wait action requires diagnostics.typed.wait');
  else {
    if (wait.schemaVersion !== 'v1') errors.push("diagnostics.typed.wait.schemaVersion must be 'v1'");
    if (!wait.waitKind || typeof wait.waitKind !== 'string') errors.push('diagnostics.typed.wait.waitKind must be a non-empty string');
    if (!wait.status) errors.push('diagnostics.typed.wait.status must be a non-empty string');
    else if (typeof wait.status !== 'string') errors.push('diagnostics.typed.wait.status must be a non-empty string');
  }
  if (status && status !== 'WAIT') {
    errors.push(`wait for ${producerLabel(result)} cannot report terminal gateRunStatus '${status}'`);
  }
}

export function validateGateActionSemantics(result: UnknownRecord, errors: string[]): void {
  const diagnostics = isPlainObject(result.diagnostics) ? result.diagnostics : null;
  if (!diagnostics) {
    errors.push('diagnostics must be an object');
    return;
  }
  const metadata = isPlainObject(diagnostics.metadata) ? diagnostics.metadata : {};
  const typed = isPlainObject(diagnostics.typed) ? diagnostics.typed : null;
  const typedGate = isPlainObject(typed?.gate) ? typed.gate : null;
  const status = textValue(typedGate?.gateRunStatus).toUpperCase();
  if (!textValue(diagnostics.summary)) errors.push('diagnostics.summary must be a non-empty string');
  if (!Array.isArray(diagnostics.findings)) errors.push('diagnostics.findings must be an array');
  if (!isPlainObject(diagnostics.metadata)) errors.push('diagnostics.metadata must be an object');
  if (!typed) errors.push('diagnostics.typed must be an object');
  validateTypedGate(typedGate, status, errors);
  validateTerminalAction(result, status, metadata, errors);
  validateWaitAction(result, typed, status, errors);
}

function readValue(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim() !== '') return value;
  }
  return null;
}

function valuesMatch(expected: unknown, actual: unknown): boolean {
  if (expected == null || expected === '') return true;
  return actual != null && String(actual) === String(expected);
}

function evidenceValues(result: UnknownRecord): { values: UnknownRecord; metadata: UnknownRecord } {
  const diagnostics = isPlainObject(result.diagnostics) ? result.diagnostics : {};
  const metadata = isPlainObject(diagnostics.metadata) ? diagnostics.metadata : {};
  const remediation = isPlainObject(diagnostics?.typed?.remediation) ? diagnostics.typed.remediation : null;
  const evidence = remediation ?? metadata;
  const correlation = isPlainObject(remediation?.correlation) ? remediation.correlation : {};
  return {
    metadata,
    values: {
      runId: readValue(evidence, ['runId', 'run_id']),
      gateId: readValue(evidence, ['gateId', 'gate_id']),
      gateType: readValue(evidence, ['gateType', 'gate_type']),
      attempt: readValue(evidence, ['attempt']),
      dispatchId: readValue(evidence, ['dispatchId', 'dispatch_id']) ?? readValue(correlation, ['dispatchId', 'dispatch_id']),
    },
  };
}

function requiredErrors(values: UnknownRecord, requireDispatchId: boolean): string[] {
  const errors: string[] = [];
  if (!values.runId) errors.push('gate evidence must include run_id');
  if (!values.gateId) errors.push('gate evidence must include gate_id');
  if (!values.gateType) errors.push('gate evidence must include gate_type');
  if (values.attempt === null) errors.push('gate evidence must include attempt');
  if (requireDispatchId && !values.dispatchId) errors.push('gate evidence must include dispatch_id');
  return errors;
}

function mismatchErrors(values: UnknownRecord, expected: UnknownRecord): string[] {
  const errors: string[] = [];
  const fields: Array<[string, string, string]> = [
    ['runId', 'run_id', 'run'], ['gateId', 'gate_id', 'gate'],
    ['gateType', 'gate_type', 'gate type'], ['attempt', 'attempt', 'attempt'],
    ['dispatchId', 'dispatch_id', 'dispatch'],
  ];
  for (const [field, wireName, label] of fields) {
    if (!valuesMatch(expected[field], values[field])) {
      errors.push(`gate evidence ${wireName} does not match expected ${label}`);
    }
  }
  return errors;
}

export function validateGateEvidenceAuthority(result: unknown, expected: UnknownRecord = {}): string[] {
  if (!isPlainObject(result)) return ['gate evidence result must be an object'];
  const { values, metadata } = evidenceValues(result);
  const errors = [
    ...requiredErrors(values, expected.requireDispatchId === true),
    ...mismatchErrors(values, {
      runId: expected.expectedRunId,
      gateId: expected.expectedGateId,
      gateType: expected.expectedGateType,
      attempt: expected.expectedAttempt,
      dispatchId: expected.expectedDispatchId,
    }),
  ];
  const pathEvidence = readValue(metadata, ['path', 'output_file', 'evidence_path', 'request_artifact_path']);
  const missingIdentity = [values.runId, values.gateId, values.attempt].some((value) => value == null || value === '');
  if (pathEvidence && missingIdentity) {
    errors.push('gate evidence path is diagnostic only without run/gate/attempt identity');
  }
  return errors;
}
