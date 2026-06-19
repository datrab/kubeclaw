
import {
  resolveBusterRateLimitMaxPauses,
  buildPreTestVerdict,
} from '../pipeline-helpers.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';
import { getRedisClient } from '../task-queue.ts';
import { publishTaskCompletionWithArtifact } from '../task-completion.ts';

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
}) {
  if (!payload?.completion_stream) return;
  if (!outcome || !reason) throw new Error('Buster completion signal requires explicit outcome and reason');

  completionState.attempted = true;
  completionState.stream = payload.completion_stream;
  try {
    const redisClientFactory = deps.getRedisClient || getRedisClient;
    const publishCompletion = deps.publishTaskCompletionWithArtifact || publishTaskCompletionWithArtifact;

    const redisClient = redisClientFactory();
    const preTestVerdict = !spawnedSubagent
      ? buildPreTestVerdict(moduleId, project, suitesInfo)
      : null;
    const completionSummary = !spawnedSubagent && suitesInfo.suiteSummary
      ? (suitesInfo.suiteDetailSummary || suitesInfo.suiteSummary)
      : (agentResultForCompletion?.summary || reason || suitesInfo.suiteSummary || '');
    const rateLimitMaxPauses = outcome === 'RATE_LIMITED'
      ? resolveBusterRateLimitMaxPauses(payload, sessionResultForCompletion || {})
      : null;
    const published = await publishCompletion(redisClient, payload, {
      moduleId,
      outcome,
      reason,
      summary: completionSummary,
      artifactSummary: agentResultForCompletion?.summary || reason || suitesInfo.suiteDetailSummary || suitesInfo.suiteSummary || '',
      preTestVerdict,
      rateLimitMaxPauses,
      runId,
      attempt,
      dispatchId: dispatchIdForCompletion,
      sessionKey: sessionKeyForCompletion,
      source: 'buster-pipeline',
      ensureBusterOutputFile: deps.ensureBusterOutputFile,
      verifyAndPush: deps.verifyAndPush,
      emitTaskCompletion: deps.emitTaskCompletion,
      commitMessage: `[BUSTER] ${payload?.task_type || 'task'} ${moduleId}: output artifact`,
    });
    if (published.outputFileResult) {
      logger.info('TASK', `Buster output_file ready: ${published.outputFileResult.path}`, {
        source: published.outputFileResult.source,
        status: published.outputFileResult.status,
      });
    }
    if (published.verifyResult) {
      logger.info('TASK', `Buster output_file pushed before completion`, {
        action: published.verifyResult?.action || null,
        commit_hash: published.verifyResult?.commit_hash || null,
      });
    }
    completionState.terminal = true;
    completionState.error = null;
    logger.info('TASK', `Completion signal sent to ${payload.completion_stream}`);
  } catch (e) {
    completionState.error = safeErrorMessage(e);
    logger.error('TASK', `Failed to send completion signal: ${completionState.error}`, {
      error_name: e?.name || null,
      error_code: e?.code || null,
    });
  }
}
