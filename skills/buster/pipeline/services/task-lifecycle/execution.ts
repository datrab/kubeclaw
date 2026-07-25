import { runSuites } from '../../runners/suite-runner.ts';
import { emitPluginEvent } from '../telemetry.ts';
import { sendDiscord } from '../discord.ts';
import { buildSuiteResultsEmbed, clearBusterOutputFile } from '../pipeline-helpers.ts';
import { runResourceCleanupStage } from './cleanup.ts';
import { syncTaskRepo } from './git-sync.ts';
import { spawnTaskSession, monitorTaskSession, killTaskSession, publishTaskOutcome } from './session.ts';
import { appendAppTestCredentialsToPrompt, appendPreTestResultsToPrompt } from './prompt.ts';
import { textValue } from '../../value-boundary.ts';
import { notifyTaskFailure, type TaskRuntime } from './context.ts';

function taskFailure(runtime: TaskRuntime, reason: string): false {
  runtime.outcome = 'FAIL';
  runtime.reason = reason;
  notifyTaskFailure(runtime, {
    reason, stage: runtime.stage, attempt: runtime.attempt,
    taskType: runtime.taskType, commitHash: runtime.commitHash,
  });
  return false;
}

export async function announceTaskStart(runtime: TaskRuntime): Promise<void> {
  runtime.logger.step('task-started');
  runtime.logger.info('TASK', `Starting task: module=${runtime.moduleId} attempt=${runtime.attempt} taskType=${runtime.taskType}`, {
    suites: runtime.suites, serveType: runtime.serveType,
    commitHash: runtime.commitHash, stageId: runtime.stageId, workerType: runtime.workerType,
  });
  await emitPluginEvent(runtime.tctx, 'task_started', runtime.telemetryIdentity({
    task_type: runtime.taskType, stage_id: runtime.stageId, worker_type: runtime.workerType,
    suites: runtime.suites, serve_type: runtime.serveType, commit_hash: runtime.commitHash,
  }));
}

async function prepareRepository(runtime: TaskRuntime): Promise<string | null> {
  runtime.stage = 'pre-cleanup';
  runtime.logger.step(runtime.stage);
  await runResourceCleanupStage({
    payload: runtime.payload, moduleId: runtime.moduleId, tctx: runtime.tctx,
    logger: runtime.logger, stage: 'pre', logCompletion: true,
  });
  runtime.stage = 'git-sync';
  runtime.logger.step(runtime.stage);
  const { repoRoot, syncResult } = await syncTaskRepo({
    payload: runtime.payload, commitHash: runtime.commitHash,
    moduleId: runtime.moduleId, tctx: runtime.tctx, logger: runtime.logger,
  });
  if (!syncResult.ok) {
    runtime.logger.error('GIT', `Git sync failed: ${syncResult.error}`);
    taskFailure(runtime, `git_sync_failed: ${syncResult.error ?? 'missing_git_sync_error'}`);
    return null;
  }
  const cleared = clearBusterOutputFile(runtime.payload);
  runtime.logger.info('TASK', `Prepared Buster output_file: ${cleared.path}`, { removed_stale: cleared.removed });
  return repoRoot;
}

function decision(runtime: TaskRuntime, agentJudgment: Record<string, any>) {
  const critical = runtime.suitesInfo.criticalFailed;
  return {
    recommendation: critical ? 'NO_SUBAGENT' : (agentJudgment.required ? 'SPAWN' : 'NO_SUBAGENT'),
    reason: critical
      ? 'critical suite failure'
      : (agentJudgment.required ? agentJudgment.reason : 'deterministic suites passed; agent judgment not required'),
  };
}

function criticalSuiteDetail(runtime: TaskRuntime): string {
  if (runtime.suitesInfo.suiteDetailSummary) return runtime.suitesInfo.suiteDetailSummary;
  return runtime.suitesInfo.suiteSummary || 'critical suite failure';
}

async function runDeterministicSuites(runtime: TaskRuntime, repoRoot: string): Promise<boolean> {
  runtime.stage = 'run-suites';
  runtime.logger.step(runtime.stage);
  runtime.suitesInfo = await runSuites(runtime.suites, {
    repoRoot, payload: runtime.payload, moduleId: runtime.moduleId, attempt: runtime.attempt,
    telemetryContext: runtime.tctx, logDir: runtime.logBaseDir,
    pipelineLogPath: runtime.payload.pipeline_log_path ?? null,
    pipelineRunLogPath: runtime.payload.pipeline_run_log_path ?? null,
    capabilities: runtime.capabilities,
  });
  runtime.logger.info('SUITES', `Suites complete: ${runtime.suitesInfo.suiteSummary}`, {
    criticalFailed: runtime.suitesInfo.criticalFailed,
  });
  return publishDecision(runtime);
}

