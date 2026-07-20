import { selectDeps } from '../core/deps.ts';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { swarmRoot, relPath, costLogDir } from '../core/paths.ts';
import { modelToHarness, resolveRuntime } from '../agents/runtime.ts';
import { spawnSession, trackAgent, untrackAgent } from '../agents/lifecycle.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { pollForFile, sleep } from './polling.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { discord } from '../integrations/discord.ts';
import {
  aggregateUsage,
  checkBudgetThresholds,
  emitBudgetWarnings,
  writeCostReport,
} from './observability.ts';
import { buildGovernanceSummary } from './governance-context.ts';
import { buildRunFacts } from './run-facts.ts';
import { copyTranscriptArtifact, sanitizeJsonEgress, sanitizeMarkdownText } from '../egress.ts';
import {
  onBudgetExceeded,
  onBudgetWarning,
  onSummaryStarted,
  onSummaryCompleted,
} from './telemetry.ts';
import {
  buildLatestPointer,
  buildRunCostSummary,
  buildRunTestSummary,
  buildSummaryArtifactBundle,
  getPipelineArtifactBundle,
} from './artifact-bundle.ts';
import {
  createTrackedSummarySessionRateLimitExhaustionOptions,
  createTrackedSummarySessionRateLimitRecoveryOptions,
  finalizeSummarySessionRateLimitExit,
  getRateLimitConfig,
  resolveTrackedSessionRateLimitOutcome,
  withSessionRateLimitRecovery,
} from './rate-limit.ts';
import {
  resolveResultAttempt,
  resolveStatusDispatchId,
  resolveStatusSessionKey,
} from './correlation.ts';
import { buildGeneratorArtifactRef, buildGeneratorResult } from './contracts/generator-result.ts';
import { createTrackedSummarySessionCleanup } from './summary-session-cleanup.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from './discord-fields.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { getReviewDefaultsConfig } from './runtime-defaults.ts';
import { finalizeSummaryEvidence, summaryEvidenceFields } from './evidence-plane.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function buildPipelineReviewDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, identity, extra);
}
function buildPipelineReviewDiscordCorrelation(identity = {}) {
  return {
    run_id: selectTruthyValue(() => (identity.run_id), () => (null)),
    attempt: selectDefinedValue(() => (identity.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (identity.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (identity.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (identity.session_key), () => (null)),
  };
}
function resolvePipelineReviewGatewayLabel(status) {
  return selectDefinedValue(() => (selectDefinedValue(() => (status?.gateway_label), () => (status?.active_agent?.gateway_label))), () => (null));
}

const DEFAULT_PIPELINE_REVIEW_DEPS = {
  spawnSession,
  terminateSession,
  trackAgent,
  untrackAgent,
  pollForFile,
  sleep,
  discord,
  copyTranscriptArtifact,
};

const COMPLETED_TERMINAL_STATUSES = new Set([0, 'succeeded', 'completed']);
const CUMULATIVE_COUNT_ABSENT = 0;
const PIPELINE_REVIEW_OUTPUT_FILE = 'logs/pipeline-review/PIPELINE-REVIEW.md';
const PIPELINE_REVIEW_JSON_OUTPUT_FILE = 'logs/pipeline-review/PIPELINE-REVIEW.json';
const PIPELINE_REVIEW_INSTRUCTIONS_FILE = 'pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md';
const PIPELINE_REVIEW_SUBAGENT_MODEL = 'gpt5';
const PIPELINE_REVIEW_HARNESS_AGENT = 'claude';
const PIPELINE_REVIEW_RATE_LIMIT_EXHAUSTED_REASON = 'rate_limit_exhausted';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function reviewConfig(config, progress = null) {
  return selectDefinedValue(() => (selectDefinedValue(() => (objectRecord(config?.pipeline_review)), () => (objectRecord(progress?.pipeline_review)))), () => ({}));
}

function budgetConfig(config) {
  return selectDefinedValue(() => (objectRecord(config?.observability?.budget)), () => ({}));
}

function cumulativeCount(value) {
  return selectDefinedValue(() => (value), () => (CUMULATIVE_COUNT_ABSENT));
}

function requireText(value, label) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${label}: required non-empty string`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function requireArtifactBundlePath(bundle, key) {
  return requireText(bundle?.[key], `pipeline artifact bundle.${key}`);
}

function pipelineReviewPathConfig(pr, key, fallback) {
  return selectDefinedValue(() => (pr[key]), () => (fallback));
}

function getPipelineReviewDeps(config, overrides = {}) {
  return { ...DEFAULT_PIPELINE_REVIEW_DEPS, ...selectDeps(overrides, 'pipelineReview') };
}

function requirePositiveTimeoutMinutes(value, label) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value <= 0))) {
    throw new Error(`${label}: required positive number in swarm.config.json`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}: required positive integer in swarm.config.json`);
  return value;
}

function resolvePipelineReviewMaxAttempts(pr) {
  return requirePositiveInteger(Number(selectDefinedValue(() => (pr.agent_max_attempts), () => (1))), 'config.pipeline_review.agent_max_attempts');
}

function removePipelineReviewOutputArtifacts(config, pr) {
  for (const artifactPath of [pipelineReviewOutputPath(config, pr), pipelineReviewJsonPath(config, pr)]) {
    try {
      if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
    } catch (_error) {}
  }
}

function normalizeLatestSummaryStatus(terminalStatus) {
  if (terminalStatus == null) return 'running';
  if (COMPLETED_TERMINAL_STATUSES.has(terminalStatus)) return 'completed';
  return 'failed';
}

/**
 * Cumulative summary projection.
 * Legacy module status.json scans were removed: terminal summaries now use typed
 * run_stats/read-model data collected by the runtime rather than re-reading
 * per-module lifecycle files with best-effort skip semantics.
 */
export function buildCumulativeSummary(config, progress) {
  const cumulative = selectTruthyValue(() => (selectTruthyValue(() => (progress?.run_stats?.cumulative), () => (progress?.cumulative))), () => (null));
  if (selectTruthyValue(() => (selectTruthyValue(() => (!cumulative), () => (typeof cumulative !== 'object'))), () => (Array.isArray(cumulative)))) return null;
  return {
    modules_completed: cumulativeCount(cumulative.modules_completed),
    modules_failed: cumulativeCount(cumulative.modules_failed),
    modules_blocked: cumulativeCount(cumulative.modules_blocked),
    total_forge_attempts: cumulativeCount(cumulative.total_forge_attempts),
    total_buster_attempts: cumulativeCount(cumulative.total_buster_attempts),
  };
}

export function writeSummary(config, terminalStatus, reasonCode, ctx = null, progress = null, terminalDecision = null) {
  const artifactBundle = getPipelineArtifactBundle(config);
  if (!artifactBundle.pipeline_dir) {
    return {
      output_dir: null,
      pipeline_summary_path: null,
      summary_json_path: null,
      latest_json_path: null,
      failed: false,
      reason: null,
    };
  }
  try {
    const stats = getRunStats(config);
    const startedAt = requireText(stats?.started_at, 'run_stats.started_at');

    // Cost/usage snapshot — OpenClaw model.usage aggregate only.
    let budgetStatus = null;
    let costReportPath = null;
    let usageAggregate = null;
    try {
      usageAggregate = aggregateUsage(config);
      const report = writeCostReport(config, { progress });
      const warnings = selectDefinedValue(() => (report?.warnings), () => (checkBudgetThresholds(usageAggregate, budgetConfig(config))));
      emitBudgetWarnings(config, warnings);
      if (ctx) {
        for (const warning of warnings) {
          if (warning.type === 'budget.exceeded') {
            onBudgetExceeded(ctx, warning.threshold, warning.current, warning.limit, warning.unit);
          } else if (warning.type === 'budget.warning') {
            onBudgetWarning(ctx, warning.threshold, warning.current, warning.limit, warning.unit);
          }
        }
      }
      budgetStatus = warnings.some((warning) => warning.type === 'budget.exceeded')
        ? 'exceeded_stop'
        : warnings.some((warning) => warning.type === 'budget.warning')
          ? 'warning'
          : 'ok';
      if (report) costReportPath = path.join(costLogDir(config), 'cost-report.json');
    } catch (e) {
      log('DEBUG', `[summary] Cost report failed (non-critical): ${errorMessage(e)}`);
    }

    const completedAt = new Date().toISOString();
    const durationSeconds = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
    const cumulative = buildCumulativeSummary(config, progress);
    const runFacts = buildRunFacts(config, progress, {
      terminal_status: terminalStatus,
      reason_code: reasonCode,
      started_at: startedAt,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
    });

    const run_stats = {
      modules_completed: stats.modules_completed,
      modules_failed: stats.modules_failed,
      modules_blocked: stats.modules_blocked,
      gates_completed: stats.gates_completed,
      gates_failed: stats.gates_failed,
      total_forge_attempts: stats.total_forge_attempts,
      total_buster_attempts: stats.total_buster_attempts,
      total_echo_reviews: stats.total_echo_reviews,
      errors: stats.errors,
      discord_notifications_sent: stats.discord_notifications_sent,
      git_pull_failures: stats.git_pull_failures,
      git_push_failures: stats.git_push_failures,
      config_validation_issues: stats.config_validation_issues,
    };

    const relativeCostReportPath = costReportPath
      ? path.relative(requireText(config.repo_root, 'config.repo_root'), costReportPath)
      : null;
    const summary = {
      run_id: artifactBundle.run_id,
      pipeline_run_id: artifactBundle.run_id,
      started_at: startedAt,
      completed_at: completedAt,
      ended_at: completedAt,
      terminal_status: selectDefinedValue(() => (terminalStatus), () => (null)),
      terminal_decision: selectDefinedValue(() => (terminalDecision), () => (null)),
      reason_code: reasonCode,
      project: config.project,
      telemetry_stream_key: artifactBundle.telemetry_stream_key,
      duration_seconds: durationSeconds,
      run_stats,
      run_facts: runFacts,
      modules: runFacts.modules,
      gates: runFacts.gates,
      tests: buildRunTestSummary(runFacts),
      ...(cumulative ? { cumulative } : {}),
      governance: buildGovernanceSummary(config),
      usage: {
        total_input_tokens: selectDefinedValue(() => (usageAggregate?.run?.input_tokens), () => (null)),
        total_output_tokens: selectDefinedValue(() => (usageAggregate?.run?.output_tokens), () => (null)),
        total_tokens: usageAggregate
          ? (usageAggregate.run.input_tokens) + (usageAggregate.run.output_tokens)
          : null,
        cost_usd: selectDefinedValue(() => (usageAggregate?.run?.estimated_cost_usd), () => (null)),
        cost_availability: usageAggregate?.run?.estimated_cost_usd != null
          ? 'available from OpenClaw model.usage diagnostics'
          : 'unavailable — no OpenClaw model.usage USD aggregate yet',
      },
      budget_threshold_status: budgetStatus,
      cost_report_path: relativeCostReportPath,
      cost: buildRunCostSummary({ usageAggregate, budgetStatus, costReportPath: relativeCostReportPath }),
      artifacts: buildSummaryArtifactBundle(config),
    };
    const pipelineDir = requireArtifactBundlePath(artifactBundle, 'pipeline_dir');
    const runLogDir = requireArtifactBundlePath(artifactBundle, 'run_log_dir');
    const runSummaryPath = requireArtifactBundlePath(artifactBundle, 'run_summary_path');
    const pipelineSummaryPath = requireArtifactBundlePath(artifactBundle, 'pipeline_summary_path');
    fs.mkdirSync(runLogDir, { recursive: true });
    const evidence = finalizeSummaryEvidence(config, { progress, terminalStatus, reasonCode, durationSeconds, runStats: run_stats, cost: summary.cost, summaryReference: artifactBundle.relative.summary_json });
    Object.assign(summary, summaryEvidenceFields(evidence));
    const enrichedSummary = sanitizeJsonEgress(summary, 'pipeline_summary');
    fs.writeFileSync(runSummaryPath, JSON.stringify(enrichedSummary, null, 2));
    fs.writeFileSync(pipelineSummaryPath, JSON.stringify(enrichedSummary, null, 2));

    // Write latest.json pointer atomically so operators can find the most recent run.
    const latestPath = requireArtifactBundlePath(artifactBundle, 'latest_json_path');
    const latestTmp = latestPath + '.tmp';
    fs.writeFileSync(latestTmp, JSON.stringify(sanitizeJsonEgress(buildLatestPointer(config, {
      status: normalizeLatestSummaryStatus(terminalStatus),
      startedAt: selectTruthyValue(() => (summary.started_at), () => (null)),
      completedAt: selectTruthyValue(() => (summary.completed_at), () => (null)),
      terminalStatus,
      terminalDecision: selectDefinedValue(() => (terminalDecision), () => (null)),
      runFacts,
      usageAggregate,
      budgetStatus,
      costReportPath: relativeCostReportPath,
    }), 'latest_pointer'), null, 2));
    fs.renameSync(latestTmp, latestPath);

    log('OK', `Pipeline summary written: terminal_status=${terminalStatus} (${reasonCode})`);
    return {
      output_dir: pipelineDir,
      pipeline_summary_path: pipelineSummaryPath,
      summary_json_path: runSummaryPath,
      latest_json_path: latestPath,
      failed: false,
      reason: null,
    };
  } catch (e) {
    log('WARN', `Failed to write summary.json: ${errorMessage(e)}`);
    return {
      output_dir: artifactBundle.pipeline_dir,
      pipeline_summary_path: null,
      summary_json_path: null,
      latest_json_path: null,
      failed: true,
      reason: errorMessage(e),
    };
  }
}

export function pipelineReviewOutputPath(config, pr = {}) {
  return path.join(swarmRoot(config), pipelineReviewPathConfig(pr, 'output_file', PIPELINE_REVIEW_OUTPUT_FILE));
}

export function pipelineReviewJsonPath(config, pr = {}) {
  return path.join(swarmRoot(config), pipelineReviewPathConfig(pr, 'json_output_file', PIPELINE_REVIEW_JSON_OUTPUT_FILE));
}

export function pipelineReviewInstructionsPath(config, pr = {}) {
  return path.join(swarmRoot(config), pipelineReviewPathConfig(pr, 'instructions_file', PIPELINE_REVIEW_INSTRUCTIONS_FILE));
}

export function pipelineReviewAgentId(model, pr = {}) {
  if (pr.agent_id) return pr.agent_id;
  const dispatch = resolveRuntime({ model });
  if (dispatch === 'subagent') return `${String(selectDefinedValue(() => (model), () => (PIPELINE_REVIEW_SUBAGENT_MODEL))).split('/').pop().replace(/[^a-zA-Z0-9._-]+/g, '-')}_pipeline-review`;
  return selectDefinedValue(() => (modelToHarness(model)), () => (PIPELINE_REVIEW_HARNESS_AGENT));
}

export function writePipelineReviewInstructions(config, pr = {}) {
  const out = pipelineReviewOutputPath(config, pr);
  const jsonOut = pipelineReviewJsonPath(config, pr);
  const pathOut = pipelineReviewInstructionsPath(config, pr);
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });
  const artifacts = getPipelineArtifactBundle(config);
  const pipelineLogPath = requireArtifactBundlePath(artifacts, 'run_pipeline_jsonl_path');
  const summaryJsonPath = requireArtifactBundlePath(artifacts, 'run_summary_path');
  const reviewMdPath = relPath(config, out);
  const reviewJsonPath = relPath(config, jsonOut);
  const runId = requireText(getRunId(config), 'run_id');
  const content = `You are reviewing a completed pipeline run for project: ${config.project}

## Run Data Available
- Pipeline log: ${pipelineLogPath}
- Summary JSON: ${summaryJsonPath}
- Lifecycle read models: check logs/pipeline/runs/${runId}/lifecycle/read-models.json
- Saved prompt artifacts: check module log dirs for forge-prompt-*.md and buster-prompt-*.md

## What to analyze

### 1. Architecture observations
Were there patterns in how Forge/Buster/Echo behaved that suggest architectural improvements?

### 2. Agent performance patterns
Which modules had multiple retries? What were the common failure modes?
Did any modules have consistent patterns (e.g., always failing pre-check, always needing Nova)?

### 3. Prompt effectiveness signals
Did agents frequently miss sections of the prompt? Were certain instructions ignored repeatedly?
Suggest specific prompt improvements.

### 4. Test quality signals
Did Buster tests catch real issues? Were there false positives? Tests that never failed?
Suggest test improvements for modules that passed too easily.
Before marking this run healthy, actively look for weak module-owned assertions, ownership leaks, unverified assumptions, and missing expected artifacts.
Do not treat a passing shared build or generic health check as enough when a module owns a specific route, asset, manifest, or integration contract.

### 5. Pipeline configuration recommendations
Based on this run: suggested changes to timeout_minutes, max_fails, auto_retry_threshold per module.

### 6. Specific improvements for next run
Concrete list of changes ranked by expected impact.

## Output

Write two files:
1. ${reviewMdPath} — Human-readable markdown review
2. ${reviewJsonPath} — Structured JSON:
{
  "status": "REVIEWED",
  "project": "${config.project}",
  "run_id": "${runId}",
  "architecture_observations": [],
  "agent_performance": { "modules_with_retries": [], "common_failure_modes": [] },
  "prompt_effectiveness": [],
  "test_quality": [],
  "config_recommendations": [],
  "improvements_next_run": []
}
`;
  fs.writeFileSync(pathOut, sanitizeMarkdownText(content));
  return pathOut;
}

