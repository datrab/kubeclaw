// Named exports from extracted modules
export { loadConfig, validateConfig, validateBusterConfig, resolveModel } from './core/config.js';
export { RUN_ID, _runStats, createRunId, createRunStats, setRunState, bindRunContext, resolveRunContext, getRunState, getRunId, getRunStats, output, loadProgress } from './core/runtime.js';
export { getRepoRoot, gitExec, headHash, invalidateHeadHash, setRepoRoot } from './core/git.js';
export { modulePath, statusPath, swarmRoot, projectSrcPath, relPath, completionStreamKey, gateStatusPath, moduleLogDir, moduleTestLogDir, moduleLintLogDir, gateLogDir, gateTestLogDir, gateLintLogDir, validateSafePath, costLogDir, redisLogDir, archValidatorLogDir } from './core/paths.js';
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
export { discord } from './integrations/discord.js';

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
  publishTranscriptDelta,
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
  getTrackedAgentCount,
} from './agents/shutdown.js';

// Status and exit code constants (module 16)
export { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from './core/constants.js';

// Polling and rate-limit service exports (module 08)
export { sleep, pollResult, pollGeneric, pollForFile, pollStatus, pollForSessionEnd, pollDual, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery, archiveModuleCompletions, readCompletionFromRedis } from './services/polling.js';
export { withRateLimitRecovery, handleRateLimit } from './services/rate-limit.js';
export { FAIL_PATTERNS, extractAgentFailReason, extractPreTestFailReason, getFailedSuiteNames, handleFail, buildNovaEscalation, injectNeedsNova, resolveAutoRetryThreshold } from './services/failures.js';
export { emitEvent, onPipelineStarted, onPipelineCompleted, onPipelineHalted, onModuleStarted, onModulePass, onModuleFail, onModuleBlocked, onGateStarted, onGatePass, onGateFail, onAgentSpawned, onAgentKilled, onPhaseStarted, onPhaseCompleted, onRetryScheduled, onRetryExhausted, onEscalated, onSummaryStarted, onSummaryCompleted, onBudgetWarning, onBudgetExceeded, onRedisMessage, emitCostUpdate, emitRateLimitDetected, emitBusterResult, emitTranscriptLine, emitAgentProgress, emitMemoryRecalled } from './services/telemetry.js';
export { appendStructuredEvent, recordUsageSnapshot, aggregateUsage, isBudgetExceeded, emitBudgetWarnings } from './services/observability.js';
export { logRedisExchange, logRedisSent, logRedisReceived, closeRedisLog } from './services/redis-log.js';
export { captureSessionSnapshot, writeUsageArtifact, writeCostReport, checkBudgetThresholds, accumulateTokens } from './services/cost.js';

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
  writePipelineReviewInstructions,
  pipelineReviewOutputPath,
  pipelineReviewJsonPath,
  pipelineReviewInstructionsPath,
  pipelineReviewDispatchMode,
  pipelineReviewAgentId,
} from './services/summary.js';
export {
  generateCaseStudy,
  caseStudyOutputPath,
  caseStudyInstructionsPath,
  caseStudyDispatchMode,
  caseStudyAgentId,
} from './services/case-study.js';

// Architecture validator (module 08)
export { runArchValidator, archValidatorLogDir, buildMarkdownSummary, isBlocking, buildValidatorPrompt, SEVERITY, SCOPE, FINDING_CODES } from './services/arch-validator.js';

// Lint / pre-check helpers (module 03)
export { generateLintReport, formatLintReportForReviewer, runPreCheck } from './services/lint.js';

// Module dependency checker (module 03)
export { checkDependencies } from './services/dependencies.js';

// Git utilities — owned by integrations/git.js
export { gitPullForPolling, gitPullBeforePush, gitPushWithRetry, gitCommitAndPush, gitSyncBeforeBuster } from './integrations/git.js';

export { default } from './runners/pipeline-runner.js';
