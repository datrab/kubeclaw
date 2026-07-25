import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { swarmRoot } from '../core/paths.ts';
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
  buildSummaryDiscordCorrelation as buildCaseStudyDiscordCorrelation,
  buildSummaryDiscordFields as buildCaseStudyDiscordFields,
  requirePositiveSummaryTimeout,
} from './summary-session-values.ts';
import { errorMessage } from './text-values.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { getCaseStudyConfig } from './runtime-defaults.ts';
import { onSummaryStarted } from './telemetry.ts';
import { writeCaseStudyInstructions } from './case-study-instructions.ts';
import {
  caseStudyAgentId,
  caseStudyOutputPath,
  firstDefined,
  getCaseStudyDeps,
  requireNonEmptyString,
} from './case-study-values.ts';
import {
  buildFailedCaseStudyResult,
  buildRateLimitResult,
  buildSuccessfulCaseStudyResult,
  requireCaseStudyOutput,
} from './case-study-outcomes.ts';

function createInitialState(config: any, progress: any, opts: any): any {
  const caseStudy = getCaseStudyConfig(config);
  if (caseStudy.enabled !== true) {
    throw new Error(
      'config.case_study.enabled: required true for terminal generator case_study'
    );
  }
  return {
    config,
    progress,
    opts,
    deps: getCaseStudyDeps(opts.deps),
    caseStudy,
    runId: getRunId(config),
    sessionKey: null,
    model: requireNonEmptyString(caseStudy.model, 'config.case_study.model'),
    label: null,
    runtime: null,
    agentId: null,
    attempt: resolveResultAttempt(caseStudy),
    lastStatus: null,
    dispatch_id: null,
    gateway_label: null,
    instructionsPath: null,
    trackingKey: null,
    pollResult: null,
    timeoutMinutes: null,
    maxRateLimitPauses: null,
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
  }, { summaryType: 'case_study' });
}

function buildSpawnOptions(state: any) {
  return {
    ...sessionLifecyclePolicies(state.config),
    runtime: state.runtime,
    model: state.model,
    agentId: state.agentId,
    cwd: state.config.repo_root,
    label: state.label,
    thinking: state.caseStudy.thinking_level ?? null,
    trackActive: false,
    budget: state.opts.budget ?? null,
    signal: state.opts.signal ?? null,
  };
}

async function notifySpawned(state: any) {
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    gateway_label: state.gateway_label,
    session_key: state.sessionKey,
  };
  await state.deps.discord(
    state.config,
    'INFO',
    '📝 Case Study Agent Spawned',
    'Generating publishable case study from pipeline data.',
    buildCaseStudyDiscordFields(identity, [
      { name: 'Model', value: state.model, inline: true },
      { name: 'Agent', value: state.agentId, inline: true },
      { name: 'Dispatch', value: state.runtime, inline: true },
    ]),
    { correlation: buildCaseStudyDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'DEBUG',
      `Case study spawn Discord notice failed: ${errorMessage(error)}`
    );
  });
}

async function spawnCaseStudySession(state: any) {
  state.runtime = resolveRuntime({ model: state.model });
  state.agentId = caseStudyAgentId(state.model, state.caseStudy);
  state.instructionsPath = writeCaseStudyInstructions(
    state.config,
    state.caseStudy,
    state.progress
  );
  state.label = `case-study-${Date.now()}`;
  state.timeoutMinutes = requirePositiveSummaryTimeout(
    state.caseStudy.timeout_minutes,
    'config.case_study.timeout_minutes'
  );
  onSummaryStarted({ config: state.config }, 'case_study', {
    attempt: state.attempt,
    gateway_label: state.gateway_label,
    model: state.model,
    runtime: state.runtime,
  });
  log(
    'STEP',
    `Spawning case study agent (${state.runtime}): ${state.agentId} / ${state.model}`
  );
  const instructions = fs.readFileSync(state.instructionsPath, 'utf8');
  const session = await state.deps.spawnSession({
    session: {
      model: state.model,
      runtime: state.runtime,
      agentId: state.agentId,
      cwd: state.config.repo_root,
      label: state.label,
    },
  }, instructions, state.timeoutMinutes * 60, buildSpawnOptions(state));
  recordSpawnedSession(state, session);
  await notifySpawned(state);
}

function recordSpawnedSession(state: any, session: any) {
  state.sessionKey = session.childSessionKey;
  state.streamLogPath = session.streamLogPath ?? null;
  state.trackingKey = `case-study-${state.agentId}`;
  state.attempt = firstDefined(
    resolveResultAttempt(session),
    state.attempt,
    null
  );
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
      telemetry_module_id: 'case-study',
      telemetry_agent_type: 'echo',
      telemetry_attempt: state.attempt,
    }
  );
}

function buildRateLimitRecovery(state: any) {
  return createTrackedSummarySessionRateLimitRecoveryOptions(state.config, {
    sleepFn: state.deps.sleep,
    discordFn: state.deps.discord,
    buildFields: buildCaseStudyDiscordFields,
    moduleId: 'case-study',
    identity: {
      agent_type: 'echo',
      run_id: state.runId,
      attempt: state.attempt,
      dispatch_id: state.dispatch_id,
      gateway_label: state.gateway_label,
      session_key: state.sessionKey,
    },
    agentId: state.agentId,
    model: state.model,
    resumeDescription: 'Resuming case study generation.',
    pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }: any) =>
      `Case study generation rate limited (pause ${pauseCount}/${maxPauses}) - sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
    resumeLogMessage: () =>
      'Case study cooldown complete - retrying output poll',
  });
}

async function pollCaseStudyOutput(state: any) {
  const recovery = buildRateLimitRecovery(state);
  state.maxRateLimitPauses = getRateLimitConfig(
    state.config
  ).max_pauses_per_module;
  state.pollResult = await withSessionRateLimitRecovery(
    state.config,
    () => state.deps.pollForFile(
      state.config,
      caseStudyOutputPath(state.config, state.caseStudy),
      state.timeoutMinutes,
      'Case Study',
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
  state.gateway_label = outcome.gatewayLabel;
  state.lastStatus = outcome.status;
}

function archiveCaseStudyTranscript(state: any) {
  const archiveDir = path.join(swarmRoot(state.config), 'logs', 'case-study');
  fs.mkdirSync(archiveDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (
    state.runtime === 'acp'
    && state.streamLogPath
    && fs.existsSync(state.streamLogPath)
  ) {
    state.deps.copyTranscriptArtifact(
      state.streamLogPath,
      path.join(archiveDir, `case-study-transcript-${timestamp}.jsonl`)
    );
  }
}

export async function runCaseStudy(config: any, progress: any, opts: any = {}) {
  const state = createInitialState(config, progress, opts);
  const cleanup = createCleanup(state);
  try {
    await spawnCaseStudySession(state);
    await pollCaseStudyOutput(state);
    archiveCaseStudyTranscript(state);
    await cleanup('post-poll');
    if (state.pollResult?.rate_limit_exhausted) {
      return buildRateLimitResult(state);
    }
    await requireCaseStudyOutput(state);
    return buildSuccessfulCaseStudyResult(state);
  } catch (error: any) {
    return buildFailedCaseStudyResult(state, error);
  } finally {
    await cleanup('finally');
  }
}
