// services/telemetry.js — public telemetry facade.
// Event builders, sink/dispatch wiring, and close handling live under
// services/telemetry/ for auditability.
//
// Operator evidence is local-first: durable operator-alert JSONL is written
// before registry-owned Discord presentation dispatch.

export { emitEvent, emitEventNonBlocking, emitOperatorAlert } from './telemetry/dispatch.ts';
export { appendDurableOperatorAlert, durableOperatorAlertTargets } from './durable-operator-alert.ts';
export { recordObservabilityDegraded, recordObservabilityRestored } from './observability.ts';

export {
  onPipelineStarted,
  onPipelineCompleted,
  onPipelineHalted,
  onModuleStarted,
  onModuleStatusChanged,
  onModulePass,
  onModuleFail,
  onModuleBlocked,
  onGateStarted,
  onGatePass,
  onGateFail,
  onAgentSpawned,
  onAgentKilled,
  onPhaseStarted,
  onPhaseCompleted,
  onRetryScheduled,
  onRetryExhausted,
  onEscalated,
  onSummaryStarted,
  onSummaryCompleted,
  onBudgetWarning,
  onBudgetExceeded,
  onApprovalRequested,
  onApprovalResolved,
  emitCostUpdate,
  emitRateLimitDetected,
  emitObservabilityDegraded,
  emitObservabilityRestored,
  updateObservabilitySurface,
  updateGatewayObservability,
  updateTranscriptObservability,
  updateRedisCompletionObservability,
} from './telemetry/builders.ts';

export {
  emitTranscriptLine,
  emitAgentProgress,
} from './telemetry/progress.ts';

export {
  TELEMETRY_PAYLOAD_EVENT_TYPES,
  TELEMETRY_PAYLOAD_SCHEMAS,
  TelemetryPayloadInvalidError,
  assertTelemetryEventPayload,
  validateTelemetryEventPayload,
} from './telemetry/payload-schema.ts';

export { closeTelemetryRedis } from './telemetry/sinks.ts';