async function publishDecision(runtime: TaskRuntime): Promise<boolean> {
  runtime.stage = 'decision';
  runtime.logger.step(runtime.stage);
  const policy = runtime.opts.resolveAgentJudgmentPolicy(runtime.payload);
  const result = decision(runtime, policy);
  await emitPluginEvent(runtime.tctx, 'decision', runtime.telemetryIdentity({
    recommendation: result.recommendation, reason: result.reason,
    suite_summary: runtime.suitesInfo.suiteSummary,
    agent_judgment_required: policy.required, agent_judgment_source: policy.source,
  }));
  runtime.logger.info('DECISION', `${result.recommendation} — ${result.reason}`);
  sendDiscord(buildSuiteResultsEmbed(runtime.moduleId, runtime.project, runtime.suitesInfo, {
    recommendation: result.recommendation, reason: result.reason,
    agent_judgment_required: policy.required, agent_judgment_source: policy.source,
  }), runtime.discordContext());
  if (runtime.suitesInfo.criticalFailed) return taskFailure(runtime, `NO_SUBAGENT: ${criticalSuiteDetail(runtime)}`);
  if (policy.required) return true;
  runtime.outcome = 'PASS';
  runtime.reason = 'deterministic_suites_passed';
  return false;
}

async function spawnAndMonitor(runtime: TaskRuntime) {
  runtime.stage = 'spawn-session';
  runtime.logger.step(runtime.stage);
  const prompt = appendAppTestCredentialsToPrompt(
    appendPreTestResultsToPrompt(textValue(runtime.payload.prompt), runtime.suitesInfo), runtime.suitesInfo,
  );
  const spawned: any = await spawnTaskSession({
    payload: runtime.payload, prompt, timeoutSeconds: runtime.timeoutSeconds,
    moduleId: runtime.moduleId, project: runtime.project, taskType: runtime.taskType,
    logger: runtime.logger, tctx: runtime.tctx, currentDiscordContext: runtime.discordContext,
    discord: sendDiscord as any, dispatchIdForCompletion: runtime.dispatchIdForCompletion,
    sessionPolicies: runtime.sessionPolicies,
  });
  if (!spawned.ok) return taskFailure(runtime, spawned.reason ?? 'session_spawn_failed');
  runtime.spawnedSubagent = true;
  runtime.sessionKeyForCompletion = spawned.sessionKeyForCompletion;
  runtime.dispatchIdForCompletion = spawned.dispatchIdForCompletion;
  runtime.stage = 'monitor-session';
  runtime.logger.step(runtime.stage);
  const monitored: any = await monitorTaskSession({
    sessionData: spawned.sessionData, payload: runtime.payload, tctx: runtime.tctx,
    moduleId: runtime.moduleId, timeoutSeconds: runtime.timeoutSeconds,
    logger: runtime.logger, sessionPolicies: runtime.sessionPolicies,
  });
  return { spawned, monitored };
}

async function finishAgent(runtime: TaskRuntime, session: Record<string, any>): Promise<void> {
  const { spawned, monitored } = session;
  if (!monitored.ok) {
    taskFailure(runtime, monitored.reason);
    return;
  }
  runtime.sessionResultForCompletion = monitored.sessionResult;
  runtime.stage = 'kill-session';
  runtime.logger.step(runtime.stage);
  await killTaskSession({
    sessionData: spawned.sessionData, sessionResult: monitored.sessionResult,
    elapsedSeconds: monitored.elapsedSeconds, moduleId: runtime.moduleId,
    tctx: runtime.tctx, logger: runtime.logger, sessionPolicies: runtime.sessionPolicies,
  });
  runtime.stage = 'determine-outcome';
  runtime.logger.step(runtime.stage);
  const result = publishTaskOutcome({
    payload: runtime.payload, sessionData: spawned.sessionData, sessionResult: monitored.sessionResult,
    elapsedSeconds: monitored.elapsedSeconds, timeoutSeconds: runtime.timeoutSeconds,
    moduleId: runtime.moduleId, project: runtime.project, commitHash: runtime.commitHash,
    currentDiscordContext: runtime.discordContext, discord: sendDiscord as any, logger: runtime.logger,
    dispatchIdForCompletion: runtime.dispatchIdForCompletion,
  });
  runtime.agentResultForCompletion = result.agentResult;
  runtime.outcome = result.outcome;
  runtime.reason = result.reason;
}

export async function executeTask(runtime: TaskRuntime): Promise<void> {
  const repoRoot = await prepareRepository(runtime);
  if (!repoRoot) return;
  if (!await runDeterministicSuites(runtime, repoRoot)) return;
  const session = await spawnAndMonitor(runtime);
  if (session === false) return;
  await finishAgent(runtime, session);
}
