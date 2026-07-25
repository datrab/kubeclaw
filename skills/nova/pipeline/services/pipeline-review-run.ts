import fs from 'fs';
import { log } from '../core/logger.ts';
import { resolveRuntime } from '../agents/runtime.ts';
import { getRunId } from '../core/runtime.ts';
import {
  createTrackedSummarySessionRateLimitRecoveryOptions,
  getRateLimitConfig,
  resolveTrackedSessionRateLimitOutcome,
  withSessionRateLimitRecovery,
} from './rate-limit.ts';
import { resolveResultAttempt } from './correlation.ts';
import { createTrackedSummarySessionCleanup } from './summary-session-cleanup.ts';
import {
  buildSummaryDiscordCorrelation as buildPipelineReviewDiscordCorrelation,
  buildSummaryDiscordFields as buildPipelineReviewDiscordFields,
  requirePositiveSummaryTimeout,
} from './summary-session-values.ts';
import { errorMessage } from './text-values.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { getReviewDefaultsConfig } from './runtime-defaults.ts';
import { onSummaryStarted } from './telemetry.ts';
import { writePipelineReviewInstructions } from './pipeline-review-instructions.ts';
import {
  getPipelineReviewConfig,
  getPipelineReviewDeps,
  firstReviewValue,
  archivePipelineReviewTranscript,
  pipelineReviewAgentId,
  pipelineReviewExecutionAttempt,
  pipelineReviewMaxAttempts,
  pipelineReviewOutputPath,
  removePipelineReviewOutputArtifacts,
  requireReviewText,
  resolvePipelineReviewGatewayLabel,
} from './pipeline-review-values.ts';
import {
  buildFailedPipelineReviewResult,
  buildPipelineReviewNoOutputResult,
  buildPipelineReviewRateLimitResult,
} from './pipeline-review-failure.ts';
import {
  buildSuccessfulPipelineReviewResult,
} from './pipeline-review-success.ts';

function resolveReviewTimeout(config: any, review: any) {
  if (review.timeout_minutes !== undefined) {
    return requirePositiveSummaryTimeout(
      review.timeout_minutes,
      'config.pipeline_review.timeout_minutes'
    );
  }
  return requirePositiveSummaryTimeout(
    getReviewDefaultsConfig(config).timeout_minutes,
    'config.review_defaults.timeout_minutes'
  );
}

function createReviewState(config: any, progress: any, opts: any): any {
  const review = getPipelineReviewConfig(config, progress);
  const model = requireReviewText(
    review.model,
    'config.pipeline_review.model'
  );
  return {
    config,
    progress,
    opts,
    deps: getPipelineReviewDeps(opts.deps),
    review,
    runId: requireReviewText(getRunId(config), 'run_id'),
    executionAttempt: pipelineReviewExecutionAttempt(opts),
    maxExecutionAttempts: pipelineReviewMaxAttempts(review),
    sessionKey: null,
    model,
    agentId: pipelineReviewAgentId(model, review),
    label: null,
    runtime: null,
    attempt: resolveResultAttempt(review),
    dispatch_id: null,
    gateway_label: null,
    lastStatus: null,
    trackingKey: null,
    instructionsPath: null,
    timeoutMinutes: resolveReviewTimeout(config, review),
    maxRateLimitPauses: null,
    pollResult: null,
  };
}

function createCleanup(state: any) {
  return createTrackedSummarySessionCleanup(state.deps, {
    config: state.config,
    sessionKey: () => state.sessionKey,
    trackingKey: () => state.trackingKey,
    runtime: () => state.runtime,
    model: () => state.model,
    agentId: () => state.agentId,
    label: () => state.label,
  }, { summaryType: 'pipeline_review' });
}

function buildSpawnOptions(state: any) {
  return {
    ...sessionLifecyclePolicies(state.config),
    runtime: state.runtime,
    model: state.model,
    agentId: state.agentId,
    cwd: state.config.repo_root,
    label: state.label,
    thinking: state.review.thinking_level ?? null,
    trackActive: false,
    budget: state.opts.budget ?? null,
    signal: state.opts.signal ?? null,
  };
}

async function notifyReviewSpawned(state: any) {
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    gateway_label: state.gateway_label,
    session_key: state.sessionKey,
  };
  await state.deps.discord(
    state.config,
    'INFO',
    '📋 Pipeline Review Spawned',
    'Reviewing full pipeline run.',
    buildPipelineReviewDiscordFields(identity, [
      { name: 'Model', value: state.model, inline: true },
      { name: 'Agent', value: state.agentId, inline: true },
      { name: 'Dispatch', value: state.runtime, inline: true },
    ]),
    { correlation: buildPipelineReviewDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'DEBUG',
      `Pipeline review spawn Discord notice failed: ${errorMessage(error)}`
    );
  });
}

