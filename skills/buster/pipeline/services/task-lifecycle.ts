
import { join } from 'path';

import {
  createTelemetryContext,
  emitEvent,
  emitPluginEvent,
  closeTelemetry,
} from './telemetry.ts';
import { requireTelemetryStreamMaxLenFromConfig } from '../telemetry.ts';
import { runSuites } from '../runners/suite-runner.ts';
import { createLogger } from './logger.ts';
import { sendDiscord } from './discord.ts';
import {
  buildSuiteResultsEmbed,
  buildTaskFailureEmbed,
  clearBusterOutputFile,
} from './pipeline-helpers.ts';

import { validateBusterTaskPayload } from './task-validation.ts';
import { safeErrorMessage } from './runtime-diagnostics.ts';
import { createTaskCompletionState } from './task-completion.ts';
import { runSandboxCleanupStage } from './task-lifecycle/cleanup.ts';
import { syncTaskRepo } from './task-lifecycle/git-sync.ts';
import { sendTaskCompletionSignal } from './task-lifecycle/completion-signal.ts';
import {
  spawnTaskSession,
  monitorTaskSession,
  killTaskSession,
  publishTaskOutcome,
} from './task-lifecycle/session.ts';

const TASK_LIFECYCLE_STATE = {
  lastRunLogDir: null,
};

export function getLastRunLogDir() {
  return TASK_LIFECYCLE_STATE.lastRunLogDir;
}

function discord(message, context = {}) {
  return sendDiscord(message, context);
}

function notifyTaskFailure(moduleId, project, result, context = {}) {
  discord(buildTaskFailureEmbed(moduleId, project, result), context);
}

function sandboxCleanupFailureReason(cleanup) {
  if (!cleanup) return 'cleanup returned no result';
  if (Array.isArray(cleanup.errors) && cleanup.errors.length > 0) {
    return cleanup.errors.map(safeErrorMessage).join('; ');
  }
  if (Array.isArray(cleanup.failures) && cleanup.failures.length > 0) {
    return cleanup.failures.map(safeErrorMessage).join('; ');
  }
  return cleanup.reason || cleanup.error || 'cleanup returned ok=false';
}

function collectAppTestCredentials(suitesInfo = {}) {
  const credentials = [];
  for (const result of suitesInfo?.results || []) {
    const entries = Array.isArray(result?.metadata?.test_credentials)
      ? result.metadata.test_credentials
      : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !entry.values || typeof entry.values !== 'object') continue;
      credentials.push({
        suite: result.suite || 'unknown',
        namespace: result.metadata?.test_namespace || null,
        service_url: result.metadata?.service_url || null,
        preview_url: result.metadata?.preview_url || null,
        secret: entry.secret || null,
        purpose: entry.purpose || null,
        values: entry.values,
      });
    }
  }
  return credentials;
}

function formatPreTestResultLine(result = {}) {
  const suite = String(result?.suite || 'unknown');
  const status = String(result?.status || 'UNKNOWN');
  const detail = result?.findings?.[0]?.message
    || result?.error
    || result?.reason
    || null;
  return detail ? `- ${suite}: ${status} - ${detail}` : `- ${suite}: ${status}`;
}

function appendPreTestResultsToPrompt(prompt, suitesInfo = {}) {
  const results = Array.isArray(suitesInfo?.results) ? suitesInfo.results : [];
  if (results.length === 0) return prompt || '';

  const buildResult = results.find((result) => result?.suite === 'build') || null;
  const healthResult = results.find((result) => result?.suite === 'health') || null;
  const buildPassed = buildResult?.status === 'PASS';
  const healthPassed = healthResult?.status === 'PASS';
  const healthUrl = typeof healthResult?.metadata?.url === 'string' ? healthResult.metadata.url : null;
  const buildPort = buildResult?.metadata?.port ?? null;
  const buildTool = typeof buildResult?.metadata?.tool === 'string' ? buildResult.metadata.tool : null;
  const imageRef = typeof buildResult?.metadata?.image === 'string'
    ? buildResult.metadata.image
    : (typeof buildResult?.metadata?.image_ref === 'string' ? buildResult.metadata.image_ref : null);

  const section = [
    '',
    '---',
    '',
    '## Pre-Test Results',
    '',
    `Summary: ${suitesInfo?.suiteSummary || 'No suite summary available.'}`,
    '',
    ...results.map(formatPreTestResultLine),
    '',
    'These deterministic pre-test results are authoritative for build and initial app startup.',
    'Do not rerun build or start commands just to reconfirm them.',
  ];

  if (buildPassed || healthPassed) {
    section.push(
      'Do not run `npm run build`, `docker build`, `podman build`, `npm start`, or start a second local server unless you are investigating a new failure the pre-test runner did not already cover.',
    );
  }
  if (buildPassed && buildTool) {
    section.push(`Build authority: ${buildTool} already produced the runnable artifact for this attempt.`);
  }
  if (imageRef) {
    section.push(`Runtime image: \`${imageRef}\``);
  }
  if (healthUrl) {
    section.push(`Running app URL: \`${healthUrl}\``);
  } else if (healthPassed && buildPort) {
    section.push(`Running app port: \`${buildPort}\``);
  }

  section.push('', '');
  return `${prompt || ''}${section.join('\n')}`;
}

