import { STATUS } from '../core/constants.js';

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
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
  return {
    schemaVersion: 'v1',
    producerKind: 'gate',
    producerType,
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
          outcomeClass: 'request_fix',
          recommendation: 'request_fix',
          metrics: {
            attempt,
            issues_count: Array.isArray(findings) ? findings.length : 0,
          },
        },
        remediation: {
          schemaVersion: 'v1',
          sourceKind: 'gate',
          sourceType: producerType,
          gateId,
          gateType,
          runId: runId || null,
          attempt: attempt ?? null,
          policy: {
            maxFixCycles: remediation?.policy?.maxFixCycles ?? null,
            nextFixCycle: remediation?.policy?.nextFixCycle ?? null,
            rerunStageId: remediation?.policy?.rerunStageId || `gate:${gateType || producerType || 'unknown'}`,
          },
          targetRef: remediation?.targetRef || null,
          startedAt: remediation?.startedAt || null,
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

export async function runGateRemediationHandoff({
  initialControlResult,
  evaluateGate,
  performFix,
  extractLegacyResult,
  buildExhaustedLegacyResult,
  gateId,
  gate,
}) {
  let controlResult = initialControlResult;

  while (isGateRemediationControlResult(controlResult)) {
    const remediation = readGateRemediationSpec(controlResult);
    const maxFixCycles = Number(remediation?.policy?.maxFixCycles || 0);
    const cycle = Number(remediation?.policy?.nextFixCycle || 0);

    if (!Number.isFinite(cycle) || cycle < 1 || cycle > maxFixCycles) {
      return await buildExhaustedLegacyResult({ controlResult, remediation, gateId, gate });
    }

    const fixOutcome = await performFix({ controlResult, remediation, cycle, maxFixCycles, gateId, gate });

    if (fixOutcome?.mode === 'terminal') {
      return fixOutcome.result;
    }

    if (fixOutcome?.mode === 'retry_request_fix') {
      controlResult = bumpGateRemediationControlResult(
        fixOutcome.controlResult || controlResult,
        cycle + 1,
      );
      continue;
    }

    if (fixOutcome?.controlResult) {
      controlResult = fixOutcome.controlResult;
    }

    controlResult = await evaluateGate({
      attempt: cycle + 1,
      remediationCycle: cycle,
      controlResult,
      remediation,
      gateId,
      gate,
    });
  }

  return extractLegacyResult(controlResult, gateId, gate);
}
