
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
import { loadBusterSessionPolicies } from './runtime-policy.ts';
import { createTaskCompletionState, publishTaskCompletionWithArtifact } from './task-completion.ts';
import { getRedisClient } from './task-queue.ts';
import { runResourceCleanupStage } from './task-lifecycle/cleanup.ts';
import { syncTaskRepo } from './task-lifecycle/git-sync.ts';
import { sendTaskCompletionSignal } from './task-lifecycle/completion-signal.ts';
import {
  spawnTaskSession,
  monitorTaskSession,
  killTaskSession,
  publishTaskOutcome,
} from './task-lifecycle/session.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const TASK_LIFECYCLE_STATE = {
  lastRunLogDir: null,
};
const RESOURCE_CLEANUP_RETURNED_INCOMPLETE = 'cleanup returned ok=false';
const SUITE_NAME_MISSING = 'missing_suite_name';
const PRETEST_STATUS_MISSING = 'UNKNOWN';
const SUITE_SUMMARY_MISSING = 'No suite summary available.';
const CRITICAL_SUITE_FAILURE_REASON = 'critical suite failure';
const EMPTY_PROMPT = '';

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function textValue(value) {
  return typeof value === 'string' ? value : EMPTY_PROMPT;
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function preTestResultDetail(result = {}) {
  if (typeof result?.findings?.[0]?.message === 'string' && result.findings[0].message) return result.findings[0].message;
  if (typeof result?.error === 'string' && result.error) return result.error;
  if (typeof result?.reason === 'string' && result.reason) return result.reason;
  return null;
}

function taskLogBaseDir(payload, moduleId, attempt) {
  if (typeof payload?.log_dir === 'string' && payload.log_dir.trim()) return payload.log_dir;
  return join('.swarm', 'logs', 'buster', moduleId, `attempt-${attempt}`);
}

function discordCorrelationIdentity(extra, fallback) {
  return {
    gate_id: firstDefined(extra.gate_id, fallback.gateId),
    gate_type: firstDefined(extra.gate_type, fallback.gateType),
    dispatch_id: firstDefined(extra.dispatch_id, fallback.dispatchId),
    session_key: firstDefined(extra.session_key, fallback.sessionKey),
  };
}

function agentRecommendation(suitesInfo, agentJudgment) {
  if (suitesInfo.criticalFailed) return 'NO_SUBAGENT';
  return agentJudgment.required ? 'SPAWN' : 'NO_SUBAGENT';
}

export function getLastRunLogDir() {
  return TASK_LIFECYCLE_STATE.lastRunLogDir;
}

function discord(message, context = {}) {
  return sendDiscord(message, context);
}

function notifyTaskFailure(moduleId, project, result, context = {}) {
  discord(buildTaskFailureEmbed(moduleId, project, result), context);
}

function resourceCleanupFailureReason(cleanup) {
  if (!cleanup) return 'cleanup returned no result';
  if (Array.isArray(cleanup.errors) && cleanup.errors.length > 0) {
    return cleanup.errors.map(safeErrorMessage).join('; ');
  }
  if (Array.isArray(cleanup.failures) && cleanup.failures.length > 0) {
    return cleanup.failures.map(safeErrorMessage).join('; ');
  }
  return selectPresentValue(cleanup.reason, cleanup.error, RESOURCE_CLEANUP_RETURNED_INCOMPLETE);
}

function collectAppTestCredentials(suitesInfo = {}) {
  const credentials = [];
  for (const result of arrayValue(suitesInfo?.results)) {
    const entries = Array.isArray(result?.metadata?.test_credentials)
      ? result.metadata.test_credentials
      : [];
    for (const entry of entries) {
      if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!entry), () => (typeof entry !== 'object'))), () => (!entry.values))), () => (typeof entry.values !== 'object'))) continue;
      credentials.push({
        suite: selectPresentValue(result.suite, SUITE_NAME_MISSING),
        namespace: selectTruthyValue(() => (result.metadata?.test_namespace), () => (null)),
        service_url: selectTruthyValue(() => (result.metadata?.service_url), () => (null)),
        preview_url: selectTruthyValue(() => (result.metadata?.preview_url), () => (null)),
        secret: selectTruthyValue(() => (entry.secret), () => (null)),
        purpose: selectTruthyValue(() => (entry.purpose), () => (null)),
        values: entry.values,
      });
    }
  }
  return credentials;
}

