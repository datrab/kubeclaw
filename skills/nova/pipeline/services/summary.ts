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
import { copyRedactedTranscriptArtifact, sanitizeJsonEgress, sanitizeMarkdownText } from '../redaction.ts';
import {
  onBudgetExceeded,
  onBudgetWarning,
  onSummaryStarted,
  onSummaryCompleted,
} from './telemetry.ts';
import { buildLatestPointer, buildSummaryArtifactBundle, getPipelineArtifactBundle } from './artifact-bundle.ts';
import {
  createTrackedSummarySessionRateLimitExhaustionOptions,
  createTrackedSummarySessionRateLimitRecoveryOptions,
  finalizeSummarySessionRateLimitExit,
  resolveTrackedSessionRateLimitOutcome,
  withSessionRateLimitRecovery,
} from './rate-limit.ts';
import {
  resolveResultAttempt,
  resolveStatusDispatchId,
  resolveStatusSessionKey,
} from './correlation.ts';
import { buildGeneratorResult } from './contracts/generator-result.ts';
import { createTrackedSummarySessionCleanup } from './summary-session-cleanup.ts';

function buildPipelineReviewDiscordFields(identity = {}, extra = []) {
  const fields = [];
  if (identity.run_id) fields.push({ name: 'Run ID', value: identity.run_id, inline: true, correlation_key: 'run_id' });
  if (identity.attempt != null) fields.push({ name: 'Attempt', value: `${identity.attempt}`, inline: true, correlation_key: 'attempt' });
  if (identity.dispatch_id) fields.push({ name: 'Dispatch', value: identity.dispatch_id, inline: false, correlation_key: 'dispatch_id' });
  if (identity.gateway_label) fields.push({ name: 'Gateway Label', value: identity.gateway_label, inline: false, correlation_key: 'gateway_label' });
  if (identity.session_key) fields.push({ name: 'Session', value: identity.session_key, inline: false, correlation_key: 'session_key' });
  return [...fields, ...extra];
}

function resolvePipelineReviewGatewayLabel(status) {
  return status?.gateway_label ?? status?.active_agent?.gateway_label ?? null;
}

const DEFAULT_PIPELINE_REVIEW_DEPS = {
  spawnSession,
  terminateSession,
  trackAgent,
  untrackAgent,
  pollForFile,
  sleep,
  discord,
  copyRedactedTranscriptArtifact,
};

function getPipelineReviewDeps(config, overrides = {}) {
  return { ...DEFAULT_PIPELINE_REVIEW_DEPS, ...selectDeps(overrides, 'pipelineReview') };
}

/**
 * Cumulative summary projection.
 * Legacy module status.json scans were removed: terminal summaries now use typed
 * run_stats/read-model data collected by the runtime rather than re-reading
 * per-module lifecycle files with best-effort skip semantics.
 */
export function buildCumulativeSummary(config, progress) {
  const cumulative = progress?.run_stats?.cumulative || progress?.cumulative || null;
  if (!cumulative || typeof cumulative !== 'object' || Array.isArray(cumulative)) return null;
  return {
    modules_completed: cumulative.modules_completed ?? 0,
    modules_failed: cumulative.modules_failed ?? 0,
    modules_blocked: cumulative.modules_blocked ?? 0,
    total_forge_attempts: cumulative.total_forge_attempts ?? 0,
    total_buster_attempts: cumulative.total_buster_attempts ?? 0,
  };
}

