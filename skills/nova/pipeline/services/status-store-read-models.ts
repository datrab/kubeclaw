// services/status-store-read-models.ts — scheduler read-model projection facade.
// Module and gate projections live under status-store-read-models/ so
// scheduler authority and diagnostic evidence stay easy to audit independently.

export {
  GATE_OUTPUT_EVIDENCE_SOURCE,
  GATE_DIAGNOSTIC_EVIDENCE_SOURCE,
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from './status-store-read-models/common.ts';

export {
  getAuthoritativeModuleState,
  projectModuleSchedulerState,
} from './status-store-read-models/module-projection.ts';

export {
  GATE_STATUS_AUTHORITY_ROLES,
  buildGateStatusAuthorityPolicy,
  gateOutputExists,
  projectGateCompletionState,
  projectGateEvidenceIntoReadModel,
  projectGateSchedulerState,
  readBusterGateCompletion,
  readGateCompletionEvidence,
  readGateOutput,
  syncApprovalWaitState,
} from './status-store-read-models/gate-projection.ts';
