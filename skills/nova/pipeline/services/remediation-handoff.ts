import { STATUS } from '../core/constants.ts';
import { cloneSerializable } from './serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function requireNonEmptyString(value: any, label: any) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`gate remediation request requires ${label}`);
  }
  return value.trim();
}

function requirePositiveNumber(value: any, label: any) {
  const normalized = Number(value);
  if (selectTruthyValue(() => (!Number.isFinite(normalized)), () => (normalized < 1))) {
    throw new Error(`gate remediation request requires ${label} >= 1`);
  }
  return normalized;
}

function requireObject(value: any, label: any) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))), () => (Array.isArray(value)))) {
    throw new Error(`gate remediation request requires ${label}`);
  }
  return value;
}

export function buildGateRemediationRequestControlResult({
  producerType,
  gateId,
  gateType,
  runId,
  attempt,
  summary,
  findings = [],
  metadata = {},
  remediation = {},
}: any) {
  const normalized = normalizeRemediationRequest({ producerType, gateId, gateType, runId, attempt, remediation });

  return {
    schemaVersion: 'v1',
    producerKind: 'gate',
    producerType: normalized.producerType,
    nextAction: 'request_fix',
    issueType: 'code',
    diagnostics: {
      summary,
      findings: selectDefinedValue(() => (cloneSerializable(findings)), () => ([])),
      metadata: selectDefinedValue(() => (cloneSerializable(metadata)), () => ({})),
      typed: {
        gate: {
          schemaVersion: 'v1',
          gateRunStatus: STATUS.FAIL,
          outcomeClass: 'fix_requested',
          recommendation: 'request_fix',
          metrics: {
            attempt: normalized.attempt,
            issues_count: Array.isArray(findings) ? findings.length : 0,
          },
        },
        remediation: {
          schemaVersion: 'v1',
          sourceKind: 'gate',
          sourceType: normalized.producerType,
          gateId: normalized.gateId,
          gateType: normalized.gateType,
          runId: normalized.runId,
          attempt: normalized.attempt,
          policy: normalized.policy,
          targetRef: normalized.targetRef,
          startedAt: normalized.startedAt,
          correlation: cloneSerializable(selectDefinedValue(() => (remediation?.correlation), () => ({}))),
          diagnostics: cloneSerializable(selectDefinedValue(() => (remediation?.diagnostics), () => ({}))),
        },
      },
    },
  };
}

function normalizeRemediationRequest(input: any) {
  const policy = requireObject(input.remediation?.policy, 'remediation.policy');
  return {
    producerType: requireNonEmptyString(input.producerType, 'producerType'),
    gateId: requireNonEmptyString(input.gateId, 'gateId'),
    gateType: requireNonEmptyString(input.gateType, 'gateType'),
    runId: requireNonEmptyString(input.runId, 'runId'),
    attempt: requirePositiveNumber(input.attempt, 'attempt'),
    policy: {
      maxFixCycles: requirePositiveNumber(policy.maxFixCycles, 'remediation.policy.maxFixCycles'),
      nextFixCycle: requirePositiveNumber(policy.nextFixCycle, 'remediation.policy.nextFixCycle'),
      rerunStageId: requireNonEmptyString(policy.rerunStageId, 'remediation.policy.rerunStageId'),
    },
    targetRef: requireNonEmptyString(input.remediation?.targetRef, 'remediation.targetRef'),
    startedAt: requireNonEmptyString(input.remediation?.startedAt, 'remediation.startedAt'),
  };
}

export function readGateRemediationSpec(result: any = {}) {
  return selectTruthyValue(() => (result?.diagnostics?.typed?.remediation), () => (null));
}

export function isGateRemediationControlResult(result: any = {}) {
  return result?.schemaVersion === 'v1'
    && result?.producerKind === 'gate'
    && result?.nextAction === 'request_fix'
    && !!readGateRemediationSpec(result);
}

