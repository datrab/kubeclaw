// services/status-store-compat.ts — legacy evidence projection facade.
// Module and gate compatibility projections live under status-store-compat/ so
// scheduler authority, diagnostic evidence, and migration bootstrap behavior are
// easier to audit independently.

export {
  GATE_OUTPUT_EVIDENCE_SOURCE,
  LEGACY_GATE_STATUS_EVIDENCE_SOURCE,
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
} from './status-store-compat/common.ts';

export {
  getAuthoritativeModuleState,
  projectModuleSchedulerState,
} from './status-store-compat/module-projection.ts';

export {
  GATE_STATUS_AUTHORITY_ROLES,
  buildGateStatusAuthorityPolicy,
  gateOutputExists,
  projectGateCompletionState,
  projectGateLegacyEvidenceIntoReadModel,
  projectGateSchedulerState,
  readBusterGateCompletion,
  readGateCompletionEvidence,
  readGateOutput,
  readGateStatusJson,
  syncApprovalWaitState,
} from './status-store-compat/gate-projection.ts';
