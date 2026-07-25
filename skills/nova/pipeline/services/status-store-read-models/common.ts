const READ_MODEL_SOURCE_CANONICAL_EVENTS = "canonical-events";
const READ_MODEL_SOURCE_PENDING = "read_model:pending";
const GATE_OUTPUT_EVIDENCE_SOURCE = "output_file";
const GATE_DIAGNOSTIC_EVIDENCE_SOURCE = "gate_diagnostic_state";

function buildProjectionSourceFields({
  readModelSource = READ_MODEL_SOURCE_PENDING,
  operatorProjectionSource = "scheduler_read_model",
  diagnosticEvidenceSource = null,
  completionEvidenceSource = null,
}: any = {}) {
  return {
    read_model_source: readModelSource
      ? readModelSource
      : READ_MODEL_SOURCE_PENDING,
    operator_projection_source: operatorProjectionSource,
    diagnostic_evidence_source: diagnosticEvidenceSource,
    completion_evidence_source: completionEvidenceSource,
  };
}

export {
  GATE_OUTPUT_EVIDENCE_SOURCE,
  GATE_DIAGNOSTIC_EVIDENCE_SOURCE,
  READ_MODEL_SOURCE_CANONICAL_EVENTS,
  READ_MODEL_SOURCE_PENDING,
  buildProjectionSourceFields,
};