export function validateGateRemediationControlResult(result: any = {}, stageId: any = 'gate:missing_gate_type') {
  if (result?.nextAction !== 'request_fix') return [];

  const errors: any[] = [];
  const remediation = readGateRemediationSpec(result);
  if (selectTruthyValue(() => (!remediation), () => (typeof remediation !== 'object'))) {
    errors.push(`request_fix for ${stageId} requires diagnostics.typed.remediation`);
    return errors;
  }
  validateRemediationIdentity(remediation, stageId, errors);
  validateRemediationPolicy(remediation.policy, stageId, errors);
  return errors;
}

function validateRemediationIdentity(remediation: any, stageId: string, errors: string[]) {
  if (remediation.schemaVersion !== 'v1') errors.push(`request_fix for ${stageId} requires remediation schemaVersion 'v1'`);
  if (remediation.sourceKind !== 'gate') errors.push(`request_fix for ${stageId} requires remediation sourceKind 'gate'`);
  if (!remediation.gateId || typeof remediation.gateId !== 'string') errors.push(`request_fix for ${stageId} requires remediation gateId`);
  if (!remediation.gateType || typeof remediation.gateType !== 'string') errors.push(`request_fix for ${stageId} requires remediation gateType`);
}

function validateRemediationPolicy(policy: any, stageId: string, errors: string[]) {
  const maxFixCycles = Number(policy?.maxFixCycles);
  if (!Number.isFinite(maxFixCycles) || maxFixCycles < 1) errors.push(`request_fix for ${stageId} requires remediation policy.maxFixCycles >= 1`);
  const nextFixCycle = Number(policy?.nextFixCycle);
  if (!Number.isFinite(nextFixCycle) || nextFixCycle < 1) errors.push(`request_fix for ${stageId} requires remediation policy.nextFixCycle >= 1`);
  if (!policy?.rerunStageId || typeof policy.rerunStageId !== 'string') errors.push(`request_fix for ${stageId} requires remediation policy.rerunStageId`);
}

export function validateGateRemediationController(controller: any = {}, stageId: any = 'gate:missing_gate_type') {
  const errors: any[] = [];
  if (selectTruthyValue(() => (!controller), () => (typeof controller !== 'object'))) {
    return [`${stageId} remediation controller must be an object`];
  }
  if (typeof controller.performFix !== 'function') {
    errors.push(`${stageId} remediation controller must implement performFix(...)`);
  }
  if (typeof controller.evaluateGate !== 'function') {
    errors.push(`${stageId} remediation controller must implement evaluateGate(...)`);
  }
  if (typeof controller.buildExhaustedControlResult !== 'function') {
    errors.push(`${stageId} remediation controller must implement buildExhaustedControlResult(...)`);
  }
  return errors;
}

export function resolveGateRemediationController({
  remediationController,
  evaluateGate,
  performFix,
  buildExhaustedControlResult,
}: any = {}, stageId: any = 'gate:missing_gate_type') {
  const controller = remediationControllerAuthority({
    remediationController,
    evaluateGate,
    performFix,
    buildExhaustedControlResult,
  });
  const errors = validateGateRemediationController(controller, stageId);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return controller;
}

function remediationControllerAuthority({
  remediationController,
  evaluateGate,
  performFix,
  buildExhaustedControlResult,
}: any) {
  if (remediationController) return remediationController;
  return {
    evaluateGate,
    performFix,
    buildExhaustedControlResult,
  };
}

export function bumpGateRemediationControlResult(result: any = {}, nextFixCycle: any) {
  const cloned = cloneSerializable(result);
  if (!cloned?.diagnostics?.typed?.remediation?.policy) {
    return cloned;
  }
  cloned.diagnostics.typed.remediation.policy.nextFixCycle = nextFixCycle;
  if (cloned?.diagnostics?.typed?.gate?.metrics) {
    cloned.diagnostics.typed.gate.metrics.next_fix_cycle = nextFixCycle;
  }
  return cloned;
}