export async function generatePipelineReview(config, progress, opts = {}) {
  const deps = getPipelineReviewDeps(config, opts.deps);
  const pr = reviewConfig(config, progress);
  const runId = requireText(getRunId(config), 'run_id');
  const executionAttempt = requirePositiveInteger(Number(selectDefinedValue(() => (opts.pipelineReviewExecutionAttempt), () => (1))), 'pipeline_review.execution_attempt');
  const maxExecutionAttempts = resolvePipelineReviewMaxAttempts(pr);
  let sessionKey = null;
  let model = requireText(pr.model, 'config.pipeline_review.model');
  let agentId = pipelineReviewAgentId(model, pr);
  let label = null;
  let dispatch = null;
  let reviewAttempt = resolveResultAttempt(pr);
  let reviewDispatchId = null;
  let reviewGatewayLabel = null;
  let lastReviewStatus = null;
  let trackingKey = null;
  const cleanupSummarySession = createTrackedSummarySessionCleanup(deps, {
    config,
    sessionKey: () => sessionKey,
    trackingKey: () => trackingKey,
    runtime: () => dispatch,
    model: () => model,
    agentId: () => agentId,
    label: () => label,
  }, { summaryType: 'pipeline_review' });
  try {
    dispatch = resolveRuntime({ model });
    removePipelineReviewOutputArtifacts(config, pr);
    const instructionsPath = writePipelineReviewInstructions(config, pr);
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    label = `pipeline-review-${Date.now()}`;
    reviewGatewayLabel = null;
    const cwd = config.repo_root;
    const thinking = selectTruthyValue(() => (pr.thinking_level), () => (null));
    const reviewDefaults = getReviewDefaultsConfig(config);
    const timeoutMin = pr.timeout_minutes !== undefined
      ? requirePositiveTimeoutMinutes(pr.timeout_minutes, 'config.pipeline_review.timeout_minutes')
      : requirePositiveTimeoutMinutes(reviewDefaults.timeout_minutes, 'config.review_defaults.timeout_minutes');
    onSummaryStarted({ config }, 'pipeline_review', {
      attempt: reviewAttempt,
      gateway_label: reviewGatewayLabel,
      model,
      runtime: dispatch,
    });
    log('STEP', `Spawning pipeline review (${dispatch}): ${agentId} / ${model}`);
    const sessionData = await deps.spawnSession({
      session: { model, runtime: dispatch, agentId, cwd, label },
    }, instructions, timeoutMin * 60, {
      ...sessionLifecyclePolicies(config),
      runtime: dispatch,
      model,
      agentId,
      cwd,
      label,
      thinking,
      trackActive: false,
      budget: selectDefinedValue(() => (opts.budget), () => (null)),
      signal: selectDefinedValue(() => (opts.signal), () => (null)),
    });
    sessionKey = requireText(sessionData.childSessionKey, 'pipeline_review.session_key');
    const streamLogPath = selectDefinedValue(() => (sessionData.streamLogPath), () => (null));
    trackingKey = `pipeline-review-${agentId}`;
    reviewAttempt = selectDefinedValue(() => (selectDefinedValue(() => (resolveResultAttempt(sessionData)), () => (reviewAttempt))), () => (null));
    deps.trackAgent(config, trackingKey, sessionKey, agentId, label, streamLogPath, {
      model,
      runtime: dispatch,
      telemetry_module_id: 'pipeline-review',
      telemetry_agent_type: 'echo',
      telemetry_attempt: reviewAttempt,
    });
    const spawnDiscordIdentity = { run_id: runId, attempt: reviewAttempt, gateway_label: reviewGatewayLabel, session_key: sessionKey };
    await deps.discord(config, 'INFO', '📋 Pipeline Review Spawned', 'Reviewing full pipeline run.', buildPipelineReviewDiscordFields(spawnDiscordIdentity, [
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Dispatch', value: dispatch, inline: true },
    ]), { correlation: buildPipelineReviewDiscordCorrelation(spawnDiscordIdentity) }).catch((e) => {
      log('DEBUG', `Pipeline review spawn Discord notice failed: ${errorMessage(e)}`);
    });
    const outputFilePath = pipelineReviewOutputPath(config, pr);
    const maxRateLimitPauses = getRateLimitConfig(config).max_pauses_per_module;
    const reviewRateLimitRecovery = createTrackedSummarySessionRateLimitRecoveryOptions(config, {
      sleepFn: deps.sleep,
      discordFn: deps.discord,
      buildFields: buildPipelineReviewDiscordFields,
      moduleId: 'pipeline-review',
      identity: {
        agent_type: 'echo',
        run_id: runId,
        attempt: selectDefinedValue(() => (reviewAttempt), () => (resolveResultAttempt(pr))),
        dispatch_id: reviewDispatchId,
        gateway_label: reviewGatewayLabel,
        session_key: sessionKey,
      },
      agentId,
      model,
      resumeDescription: 'Resuming pipeline review.',
      pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `Pipeline review rate limited (pause ${pauseCount}/${maxPauses}) - sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
      resumeLogMessage: () => 'Pipeline review cooldown complete - retrying review poll',
    });
    let pollRes = await withSessionRateLimitRecovery(config,
      () => deps.pollForFile(config, outputFilePath, timeoutMin, 'Pipeline Review', trackingKey),
      reviewRateLimitRecovery
    );
    const trackedReviewOutcome = resolveTrackedSessionRateLimitOutcome(pollRes, reviewRateLimitRecovery, {
      attempt: reviewAttempt,
      dispatchId: reviewDispatchId,
      gatewayLabel: reviewGatewayLabel,
      lastStatus: lastReviewStatus,
    });
    reviewAttempt = trackedReviewOutcome.attempt;
    reviewDispatchId = trackedReviewOutcome.dispatchId;
    reviewGatewayLabel = (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(trackedReviewOutcome.status)), () => (reviewGatewayLabel))), () => (null)));
    lastReviewStatus = trackedReviewOutcome.status;

    const archiveDir = path.join(swarmRoot(config), 'logs', 'pipeline-review');
    fs.mkdirSync(archiveDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (dispatch === 'acp' && streamLogPath && fs.existsSync(streamLogPath)) {
      deps.copyTranscriptArtifact(streamLogPath, path.join(archiveDir, `pipeline-review-transcript-${ts}.jsonl`));
    }

    await cleanupSummarySession('post-poll');
    if (pollRes?.rate_limit_exhausted) {
      const reviewRateLimitExit = await finalizeSummarySessionRateLimitExit(pollRes, {
        config,
        moduleId: 'pipeline-review',
        summaryType: 'pipeline_review',
        phase: 'pipeline_review',
        exhaustedReason: 'Pipeline review exceeded max ACP rate limit pauses',
        identity: {
          agent_type: 'echo',
          run_id: runId,
          attempt: reviewAttempt,
          dispatch_id: reviewDispatchId,
          gateway_label: reviewGatewayLabel,
          session_key: sessionKey,
        },
        maxPauses: maxRateLimitPauses,
        model,
        runtime: dispatch,
        ...createTrackedSummarySessionRateLimitExhaustionOptions({
          agentId,
          model,
          timeoutMinutes: timeoutMin,
          notifyDiscord: deps.discord,
          discordTitle: '📋 Pipeline Review Rate Limit Exhausted',
          discordSubject: 'Pipeline review',
          discordFieldBuilder: buildPipelineReviewDiscordFields,
          discordIdentity: { run_id: runId },
        }),
      });
      reviewAttempt = requirePositiveTimeoutMinutes(reviewRateLimitExit.attempt, 'pipeline_review.rate_limit_exit.attempt');
      lastReviewStatus = selectDefinedValue(() => (reviewRateLimitExit.rate_limit_status), () => (null));
      return {
        ...reviewRateLimitExit,
        ...buildGeneratorResult('pipeline_review', {
          outputs: {
            status: 'failed',
            reason: selectDefinedValue(() => (reviewRateLimitExit.reason), () => (PIPELINE_REVIEW_RATE_LIMIT_EXHAUSTED_REASON)),
            rate_limit_exhausted: true,
          },
          diagnostics: {
            rate_limit_status: selectDefinedValue(() => (reviewRateLimitExit.rate_limit_status), () => (null)),
          },
        }),
      };
    }
    if (!pollRes.ok) {
      reviewAttempt = selectDefinedValue(() => (selectDefinedValue(() => (resolveResultAttempt(pollRes)), () => (reviewAttempt))), () => (null));
      const failureReason = pollRes?.status?.detail
        ? `${pollRes.reason} (${pollRes.status.detail})`
        : pollRes.reason;
      const failureClass = pollRes?.reason === 'timeout' ? 'timeout' : 'pipeline_review_failed';
      if (pollRes?.reason === 'session_ended_no_output' && executionAttempt < maxExecutionAttempts) {
        log('WARN', `Pipeline review produced no output (${failureReason}); retrying attempt ${executionAttempt + 1}/${maxExecutionAttempts}`);
        return generatePipelineReview(config, progress, {
          ...opts,
          pipelineReviewExecutionAttempt: executionAttempt + 1,
        });
      }
      const noOutputDiscordIdentity = {
        run_id: runId,
        attempt: reviewAttempt,
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (reviewDispatchId))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(pollRes?.status)), () => (reviewGatewayLabel))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
      };
      await deps.discord(config, 'WARN', '📋 Pipeline Review: No Output', `Review agent finished without producing a report. Reason: ${failureReason}`, [
        ...buildPipelineReviewDiscordFields(noOutputDiscordIdentity),
        { name: 'Timeout', value: `${timeoutMin}min`, inline: true },
        { name: 'Agent', value: agentId, inline: true },
        { name: 'Model', value: model, inline: true },
      ], { correlation: buildPipelineReviewDiscordCorrelation(noOutputDiscordIdentity) }).catch((e) => {
        log('DEBUG', `Pipeline review timeout/failure Discord notice failed: ${errorMessage(e)}`);
      });
      onSummaryCompleted({ config }, 'pipeline_review', {
        attempt: reviewAttempt,
        status: 'failed',
        reason: `Pipeline review failed: ${failureReason}`,
        dispatch_id: noOutputDiscordIdentity.dispatch_id,
        session_key: noOutputDiscordIdentity.session_key,
        gateway_label: noOutputDiscordIdentity.gateway_label,
        model,
        runtime: dispatch,
      });
      log('WARN', `Pipeline review failed: ${failureReason}`);
      return buildGeneratorResult('pipeline_review', {
        outputs: {
          status: 'failed',
          reason: `Pipeline review failed after ${executionAttempt} attempt(s): ${failureReason}`,
          failure_class: failureClass,
          attempt: reviewAttempt,
          execution_attempt: executionAttempt,
          runtime: dispatch,
          model,
        },
        diagnostics: {
          failure_class: failureClass,
          max_execution_attempts: maxExecutionAttempts,
          dispatch_id: noOutputDiscordIdentity.dispatch_id,
          session_key: noOutputDiscordIdentity.session_key,
          gateway_label: noOutputDiscordIdentity.gateway_label,
        },
      });
    }

    try {
      const reviewMd = fs.readFileSync(outputFilePath, 'utf8');
      // Send full review content across description + fields (Discord limits: 4096 desc, 1024/field)
      const maxDesc = 3900;
      const desc = reviewMd.length <= maxDesc ? reviewMd : reviewMd.slice(0, maxDesc) + '\n\n*[truncated — see full report]*';
      const fields = [{ name: 'Full Report', value: '`.swarm/logs/pipeline-review/PIPELINE-REVIEW.md`', inline: false }];
      // If content was truncated, send overflow as additional fields
      if (reviewMd.length > maxDesc) {
        const remaining = reviewMd.slice(maxDesc);
        for (let i = 0; i < remaining.length && fields.length < 8; i += 950) {
          fields.push({ name: `(continued ${fields.length})`, value: remaining.slice(i, i + 950), inline: false });
        }
      }
      const completeDiscordIdentity = {
        run_id: runId,
        attempt: reviewAttempt,
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (reviewDispatchId))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(pollRes?.status)), () => (reviewGatewayLabel))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
      };
      fields.unshift(...buildPipelineReviewDiscordFields(completeDiscordIdentity));
      await deps.discord(config, 'OK', '📋 Pipeline Review Complete', desc, fields, { correlation: buildPipelineReviewDiscordCorrelation(completeDiscordIdentity) });
      onSummaryCompleted({ config }, 'pipeline_review', {
        attempt: reviewAttempt,
        status: 'ok',
        output: outputFilePath,
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (reviewDispatchId))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(pollRes?.status)), () => (reviewGatewayLabel))), () => (null))),
        model,
        runtime: dispatch,
      });
      log('OK', 'Pipeline review completed');
      return buildGeneratorResult('pipeline_review', {
        artifacts: [
          buildGeneratorArtifactRef('pipeline_review', outputFilePath, { role: 'output', format: 'markdown' }),
          buildGeneratorArtifactRef('pipeline_review', pipelineReviewJsonPath(config, pr), { role: 'output', format: 'json' }),
          buildGeneratorArtifactRef('pipeline_review_instructions', instructionsPath, { role: 'input', format: 'markdown' }),
        ],
        outputs: {
          status: 'ok',
          output: outputFilePath,
          json_output: pipelineReviewJsonPath(config, pr),
          dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (reviewDispatchId))), () => (null))),
          session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
          gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(pollRes?.status)), () => (reviewGatewayLabel))), () => (null))),
          attempt: reviewAttempt,
          runtime: dispatch,
          model,
        },
      });
    } catch (e) {
      const postErrorMessage = errorMessage(e);
      log('WARN', `Pipeline review Discord post failed (non-critical): ${postErrorMessage}`);
      const postErrorDiscordIdentity = {
        run_id: runId,
        attempt: reviewAttempt,
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (reviewDispatchId))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(pollRes?.status)), () => (reviewGatewayLabel))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
      };
      await deps.discord(config, 'WARN', '📋 Pipeline Review: Post Error', `Review completed but Discord post failed: ${postErrorMessage}`,
        buildPipelineReviewDiscordFields(postErrorDiscordIdentity),
        { correlation: buildPipelineReviewDiscordCorrelation(postErrorDiscordIdentity) },
      ).catch((postErrorNoticeError) => {
        log('DEBUG', `Pipeline review post-error Discord notice failed: ${errorMessage(postErrorNoticeError)}`);
      });
      return buildGeneratorResult('pipeline_review', {
        artifacts: [
          buildGeneratorArtifactRef('pipeline_review', outputFilePath, { role: 'output', format: 'markdown' }),
          buildGeneratorArtifactRef('pipeline_review', pipelineReviewJsonPath(config, pr), { role: 'output', format: 'json' }),
          buildGeneratorArtifactRef('pipeline_review_instructions', instructionsPath, { role: 'input', format: 'markdown' }),
        ],
        outputs: {
          status: 'ok',
          output: outputFilePath,
          json_output: pipelineReviewJsonPath(config, pr),
          dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (reviewDispatchId))), () => (null))),
          session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
          gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(pollRes?.status)), () => (reviewGatewayLabel))), () => (null))),
          attempt: reviewAttempt,
          runtime: dispatch,
          model,
        },
        diagnostics: {
          post_error: postErrorMessage,
        },
      });
    }
  } catch (e) {
    const failureMessage = errorMessage(e);
    onSummaryCompleted({ config }, 'pipeline_review', {
      attempt: reviewAttempt,
      status: 'failed',
      reason: failureMessage,
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(lastReviewStatus)), () => (reviewDispatchId))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(lastReviewStatus)), () => (sessionKey))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(lastReviewStatus)), () => (reviewGatewayLabel))), () => (null))),
      model,
      runtime: dispatch,
    });
    log('WARN', `Pipeline review failed (non-critical): ${failureMessage}`);
    const failedDiscordIdentity = {
      run_id: runId,
      attempt: reviewAttempt,
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(lastReviewStatus)), () => (reviewDispatchId))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(lastReviewStatus)), () => (reviewGatewayLabel))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(lastReviewStatus)), () => (sessionKey))), () => (null))),
    };
    await deps.discord(config, 'WARN', '📋 Pipeline Review Failed', `Review agent error: ${failureMessage.split('\n')[0]}`,
      buildPipelineReviewDiscordFields(failedDiscordIdentity),
      { correlation: buildPipelineReviewDiscordCorrelation(failedDiscordIdentity) },
    ).catch((discordError) => {
      log('DEBUG', `Pipeline review failure Discord notice failed: ${errorMessage(discordError)}`);
    });
    return buildGeneratorResult('pipeline_review', {
      outputs: {
        status: 'failed',
        reason: failureMessage,
        attempt: reviewAttempt,
        runtime: dispatch,
        model,
      },
      diagnostics: {
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(lastReviewStatus)), () => (reviewDispatchId))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(lastReviewStatus)), () => (sessionKey))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolvePipelineReviewGatewayLabel(lastReviewStatus)), () => (reviewGatewayLabel))), () => (null))),
      },
    });
  } finally {
    await cleanupSummarySession('finally');
  }
}

export { caseStudyOutputPath, caseStudyInstructionsPath, caseStudyAgentId, generateCaseStudy } from './case-study.ts';

export { generateProjectSummary } from './summary/project-summary.ts';