function recordReviewSession(state: any, session: any) {
  state.sessionKey = requireReviewText(
    session.childSessionKey,
    'pipeline_review.session_key'
  );
  state.streamLogPath = session.streamLogPath ?? null;
  state.trackingKey = `pipeline-review-${state.agentId}`;
  state.attempt = resolveResultAttempt(session) ?? state.attempt;
  state.deps.trackAgent(
    state.config,
    state.trackingKey,
    state.sessionKey,
    state.agentId,
    state.label,
    state.streamLogPath,
    {
      model: state.model,
      runtime: state.runtime,
      telemetry_module_id: 'pipeline-review',
      telemetry_agent_type: 'echo',
      telemetry_attempt: state.attempt,
    }
  );
}

async function spawnPipelineReview(state: any) {
  state.runtime = resolveRuntime({ model: state.model });
  removePipelineReviewOutputArtifacts(state.config, state.review);
  state.instructionsPath = writePipelineReviewInstructions(
    state.config,
    state.review
  );
  state.label = `pipeline-review-${Date.now()}`;
  state.gateway_label = null;
  onSummaryStarted({ config: state.config }, 'pipeline_review', {
    attempt: state.attempt,
    gateway_label: state.gateway_label,
    model: state.model,
    runtime: state.runtime,
  });
  log(
    'STEP',
    `Spawning pipeline review (${state.runtime}): ${state.agentId} / ${state.model}`
  );
  const session = await state.deps.spawnSession({
    session: {
      model: state.model,
      runtime: state.runtime,
      agentId: state.agentId,
      cwd: state.config.repo_root,
      label: state.label,
    },
  }, fs.readFileSync(state.instructionsPath, 'utf8'),
  state.timeoutMinutes * 60, buildSpawnOptions(state));
  recordReviewSession(state, session);
  await notifyReviewSpawned(state);
}

function buildReviewRecovery(state: any) {
  return createTrackedSummarySessionRateLimitRecoveryOptions(state.config, {
    sleepFn: state.deps.sleep,
    discordFn: state.deps.discord,
    buildFields: buildPipelineReviewDiscordFields,
    moduleId: 'pipeline-review',
    identity: {
      agent_type: 'echo',
      run_id: state.runId,
      attempt: state.attempt ?? resolveResultAttempt(state.review),
      dispatch_id: state.dispatch_id,
      gateway_label: state.gateway_label,
      session_key: state.sessionKey,
    },
    agentId: state.agentId,
    model: state.model,
    resumeDescription: 'Resuming pipeline review.',
    pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }: any) =>
      `Pipeline review rate limited (pause ${pauseCount}/${maxPauses}) - sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
    resumeLogMessage: () =>
      'Pipeline review cooldown complete - retrying review poll',
  });
}

async function pollPipelineReview(state: any) {
  const recovery = buildReviewRecovery(state);
  state.maxRateLimitPauses = getRateLimitConfig(
    state.config
  ).max_pauses_per_module;
  state.pollResult = await withSessionRateLimitRecovery(
    state.config,
    () => state.deps.pollForFile(
      state.config,
      pipelineReviewOutputPath(state.config, state.review),
      state.timeoutMinutes,
      'Pipeline Review',
      state.trackingKey
    ),
    recovery
  );
  const outcome = resolveTrackedSessionRateLimitOutcome(
    state.pollResult,
    recovery,
    {
      attempt: state.attempt,
      dispatchId: state.dispatch_id,
      gatewayLabel: state.gateway_label,
      lastStatus: state.lastStatus,
    }
  );
  state.attempt = outcome.attempt;
  state.dispatch_id = outcome.dispatchId;
  state.gateway_label = firstReviewValue(
    resolvePipelineReviewGatewayLabel(outcome.status),
    state.gateway_label,
    null
  );
  state.lastStatus = outcome.status;
}

async function runPipelineReviewAttempt(state: any) {
  const cleanup = createCleanup(state);
  try {
    await spawnPipelineReview(state);
    await pollPipelineReview(state);
    archivePipelineReviewTranscript(state);
    await cleanup('post-poll');
    if (state.pollResult?.rate_limit_exhausted) {
      return buildPipelineReviewRateLimitResult(state);
    }
    if (!state.pollResult.ok) {
      return buildPipelineReviewNoOutputResult(state);
    }
    return buildSuccessfulPipelineReviewResult(state);
  } catch (error: any) {
    return buildFailedPipelineReviewResult(state, error);
  } finally {
    await cleanup('finally');
  }
}

export async function runPipelineReview(
  config: any,
  progress: any,
  opts: any = {}
) {
  const state = createReviewState(config, progress, opts);
  const result = await runPipelineReviewAttempt(state);
  if (result?.retry_pipeline_review === true) {
    return runPipelineReview(config, progress, {
      ...opts,
      pipelineReviewExecutionAttempt: state.executionAttempt + 1,
    });
  }
  return result;
}
