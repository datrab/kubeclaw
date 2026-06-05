const READ_MODEL_SOURCE_CANONICAL_EVENTS = 'canonical-events';
const READ_MODEL_SOURCE_PENDING = 'read_model:pending';
const GATE_OUTPUT_EVIDENCE_SOURCE = 'output_file';
const LEGACY_GATE_STATUS_EVIDENCE_SOURCE = 'legacy_status:gate-status.json';

function buildProjectionSourceFields({
  readModelSource = READ_MODEL_SOURCE_PENDING,
  operatorProjectionSource = 'scheduler_read_model',
  legacyEvidenceSource = null,
  completionEvidenceSource = null,
} = {}) {
  return {
    read_model_source: readModelSource || READ_MODEL_SOURCE_PENDING,
    operator_projection_source: operatorProjectionSource,
    legacy_evidence_source: legacyEvidenceSource,
    completion_evidence_source: completionEvidenceSource,
  };
}

export {
  GATE_OUTPUT_EVIDENCE_SOURCE,
  LEGACY_GATE_STATUS_EVIDENCE_SOURCE,
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
};
