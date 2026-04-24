// Named exports from extracted modules
export { loadConfig } from './core/config.js';

// Agent lifecycle/monitor/shutdown exports
export {
  registerShutdownHooks,
} from './agents/shutdown.js';

// Status and exit code constants (module 16)
export { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from './core/constants.js';

// Supported public telemetry surface
export { emitEvent, onPipelineStarted, onPipelineCompleted, onPipelineHalted, onModuleStarted, onModulePass, onModuleFail, onModuleBlocked, onGateStarted, onGatePass, onGateFail, onAgentSpawned, onAgentKilled, onPhaseStarted, onPhaseCompleted, onRetryScheduled, onRetryExhausted, onEscalated, onSummaryStarted, onSummaryCompleted, onBudgetWarning, onBudgetExceeded, emitCostUpdate, emitRateLimitDetected, emitObservabilityDegraded, emitObservabilityRestored, emitTranscriptLine, emitAgentProgress } from './services/telemetry.js';
export { dispatchNotificationHook } from './services/notification-dispatch.js';
export { NOTIFICATION_HOOK_IDS, buildNotificationEventInput, validateNotificationEventInput } from './services/notification-contract.js';

export { runPipeline } from './runners/pipeline-runner.js';

export { default } from './runners/pipeline-runner.js';
