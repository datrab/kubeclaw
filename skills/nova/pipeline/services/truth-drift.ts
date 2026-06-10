// services/truth-drift.js — explicit scheduler truth drift reports

import {
  projectModuleSchedulerState,
  projectGateSchedulerState,
} from './status-store-read-models.ts';
import { adjudicateCompletionEvidence } from './completion-adjudicator.ts';

function withSource(source, drift = []) {
  return (Array.isArray(drift) ? drift : []).map((entry) => ({ source, ...entry }));
}

function collectModuleArtifactRefs(moduleProjection = {}) {
  void moduleProjection;
  return {};
}

function collectGateArtifactRefs(gateProjection = {}) {
  return {
    output_path: gateProjection?.output?.path || gateProjection?.output_path || gateProjection?.gate_output_path || null,
  };
}

function redisCompletionEntryPresent(redisEntry) {
  return redisEntry !== null && redisEntry !== undefined;
}

function withMalformedGateCompletionDrift(adjudication, redisEntry) {
  if (!redisCompletionEntryPresent(redisEntry) || String(redisEntry?.status || '').trim()) {
    return adjudication;
  }

  const drift = [
    ...(Array.isArray(adjudication?.drift) ? adjudication.drift : []),
    {
      code: 'redis_completion_missing_status',
      redis_status: redisEntry?.status ?? null,
      redis_entry: redisEntry,
    },
  ];

  return {
    ...adjudication,
    drift,
    drift_detected: true,
  };
}

export function projectModuleTruthDrift(config, moduleId, moduleConfig = null, {
  status = undefined,
  statusRead = undefined,
  redisEntry = null,
  expectedIdentity = {},
  expectedStatuses = ['PASS', 'FAIL', 'BLOCKED'],
} = {}) {
  const schedulerReadModelProjection = projectModuleSchedulerState(config, moduleId, moduleConfig, {
    ...(status !== undefined ? { status } : {}),
    ...(statusRead !== undefined ? { statusRead } : {}),
  });
  const completionAdjudication = adjudicateCompletionEvidence({
    targetKind: 'module',
    targetId: moduleId,
    expectedStatuses,
    expectedIdentity,
    redisEntry,
    status: status || statusRead?.data || null,
    statusSource: 'local_lifecycle',
  });
  const drift = [
    ...withSource('module_scheduler', schedulerReadModelProjection?.scheduler_drift),
    ...withSource('completion_adjudicator', completionAdjudication?.drift),
  ];

  return {
    entity_kind: 'module',
    entity_id: moduleId,
    drift_detected: drift.length > 0,
    drift,
    scheduler_projection: schedulerReadModelProjection,
    completion_adjudication: completionAdjudication,
    artifacts: collectModuleArtifactRefs(schedulerReadModelProjection),
  };
}

export function projectGateTruthDrift(config, gateId, gate = null, {
  redisEntry = null,
  expectedIdentity = {},
  expectedStatuses = ['PASS', 'FAIL'],
  deps = {},
} = {}) {
  const schedulerReadModelProjection = projectGateSchedulerState(config, gateId, gate, deps);
  const completionAdjudication = redisCompletionEntryPresent(redisEntry)
    ? withMalformedGateCompletionDrift(
        adjudicateCompletionEvidence({
          targetKind: 'gate',
          targetId: gateId,
          expectedStatuses,
          expectedIdentity,
          redisEntry,
        }),
        redisEntry,
      )
    : null;
  const drift = [
    ...withSource('gate_scheduler', schedulerReadModelProjection?.scheduler_drift),
    ...withSource('completion_adjudicator', completionAdjudication?.drift),
  ];

  return {
    entity_kind: 'gate',
    entity_id: gateId,
    gate_type: gate?.type || null,
    drift_detected: drift.length > 0,
    drift,
    scheduler_projection: schedulerReadModelProjection,
    completion_adjudication: completionAdjudication,
    artifacts: collectGateArtifactRefs(schedulerReadModelProjection),
  };
}
