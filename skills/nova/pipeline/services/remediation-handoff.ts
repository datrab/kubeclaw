import { STATUS } from '../core/constants.ts';
import { cloneSerializable } from './serialization.ts';

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`gate remediation request requires ${label}`);
  }
  return value.trim();
}

function requirePositiveNumber(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error(`gate remediation request requires ${label} >= 1`);
  }
  return normalized;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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
}) {
  const typedProducerType = requireNonEmptyString(producerType, 'producerType');
  const typedGateId = requireNonEmptyString(gateId, 'gateId');
  const typedGateType = requireNonEmptyString(gateType, 'gateType');
  const typedRunId = requireNonEmptyString(runId, 'runId');
  const typedAttempt = requirePositiveNumber(attempt, 'attempt');
  const typedPolicy = requireObject(remediation?.policy, 'remediation.policy');
  const maxFixCycles = requirePositiveNumber(typedPolicy.maxFixCycles, 'remediation.policy.maxFixCycles');
  const nextFixCycle = requirePositiveNumber(typedPolicy.nextFixCycle, 'remediation.policy.nextFixCycle');
  const rerunStageId = requireNonEmptyString(typedPolicy.rerunStageId, 'remediation.policy.rerunStageId');
  const targetRef = requireNonEmptyString(remediation?.targetRef, 'remediation.targetRef');
  const startedAt = requireNonEmptyString(remediation?.startedAt, 'remediation.startedAt');

  return {
    schemaVersion: 'v1',
    producerKind: 'gate',
    producerType: typedProducerType,
    nextAction: 'request_fix',
    issueType: 'code',
    diagnostics: {
      summary,
      findings: cloneSerializable(findings) || [],
      metadata: cloneSerializable(metadata) || {},
      typed: {
        gate: {
          schemaVersion: 'v1',
          gateRunStatus: STATUS.FAIL,
          outcomeClass: 'fix_requested',
          recommendation: 'request_fix',
          metrics: {
            attempt,
            issues_count: Array.isArray(findings) ? findings.length : 0,
          },
        },
        remediation: {
          schemaVersion: 'v1',
          sourceKind: 'gate',
          sourceType: typedProducerType,
          gateId: typedGateId,
          gateType: typedGateType,
          runId: typedRunId,
          attempt: typedAttempt,
          policy: {
            maxFixCycles,
            nextFixCycle,
            rerunStageId,
          },
          targetRef,
          startedAt,
          correlation: cloneSerializable(remediation?.correlation || {}),
          diagnostics: cloneSerializable(remediation?.diagnostics || {}),
        },
      },
    },
  };
}

export function readGateRemediationSpec(result = {}) {
  return result?.diagnostics?.typed?.remediation || null;
}

export function isGateRemediationControlResult(result = {}) {
  return result?.schemaVersion === 'v1'
    && result?.producerKind === 'gate'
    && result?.nextAction === 'request_fix'
    && !!readGateRemediationSpec(result);
}

export function validateGateRemediationControlResult(result = {}, stageId = 'gate:unknown') {
  if (result?.nextAction !== 'request_fix') return [];

  const errors = [];
  const remediation = readGateRemediationSpec(result);
  if (!remediation || typeof remediation !== 'object') {
    errors.push(`request_fix for ${stageId} requires diagnostics.typed.remediation`);
    return errors;
  }
  if (remediation.schemaVersion !== 'v1') {
    errors.push(`request_fix for ${stageId} requires remediation schemaVersion 'v1'`);
  }
  if (remediation.sourceKind !== 'gate') {
    errors.push(`request_fix for ${stageId} requires remediation sourceKind 'gate'`);
  }
  if (!remediation.gateId || typeof remediation.gateId !== 'string') {
    errors.push(`request_fix for ${stageId} requires remediation gateId`);
  }
  if (!remediation.gateType || typeof remediation.gateType !== 'string') {
    errors.push(`request_fix for ${stageId} requires remediation gateType`);
  }
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles);
  if (!Number.isFinite(maxFixCycles) || maxFixCycles < 1) {
    errors.push(`request_fix for ${stageId} requires remediation policy.maxFixCycles >= 1`);
  }
  const nextFixCycle = Number(remediation?.policy?.nextFixCycle);
  if (!Number.isFinite(nextFixCycle) || nextFixCycle < 1) {
    errors.push(`request_fix for ${stageId} requires remediation policy.nextFixCycle >= 1`);
  }
  if (!remediation?.policy?.rerunStageId || typeof remediation.policy.rerunStageId !== 'string') {
    errors.push(`request_fix for ${stageId} requires remediation policy.rerunStageId`);
  }
  return errors;
}

export function validateGateRemediationController(controller = {}, stageId = 'gate:unknown') {
  const errors = [];
  if (!controller || typeof controller !== 'object') {
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
} = {}, stageId = 'gate:unknown') {
  const controller = remediationController || {
    evaluateGate,
    performFix,
    buildExhaustedControlResult,
  };
  const errors = validateGateRemediationController(controller, stageId);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return controller;
}

export function bumpGateRemediationControlResult(result = {}, nextFixCycle) {
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