function appendAppTestCredentialsToPrompt(prompt, suitesInfo = {}) {
  const credentials = collectAppTestCredentials(suitesInfo);
  if (credentials.length === 0) return prompt || '';
  const section = [
    '',
    '---',
    '',
    '## App Test Credentials',
    '',
    'The deterministic pre-test runner decoded only the app-under-test credentials explicitly declared in `test_config.k8s.test_credentials` or final-preview credential config.',
    'Use these values only for authenticated tests against the deployed app. Do not print them into `output_file` unless a failing assertion requires a redacted reference.',
    '',
    '```json',
    JSON.stringify(credentials, null, 2),
    '```',
    '',
  ].join('\n');
  return `${prompt || ''}${section}`;
}

export async function processTask(payload, opts = {}) {
  const identity = validateBusterTaskPayload(payload);
  const moduleId   = identity.moduleId;
  const taskType   = identity.taskType;
  const gateId     = identity.gateId;
  const attempt    = identity.attempt;
  const suites     = identity.suites;
  const serveType  = payload?.serve_type || null;
  const commitHash = identity.commitHash;
  const project    = identity.project;
  const runId      = identity.runId;
  const gateType   = payload?.gate_type || payload?.gateType || null;
  const stageId    = identity.stageId;
  const workerType = identity.workerType;
  const timeoutSeconds = identity.timeoutSeconds;

  // payload.log_dir overrides the default run-scoped layout.
  const logBaseDir = payload?.log_dir ||
    join('.swarm', 'logs', 'buster', moduleId, `attempt-${attempt}`);
  TASK_LIFECYCLE_STATE.lastRunLogDir = logBaseDir;

  let dispatchIdForCompletion = identity.dispatchId;
  const capabilities = identity.capabilities;

  const tctx = createTelemetryContext({
    project,
    module_id: moduleId,
    run_id: runId,
    enabled: opts.telemetryEnabled,
    log_dir: logBaseDir,
    pipeline_log_path: payload?.pipeline_log_path || null,
    pipeline_run_log_path: payload?.pipeline_run_log_path || null,
    attempt,
    dispatch_id: dispatchIdForCompletion,
    gate_id: gateId,
    gate_type: gateType,
    streamMaxLen: opts.platformConfig ? requireTelemetryStreamMaxLenFromConfig(opts.platformConfig) : undefined,
  });

  const logger = createLogger({
    logPath:  join(logBaseDir, 'buster-pipeline.jsonl'),
    module:   moduleId,
    taskType,
    attempt,
    dispatchId: dispatchIdForCompletion,
    emitTelemetry: (type, data) => emitEvent(tctx, type, data),
  });

  const taskStartMs = Date.now();

  let outcome    = 'FAIL';
  let reason     = 'unknown';
  let stage      = 'task-started';
  let spawnedSubagent = false;
  let suitesInfo = { results: [], suiteSummary: '', suiteDetailSummary: '', criticalFailed: false };
  let sessionKeyForCompletion = null;
  let sessionResultForCompletion = null;
  let agentResultForCompletion = null;
  const completionState = createTaskCompletionState();
  const taskResult = () => ({ outcome, reason, completion: completionState });
  const currentDiscordContext = (extra = {}) => ({
    module_id: moduleId,
    gate_id: extra.gate_id ?? gateId,
    gate_type: extra.gate_type ?? payload?.gate_type ?? payload?.gateType,
    project,
    run_id: runId,
    attempt,
    dispatch_id: extra.dispatch_id ?? dispatchIdForCompletion,
    session_key: extra.session_key ?? sessionKeyForCompletion,
    log_dir: logBaseDir,
    pipeline_log_path: payload?.pipeline_log_path || null,
    pipeline_run_log_path: payload?.pipeline_run_log_path || null,
    telemetry_context: tctx,
  });

  const taskTelemetryIdentity = (extra = {}) => ({
    module_id: gateId ? null : moduleId,
    ...(gateId ? { gate_id: gateId, gate_type: gateType || null } : {}),
    attempt,
    ...extra,
  });

  logger.step('task-started');
  logger.info('TASK', `Starting task: module=${moduleId} attempt=${attempt} taskType=${taskType}`, {
    suites, serveType, commitHash, stageId, workerType,
  });

  await emitPluginEvent(tctx, 'task_started', taskTelemetryIdentity({
    task_type:   taskType,
    stage_id:    stageId,
    worker_type: workerType,
    suites,
    serve_type:  serveType,
    commit_hash: commitHash,
  }));

  try {
    stage = 'pre-cleanup';
    logger.step('pre-cleanup');

    await runSandboxCleanupStage({
      payload,
      moduleId,
      tctx,
      logger,
      stage: 'pre',
      logCompletion: true,
    });

    stage = 'git-sync';
    logger.step('git-sync');

    const { syncResult } = await syncTaskRepo({ payload, commitHash, moduleId, tctx, logger });

    if (!syncResult.ok) {
      outcome = 'FAIL';
      reason  = `git_sync_failed: ${syncResult.error || 'unknown'}`;
      logger.error('GIT', `Git sync failed: ${syncResult.error}`);
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
      return taskResult();
    }

    const clearedOutput = clearBusterOutputFile(payload);
    logger.info('TASK', `Prepared Buster output_file: ${clearedOutput.path}`, {
      removed_stale: clearedOutput.removed,
    });

    stage = 'run-suites';
    logger.step('run-suites');

    suitesInfo = await runSuites(suites, {
      payload,
      moduleId,
      attempt,
      telemetryContext: tctx,
      logDir: logBaseDir,
      pipelineLogPath: payload?.pipeline_log_path || null,
      pipelineRunLogPath: payload?.pipeline_run_log_path || null,
      capabilities,
    });

    logger.info('SUITES', `Suites complete: ${suitesInfo.suiteSummary}`, {
      criticalFailed: suitesInfo.criticalFailed,
    });

    stage = 'decision';
    logger.step('decision');

    const recommendation = suitesInfo.criticalFailed ? 'NO_SPAWN' : 'SPAWN';
    const decisionReason = suitesInfo.criticalFailed
      ? 'critical suite failure'
      : 'all critical suites passed';

    await emitPluginEvent(tctx, 'decision', taskTelemetryIdentity({
      recommendation,
      reason:         decisionReason,
      suite_summary:  suitesInfo.suiteSummary,
    }));

    logger.info('DECISION', `${recommendation} — ${decisionReason}`);
    discord(buildSuiteResultsEmbed(moduleId, project, suitesInfo), currentDiscordContext());

    if (suitesInfo.criticalFailed) {
      outcome = 'FAIL';
      reason  = `NO_SUBAGENT: ${suitesInfo.suiteDetailSummary || suitesInfo.suiteSummary || 'critical suite failure'}`;
      return taskResult();
    }

    stage = 'spawn-session';
    logger.step('spawn-session');

    const prompt = appendAppTestCredentialsToPrompt(
      appendPreTestResultsToPrompt(payload?.prompt || '', suitesInfo),
      suitesInfo,
    );
    const spawnResult = await spawnTaskSession({
      payload,
      prompt,
      timeoutSeconds,
      moduleId,
      project,
      taskType,
      logger,
      tctx,
      currentDiscordContext,
      discord,
      dispatchIdForCompletion,
    });
    if (!spawnResult.ok) {
      outcome = 'FAIL';
      reason = spawnResult.reason;
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
      return taskResult();
    }

    const { sessionData } = spawnResult;
    spawnedSubagent = true;
    sessionKeyForCompletion = spawnResult.sessionKeyForCompletion;
    dispatchIdForCompletion = spawnResult.dispatchIdForCompletion;

    stage = 'monitor-session';
    logger.step('monitor-session');

    const monitorResult = await monitorTaskSession({
      sessionData,
      payload,
      tctx,
      moduleId,
      timeoutSeconds,
      logger,
    });
    if (!monitorResult.ok) {
      outcome = 'FAIL';
      reason = monitorResult.reason;
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext({
        dispatch_id: dispatchIdForCompletion,
        session_key: sessionData.childSessionKey,
      }));
      return taskResult();
    }

    const { sessionResult, elapsedSeconds } = monitorResult;
    sessionResultForCompletion = sessionResult;

    stage = 'kill-session';
    logger.step('kill-session');

    await killTaskSession({ sessionData, sessionResult, elapsedSeconds, moduleId, tctx, logger });

    stage = 'determine-outcome';
    logger.step('determine-outcome');

    const publishedOutcome = publishTaskOutcome({
      payload,
      sessionData,
      sessionResult,
      elapsedSeconds,
      timeoutSeconds,
      moduleId,
      project,
      commitHash,
      currentDiscordContext,
      discord,
      logger,
      dispatchIdForCompletion,
    });
    agentResultForCompletion = publishedOutcome.agentResult;
    outcome = publishedOutcome.outcome;
    reason = publishedOutcome.reason;

    return taskResult();

  } catch (err) {
    outcome = 'FAIL';
    const internalErrorDetail = safeErrorMessage(err);
    reason  = `internal_error: ${internalErrorDetail}`;
    logger.error('TASK', `Unhandled task failure at ${stage}: ${internalErrorDetail}`, {
      error_name: err?.name || null,
      error_code: err?.code || null,
    });
    notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
    return taskResult();

  } finally {
    stage = 'final-cleanup';
    logger.step('final-cleanup');

    let finalCleanupFailed = false;
    try {
      const cleanup = await runSandboxCleanupStage({
        payload,
        moduleId,
        tctx,
        logger,
        stage: 'final',
      });
      if (cleanup?.ok === false) {
        finalCleanupFailed = true;
        const cleanupDetail = sandboxCleanupFailureReason(cleanup);
        outcome = 'FAIL';
        reason = reason && reason !== 'unknown'
          ? `${reason}; final_cleanup_failed: ${cleanupDetail}`
          : `final_cleanup_failed: ${cleanupDetail}`;
        logger.error('SANDBOX', `Final cleanup failed: ${cleanupDetail}`);
        notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
      }
    } catch (cleanupError) {
      finalCleanupFailed = true;
      outcome = 'FAIL';
      reason = reason && reason !== 'unknown'
        ? `${reason}; final_cleanup_failed: ${safeErrorMessage(cleanupError)}`
        : `final_cleanup_failed: ${safeErrorMessage(cleanupError)}`;
      logger.error('SANDBOX', `Final cleanup failed: ${safeErrorMessage(cleanupError)}`, {
        error_name: cleanupError?.name || null,
        error_code: cleanupError?.code || null,
      });
      notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
    }

    const totalDuration = Math.round((Date.now() - taskStartMs) / 1000);
    const passCount = suitesInfo.results.filter(r => r.status === 'PASS').length;
    const failCount = suitesInfo.results.filter(r => r.status === 'FAIL').length;
    const errorCount = suitesInfo.results.filter(r => r.status === 'ERROR').length;
    const skipCount = suitesInfo.results.filter(r => r.status === 'SKIP').length;

    try {
      await emitPluginEvent(tctx, 'task_completed', taskTelemetryIdentity({
        task_type:        taskType,
        stage_id:         stageId,
        worker_type:      workerType,
        outcome,
        reason,
        duration_seconds: totalDuration,
        suites_passed:    passCount,
        suites_failed:    failCount,
        suites_errored:   errorCount,
        suites_skipped:   skipCount,
        suite_summary:    suitesInfo.suiteSummary,
        spawned_subagent: spawnedSubagent,
      }));
    } catch (telemetryError) {
      logger.error('TELEMETRY', `Task completion telemetry failed: ${safeErrorMessage(telemetryError)}`, {
        error_name: telemetryError?.name || null,
        error_code: telemetryError?.code || null,
      });
    }

    logger.info('TASK', `Task completed: outcome=${outcome} reason=${reason} duration=${totalDuration}s`);

    // Send completion signal back to Nova pipeline via completion_stream.
    // Buster v2 uses telemetry for observability, but Nova still polls this
    // stream to unblock the dual-channel poller.
    await sendTaskCompletionSignal({
      payload,
      completionState,
      spawnedSubagent,
      suitesInfo,
      agentResultForCompletion,
      sessionResultForCompletion,
      moduleId,
      project,
      outcome,
      reason,
      runId,
      attempt,
      dispatchIdForCompletion,
      sessionKeyForCompletion,
      logger,
    });

    try {
      logger.flush();
    } catch (flushError) {
      logger.error('TASK', `Logger flush failed: ${safeErrorMessage(flushError)}`, {
        error_name: flushError?.name || null,
        error_code: flushError?.code || null,
      });
    }

    try {
      await closeTelemetry(tctx);
    } catch (telemetryCloseError) {
      logger.error('TELEMETRY', `Telemetry close failed: ${safeErrorMessage(telemetryCloseError)}`, {
        error_name: telemetryCloseError?.name || null,
        error_code: telemetryCloseError?.code || null,
      });
    }

    if (finalCleanupFailed) return taskResult();
  }
}

export const __taskLifecycleTest = {
  appendAppTestCredentialsToPrompt,
  appendPreTestResultsToPrompt,
};