export function writeSummary(config, exitCode, exitReason, ctx = null, progress = null) {
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
    const startedAt = stats?.started_at || new Date().toISOString();

    // Cost/usage snapshot — OpenClaw model.usage aggregate only.
    let budgetStatus = null;
    let costReportPath = null;
    let usageAggregate = null;
    try {
      usageAggregate = aggregateUsage(config);
      const report = writeCostReport(config);
      const warnings = report?.warnings || checkBudgetThresholds(usageAggregate, config?.observability?.budget || {});
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
      log('DEBUG', `[summary] Cost report failed (non-critical): ${e.message}`);
    }

    const cumulative = buildCumulativeSummary(config, progress);

    // run_stats: current-run-only counters (existing behavior, renamed to sub-object)
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

    // Top-level fields: populated from cumulative when available (backward compat for readers
    // expecting modules_completed, total_forge_attempts, etc. at the top level).
    const topLevel = cumulative
      ? {
          modules_completed: cumulative.modules_completed,
          modules_failed: cumulative.modules_failed,
          modules_blocked: cumulative.modules_blocked,
          total_forge_attempts: cumulative.total_forge_attempts,
          total_buster_attempts: cumulative.total_buster_attempts,
        }
      : {
          modules_completed: stats.modules_completed,
          modules_failed: stats.modules_failed,
          modules_blocked: stats.modules_blocked,
          total_forge_attempts: stats.total_forge_attempts,
          total_buster_attempts: stats.total_buster_attempts,
        };

    const completedAt = new Date().toISOString();
    const summary = {
      run_id: artifactBundle.run_id,
      started_at: startedAt,
      completed_at: completedAt,
      ended_at: completedAt,
      exit_code: exitCode,
      exit_reason: exitReason,
      project: config.project,
      telemetry_stream_key: artifactBundle.telemetry_stream_key,
      ...topLevel,
      gates_completed: stats.gates_completed,
      gates_failed: stats.gates_failed,
      total_echo_reviews: stats.total_echo_reviews,
      errors: stats.errors,
      discord_notifications_sent: stats.discord_notifications_sent,
      git_pull_failures: stats.git_pull_failures,
      git_push_failures: stats.git_push_failures,
      config_validation_issues: stats.config_validation_issues,
      duration_seconds: Math.round((Date.now() - new Date(startedAt).getTime()) / 1000),
      run_stats,
      ...(cumulative ? { cumulative } : {}),
      governance: buildGovernanceSummary(config),
      usage: {
        total_input_tokens: usageAggregate?.run?.input_tokens ?? null,
        total_output_tokens: usageAggregate?.run?.output_tokens ?? null,
        total_tokens: usageAggregate
          ? (usageAggregate.run.input_tokens ?? 0) + (usageAggregate.run.output_tokens ?? 0)
          : null,
        cost_usd: usageAggregate?.run?.estimated_cost_usd ?? null,
        cost_availability: usageAggregate?.run?.estimated_cost_usd != null
          ? 'available from OpenClaw model.usage diagnostics'
          : 'unavailable — no OpenClaw model.usage USD aggregate yet',
      },
      budget_threshold_status: budgetStatus,
      cost_report_path: costReportPath
        ? path.relative(config.repo_root || artifactBundle.pipeline_dir, costReportPath)
        : null,
      artifacts: buildSummaryArtifactBundle(config),
    };
    const pipelineDir = artifactBundle.pipeline_dir;
    const runLogDir = artifactBundle.run_log_dir || pipelineDir;
    const runSummaryPath = artifactBundle.run_summary_path || path.join(runLogDir, 'summary.json');
    const pipelineSummaryPath = artifactBundle.pipeline_summary_path || path.join(pipelineDir, 'summary.json');
    fs.mkdirSync(runLogDir, { recursive: true });
    const safeSummary = sanitizeJsonEgress(summary, 'pipeline_summary');
    fs.writeFileSync(runSummaryPath, JSON.stringify(safeSummary, null, 2));
    fs.writeFileSync(pipelineSummaryPath, JSON.stringify(safeSummary, null, 2));

    // Write latest.json pointer atomically so operators can find the most recent run.
    const latestPath = artifactBundle.latest_json_path || path.join(pipelineDir, 'latest.json');
    const latestTmp = latestPath + '.tmp';
    fs.writeFileSync(latestTmp, JSON.stringify(sanitizeJsonEgress(buildLatestPointer(config, {
      status: exitCode === null ? 'running' : (exitCode === 0 ? 'completed' : 'failed'),
      startedAt: summary.started_at || null,
      completedAt: summary.completed_at || null,
      exitCode,
    }), 'latest_pointer'), null, 2));
    fs.renameSync(latestTmp, latestPath);

    log('OK', `Pipeline summary written: exit=${exitCode} (${exitReason})`);
    return {
      output_dir: pipelineDir,
      pipeline_summary_path: pipelineSummaryPath,
      summary_json_path: runSummaryPath,
      latest_json_path: latestPath,
      failed: false,
      reason: null,
    };
  } catch (e) {
    log('WARN', `Failed to write summary.json: ${e.message}`);
    return {
      output_dir: artifactBundle.pipeline_dir,
      pipeline_summary_path: null,
      summary_json_path: null,
      latest_json_path: null,
      failed: true,
      reason: e.message || 'unknown',
    };
  }
}

