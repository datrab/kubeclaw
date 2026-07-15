
import {
  resolveBusterRateLimitMaxPauses,
  buildSuiteArtifactData,
  buildPreTestVerdict,
} from '../pipeline-helpers.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
function requireFunction(value, name) {
  if (typeof value === 'function') return value;
  throw new Error(`Buster completion signal requires ${name}`);
}

function rateLimitSessionResultForResolver(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function suiteCompletionSummary(suitesInfo) {
  if (suitesInfo.suiteDetailSummary) return suitesInfo.suiteDetailSummary;
  return suitesInfo.suiteSummary;
}

function textValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function completionFailureClass({ outcome, spawnedSubagent, suitesInfo, agentResultForCompletion }) {
  if (outcome === 'PASS') return null;
  const agentFailureClass = textValue(agentResultForCompletion?.failure_class);
  if (agentFailureClass) return agentFailureClass;
  if (!spawnedSubagent && suitesInfo?.criticalFailed === true) return 'pretest_code';
  if (outcome === 'RATE_LIMITED') return 'rate_limit_exhausted';
  return null;
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
}) {
  if (!payload?.completion_stream) return;
  if (selectTruthyValue(() => (!outcome), () => (!reason))) throw new Error('Buster completion signal requires explicit outcome and reason');

  completionState.attempted = true;
  completionState.stream = payload.completion_stream;
  try {
    const redisClientFactory = requireFunction(deps.getRedisClient, 'deps.getRedisClient');
    const publishCompletion = requireFunction(deps.publishTaskCompletionWithArtifact, 'deps.publishTaskCompletionWithArtifact');

    const redisClient = redisClientFactory();
    const preTestVerdict = !spawnedSubagent
      ? buildPreTestVerdict(moduleId, project, suitesInfo)
      : null;
    const artifactData = !spawnedSubagent
      ? buildSuiteArtifactData(moduleId, project, suitesInfo)
      : (agentResultForCompletion?.data && typeof agentResultForCompletion.data === 'object' ? agentResultForCompletion.data : null);
    const completionSummary = !spawnedSubagent && suitesInfo.suiteSummary
      ? suiteCompletionSummary(suitesInfo)
      : (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (agentResultForCompletion?.summary), () => (reason))), () => (suitesInfo.suiteSummary))), () => ('')));
    const rateLimitMaxPauses = outcome === 'RATE_LIMITED'
      ? resolveBusterRateLimitMaxPauses(payload, rateLimitSessionResultForResolver(sessionResultForCompletion))
      : null;
    const failureClass = completionFailureClass({ outcome, spawnedSubagent, suitesInfo, agentResultForCompletion });
    const published = await publishCompletion(redisClient, payload, {
      moduleId,
      outcome,
      reason,
      failureClass,
      summary: completionSummary,
      artifactSummary: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (agentResultForCompletion?.summary), () => (reason))), () => (suitesInfo.suiteDetailSummary))), () => (suitesInfo.suiteSummary))), () => ('')),
      artifactSource: selectTruthyValue(() => (agentResultForCompletion?.source), () => (null)),
      artifactData,
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
      commitMessage: `[BUSTER] ${selectDefinedValue(() => (payload?.task_type), () => ('task'))} ${moduleId}: output artifact`,
    });
    if (published.outputFileResult) {
      logger.info('TASK', `Buster output_file ready: ${published.outputFileResult.path}`, {
        source: published.outputFileResult.source,
        status: published.outputFileResult.status,
      });
    }
    if (published.verifyResult) {
      logger.info('TASK', `Buster output_file pushed before completion`, {
        action: selectTruthyValue(() => (published.verifyResult?.action), () => (null)),
        commit_hash: selectTruthyValue(() => (published.verifyResult?.commit_hash), () => (null)),
      });
    }
    completionState.terminal = true;
    completionState.error = null;
    logger.info('TASK', `Completion signal sent to ${payload.completion_stream}`);
  } catch (e) {
    completionState.error = safeErrorMessage(e);
    logger.error('TASK', `Failed to send completion signal: ${completionState.error}`, {
      error_name: selectTruthyValue(() => (e?.name), () => (null)),
      error_code: selectTruthyValue(() => (e?.code), () => (null)),
    });
  }
}
