import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { log } from '../core/logger.js';
import { swarmRoot, relPath, costLogDir, statusPath } from '../core/paths.js';
import { modelToHarness, resolveRuntime } from '../../../common/pipeline/agents/runtime.js';
import { spawnSession, killSession, trackAgent, untrackAgent } from '../../../common/pipeline/agents/lifecycle.js';
import { pollForFile, sleep } from './polling.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { discord, discordEmbeds } from '../integrations/discord.js';
import { writeCostReport, checkBudgetThresholds } from './cost.js';
import { buildGovernanceSummary } from './governance-context.js';
import { copyRedactedTranscriptArtifact } from '../../../common/pipeline/redaction.js';
import { onSummaryStarted, onSummaryCompleted } from './telemetry.js';
import { buildLatestPointer, buildSummaryArtifactBundle, getPipelineArtifactBundle } from './artifact-bundle.js';
import {
  createTrackedSummarySessionRateLimitExhaustionOptions,
  createTrackedSummarySessionRateLimitRecoveryOptions,
  finalizeSummarySessionRateLimitExit,
  resolveTrackedSessionRateLimitOutcome,
  withSessionRateLimitRecovery,
} from './rate-limit.js';
import {
  resolveResultAttempt,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from './correlation.js';
import { generateSummary as canonicalGenerateSummary } from '../tools/project-summary.js';
import { buildGeneratorArtifactRef, buildGeneratorResult } from './generator-result.js';

function buildPipelineReviewDiscordFields(identity = {}, extra = []) {
  const fields = [];
  if (identity.runId || identity.run_id) fields.push({ name: 'Run ID', value: identity.runId || identity.run_id, inline: true });
  if (identity.attempt != null) fields.push({ name: 'Attempt', value: `${identity.attempt}`, inline: true });
  if (identity.dispatchId || identity.dispatch_id) fields.push({ name: 'Dispatch', value: identity.dispatchId || identity.dispatch_id, inline: false });
  if (identity.gatewayLabel || identity.gateway_label || identity.label) fields.push({ name: 'Label', value: identity.gatewayLabel || identity.gateway_label || identity.label, inline: false });
  if (identity.sessionKey || identity.session_key) fields.push({ name: 'Session', value: identity.sessionKey || identity.session_key, inline: false });
  return [...fields, ...extra];
}

function buildProjectSummaryDiscordFields(identity = {}, extra = []) {
  const fields = [];
  if (identity.runId || identity.run_id) fields.push({ name: 'Run ID', value: identity.runId || identity.run_id, inline: true });
  return [...fields, ...extra];
}

function buildProjectSummaryArtifactFields(config, summaryData = {}) {
  return [
    { name: 'Output Dir', value: `\`${relPath(config, summaryData.output_dir)}\``, inline: false },
    ...(summaryData.markdown_path ? [{ name: 'Markdown', value: `\`${relPath(config, summaryData.markdown_path)}\``, inline: false }] : []),
    ...(summaryData.data_path ? [{ name: 'Data', value: `\`${relPath(config, summaryData.data_path)}\``, inline: false }] : []),
    ...(summaryData.case_study_base_path ? [{ name: 'Case Study Base', value: `\`${relPath(config, summaryData.case_study_base_path)}\``, inline: false }] : []),
  ];
}

const DEFAULT_PIPELINE_REVIEW_DEPS = {
  spawnSession,
  killSession,
  trackAgent,
  untrackAgent,
  pollForFile,
  sleep,
  discord,
  copyRedactedTranscriptArtifact,
};

const CANONICAL_PROJECT_SUMMARY_PATHS = new Set([
  path.resolve('/app/skills/pipeline/tools/project-summary.js'),
  path.resolve('/app/skills/project-summary.js'),
  path.resolve(fileURLToPath(new URL('../tools/project-summary.js', import.meta.url))),
]);

async function loadProjectSummaryGenerator(config) {
  const summaryPath = path.resolve(config?.paths?.project_summary_js || '/app/skills/pipeline/tools/project-summary.js');
  if (CANONICAL_PROJECT_SUMMARY_PATHS.has(summaryPath)) {
    return canonicalGenerateSummary;
  }
  // Justified override-only dynamic import: the standard project-summary path is static,
  // but tests and explicit deployments can inject a bounded alternate generator module.
  const mod = await import(pathToFileURL(summaryPath).href);
  const generateSummary = mod?.generateSummary || mod?.default?.generateSummary || mod?.default;
  if (typeof generateSummary !== 'function') {
    throw new Error(`Project summary module '${summaryPath}' must export generateSummary(...)`);
  }
  return generateSummary;
}

function getPipelineReviewDeps(config) {
  return { ...DEFAULT_PIPELINE_REVIEW_DEPS, ...(config?._testOverrides?.pipelineReview || {}) };
}

/**
 * Aggregate stats across all module status.json files for the cumulative project view.
 * Reads status.json for every module in progress.modules and sums attempt counts from history.
 */
export function buildCumulativeSummary(config, progress) {
  if (!progress?.modules) return null;

  let total_forge_attempts = 0;
  let total_buster_attempts = 0;
  let modules_passed = 0;
  let modules_failed = 0;
  let modules_blocked = 0;

  for (const [moduleId, mod] of Object.entries(progress.modules)) {
    const sPath = statusPath(config, mod.dir);
    let status;
    try {
      if (!fs.existsSync(sPath)) continue;
      status = JSON.parse(fs.readFileSync(sPath, 'utf8'));
    } catch (e) {
      log('WARN', `[summary] Could not read status.json for ${moduleId}: ${e.message}`);
      continue;
    }

    if (status.status === 'PASS') modules_passed++;
    else if (status.status === 'BLOCKED') modules_blocked++;
    else if (status.status === 'FAIL') modules_failed++;

    if (Array.isArray(status.history)) {
      for (const entry of status.history) {
        const note = entry.note || '';
        if (note.includes('Forge started')) total_forge_attempts++;
        if (note.includes('Buster started')) total_buster_attempts++;
      }
    }
  }

  return {
    modules_completed: modules_passed,
    modules_failed,
    modules_blocked,
    total_forge_attempts,
    total_buster_attempts,
  };
}

export function writeSummary(config, exitCode, exitReason, ctx = null, progress = null) {
  if (!config?._logDir) {
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

    // Cost/usage snapshot — write cost report and check budget thresholds
    let budgetStatus = null;
    let costReportPath = null;
    try {
      const report = writeCostReport(config);
      if (report) {
        budgetStatus = report.budget?.threshold_status || null;
        costReportPath = path.join(costLogDir(config), 'run-usage.json');
      }
      if (ctx) checkBudgetThresholds(config, ctx);
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
    const artifactBundle = getPipelineArtifactBundle(config);

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
        total_input_tokens: stats?.inputTokens ?? null,
        total_output_tokens: stats?.outputTokens ?? null,
        total_tokens: stats?.inputTokens != null && stats?.outputTokens != null
          ? stats.inputTokens + stats.outputTokens
          : null,
        cost_usd: null,
        cost_availability: 'unavailable — use provider billing dashboard',
      },
      budget_threshold_status: budgetStatus,
      cost_report_path: costReportPath
        ? path.relative(config.repo_root || config._logDir, costReportPath)
        : null,
      artifacts: buildSummaryArtifactBundle(config),
    };
    const pipelineDir = artifactBundle.pipeline_dir;
    const runLogDir = artifactBundle.run_log_dir || pipelineDir;
    const runSummaryPath = artifactBundle.run_summary_path || path.join(runLogDir, 'summary.json');
    const pipelineSummaryPath = artifactBundle.pipeline_summary_path || path.join(pipelineDir, 'summary.json');
    fs.mkdirSync(runLogDir, { recursive: true });
    fs.writeFileSync(runSummaryPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(pipelineSummaryPath, JSON.stringify(summary, null, 2));

    // Write latest.json pointer atomically so operators can find the most recent run.
    const latestPath = artifactBundle.latest_json_path || path.join(pipelineDir, 'latest.json');
    const latestTmp = latestPath + '.tmp';
    fs.writeFileSync(latestTmp, JSON.stringify(buildLatestPointer(config, {
      status: exitCode === null ? 'running' : (exitCode === 0 ? 'completed' : 'failed'),
      startedAt: summary.started_at || null,
      completedAt: summary.completed_at || null,
      exitCode,
    }), null, 2));
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
      output_dir: config?._logDir ? path.join(config._logDir, 'pipeline') : null,
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

export function pipelineReviewDispatchMode(model, pr = {}) {
  return resolveRuntime({ model });
}

export function pipelineReviewAgentId(model, pr = {}) {
  if (pr.agent_id) return pr.agent_id;
  const dispatch = pipelineReviewDispatchMode(model, pr);
  if (dispatch === 'subagent') return `${String(model || 'gpt5').split('/').pop().replace(/[^a-zA-Z0-9._-]+/g, '-')}_pipeline-review`;
  return modelToHarness(model) || 'claude';
}

export function writePipelineReviewInstructions(config, pr = {}) {
  const out = pipelineReviewOutputPath(config, pr);
  const jsonOut = pipelineReviewJsonPath(config, pr);
  const pathOut = pipelineReviewInstructionsPath(config, pr);
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });
  const pipelineLogPath = config._runLogDir ? path.join(config._runLogDir, 'pipeline.jsonl') : (config._logDir ? path.join(config._logDir, 'pipeline', 'pipeline.jsonl') : '.swarm/logs/pipeline/pipeline.jsonl');
  const summaryJsonPath = config._runLogDir ? path.join(config._runLogDir, 'summary.json') : (config._logDir ? path.join(config._logDir, 'pipeline', 'summary.json') : '.swarm/logs/pipeline/summary.json');
  const modulesDir = config.paths?.modules_dir || '.swarm/modules';
  const reviewMdPath = relPath(config, out);
  const reviewJsonPath = relPath(config, jsonOut);
  const runId = getRunId(config);
  const content = `You are reviewing a completed pipeline run for project: ${config.project}

## Run Data Available
- Pipeline log: ${pipelineLogPath}
- Summary JSON: ${summaryJsonPath}
- Module statuses: check ${modulesDir}/*/status.json
- Saved prompts: check module log dirs for forge-prompt-*.md and buster-prompt-*.md

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
  fs.writeFileSync(pathOut, content);
  return pathOut;
}

export async function generatePipelineReview(config, progress) {
  const deps = getPipelineReviewDeps(config);
  // progress.json pipeline_review overrides config pipeline_review
  const progressPr = progress?.pipeline_review || {};
  const configPr = config.pipeline_review || {};
  const pr = { ...configPr, ...progressPr };
  const runId = getRunId(config);
  let sessionKey = null;
  let model = pr.model || config.models?.echo || 'openai-codex/gpt-5.4';
  let agentId = pipelineReviewAgentId(model, pr);
  let label = null;
  let dispatch = null;
  let reviewAttempt = resolveResultAttempt(pr);
  let reviewDispatchId = null;
  let reviewGatewayLabel = null;
  let lastReviewStatus = null;
  try {
    dispatch = pipelineReviewDispatchMode(model, pr);
    const instructionsPath = writePipelineReviewInstructions(config, pr);
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    label = `pipeline-review-${Date.now()}`;
    const cwd = config.repo_root;
    const thinking = pr.thinking_level || null;
    onSummaryStarted({ config }, 'pipeline_review', {
      attempt: reviewAttempt,
      gateway_label: label,
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
    });
    sessionKey = sessionData.childSessionKey;
    const streamLogPath = sessionData.streamLogPath || null;
    const trackingKey = `pipeline-review-${agentId}`;
    reviewAttempt = resolveResultAttempt(sessionData, reviewAttempt);
    deps.trackAgent(config, trackingKey, sessionKey, agentId, label, streamLogPath, {
      model,
      runtime: dispatch,
      telemetry_module_id: 'pipeline-review',
      telemetry_agent_type: 'echo',
      telemetry_attempt: reviewAttempt,
    });
    await deps.discord(config, 'INFO', '📋 Pipeline Review Spawned', 'Reviewing full pipeline run.', buildPipelineReviewDiscordFields({ run_id: runId, attempt: reviewAttempt, gateway_label: label, session_key: sessionKey }, [
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Dispatch', value: dispatch, inline: true },
    ])).catch(() => {});
    const outputFilePath = pipelineReviewOutputPath(config, pr);
    const timeoutMin = pr.timeout_minutes || 45;
    const maxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;
    const reviewRateLimitRecovery = createTrackedSummarySessionRateLimitRecoveryOptions(config, {
      sleepFn: deps.sleep,
      discordFn: deps.discord,
      buildFields: buildPipelineReviewDiscordFields,
      moduleId: 'pipeline-review',
      agentTypeFallback: 'echo',
      runIdFallback: runId,
      attemptFallback: reviewAttempt ?? 1,
      dispatchIdFallback: () => reviewDispatchId,
      gatewayLabelFallback: () => reviewGatewayLabel || reviewDispatchId || label,
      sessionKeyFallback: sessionKey,
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
      gatewayLabel: reviewGatewayLabel || reviewDispatchId || label,
      lastStatus: lastReviewStatus,
    });
    reviewAttempt = trackedReviewOutcome.attempt;
    reviewDispatchId = trackedReviewOutcome.dispatchId;
    reviewGatewayLabel = trackedReviewOutcome.gatewayLabel;
    lastReviewStatus = trackedReviewOutcome.status;

    const archiveDir = path.join(swarmRoot(config), '.swarm', 'logs', 'pipeline-review');
    fs.mkdirSync(archiveDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (dispatch === 'acp' && streamLogPath && fs.existsSync(streamLogPath)) {
      deps.copyRedactedTranscriptArtifact(streamLogPath, path.join(archiveDir, `pipeline-review-transcript-${ts}.jsonl`));
    }

    await deps.killSession(sessionKey, { runtime: dispatch, model, agentId, label });
    deps.untrackAgent(trackingKey);
    if (pollRes?.rate_limit_exhausted) {
      const reviewRateLimitExit = await finalizeSummarySessionRateLimitExit(pollRes, {
        config,
        moduleId: 'pipeline-review',
        summaryType: 'pipeline_review',
        phase: 'pipeline_review',
        exhaustedReason: 'Pipeline review exceeded max ACP rate limit pauses',
        attemptFallback: reviewAttempt,
        runIdFallback: runId,
        dispatchIdFallback: reviewDispatchId,
        gatewayLabelFallback: reviewGatewayLabel || reviewDispatchId || label,
        sessionKeyFallback: sessionKey,
        maxPausesFallback: maxRateLimitPauses,
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
      reviewAttempt = resolveResultAttempt(pollRes, reviewAttempt);
      const failureReason = pollRes?.status?.detail
        ? `${pollRes.reason} (${pollRes.status.detail})`
        : pollRes.reason;
      await deps.discord(config, 'WARN', '📋 Pipeline Review: No Output', `Review agent finished without producing a report. Reason: ${failureReason}`, [
        ...buildPipelineReviewDiscordFields({
          run_id: runId,
          attempt: reviewAttempt,
          dispatch_id: resolveStatusDispatchId(pollRes?.status, reviewDispatchId),
          gateway_label: resolveStatusGatewayLabel(pollRes?.status, reviewGatewayLabel || reviewDispatchId || label),
          session_key: resolveStatusSessionKey(pollRes?.status, sessionKey),
        }),
        { name: 'Timeout', value: `${timeoutMin}min`, inline: true },
        { name: 'Agent', value: agentId, inline: true },
        { name: 'Model', value: model, inline: true },
      ]).catch(() => {});
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
        dispatch_id: resolveStatusDispatchId(pollRes?.status, reviewDispatchId),
        gateway_label: resolveStatusGatewayLabel(pollRes?.status, reviewGatewayLabel || reviewDispatchId || label),
        session_key: resolveStatusSessionKey(pollRes?.status, sessionKey),
      }));
      await deps.discord(config, 'OK', '📋 Pipeline Review Complete', desc, fields);
      onSummaryCompleted({ config }, 'pipeline_review', {
        attempt: reviewAttempt,
        status: 'ok',
        output: outputFilePath,
        dispatch_id: resolveStatusDispatchId(pollRes?.status, reviewDispatchId),
        session_key: resolveStatusSessionKey(pollRes?.status, sessionKey),
        gateway_label: resolveStatusGatewayLabel(pollRes?.status, reviewGatewayLabel || reviewDispatchId || label),
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
          dispatch_id: resolveStatusDispatchId(pollRes?.status, reviewDispatchId),
          session_key: resolveStatusSessionKey(pollRes?.status, sessionKey),
          gateway_label: resolveStatusGatewayLabel(pollRes?.status, reviewGatewayLabel || reviewDispatchId || label),
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
          dispatch_id: resolveStatusDispatchId(pollRes?.status, reviewDispatchId),
          gateway_label: resolveStatusGatewayLabel(pollRes?.status, reviewGatewayLabel || reviewDispatchId || label),
          session_key: resolveStatusSessionKey(pollRes?.status, sessionKey),
        })
      ).catch(() => {});
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
          dispatch_id: resolveStatusDispatchId(pollRes?.status, reviewDispatchId),
          session_key: resolveStatusSessionKey(pollRes?.status, sessionKey),
          gateway_label: resolveStatusGatewayLabel(pollRes?.status, reviewGatewayLabel || reviewDispatchId || label),
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
      dispatch_id: resolveStatusDispatchId(lastReviewStatus, reviewDispatchId),
      session_key: resolveStatusSessionKey(lastReviewStatus, sessionKey),
      gateway_label: resolveStatusGatewayLabel(lastReviewStatus, reviewGatewayLabel || reviewDispatchId || label),
      model,
      runtime: dispatch,
    });
    log('WARN', `Pipeline review failed (non-critical): ${e.message}`);
    await deps.discord(config, 'WARN', '📋 Pipeline Review Failed', `Review agent error: ${e.message?.split('\n')[0] || 'unknown'}`,
      buildPipelineReviewDiscordFields({
        run_id: runId,
        attempt: reviewAttempt,
        dispatch_id: resolveStatusDispatchId(lastReviewStatus, reviewDispatchId),
        gateway_label: resolveStatusGatewayLabel(lastReviewStatus, reviewGatewayLabel || reviewDispatchId || label),
        session_key: resolveStatusSessionKey(lastReviewStatus, sessionKey),
      })
    ).catch(() => {});
    return buildGeneratorResult('pipeline_review', {
      outputs: {
        status: 'failed',
        reason: e.message || 'unknown',
        attempt: reviewAttempt,
        runtime: dispatch,
        model,
      },
      diagnostics: {
        dispatch_id: resolveStatusDispatchId(lastReviewStatus, reviewDispatchId),
        session_key: resolveStatusSessionKey(lastReviewStatus, sessionKey),
        gateway_label: resolveStatusGatewayLabel(lastReviewStatus, reviewGatewayLabel || reviewDispatchId || label),
      },
    });
  }
}

export { caseStudyOutputPath, caseStudyInstructionsPath, caseStudyDispatchMode, caseStudyAgentId, generateCaseStudy } from './case-study.js';

export async function generateProjectSummary(config) {
  if (!config?._logDir) return;
  const ctx = { config };
  const logDir = path.join(config._logDir, 'pipeline');
  const runId = config._runId || config.run_id || getRunId(config);
  const summaryData = { output_dir: logDir };
  onSummaryStarted(ctx, 'project_summary', summaryData);
  try {
    const generateSummary = await loadProjectSummaryGenerator(config);
    const summary = await generateSummary({ project: config.project });

    fs.mkdirSync(logDir, { recursive: true });
    if (summary.markdown) {
      summaryData.markdown_path = path.join(logDir, 'project-summary.md');
      fs.writeFileSync(summaryData.markdown_path, summary.markdown);
    }
    if (summary.data) {
      summaryData.data_path = path.join(logDir, 'project-summary.json');
      fs.writeFileSync(summaryData.data_path, JSON.stringify(summary.data, null, 2));
    }
    if (summary.caseStudyBase) {
      summaryData.case_study_base_path = path.join(logDir, 'case-study.base.json');
      fs.writeFileSync(summaryData.case_study_base_path, JSON.stringify(summary.caseStudyBase, null, 2));
    }
    log('OK', 'Project summary saved to logs');

    if (config.discord_webhook_url && summary.embeds?.length) {
      const summaryEmbeds = summary.embeds.map((embed = {}) => ({
        ...embed,
        fields: buildProjectSummaryDiscordFields({ run_id: runId }, [
          ...(Array.isArray(embed.fields) ? embed.fields : []),
          ...buildProjectSummaryArtifactFields(config, summaryData),
        ]),
      }));
      await discordEmbeds(config, summaryEmbeds, { level: 'INFO' });
      log('OK', 'Project summary posted to Discord');
    }
    onSummaryCompleted(ctx, 'project_summary', { status: 'ok', ...summaryData });
    return buildGeneratorResult('project_summary', {
      artifacts: [
        buildGeneratorArtifactRef('project_summary', summaryData.markdown_path, { role: 'output', format: 'markdown' }),
        buildGeneratorArtifactRef('project_summary', summaryData.data_path, { role: 'output', format: 'json' }),
        buildGeneratorArtifactRef('case_study_base', summaryData.case_study_base_path, { role: 'output', format: 'json' }),
      ],
      outputs: {
        status: 'ok',
        ...summaryData,
      },
    });
  } catch (e) {
    onSummaryCompleted(ctx, 'project_summary', { status: 'failed', reason: e.message || 'unknown', ...summaryData });
    log('WARN', `Project summary generation failed (non-critical): ${e.message}`);
    await discord(config, 'WARN', '📦 Project Summary Failed', `Project summary generation failed: ${e.message?.split('\n')[0] || 'unknown'}`,
      buildProjectSummaryDiscordFields({ run_id: runId }, buildProjectSummaryArtifactFields(config, summaryData))
    ).catch(() => {});
    return buildGeneratorResult('project_summary', {
      artifacts: [
        buildGeneratorArtifactRef('project_summary', summaryData.markdown_path, { role: 'output', format: 'markdown' }),
        buildGeneratorArtifactRef('project_summary', summaryData.data_path, { role: 'output', format: 'json' }),
        buildGeneratorArtifactRef('case_study_base', summaryData.case_study_base_path, { role: 'output', format: 'json' }),
      ],
      outputs: {
        status: 'failed',
        reason: e.message || 'unknown',
        ...summaryData,
      },
    });
  }
}
