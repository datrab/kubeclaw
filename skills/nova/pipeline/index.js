// Named exports from extracted modules
export { loadConfig, validateConfig, validateBusterConfig, resolveModel } from './core/config.js';
export { getRepoRoot } from './core/git.js';
export { modulePath, statusPath, swarmRoot, projectSrcPath, relPath, completionStreamKey, gateStatusPath, moduleLogDir, moduleTestLogDir, moduleLintLogDir, gateLogDir, gateTestLogDir, gateLintLogDir, validateSafePath } from './core/paths.js';
export { createPipelineContext } from './core/context.js';
export { createLogger, log, setActiveContext, clearActiveContext, getActiveContext, initContextLogging } from './core/logger.js';
export { createTempManager } from './core/temp.js';
export {
  loadStatus,
  saveStatus,
  initStatus,
  addHistory,
  savePrompt,
  saveStreamLog,
  archiveGateOutputIfPresent,
  gateArchiveDir,
  initLogDir,
} from './services/status-store.js';

// Integration layer exports
export { gatewayInvoke, GATEWAY_URL, GATEWAY_TOKEN } from './integrations/gateway.js';
export { discord } from '../pipeline-original.js';

// Agent lifecycle/monitor/shutdown exports
export {
  acpLabel,
  modelToHarness,
  spawnAcpAgent,
  killAcpAgent,
  spawnAgent,
  killAgent,
  steerAgent,
  verifyAgentAlive,
  dispatchRedisTask,
  buildBusterPayload,
  spawnReviewerAgent,
  killReviewerAgent,
} from './agents/lifecycle.js';
export {
  parseSessionState,
  readAcpTranscriptState,
  getAcpMonitorState,
  isSessionTerminal,
  waitForSessionIdle,
  classifyTranscriptText,
  getAcpMonitorConfig,
} from './agents/acp-monitor.js';
export {
  registerShutdownHooks,
  trackAgent,
  untrackAgent,
  setShutdownContext,
  clearShutdownContext,
  gatewayKillSync,
  acpxCleanupSync,
  acpxCleanup,
  reaperAfterKill,
  reaperAfterKillSync,
  getTrackedAgent,
} from './agents/shutdown.js';

// Status and exit code constants (module 16)
export { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from './core/constants.js';

// Polling and rate-limit service exports (module 08)
export { sleep, pollResult, pollGeneric, pollForFile, pollStatus, pollForSessionEnd, pollDual, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery, archiveModuleCompletions, readCompletionFromRedis } from './services/polling.js';
export { withRateLimitRecovery, handleRateLimit } from './services/rate-limit.js';
export { FAIL_PATTERNS, extractAgentFailReason, extractPreTestFailReason, getFailedSuiteNames, handleFail, buildNovaEscalation, injectNeedsNova, resolveAutoRetryThreshold } from './services/failures.js';
export { emitEvent, onPipelineStarted, onPipelineCompleted, onPipelineHalted, onModuleStarted, onModulePass, onModuleFail, onModuleBlocked, onGateStarted, onGatePass, onGateFail, onAgentSpawned, onAgentKilled, onPhaseStarted, onPhaseCompleted } from './services/telemetry.js';

// Prompt subsystem exports (module 07)
export { makePromptResult, buildGitSyncSection, buildAvailableToolsSection, buildTestWorkspaceSection, buildBusterCompletionProtocol, buildBusterGateCompletionProtocol } from './prompts/shared.js';
export { readBusterInstructions } from './prompts/buster-instructions.js';
export { readForgeInstructions, buildForgePrompt } from './prompts/forge.js';
export { buildBusterModulePrompt } from './prompts/buster-module.js';
export { readGateInstructions, buildBusterGatePrompt } from './prompts/buster-gate.js';
export { buildGateFixPrompt } from './prompts/gate-fix.js';
export { buildReviewerPrompt } from './prompts/review.js';

export { runPipeline, findNextStep, printStatus, dryRun } from './runners/pipeline-runner.js';
export { runModule } from './runners/module-runner.js';
export { runGate, GATE_RUNNERS } from './runners/gate-runner.js';
export { runBusterGate } from './runners/buster-gate-runner.js';
export { runReviewGate } from './runners/review-gate-runner.js';
export { readGateOutput, gateOutputExists, readGateStatusJson } from './services/status-store.js';
export { listBlueprints, releaseBlueprint, releaseGateFiles, syncControlFiles } from './services/blueprint.js';
export {
  writeSummary,
  generateProjectSummary,
  generatePipelineReview,
  pipelineReviewOutputPath,
  pipelineReviewJsonPath,
  pipelineReviewInstructionsPath,
  pipelineReviewDispatchMode,
  pipelineReviewAgentId,
} from './services/summary.js';

// Remaining items not yet extracted from pipeline-original.js — explicit re-exports
// These will be removed as extraction continues in future modules.
export {
  // Runtime stats / run identity
  RUN_ID,
  _runStats,
  // Output helper
  output,
  // Progress loader
  loadProgress,
  // Module execution internals (not yet extracted to runners/)
  executeModuleAttempt,
  runPreCheck,
  generateLintReport,
  formatLintReportForReviewer,
  // Git utilities (not yet extracted to integrations/git.js)
  gitExec,
  headHash,
  invalidateHeadHash,
  gitSyncBeforeBuster,
  gitPullForPolling,
  gitPullBeforePush,
  gitPushWithRetry,
  gitCommitAndPush,
} from '../pipeline-original.js';

export { default } from './runners/pipeline-runner.js';
