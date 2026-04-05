import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { swarmRoot, relPath, costLogDir, statusPath } from '../core/paths.js';
import { gatewayInvoke } from '../integrations/gateway.js';
import { trackAgent, untrackAgent, acpxCleanup } from '../agents/shutdown.js';
import { modelToHarness } from '../agents/lifecycle.js';
import { pollForFile } from './polling.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { discord } from '../integrations/discord.js';
import { writeCostReport, checkBudgetThresholds } from './cost.js';
import { buildGovernanceSummary } from './governance-context.js';

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
  if (!config?._logDir) return;
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

    const summary = {
      run_id: getRunId(config),
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      exit_code: exitCode,
      exit_reason: exitReason,
      project: config.project,
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
    };
    const runLogDir = config._runLogDir || path.join(config._logDir, 'pipeline');
    fs.mkdirSync(runLogDir, { recursive: true });
    fs.writeFileSync(path.join(runLogDir, 'summary.json'), JSON.stringify(summary, null, 2));

    // Write latest.json pointer atomically so operators can find the most recent run.
    const latestPath = path.join(config._logDir, 'pipeline', 'latest.json');
    const runId = summary.run_id;
    const latestTmp = latestPath + '.tmp';
    fs.writeFileSync(latestTmp, JSON.stringify({ run_id: runId, path: `runs/${runId}` }, null, 2));
    fs.renameSync(latestTmp, latestPath);

    log('OK', `Pipeline summary written: exit=${exitCode} (${exitReason})`);
  } catch (e) {
    log('WARN', `Failed to write summary.json: ${e.message}`);
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
  const m = String(model || '').toLowerCase();
  if (m.startsWith('openai/') || m.startsWith('openai-codex/') || m.includes('gpt-5') || m.includes('codex')) return 'subagent';
  return 'acp';
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
  const pipelineLogPath = config._logDir ? path.join(config._logDir, 'pipeline', 'pipeline.jsonl') : '.swarm/logs/pipeline/pipeline.jsonl';
  const summaryJsonPath = config._logDir ? path.join(config._logDir, 'pipeline', 'summary.json') : '.swarm/logs/pipeline/summary.json';
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
  // progress.json pipeline_review overrides config pipeline_review
  const progressPr = progress?.pipeline_review || {};
  const configPr = config.pipeline_review || {};
  const pr = { ...configPr, ...progressPr };
  try {
    const model = pr.model || config.models?.echo || 'openai-codex/gpt-5.4';
    const dispatch = pipelineReviewDispatchMode(model, pr);
    const agentId = pipelineReviewAgentId(model, pr);
    const instructionsPath = writePipelineReviewInstructions(config, pr);
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    const label = `pipeline-review-${Date.now()}`;
    const cwd = config.repo_root;
    const thinking = pr.thinking_level || null;
    const spawnArgs = { task: instructions, agentId, label, model, cwd, thread: false, mode: 'run', cleanup: 'keep' };
    if (thinking) spawnArgs.thinking = thinking;
    if (dispatch === 'acp') {
      spawnArgs.runtime = 'acp';
      spawnArgs.streamTo = 'parent';
    }
    log('STEP', `Spawning pipeline review (${dispatch}): ${agentId} / ${model}`);
    await discord(config, 'INFO', '📋 Pipeline Review Spawned', 'Reviewing full pipeline run.', [
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Dispatch', value: dispatch, inline: true },
    ]).catch(() => {});
    const raw = await gatewayInvoke('sessions_spawn', spawnArgs, 30000);
    const result = raw?.result?.details || raw;
    if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
    const sessionKey = result.childSessionKey;
    const streamLogPath = result.streamLogPath || null;
    const trackingKey = `pipeline-review-${agentId}`;
    trackAgent(config, trackingKey, sessionKey, agentId, label, streamLogPath);
    const outputFilePath = pipelineReviewOutputPath(config, pr);
    const timeoutMin = pr.timeout_minutes || 45;
    const pollRes = await pollForFile(config, outputFilePath, timeoutMin, 'Pipeline Review', trackingKey);

    const archiveDir = path.join(swarmRoot(config), '.swarm', 'logs', 'pipeline-review');
    fs.mkdirSync(archiveDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (dispatch === 'acp' && streamLogPath && fs.existsSync(streamLogPath)) {
      fs.copyFileSync(streamLogPath, path.join(archiveDir, `pipeline-review-transcript-${ts}.jsonl`));
    }

    try { await gatewayInvoke('sessions_send', { sessionKey, message: '/stop' }, 15000); } catch {}
    if (dispatch === 'acp') await acpxCleanup(agentId, label);
    untrackAgent(trackingKey);
    if (!pollRes.ok) {
      await discord(config, 'WARN', '📋 Pipeline Review: No Output', `Review agent finished without producing a report. Reason: ${pollRes.reason}`, [
        { name: 'Timeout', value: `${timeoutMin}min`, inline: true },
        { name: 'Agent', value: agentId, inline: true },
        { name: 'Model', value: model, inline: true },
      ]).catch(() => {});
      throw new Error(`Pipeline review failed: ${pollRes.reason}`);
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
      await discord(config, 'OK', '📋 Pipeline Review Complete', desc, fields);
      log('OK', 'Pipeline review completed');
    } catch (e) {
      log('WARN', `Pipeline review Discord post failed (non-critical): ${e.message}`);
      await discord(config, 'WARN', '📋 Pipeline Review: Post Error', `Review completed but Discord post failed: ${e.message}`).catch(() => {});
    }
  } catch (e) {
    log('WARN', `Pipeline review failed (non-critical): ${e.message}`);
    await discord(config, 'WARN', '📋 Pipeline Review Failed', `Review agent error: ${e.message?.split('\n')[0] || 'unknown'}`).catch(() => {});
  }
}

export { caseStudyOutputPath, caseStudyInstructionsPath, caseStudyDispatchMode, caseStudyAgentId, generateCaseStudy } from './case-study.js';

export async function generateProjectSummary(config) {
  if (!config?._logDir) return;
  try {
    const summaryPath = config.paths?.project_summary_js || '/app/skills/project-summary.js';
    const { generateSummary, postToDiscord } = await import(summaryPath);
    const summary = await generateSummary({ project: config.project });

    const logDir = path.join(config._logDir, 'pipeline');
    if (summary.markdown) fs.writeFileSync(path.join(logDir, 'project-summary.md'), summary.markdown);
    if (summary.data) fs.writeFileSync(path.join(logDir, 'project-summary.json'), JSON.stringify(summary.data, null, 2));
    if (summary.caseStudyBase) fs.writeFileSync(path.join(logDir, 'case-study.base.json'), JSON.stringify(summary.caseStudyBase, null, 2));
    log('OK', 'Project summary saved to logs');

    if (config.discord_webhook_url && summary.embeds?.length) {
      const oldWebhook = process.env.DISCORD_WEBHOOK;
      process.env.DISCORD_WEBHOOK = config.discord_webhook_url;
      try {
        await postToDiscord(summary.embeds);
        log('OK', 'Project summary posted to Discord');
      } finally {
        if (oldWebhook === undefined) delete process.env.DISCORD_WEBHOOK;
        else process.env.DISCORD_WEBHOOK = oldWebhook;
      }
    }
  } catch (e) {
    log('WARN', `Project summary generation failed (non-critical): ${e.message}`);
  }
}