export function pipelineReviewOutputPath(config, pr = {}) {
  return path.join(swarmRoot(config), pr.output_file || 'logs/pipeline-review/PIPELINE-REVIEW.md');
}

export function pipelineReviewJsonPath(config, pr = {}) {
  return path.join(swarmRoot(config), pr.json_output_file || 'logs/pipeline-review/PIPELINE-REVIEW.json');
}

export function pipelineReviewInstructionsPath(config, pr = {}) {
  return path.join(swarmRoot(config), pr.instructions_file || 'pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md');
}

export function pipelineReviewAgentId(model, pr = {}) {
  if (pr.agent_id) return pr.agent_id;
  const dispatch = resolveRuntime({ model });
  if (dispatch === 'subagent') return `${String(model || 'gpt5').split('/').pop().replace(/[^a-zA-Z0-9._-]+/g, '-')}_pipeline-review`;
  return modelToHarness(model) || 'claude';
}

export function writePipelineReviewInstructions(config, pr = {}) {
  const out = pipelineReviewOutputPath(config, pr);
  const jsonOut = pipelineReviewJsonPath(config, pr);
  const pathOut = pipelineReviewInstructionsPath(config, pr);
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });
  const artifacts = getPipelineArtifactBundle(config);
  const pipelineLogPath = artifacts.run_pipeline_jsonl_path || artifacts.global_pipeline_jsonl_path;
  const summaryJsonPath = artifacts.run_summary_path || artifacts.pipeline_summary_path;
  const reviewMdPath = relPath(config, out);
  const reviewJsonPath = relPath(config, jsonOut);
  const runId = getRunId(config);
  const content = `You are reviewing a completed pipeline run for project: ${config.project}

## Run Data Available
- Pipeline log: ${pipelineLogPath}
- Summary JSON: ${summaryJsonPath}
- Lifecycle read models: check logs/pipeline/runs/${runId || '<run-id>'}/lifecycle/read-models.json
- Saved prompt artifacts: check module log dirs for forge-prompt-*.md and buster-prompt-*.md; these files contain redacted metadata only, not raw prompt text

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
  const pr = config.pipeline_review || progress?.pipeline_review || {};
  const runId = getRunId(config);
  let sessionKey = null;
  let model = pr.model || progress?.defaults?.models?.echo || config.fallback_model;
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
    const instructionsPath = writePipelineReviewInstructions(config, pr);
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    label = `pipeline-review-${Date.now()}`;
    reviewGatewayLabel = null;
    const cwd = config.repo_root;
    const thinking = pr.thinking_level || null;
    onSummaryStarted({ config }, 'pipeline_review', {
      attempt: reviewAttempt,
      gateway_label: reviewGatewayLabel,
      model,
      runtime: dispatch,
    });
    log('STEP', `Spawning pipeline review (${dispatch}): ${agentId} / ${model}`);
    const sessionData = await deps.spawnSession({
      session: { model, runtime: dispatch, agentId, cwd, label },
    }, instructions, (pr.timeout_minutes || 45) * 60, {
      runtime: dispatch,
      model,
      agentId,
      cwd,
      label,
      thinking,
      trackActive: false,
      budget: opts.budget || null,
      signal: opts.signal || null,
    });
    sessionKey = sessionData.childSessionKey;
    const streamLogPath = sessionData.streamLogPath || null;
    trackingKey = `pipeline-review-${agentId}`;
    reviewAttempt = resolveResultAttempt(sessionData) ?? reviewAttempt ?? null;
    deps.trackAgent(config, trackingKey, sessionKey, agentId, label, streamLogPath, {
      model,
      runtime: dispatch,
      telemetry_module_id: 'pipeline-review',
      telemetry_agent_type: 'echo',
      telemetry_attempt: reviewAttempt,
    });
    await deps.discord(config, 'INFO', '📋 Pipeline Review Spawned', 'Reviewing full pipeline run.', buildPipelineReviewDiscordFields({ run_id: runId, attempt: reviewAttempt, gateway_label: reviewGatewayLabel, session_key: sessionKey }, [
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Dispatch', value: dispatch, inline: true },
    ])).catch((e) => {
      log('DEBUG', `Pipeline review spawn Discord notice failed: ${e?.message || e}`);
    });
    const outputFilePath = pipelineReviewOutputPath(config, pr);
    const timeoutMin = pr.timeout_minutes || 45;
    const maxRateLimitPauses = config.rate_limit.max_pauses_per_module;
    const reviewRateLimitRecovery = createTrackedSummarySessionRateLimitRecoveryOptions(config, {
      sleepFn: deps.sleep,
      discordFn: deps.discord,
      buildFields: buildPipelineReviewDiscordFields,
      moduleId: 'pipeline-review',
      identity: {
        agent_type: 'echo',
        run_id: runId,
        attempt: reviewAttempt ?? 1,
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
    reviewGatewayLabel = (resolvePipelineReviewGatewayLabel(trackedReviewOutcome.status) ?? reviewGatewayLabel ?? null);
    lastReviewStatus = trackedReviewOutcome.status;

    const archiveDir = path.join(swarmRoot(config), 'logs', 'pipeline-review');
    fs.mkdirSync(archiveDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (dispatch === 'acp' && streamLogPath && fs.existsSync(streamLogPath)) {
      deps.copyRedactedTranscriptArtifact(streamLogPath, path.join(archiveDir, `pipeline-review-transcript-${ts}.jsonl`));
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
      reviewAttempt = reviewRateLimitExit.attempt ?? reviewAttempt;
      lastReviewStatus = reviewRateLimitExit.rate_limit_status || lastReviewStatus;
      return {
        ...reviewRateLimitExit,
        ...buildGeneratorResult('pipeline_review', {
          outputs: {
            status: 'failed',
            reason: reviewRateLimitExit.reason || 'rate_limit_exhausted',
            rate_limit_exhausted: true,
          },
          diagnostics: {
            rate_limit_status: reviewRateLimitExit.rate_limit_status || null,
          },
        }),
      };
    }
    if (!pollRes.ok) {
      reviewAttempt = resolveResultAttempt(pollRes) ?? reviewAttempt ?? null;
      const failureReason = pollRes?.status?.detail
        ? `${pollRes.reason} (${pollRes.status.detail})`
        : pollRes.reason;
      await deps.discord(config, 'WARN', '📋 Pipeline Review: No Output', `Review agent finished without producing a report. Reason: ${failureReason}`, [
        ...buildPipelineReviewDiscordFields({
          run_id: runId,
          attempt: reviewAttempt,
          dispatch_id: (resolveStatusDispatchId(pollRes?.status) ?? reviewDispatchId ?? null),
          gateway_label: (resolvePipelineReviewGatewayLabel(pollRes?.status) ?? reviewGatewayLabel ?? null),
          session_key: (resolveStatusSessionKey(pollRes?.status) ?? sessionKey ?? null),
        }),
        { name: 'Timeout', value: `${timeoutMin}min`, inline: true },
        { name: 'Agent', value: agentId, inline: true },
        { name: 'Model', value: model, inline: true },
      ]).catch((e) => {
        log('DEBUG', `Pipeline review timeout/failure Discord notice failed: ${e?.message || e}`);
      });
      throw new Error(`Pipeline review failed: ${failureReason}`);
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
      fields.unshift(...buildPipelineReviewDiscordFields({
        run_id: runId,
        attempt: reviewAttempt,
        dispatch_id: (resolveStatusDispatchId(pollRes?.status) ?? reviewDispatchId ?? null),
        gateway_label: (resolvePipelineReviewGatewayLabel(pollRes?.status) ?? reviewGatewayLabel ?? null),
        session_key: (resolveStatusSessionKey(pollRes?.status) ?? sessionKey ?? null),
      }));
      await deps.discord(config, 'OK', '📋 Pipeline Review Complete', desc, fields);
      onSummaryCompleted({ config }, 'pipeline_review', {
        attempt: reviewAttempt,
        status: 'ok',
        output: outputFilePath,
        dispatch_id: (resolveStatusDispatchId(pollRes?.status) ?? reviewDispatchId ?? null),
        session_key: (resolveStatusSessionKey(pollRes?.status) ?? sessionKey ?? null),
        gateway_label: (resolvePipelineReviewGatewayLabel(pollRes?.status) ?? reviewGatewayLabel ?? null),
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
          dispatch_id: (resolveStatusDispatchId(pollRes?.status) ?? reviewDispatchId ?? null),
          session_key: (resolveStatusSessionKey(pollRes?.status) ?? sessionKey ?? null),
          gateway_label: (resolvePipelineReviewGatewayLabel(pollRes?.status) ?? reviewGatewayLabel ?? null),
          attempt: reviewAttempt,
          runtime: dispatch,
          model,
        },
      });
    } catch (e) {
      log('WARN', `Pipeline review Discord post failed (non-critical): ${e.message}`);
      await deps.discord(config, 'WARN', '📋 Pipeline Review: Post Error', `Review completed but Discord post failed: ${e.message}`,
        buildPipelineReviewDiscordFields({
          run_id: runId,
          attempt: reviewAttempt,
          dispatch_id: (resolveStatusDispatchId(pollRes?.status) ?? reviewDispatchId ?? null),
          gateway_label: (resolvePipelineReviewGatewayLabel(pollRes?.status) ?? reviewGatewayLabel ?? null),
          session_key: (resolveStatusSessionKey(pollRes?.status) ?? sessionKey ?? null),
        })
      ).catch((postErrorNoticeError) => {
        log('DEBUG', `Pipeline review post-error Discord notice failed: ${postErrorNoticeError?.message || postErrorNoticeError}`);
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
          dispatch_id: (resolveStatusDispatchId(pollRes?.status) ?? reviewDispatchId ?? null),
          session_key: (resolveStatusSessionKey(pollRes?.status) ?? sessionKey ?? null),
          gateway_label: (resolvePipelineReviewGatewayLabel(pollRes?.status) ?? reviewGatewayLabel ?? null),
          attempt: reviewAttempt,
          runtime: dispatch,
          model,
        },
        diagnostics: {
          post_error: e.message || 'unknown',
        },
      });
    }
  } catch (e) {
    onSummaryCompleted({ config }, 'pipeline_review', {
      attempt: reviewAttempt,
      status: 'failed',
      reason: e.message || 'unknown',
      dispatch_id: (resolveStatusDispatchId(lastReviewStatus) ?? reviewDispatchId ?? null),
      session_key: (resolveStatusSessionKey(lastReviewStatus) ?? sessionKey ?? null),
      gateway_label: (resolvePipelineReviewGatewayLabel(lastReviewStatus) ?? reviewGatewayLabel ?? null),
      model,
      runtime: dispatch,
    });
    log('WARN', `Pipeline review failed (non-critical): ${e.message}`);
    await deps.discord(config, 'WARN', '📋 Pipeline Review Failed', `Review agent error: ${e.message?.split('\n')[0] || 'unknown'}`,
      buildPipelineReviewDiscordFields({
        run_id: runId,
        attempt: reviewAttempt,
        dispatch_id: (resolveStatusDispatchId(lastReviewStatus) ?? reviewDispatchId ?? null),
        gateway_label: (resolvePipelineReviewGatewayLabel(lastReviewStatus) ?? reviewGatewayLabel ?? null),
        session_key: (resolveStatusSessionKey(lastReviewStatus) ?? sessionKey ?? null),
      })
    ).catch((discordError) => {
      log('DEBUG', `Pipeline review failure Discord notice failed: ${discordError?.message || discordError}`);
    });
    return buildGeneratorResult('pipeline_review', {
      outputs: {
        status: 'failed',
        reason: e.message || 'unknown',
        attempt: reviewAttempt,
        runtime: dispatch,
        model,
      },
      diagnostics: {
        dispatch_id: (resolveStatusDispatchId(lastReviewStatus) ?? reviewDispatchId ?? null),
        session_key: (resolveStatusSessionKey(lastReviewStatus) ?? sessionKey ?? null),
        gateway_label: (resolvePipelineReviewGatewayLabel(lastReviewStatus) ?? reviewGatewayLabel ?? null),
      },
    });
  } finally {
    await cleanupSummarySession('finally');
  }
}

export { caseStudyOutputPath, caseStudyInstructionsPath, caseStudyAgentId, generateCaseStudy } from './case-study.ts';

export { generateProjectSummary } from './summary/project-summary.ts';
