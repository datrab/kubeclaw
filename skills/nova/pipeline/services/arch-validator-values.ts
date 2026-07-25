import path from 'node:path';
import { getRunId } from '../core/runtime.ts';
import { archValidatorLogDir } from '../core/paths.ts';

export const SEVERITY = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  BLOCKING: 'blocking',
});

export const SCOPE = Object.freeze({
  PROJECT: 'project',
  MODULE: 'module',
  GATE: 'gate',
  DEPENDENCY_GRAPH: 'dependency_graph',
  DOMAIN_MODEL: 'domain_model',
  INTEGRATION_BOUNDARY: 'integration_boundary',
  TEST_SPEC: 'test_spec',
  CONFIG: 'config',
});

export const FINDING_CODES = Object.freeze({
  PROGRESS_MISSING_FIELD: 'PROGRESS_MISSING_FIELD',
  PROGRESS_EMPTY_EXEC_ORDER: 'PROGRESS_EMPTY_EXEC_ORDER',
  EXEC_ORDER_ENTRY_INVALID: 'EXEC_ORDER_ENTRY_INVALID',
  EXEC_ORDER_MODULE_UNDEFINED: 'EXEC_ORDER_MODULE_UNDEFINED',
  EXEC_ORDER_GATE_UNDEFINED: 'EXEC_ORDER_GATE_UNDEFINED',
  MODULE_MISSING_DIR: 'MODULE_MISSING_DIR',
  GATE_MISSING_TYPE: 'GATE_MISSING_TYPE',
  MODULE_FORGE_MISSING: 'MODULE_FORGE_MISSING',
  MODULE_BUSTER_MISSING: 'MODULE_BUSTER_MISSING',
  MODULE_TEST_SPEC_INVALID_JSON: 'MODULE_TEST_SPEC_INVALID_JSON',
  TEST_SPEC_MISSING_FIELD: 'TEST_SPEC_MISSING_FIELD',
  TEST_SPEC_MODULE_ID_MISMATCH: 'TEST_SPEC_MODULE_ID_MISMATCH',
  GATE_INSTRUCTIONS_MISSING: 'GATE_INSTRUCTIONS_MISSING',
  GATE_MISSING_REVIEW_NAME: 'GATE_MISSING_REVIEW_NAME',
  DEP_UNDEFINED_REF: 'DEP_UNDEFINED_REF',
  DEP_SELF_REFERENCE: 'DEP_SELF_REFERENCE',
  ARCH_VALIDATOR_MODEL_MALFORMED: 'ARCH_VALIDATOR_MODEL_MALFORMED',
  MODULE_FORGE_MODEL_MALFORMED: 'MODULE_FORGE_MODEL_MALFORMED',
  GATE_MODEL_MALFORMED: 'GATE_MODEL_MALFORMED',
  AGENT_JUDGMENT_EXECUTION_ERROR: 'AGENT_JUDGMENT_EXECUTION_ERROR',
  AGENT_JUDGMENT_PARSE_ERROR: 'AGENT_JUDGMENT_PARSE_ERROR',
  VALIDATOR_INTERNAL_ERROR: 'VALIDATOR_INTERNAL_ERROR',
});

export function makeFinding(id: any, severity: any, scope: any, filePaths: any, explanation: any, remediation: any) {
  return {
    id,
    severity,
    scope,
    paths: Array.isArray(filePaths) ? filePaths : (filePaths ? [filePaths] : []),
    explanation,
    remediation,
  };
}

export function objectRecord(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function requireNonEmptyString(value: any, label: any) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: required non-empty string`);
  return value.trim();
}

export function errorMessage(error: any) {
  return error instanceof Error ? error.message : String(error);
}

export function firstTruthy(...values: any[]) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

export function validatorAgentOutputPath(config: any) {
  const logDir = archValidatorLogDir(config);
  return logDir ? path.join(logDir, 'agent-findings.json') : null;
}

export function resolveArchValidatorRunId(config: any, preferred: any = null) {
  if (preferred) return preferred;
  return firstTruthy(getRunId(config), config?._runId, config?.run_id);
}

export function isBlocking(findings: any) {
  return Array.isArray(findings)
    && findings.some((finding: any) => finding.severity === SEVERITY.BLOCKING || finding.severity === SEVERITY.ERROR);
}