function formatPreTestResultLine(result = {}) {
  const suite = selectPresentValue(result?.suite, SUITE_NAME_MISSING);
  const status = selectPresentValue(result?.status, PRETEST_STATUS_MISSING);
  const detail = preTestResultDetail(result);
  return detail ? `- ${suite}: ${status} - ${detail}` : `- ${suite}: ${status}`;
}

function appendPreTestResultsToPrompt(prompt, suitesInfo = {}) {
  const results = Array.isArray(suitesInfo?.results) ? suitesInfo.results : [];
  if (results.length === 0) return textValue(prompt);

  const buildResult = selectTruthyValue(() => (results.find((result) => result?.suite === 'build')), () => (null));
  const healthResult = selectTruthyValue(() => (results.find((result) => result?.suite === 'health')), () => (null));
  const buildPassed = buildResult?.status === 'PASS';
  const healthPassed = healthResult?.status === 'PASS';
  const healthUrl = typeof healthResult?.metadata?.url === 'string' ? healthResult.metadata.url : null;
  const buildPort = selectDefinedValue(() => (buildResult?.metadata?.port), () => (null));
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
    `Summary: ${selectPresentValue(suitesInfo?.suiteSummary, SUITE_SUMMARY_MISSING)}`,
    '',
    ...results.map(formatPreTestResultLine),
    '',
    'These deterministic pre-test results are authoritative for build and initial app startup.',
    'Do not rerun build or start commands just to reconfirm them.',
  ];

  if (selectTruthyValue(() => (buildPassed), () => (healthPassed))) {
    section.push(
      'Do not run another image build, deployment, `npm start`, or local server unless you are investigating a new failure the pre-test runner did not already cover.',
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
  const promptText = textValue(prompt);
  const insertBefore = '\n## Test Instructions';
  const sectionText = section.join('\n');
  const markerIndex = promptText.indexOf(insertBefore);
  if (markerIndex >= 0) {
    return `${promptText.slice(0, markerIndex)}${sectionText}${promptText.slice(markerIndex)}`;
  }
  return `${promptText}${sectionText}`;
}

function appendAppTestCredentialsToPrompt(prompt, suitesInfo = {}) {
  const credentials = collectAppTestCredentials(suitesInfo);
  if (credentials.length === 0) return textValue(prompt);
  const section = [
    '',
    '---',
    '',
    '## App Test Credentials',
    '',
    'The deterministic pre-test runner decoded only the app-under-test credentials explicitly declared in `test_config.k8s.test_credentials` or final-preview credential config.',
    'Use these values only for authenticated tests against the deployed app. Do not print them into `output_file` unless a failing assertion requires the credential evidence.',
    '',
    '```json',
    JSON.stringify(credentials, null, 2),
    '```',
    '',
  ].join('\n');
  return `${textValue(prompt)}${section}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveGateType(payload = {}) {
  if (payload?.gate_type !== undefined && payload?.gate_type !== null) return payload.gate_type;
  return null;
}

export function resolveAgentJudgmentPolicy(payload = {}) {
  const policy = payload?.agent_judgment;
  if (selectTruthyValue(() => (policy === undefined), () => (policy === null))) {
    return {
      required: false,
      source: 'default',
      reason: 'deterministic_suites_authoritative',
    };
  }
  if (!isPlainObject(policy)) {
    throw new Error('Buster payload agent_judgment must be an object');
  }
  if (typeof policy.required !== 'boolean') {
    throw new Error('Buster payload agent_judgment.required must be a boolean');
  }
  return {
    required: policy.required,
    source: 'payload',
    reason: typeof policy.reason === 'string' && policy.reason.trim()
      ? policy.reason.trim()
      : (policy.required ? 'agent_judgment_required' : 'deterministic_suites_authoritative'),
  };
}

export async function processTask(payload, opts = {}) {
  const identity = validateBusterTaskPayload(payload);
  const moduleId   = identity.moduleId;
  const taskType   = identity.taskType;
  const gateId     = identity.gateId;
  const attempt    = identity.attempt;
  const suites     = identity.suites;
  const serveType  = selectTruthyValue(() => (payload?.serve_type), () => (null));
  const commitHash = identity.commitHash;
  const project    = identity.project;
  const runId      = identity.runId;
  const gateType   = resolveGateType(payload);
  const stageId    = identity.stageId;
  const workerType = identity.workerType;
  const timeoutSeconds = identity.timeoutSeconds;

  // payload.log_dir overrides the default run-scoped layout.
  const logBaseDir = taskLogBaseDir(payload, moduleId, attempt);
  TASK_LIFECYCLE_STATE.lastRunLogDir = logBaseDir;

  let dispatchIdForCompletion = identity.dispatchId;
  const capabilities = identity.capabilities;

  const tctx = createTelemetryContext({
    project,
    module_id: moduleId,
    run_id: runId,
    enabled: opts.telemetryEnabled,
    log_dir: logBaseDir,
    pipeline_log_path: selectTruthyValue(() => (payload?.pipeline_log_path), () => (null)),
    pipeline_run_log_path: selectTruthyValue(() => (payload?.pipeline_run_log_path), () => (null)),
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
  let reason     = 'missing_task_lifecycle_reason';
  let stage      = 'task-started';
  let spawnedSubagent = false;
  let suitesInfo = { results: [], suiteSummary: '', suiteDetailSummary: '', criticalFailed: false };
  let sessionKeyForCompletion = null;
  let sessionResultForCompletion = null;
  let agentResultForCompletion = null;
  const completionState = createTaskCompletionState();
  const sessionPolicies = opts.sessionPolicies === undefined ? loadBusterSessionPolicies() : opts.sessionPolicies;
  const taskResult = () => ({ outcome, reason, completion: completionState });
  const currentDiscordContext = (extra = {}) => ({
    ...discordCorrelationIdentity(extra, {
      gateId,
      gateType,
      dispatchId: dispatchIdForCompletion,
      sessionKey: sessionKeyForCompletion,
    }),
    module_id: moduleId,
    project,
    run_id: runId,
    attempt,
    log_dir: logBaseDir,
    pipeline_log_path: selectTruthyValue(() => (payload?.pipeline_log_path), () => (null)),
    pipeline_run_log_path: selectTruthyValue(() => (payload?.pipeline_run_log_path), () => (null)),
    telemetry_context: tctx,
    webhook_url: selectTruthyValue(() => (payload?.discord_webhook_url), () => (null)),
  });

  const taskTelemetryIdentity = (extra = {}) => ({
    module_id: gateId ? null : moduleId,
    ...(gateId ? { gate_id: gateId, gate_type: selectTruthyValue(() => (gateType), () => (null)) } : {}),
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

    await runResourceCleanupStage({
      payload,
      moduleId,
      tctx,
      logger,
      stage: 'pre',
      logCompletion: true,
    });

    stage = 'git-sync';
    logger.step('git-sync');

    const { repoRoot, syncResult } = await syncTaskRepo({ payload, commitHash, moduleId, tctx, logger });

    if (!syncResult.ok) {
      outcome = 'FAIL';
      reason  = `git_sync_failed: ${selectTruthyValue(() => (syncResult.error), () => ('missing_git_sync_error'))}`;
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
      repoRoot,
      payload,
      moduleId,
      attempt,
      telemetryContext: tctx,
      logDir: logBaseDir,
      pipelineLogPath: selectTruthyValue(() => (payload?.pipeline_log_path), () => (null)),
      pipelineRunLogPath: selectTruthyValue(() => (payload?.pipeline_run_log_path), () => (null)),
      capabilities,
    });

    logger.info('SUITES', `Suites complete: ${suitesInfo.suiteSummary}`, {
      criticalFailed: suitesInfo.criticalFailed,
    });

    stage = 'decision';
    logger.step('decision');

    const agentJudgment = resolveAgentJudgmentPolicy(payload);
    const recommendation = agentRecommendation(suitesInfo, agentJudgment);
    const decisionReason = suitesInfo.criticalFailed
      ? 'critical suite failure'
      : agentJudgment.required
        ? agentJudgment.reason
        : 'deterministic suites passed; agent judgment not required';

    await emitPluginEvent(tctx, 'decision', taskTelemetryIdentity({
      recommendation,
      reason:         decisionReason,
      suite_summary:  suitesInfo.suiteSummary,
      agent_judgment_required: agentJudgment.required,
      agent_judgment_source: agentJudgment.source,
    }));

    logger.info('DECISION', `${recommendation} — ${decisionReason}`);
    discord(buildSuiteResultsEmbed(moduleId, project, suitesInfo, {
      recommendation,
      reason: decisionReason,
      agent_judgment_required: agentJudgment.required,
      agent_judgment_source: agentJudgment.source,
    }), currentDiscordContext());

    if (suitesInfo.criticalFailed) {
      outcome = 'FAIL';
      reason  = `NO_SUBAGENT: ${selectPresentValue(suitesInfo.suiteDetailSummary, suitesInfo.suiteSummary, CRITICAL_SUITE_FAILURE_REASON)}`;
      return taskResult();
    }

    if (!agentJudgment.required) {
      outcome = 'PASS';
      reason = 'deterministic_suites_passed';
      return taskResult();
    }

    stage = 'spawn-session';
    logger.step('spawn-session');

    const prompt = appendAppTestCredentialsToPrompt(
      appendPreTestResultsToPrompt(textValue(payload?.prompt), suitesInfo),
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
      sessionPolicies,
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
      sessionPolicies,
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

    await killTaskSession({ sessionData, sessionResult, elapsedSeconds, moduleId, tctx, logger, sessionPolicies });

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
      error_name: selectTruthyValue(() => (err?.name), () => (null)),
      error_code: selectTruthyValue(() => (err?.code), () => (null)),
    });
    notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
    return taskResult();

  } finally {
    stage = 'final-cleanup';
    logger.step('final-cleanup');

    let finalCleanupFailed = false;
    try {
      const cleanup = await runResourceCleanupStage({
        payload,
        moduleId,
        tctx,
        logger,
        stage: 'final',
      });
      if (cleanup?.ok === false) {
        finalCleanupFailed = true;
        const cleanupDetail = resourceCleanupFailureReason(cleanup);
        outcome = 'FAIL';
        reason = reason && reason !== 'missing_task_lifecycle_reason'
          ? `${reason}; final_cleanup_failed: ${cleanupDetail}`
          : `final_cleanup_failed: ${cleanupDetail}`;
        logger.error('RESOURCE', `Final cleanup failed: ${cleanupDetail}`);
        notifyTaskFailure(moduleId, project, { reason, stage, attempt, taskType, commitHash }, currentDiscordContext());
      }
    } catch (cleanupError) {
      finalCleanupFailed = true;
      outcome = 'FAIL';
      reason = reason && reason !== 'missing_task_lifecycle_reason'
        ? `${reason}; final_cleanup_failed: ${safeErrorMessage(cleanupError)}`
        : `final_cleanup_failed: ${safeErrorMessage(cleanupError)}`;
      logger.error('RESOURCE', `Final cleanup failed: ${safeErrorMessage(cleanupError)}`, {
        error_name: selectTruthyValue(() => (cleanupError?.name), () => (null)),
        error_code: selectTruthyValue(() => (cleanupError?.code), () => (null)),
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
        error_name: selectTruthyValue(() => (telemetryError?.name), () => (null)),
        error_code: selectTruthyValue(() => (telemetryError?.code), () => (null)),
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
      deps: {
        getRedisClient,
        publishTaskCompletionWithArtifact,
      },
    });

    try {
      logger.flush();
    } catch (flushError) {
      logger.error('TASK', `Logger flush failed: ${safeErrorMessage(flushError)}`, {
        error_name: selectTruthyValue(() => (flushError?.name), () => (null)),
        error_code: selectTruthyValue(() => (flushError?.code), () => (null)),
      });
    }

    try {
      await closeTelemetry(tctx);
    } catch (telemetryCloseError) {
      logger.error('TELEMETRY', `Telemetry close failed: ${safeErrorMessage(telemetryCloseError)}`, {
        error_name: selectTruthyValue(() => (telemetryCloseError?.name), () => (null)),
        error_code: selectTruthyValue(() => (telemetryCloseError?.code), () => (null)),
      });
    }

    if (finalCleanupFailed) return taskResult();
  }
}

export const __taskLifecycleTest = {
  appendAppTestCredentialsToPrompt,
  appendPreTestResultsToPrompt,
  resolveAgentJudgmentPolicy,
};
