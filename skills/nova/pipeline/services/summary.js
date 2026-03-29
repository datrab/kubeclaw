import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { swarmRoot, relPath } from '../core/paths.js';
import { gatewayInvoke } from '../integrations/gateway.js';
import { trackAgent, untrackAgent, acpxCleanup } from '../agents/shutdown.js';
import { modelToHarness } from '../agents/lifecycle.js';
import { pollForFile } from './polling.js';
// RUN_ID and _runStats are module-level state in pipeline-original.js, not yet extracted
import { RUN_ID, _runStats, discord } from '../../pipeline-original.js';

export function writeSummary(config, exitCode, exitReason) {
  if (!config?._logDir) return;
  try {
    const summary = {
      run_id: RUN_ID,
      started_at: _runStats.started_at,
      ended_at: new Date().toISOString(),
      exit_code: exitCode,
      exit_reason: exitReason,
      project: config.project,
      modules_completed: _runStats.modules_completed,
      modules_failed: _runStats.modules_failed,
      modules_blocked: _runStats.modules_blocked,
      gates_completed: _runStats.gates_completed,
      gates_failed: _runStats.gates_failed,
      total_forge_attempts: _runStats.total_forge_attempts,
      total_buster_attempts: _runStats.total_buster_attempts,
      total_echo_reviews: _runStats.total_echo_reviews,
      errors: _runStats.errors,
      discord_notifications_sent: _runStats.discord_notifications_sent,
      git_pull_failures: _runStats.git_pull_failures,
      git_push_failures: _runStats.git_push_failures,
      config_validation_issues: _runStats.config_validation_issues,
      duration_seconds: Math.round((Date.now() - new Date(_runStats.started_at).getTime()) / 1000),
    };
    fs.writeFileSync(path.join(config._logDir, 'pipeline', 'summary.json'), JSON.stringify(summary, null, 2));
    log('OK', `Pipeline summary written: exit=${exitCode} (${exitReason})`);
  } catch (e) {
    log('WARN', `Failed to write summary.json: ${e.message}`);
  }
}

export function pipelineReviewOutputPath(config, pr = {}) {
  return path.join(swarmRoot(config), pr.output_file || '.swarm/logs/pipeline-review/PIPELINE-REVIEW.md');
}

export function pipelineReviewJsonPath(config, pr = {}) {
  return path.join(swarmRoot(config), pr.json_output_file || '.swarm/logs/pipeline-review/PIPELINE-REVIEW.json');
}

export function pipelineReviewInstructionsPath(config, pr = {}) {
  return path.join(swarmRoot(config), pr.instructions_file || '.swarm/pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md');
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

function ensurePipelineReviewInstructions(config, pr = {}) {
  const out = pipelineReviewOutputPath(config, pr);
  const jsonOut = pipelineReviewJsonPath(config, pr);
  const pathOut = pipelineReviewInstructionsPath(config, pr);
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });
  const pipelineLogPath = config._logDir ? path.join(config._logDir, 'pipeline', 'pipeline.jsonl') : '.swarm/logs/pipeline/pipeline.jsonl';
  const summaryJsonPath = config._logDir ? path.join(config._logDir, 'pipeline', 'summary.json') : '.swarm/logs/pipeline/summary.json';
  const modulesDir = config.paths?.modules_dir || '.swarm/modules';
  const reviewMdPath = relPath(config, out);
  const reviewJsonPath = relPath(config, jsonOut);
  const runId = config._runId || 'unknown';
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

export async function generatePipelineReview(config) {
  const pr = config.pipeline_review || {};
  try {
    const model = pr.model || config.models?.echo || 'openai-codex/gpt-5.4';
    const dispatch = pipelineReviewDispatchMode(model, pr);
    const agentId = pipelineReviewAgentId(model, pr);
    const instructionsPath = ensurePipelineReviewInstructions(config, pr);
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    const label = `pipeline-review-${Date.now()}`;
    const cwd = config.repo_root;
    const spawnArgs = { task: instructions, agentId, label, model, cwd, thread: false, mode: 'run', cleanup: 'keep' };
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
    if (!pollRes.ok) throw new Error(`Pipeline review failed: ${pollRes.reason}`);

    try {
      const reviewMd = fs.readFileSync(outputFilePath, 'utf8');
      const summaryEnd = reviewMd.indexOf('\n---', 200);
      const excerpt = summaryEnd > 0 ? reviewMd.slice(0, summaryEnd) : reviewMd.slice(0, 1800);
      await discord(config, 'OK', '📋 Pipeline Review Complete', excerpt.slice(0, 1900), [
        { name: 'Full Report', value: '`.swarm/logs/pipeline-review/PIPELINE-REVIEW.md`', inline: false },
      ]);
    } catch (e) {
      log('WARN', `Pipeline review Discord post failed (non-critical): ${e.message}`);
    }
    log('OK', 'Pipeline review completed');
  } catch (e) {
    log('WARN', `Pipeline review failed (non-critical): ${e.message}`);
  }
}

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
