
import {
  resolveBusterRateLimitMaxPauses,
  buildSuiteArtifactData,
  buildPreTestVerdict,
} from '../pipeline-helpers.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';

import { selectTruthyValue } from '../../optional-absence.ts';
type AnyRecord = Record<string, any>;

function requireFunction(value: unknown, name: string): (...args: any[]) => any {
  if (typeof value === 'function') return value as (...args: any[]) => any;
  throw new Error(`Buster completion signal requires ${name}`);
}

function rateLimitSessionResultForResolver(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function suiteCompletionSummary(suitesInfo: AnyRecord): string {
  if (suitesInfo.suiteDetailSummary) return suitesInfo.suiteDetailSummary;
  return suitesInfo.suiteSummary;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function completionFailureClass({ outcome, spawnedSubagent, suitesInfo, agentResultForCompletion }: AnyRecord): string | null {
  if (outcome === 'PASS') return null;
  const agentFailureClass = textValue(agentResultForCompletion?.failure_class);
  if (agentFailureClass) return agentFailureClass;
  if (!spawnedSubagent && suitesInfo?.criticalFailed === true) return 'pretest_code';
  if (outcome === 'RATE_LIMITED') return 'rate_limit_exhausted';
  return null;
}

function completionSummary(request: AnyRecord): string {
  if (!request.spawnedSubagent && request.suitesInfo.suiteSummary) return suiteCompletionSummary(request.suitesInfo);
  if (request.agentResultForCompletion?.summary) return request.agentResultForCompletion.summary;
  if (request.reason) return request.reason;
  return request.suitesInfo.suiteSummary || '';
}

function artifactSummary(request: AnyRecord): string {
  if (request.agentResultForCompletion?.summary) return request.agentResultForCompletion.summary;
  if (request.reason) return request.reason;
  if (request.suitesInfo.suiteDetailSummary) return request.suitesInfo.suiteDetailSummary;
  return request.suitesInfo.suiteSummary || '';
}

function artifactData(request: AnyRecord): unknown {
  if (!request.spawnedSubagent) return buildSuiteArtifactData(request.moduleId, request.project, request.suitesInfo);
  const data = request.agentResultForCompletion?.data;
  return data && typeof data === 'object' ? data : null;
}

function completionOptions(request: AnyRecord): AnyRecord {
  const { payload, sessionResultForCompletion } = request;
  const rateLimitMaxPauses = request.outcome === 'RATE_LIMITED'
    ? resolveBusterRateLimitMaxPauses(payload, rateLimitSessionResultForResolver(sessionResultForCompletion))
    : null;
  return {
    moduleId: request.moduleId, outcome: request.outcome, reason: request.reason,
    failureClass: completionFailureClass(request), summary: completionSummary(request),
    artifactSummary: artifactSummary(request), artifactSource: request.agentResultForCompletion?.source ?? null,
    artifactData: artifactData(request),
    preTestVerdict: request.spawnedSubagent ? null : buildPreTestVerdict(request.moduleId, request.project, request.suitesInfo),
    rateLimitMaxPauses, runId: request.runId, attempt: request.attempt,
    dispatchId: request.dispatchIdForCompletion, sessionKey: request.sessionKeyForCompletion,
    source: 'buster-pipeline', ensureBusterOutputFile: request.deps.ensureBusterOutputFile,
    verifyAndPush: request.deps.verifyAndPush, emitTaskCompletion: request.deps.emitTaskCompletion,
    commitMessage: `[BUSTER] ${request.payload.task_type ?? 'task'} ${request.moduleId}: output artifact`,
  };
}

function logPublishedArtifacts(published: AnyRecord, logger: AnyRecord): void {
  if (published.outputFileResult) logger.info('TASK', `Buster output_file ready: ${published.outputFileResult.path}`, {
    source: published.outputFileResult.source, status: published.outputFileResult.status,
  });
  if (published.verifyResult) logger.info('TASK', 'Buster output_file pushed before completion', {
    action: published.verifyResult.action ?? null, commit_hash: published.verifyResult.commit_hash ?? null,
  });
}

export async function sendTaskCompletionSignal({
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
  deps = {},
}: AnyRecord) {
  if (!payload?.completion_stream) return;
  if (selectTruthyValue(() => (!outcome), () => (!reason))) throw new Error('Buster completion signal requires explicit outcome and reason');

  completionState.attempted = true;
  completionState.stream = payload.completion_stream;
  try {
    const redisClientFactory = requireFunction(deps.getRedisClient, 'deps.getRedisClient');
    const publishCompletion = requireFunction(deps.publishTaskCompletionWithArtifact, 'deps.publishTaskCompletionWithArtifact');

    const redisClient = redisClientFactory();
    const request = { payload, completionState, spawnedSubagent, suitesInfo, agentResultForCompletion,
      sessionResultForCompletion, moduleId, project, outcome, reason, runId, attempt,
      dispatchIdForCompletion, sessionKeyForCompletion, logger, deps };
    const published = await publishCompletion(redisClient, payload, completionOptions(request));
    logPublishedArtifacts(published, logger);
    completionState.terminal = true;
    completionState.error = null;
    logger.info('TASK', `Completion signal sent to ${payload.completion_stream}`);
  } catch (e) {
    completionState.error = safeErrorMessage(e);
    logger.error('TASK', `Failed to send completion signal: ${completionState.error}`, {
      error_name: e && typeof e === 'object' && 'name' in e ? e.name : null,
      error_code: e && typeof e === 'object' && 'code' in e ? e.code : null,
    });
  }
}
