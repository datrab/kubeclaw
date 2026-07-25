import { log } from '../core/logger.ts';
import {
  createTrackedSummarySessionRateLimitExhaustionOptions,
  finalizeSummarySessionRateLimitExit,
} from './rate-limit.ts';
import { onSummaryCompleted } from './telemetry.ts';
import { buildGeneratorResult } from './contracts/generator-result.ts';
import {
  buildSummaryDiscordCorrelation as buildPipelineReviewDiscordCorrelation,
  buildSummaryDiscordFields as buildPipelineReviewDiscordFields,
} from './summary-session-values.ts';
import { errorMessage } from './text-values.ts';
import {
  firstReviewValue,
  resolvePipelineReviewCorrelation,
} from './pipeline-review-values.ts';

const RATE_LIMIT_REASON = 'rate_limit_exhausted';

export async function buildPipelineReviewRateLimitResult(state: any) {
  const exit = await finalizeSummarySessionRateLimitExit(state.pollResult, {
    config: state.config,
    moduleId: 'pipeline-review',
    summaryType: 'pipeline_review',
    phase: 'pipeline_review',
    exhaustedReason: 'Pipeline review exceeded max ACP rate limit pauses',
    identity: {
      agent_type: 'echo',
      run_id: state.runId,
      attempt: state.attempt,
      dispatch_id: state.dispatch_id,
      gateway_label: state.gateway_label,
      session_key: state.sessionKey,
    },
    maxPauses: state.maxRateLimitPauses,
    model: state.model,
    runtime: state.runtime,
    ...createTrackedSummarySessionRateLimitExhaustionOptions({
      agentId: state.agentId,
      model: state.model,
      timeoutMinutes: state.timeoutMinutes,
      notifyDiscord: state.deps.discord,
      discordTitle: '📋 Pipeline Review Rate Limit Exhausted',
      discordSubject: 'Pipeline review',
      discordFieldBuilder: buildPipelineReviewDiscordFields,
      discordIdentity: { run_id: state.runId },
    }),
  });
  state.attempt = exit.attempt;
  state.lastStatus = exit.rate_limit_status ?? null;
  return {
    ...exit,
    ...buildGeneratorResult('pipeline_review', {
      outputs: {
        status: 'failed',
        reason: exit.reason ?? RATE_LIMIT_REASON,
        rate_limit_exhausted: true,
      },
      diagnostics: {
        rate_limit_status: exit.rate_limit_status ?? null,
      },
    }),
  };
}

function noOutputFailureReason(pollResult: any) {
  return pollResult?.status?.detail
    ? `${pollResult.reason} (${pollResult.status.detail})`
    : pollResult.reason;
}

async function notifyNoOutput(state: any, reason: string, correlation: any) {
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    ...correlation,
  };
  await state.deps.discord(
    state.config,
    'WARN',
    '📋 Pipeline Review: No Output',
    `Review agent finished without producing a report. Reason: ${reason}`,
    buildPipelineReviewDiscordFields(identity, [
      { name: 'Timeout', value: `${state.timeoutMinutes}min`, inline: true },
      { name: 'Agent', value: state.agentId, inline: true },
      { name: 'Model', value: state.model, inline: true },
    ]),
    { correlation: buildPipelineReviewDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'DEBUG',
      `Pipeline review timeout/failure Discord notice failed: ${errorMessage(error)}`
    );
  });
}

export async function buildPipelineReviewNoOutputResult(state: any) {
  state.attempt = firstReviewValue(
    state.pollResult?.attempt,
    state.pollResult?.status?.attempt,
    state.attempt
  );
  const reason = noOutputFailureReason(state.pollResult);
  if (
    state.pollResult?.reason === 'session_ended_no_output'
    && state.executionAttempt < state.maxExecutionAttempts
  ) {
    log(
      'WARN',
      `Pipeline review produced no output (${reason}); retrying attempt ${state.executionAttempt + 1}/${state.maxExecutionAttempts}`
    );
    return { retry_pipeline_review: true };
  }
  const correlation = resolvePipelineReviewCorrelation(
    state.pollResult?.status,
    state
  );
  await notifyNoOutput(state, reason, correlation);
  onSummaryCompleted({ config: state.config }, 'pipeline_review', {
    attempt: state.attempt,
    status: 'failed',
    reason: `Pipeline review failed: ${reason}`,
    ...correlation,
    model: state.model,
    runtime: state.runtime,
  });
  log('WARN', `Pipeline review failed: ${reason}`);
  const failureClass = state.pollResult?.reason === 'timeout'
    ? 'timeout'
    : 'pipeline_review_failed';
  return buildGeneratorResult('pipeline_review', {
    outputs: {
      status: 'failed',
      reason: `Pipeline review failed after ${state.executionAttempt} attempt(s): ${reason}`,
      failure_class: failureClass,
      attempt: state.attempt,
      execution_attempt: state.executionAttempt,
      runtime: state.runtime,
      model: state.model,
    },
    diagnostics: {
      failure_class: failureClass,
      max_execution_attempts: state.maxExecutionAttempts,
      ...correlation,
    },
  });
}

async function notifyReviewFailure(state: any, message: string, correlation: any) {
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    ...correlation,
  };
  await state.deps.discord(
    state.config,
    'WARN',
    '📋 Pipeline Review Failed',
    `Review agent error: ${message.split('\n')[0]}`,
    buildPipelineReviewDiscordFields(identity),
    { correlation: buildPipelineReviewDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'DEBUG',
      `Pipeline review failure Discord notice failed: ${errorMessage(error)}`
    );
  });
}

export async function buildFailedPipelineReviewResult(
  state: any,
  error: any
) {
  const message = errorMessage(error);
  const correlation = resolvePipelineReviewCorrelation(
    state.lastStatus,
    state
  );
  onSummaryCompleted({ config: state.config }, 'pipeline_review', {
    attempt: state.attempt,
    status: 'failed',
    reason: message,
    ...correlation,
    model: state.model,
    runtime: state.runtime,
  });
  log('WARN', `Pipeline review failed (non-critical): ${message}`);
  await notifyReviewFailure(state, message, correlation);
  return buildGeneratorResult('pipeline_review', {
    outputs: {
      status: 'failed',
      reason: message,
      attempt: state.attempt,
      runtime: state.runtime,
      model: state.model,
    },
    diagnostics: correlation,
  });
}
