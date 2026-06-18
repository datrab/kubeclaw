
import {
  resolveBusterRateLimitMaxPauses,
  buildPreTestVerdict,
  ensureBusterOutputFile,
} from '../pipeline-helpers.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';
import { getRedisClient } from '../task-queue.ts';
import { emitTaskCompletion } from '../task-completion.ts';
import verifyAndPush from '../../tools/verify-task.ts';

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
}) {
  if (!payload?.completion_stream) return;
  if (!outcome || !reason) throw new Error('Buster completion signal requires explicit outcome and reason');

  completionState.attempted = true;
  completionState.stream = payload.completion_stream;
  try {
    const outputFileResult = ensureBusterOutputFile(payload, {
      outcome,
      reason,
      summary: agentResultForCompletion?.summary || reason || suitesInfo.suiteDetailSummary || suitesInfo.suiteSummary || '',
    });
    logger.info('TASK', `Buster output_file ready: ${outputFileResult.path}`, {
      source: outputFileResult.source,
      status: outputFileResult.status,
    });

    const verifyResult = await verifyAndPush('buster', project, {
      commitMessage: `[BUSTER] ${payload?.task_type || 'task'} ${moduleId}: output artifact`,
    });
    logger.info('TASK', `Buster output_file pushed before completion`, {
      action: verifyResult?.action || null,
      commit_hash: verifyResult?.commit_hash || null,
    });

    const redisClient = getRedisClient();
    const preTestVerdict = !spawnedSubagent
      ? buildPreTestVerdict(moduleId, project, suitesInfo)
      : null;
    const completionSummary = !spawnedSubagent && suitesInfo.suiteSummary
      ? (suitesInfo.suiteDetailSummary || suitesInfo.suiteSummary)
      : (agentResultForCompletion?.summary || reason || suitesInfo.suiteSummary || '');
    const rateLimitMaxPauses = outcome === 'RATE_LIMITED'
      ? resolveBusterRateLimitMaxPauses(payload, sessionResultForCompletion || {})
      : null;
    await emitTaskCompletion(redisClient, payload, {
      moduleId,
      outcome,
      reason,
      summary: completionSummary,
      preTestVerdict,
      rateLimitMaxPauses,
      runId,
      attempt,
      dispatchId: dispatchIdForCompletion,
      sessionKey: sessionKeyForCompletion,
      source: 'buster-pipeline',
    });
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
