import { selectDeps } from '../core/deps.ts';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { swarmRoot, relPath } from '../core/paths.ts';
import { modelToHarness, resolveRuntime } from '../agents/runtime.ts';
import { spawnSession, trackAgent, untrackAgent } from '../agents/lifecycle.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { pollForFile, sleep } from './polling.ts';
import { discord } from '../integrations/discord.ts';
import { emitEvent, onSummaryStarted, onSummaryCompleted } from './telemetry.ts';
import { getRunId } from '../core/runtime.ts';
import { copyTranscriptArtifact, sanitizeMarkdownText } from '../egress.ts';
import {
  createTrackedSummarySessionRateLimitExhaustionOptions,
  createTrackedSummarySessionRateLimitRecoveryOptions,
  finalizeSummarySessionRateLimitExit,
  getRateLimitConfig,
  resolveTrackedSessionRateLimitOutcome,
  withSessionRateLimitRecovery,
} from './rate-limit.ts';
import {
  resolveResultAttempt,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from './correlation.ts';
import { buildGeneratorArtifactRef, buildGeneratorResult } from './contracts/generator-result.ts';
import { createTrackedSummarySessionCleanup } from './summary-session-cleanup.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { buildRunFacts } from './run-facts.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from './discord-fields.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { getCaseStudyConfig } from './runtime-defaults.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
function buildCaseStudyDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, identity, extra);
}

function buildCaseStudyDiscordCorrelation(identity = {}) {
  return {
    run_id: selectTruthyValue(() => (identity.run_id), () => (null)),
    attempt: selectDefinedValue(() => (identity.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (identity.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (identity.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (identity.session_key), () => (null)),
  };
}

const DEFAULT_CASE_STUDY_DEPS = {
  spawnSession,
  terminateSession,
  trackAgent,
  untrackAgent,
  pollForFile,
  sleep,
  discord,
  emitEvent,
  copyTranscriptArtifact,
};

function requireNonEmptyString(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`${label}: required non-empty string`);
  }
  return value.trim();
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function caseStudyRateLimitAttempt(exitResult, currentAttempt) {
  return firstDefined(exitResult?.attempt, currentAttempt, null);
}

function caseStudyRateLimitStatus(exitResult, currentStatus) {
  return firstDefined(exitResult?.rate_limit_status, currentStatus, null);
}

function getCaseStudyDeps(config, overrides = {}) {
  return { ...DEFAULT_CASE_STUDY_DEPS, ...selectDeps(overrides, 'caseStudy') };
}

function requirePositiveTimeoutMinutes(value, label) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value <= 0))) {
    throw new Error(`${label}: required positive number in swarm.config.json`);
  }
  return value;
}

export function caseStudyOutputPath(config, cs = {}) {
  return path.join(swarmRoot(config), requireNonEmptyString(cs.output_file, 'config.case_study.output_file'));
}

export function caseStudyInstructionsPath(config, cs = {}) {
  return path.join(swarmRoot(config), 'pipeline-review/CASE-STUDY-INSTRUCTIONS.md');
}

export function caseStudyAgentId(model, cs = {}) {
  if (cs.agent_id) return cs.agent_id;
  const dispatch = resolveRuntime({ model });
  const resolvedModel = requireNonEmptyString(model, 'config.case_study.model');
  if (dispatch === 'subagent') return `${resolvedModel.split('/').pop().replace(/[^a-zA-Z0-9._-]+/g, '-')}_case-study`;
  return requireNonEmptyString(modelToHarness(resolvedModel), 'config.case_study.agent_id');
}

export function writeCaseStudyInstructions(config, cs = {}, progress = null) {
  const out = caseStudyOutputPath(config, cs);
  const pathOut = caseStudyInstructionsPath(config, cs);
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });

  const logDir = getPipelineArtifactBundle(config).pipeline_dir;
  const caseStudyBasePath = logDir ? path.join(logDir, 'case-study.base.json') : null;
  const runFactsPath = logDir ? path.join(logDir, 'case-study.run-facts.json') : null;
  const projectSummaryPath = logDir ? path.join(logDir, 'project-summary.json') : null;
  const outputMdPath = relPath(config, out);

  if (runFactsPath) {
    fs.mkdirSync(path.dirname(runFactsPath), { recursive: true });
    fs.writeFileSync(runFactsPath, JSON.stringify(buildRunFacts(config, progress), null, 2));
  }

  const content = `You are writing a polished, publishable case study for the project: ${config.project}

## Input Data

Read the following pipeline artifacts to gather all project information:
- Canonical run facts: ${runFactsPath}
- Case study base data: ${caseStudyBasePath}
- Project summary: ${projectSummaryPath}

Do NOT read source code files. Only use the pipeline artifacts listed above.

## Output

Write a single markdown file to: ${outputMdPath}

The case study must include ALL of the following sections:

### Overview
What was built, in one paragraph. Include the project name, its purpose, and the high-level outcome.

### Architecture
The tech stack, module breakdown, and key architectural decisions made during the project.

### Pipeline Execution
The execution timeline, key decisions made by the pipeline, and any retry patterns observed.

### Challenges & Solutions
Modules that required multiple attempts — what went wrong and how it was resolved. Be specific.

### Results
Final metrics including test coverage, code quality indicators, agent spawn counts, and total cost.

### Lessons Learned
What would be done differently in a future run of this project or similar projects.

## Requirements
- The output must be a standalone markdown document, publishable as-is on a website
- Use clear headings, bullet points where appropriate, and professional language
- Include specific data from the pipeline artifacts (module names, attempt counts, costs, etc.)
- Treat canonical run facts as the authority for terminal status, modules, gates, agents, and durations
- Do NOT fabricate data — only report what is in the artifacts
- The document should read as a professional engineering case study, not a log dump
`;
  fs.writeFileSync(pathOut, sanitizeMarkdownText(content));
  return pathOut;
}

export async function generateCaseStudy(config, progress, opts = {}) {
  const deps = getCaseStudyDeps(config, opts.deps);
  const configCs = getCaseStudyConfig(config);
  const cs = configCs;
  if (cs.enabled !== true) {
    throw new Error('config.case_study.enabled: required true for terminal generator case_study');
  }

  const ctx = { config };
  const runId = getRunId(config);
  let sessionKey = null;
  let model = requireNonEmptyString(cs.model, 'config.case_study.model');
  let label = null;
  let dispatch = null;
  let agentId = null;
  let caseStudyAttempt = resolveResultAttempt(cs);
  let lastCaseStudyStatus = null;
  let caseStudyDispatchId = null;
  let caseStudyGatewayLabel = null;
  let instructionsPath = null;
  let trackingKey = null;
  const cleanupSummarySession = createTrackedSummarySessionCleanup(deps, {
    config,
    sessionKey: () => sessionKey,
    trackingKey: () => trackingKey,
    runtime: () => dispatch,
    model: () => model,
    agentId: () => agentId,
    label: () => label,
  }, { summaryType: 'case_study' });
  try {
    dispatch = resolveRuntime({ model });
    agentId = caseStudyAgentId(model, cs);
    instructionsPath = writeCaseStudyInstructions(config, cs, progress);
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    label = `case-study-${Date.now()}`;
    const cwd = config.repo_root;
    const thinking = selectTruthyValue(() => (cs.thinking_level), () => (null));
    const timeoutMin = requirePositiveTimeoutMinutes(configCs.timeout_minutes, 'config.case_study.timeout_minutes');
    onSummaryStarted({ config }, 'case_study', {
      attempt: caseStudyAttempt,
      gateway_label: caseStudyGatewayLabel,
      model,
      runtime: dispatch,
    });
    log('STEP', `Spawning case study agent (${dispatch}): ${agentId} / ${model}`);

    const sessionData = await deps.spawnSession({
      session: { model, runtime: dispatch, agentId, cwd, label },
    }, instructions, timeoutMin * 60, {
      ...sessionLifecyclePolicies(config),
      runtime: dispatch,
      model,
      agentId,
      cwd,
      label,
      thinking,
      trackActive: false,
      budget: selectTruthyValue(() => (opts.budget), () => (null)),
      signal: selectTruthyValue(() => (opts.signal), () => (null)),
    });
    sessionKey = sessionData.childSessionKey;
    const streamLogPath = selectTruthyValue(() => (sessionData.streamLogPath), () => (null));
    trackingKey = `case-study-${agentId}`;
    caseStudyAttempt = selectDefinedValue(() => (selectDefinedValue(() => (resolveResultAttempt(sessionData)), () => (caseStudyAttempt))), () => (null));
    deps.trackAgent(config, trackingKey, sessionKey, agentId, label, streamLogPath, {
      model,
      runtime: dispatch,
      telemetry_module_id: 'case-study',
      telemetry_agent_type: 'echo',
      telemetry_attempt: caseStudyAttempt,
    });
    const spawnDiscordIdentity = { run_id: runId, attempt: caseStudyAttempt, gateway_label: caseStudyGatewayLabel, session_key: sessionKey };
    await deps.discord(config, 'INFO', '📝 Case Study Agent Spawned', 'Generating publishable case study from pipeline data.', buildCaseStudyDiscordFields(spawnDiscordIdentity, [
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Dispatch', value: dispatch, inline: true },
    ]), { correlation: buildCaseStudyDiscordCorrelation(spawnDiscordIdentity) }).catch((e) => {
      log('DEBUG', `Case study spawn Discord notice failed: ${errorMessage(e)}`);
    });

    const outputFilePath = caseStudyOutputPath(config, cs);
    const maxRateLimitPauses = getRateLimitConfig(config).max_pauses_per_module;
    const caseStudyRateLimitRecovery = createTrackedSummarySessionRateLimitRecoveryOptions(config, {
      sleepFn: deps.sleep,
      discordFn: deps.discord,
      buildFields: buildCaseStudyDiscordFields,
      moduleId: 'case-study',
      identity: {
        agent_type: 'echo',
        run_id: runId,
        attempt: caseStudyAttempt,
        dispatch_id: caseStudyDispatchId,
        gateway_label: caseStudyGatewayLabel,
        session_key: sessionKey,
      },
      agentId,
      model,
      resumeDescription: 'Resuming case study generation.',
      pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `Case study generation rate limited (pause ${pauseCount}/${maxPauses}) - sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
      resumeLogMessage: () => 'Case study cooldown complete - retrying output poll',
    });
    let pollRes = await withSessionRateLimitRecovery(config,
      () => deps.pollForFile(config, outputFilePath, timeoutMin, 'Case Study', trackingKey),
      caseStudyRateLimitRecovery
    );
    const trackedCaseStudyOutcome = resolveTrackedSessionRateLimitOutcome(pollRes, caseStudyRateLimitRecovery, {
      attempt: caseStudyAttempt,
      dispatchId: caseStudyDispatchId,
      gatewayLabel: caseStudyGatewayLabel,
      lastStatus: lastCaseStudyStatus,
    });
    caseStudyAttempt = trackedCaseStudyOutcome.attempt;
    caseStudyDispatchId = trackedCaseStudyOutcome.dispatchId;
    caseStudyGatewayLabel = trackedCaseStudyOutcome.gatewayLabel;
    lastCaseStudyStatus = trackedCaseStudyOutcome.status;

    const archiveDir = path.join(swarmRoot(config), 'logs', 'case-study');
    fs.mkdirSync(archiveDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (dispatch === 'acp' && streamLogPath && fs.existsSync(streamLogPath)) {
      deps.copyTranscriptArtifact(streamLogPath, path.join(archiveDir, `case-study-transcript-${ts}.jsonl`));
    }

    await cleanupSummarySession('post-poll');

    if (pollRes?.rate_limit_exhausted) {
      const caseStudyRateLimitExit = await finalizeSummarySessionRateLimitExit(pollRes, {
        config,
        moduleId: 'case-study',
        summaryType: 'case_study',
        phase: 'case_study',
        exhaustedReason: 'Case study generation exceeded max ACP rate limit pauses',
        identity: {
          agent_type: 'echo',
          run_id: runId,
          attempt: caseStudyAttempt,
          dispatch_id: caseStudyDispatchId,
          gateway_label: caseStudyGatewayLabel,
          session_key: sessionKey,
        },
        maxPauses: maxRateLimitPauses,
        model,
        runtime: dispatch,
        ...createTrackedSummarySessionRateLimitExhaustionOptions({
          agentId,
          model,
          timeoutMinutes: timeoutMin,
          notifyDiscord: deps.discord,
          discordTitle: '📝 Case Study Rate Limit Exhausted',
          discordSubject: 'Case study',
          discordFieldBuilder: buildCaseStudyDiscordFields,
          discordIdentity: { run_id: runId },
        }),
      });
      caseStudyAttempt = caseStudyRateLimitAttempt(caseStudyRateLimitExit, caseStudyAttempt);
      lastCaseStudyStatus = caseStudyRateLimitStatus(caseStudyRateLimitExit, lastCaseStudyStatus);
      return {
        ...caseStudyRateLimitExit,
        ...buildGeneratorResult('case_study', {
          outputs: {
            status: 'failed',
            reason: selectDefinedValue(() => (caseStudyRateLimitExit.reason), () => ('rate_limit_exhausted')),
            rate_limit_exhausted: true,
          },
          diagnostics: {
            rate_limit_status: selectTruthyValue(() => (caseStudyRateLimitExit.rate_limit_status), () => (null)),
          },
        }),
      };
    }

    if (!pollRes.ok) {
      caseStudyAttempt = selectDefinedValue(() => (selectDefinedValue(() => (resolveResultAttempt(pollRes)), () => (caseStudyAttempt))), () => (null));
      const failureReason = pollRes?.status?.detail ? `${pollRes.reason} (${pollRes.status.detail})` : pollRes.reason;
      const noOutputDiscordIdentity = {
        run_id: runId,
        attempt: caseStudyAttempt,
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (caseStudyDispatchId))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(pollRes?.status)), () => (caseStudyGatewayLabel))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
      };
      await deps.discord(config, 'WARN', '📝 Case Study: No Output', `Case study agent finished without producing a report. Reason: ${failureReason}`, [
        ...buildCaseStudyDiscordFields(noOutputDiscordIdentity),
        { name: 'Timeout', value: `${timeoutMin}min`, inline: true },
        { name: 'Agent', value: agentId, inline: true },
        { name: 'Model', value: model, inline: true },
        { name: 'Full Report', value: `\`${requireNonEmptyString(cs.output_file, 'config.case_study.output_file')}\``, inline: false },
      ], { correlation: buildCaseStudyDiscordCorrelation(noOutputDiscordIdentity) }).catch((e) => {
        log('DEBUG', `Case study timeout/failure Discord notice failed: ${errorMessage(e)}`);
      });
      throw new Error(`Case study generation failed: ${failureReason}`);
    }

    onSummaryCompleted({ config }, 'case_study', {
      attempt: caseStudyAttempt,
      status: 'ok',
      output: outputFilePath,
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (caseStudyDispatchId))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(pollRes?.status)), () => (caseStudyGatewayLabel))), () => (null))),
      model,
      runtime: dispatch,
    });

    const caseStudyMd = fs.readFileSync(outputFilePath, 'utf8');
    const safeCaseStudyMd = sanitizeMarkdownText(caseStudyMd);
    if (safeCaseStudyMd !== caseStudyMd) fs.writeFileSync(outputFilePath, safeCaseStudyMd);

    try {
      const preview = safeCaseStudyMd.slice(0, 500);
      const completeDiscordIdentity = {
        run_id: runId,
        attempt: caseStudyAttempt,
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (caseStudyDispatchId))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(pollRes?.status)), () => (caseStudyGatewayLabel))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
      };
      await deps.discord(config, 'OK', '📝 Case Study Complete', preview, [
        ...buildCaseStudyDiscordFields(completeDiscordIdentity),
        { name: 'Full Report', value: `\`${requireNonEmptyString(cs.output_file, 'config.case_study.output_file')}\``, inline: false },
      ], { correlation: buildCaseStudyDiscordCorrelation(completeDiscordIdentity) });
    } catch (e) {
      log('WARN', `Case study Discord post failed (non-critical): ${e.message}`);
    }
    log('OK', 'Case study generation completed');
    return buildGeneratorResult('case_study', {
      artifacts: [
        buildGeneratorArtifactRef('case_study', outputFilePath, { role: 'output', format: 'markdown' }),
        buildGeneratorArtifactRef('case_study_instructions', instructionsPath, { role: 'input', format: 'markdown' }),
      ],
      outputs: {
        status: 'ok',
        output: outputFilePath,
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(pollRes?.status)), () => (caseStudyDispatchId))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(pollRes?.status)), () => (sessionKey))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(pollRes?.status)), () => (caseStudyGatewayLabel))), () => (null))),
        attempt: caseStudyAttempt,
        runtime: dispatch,
        model,
      },
    });
  } catch (e) {
    onSummaryCompleted({ config }, 'case_study', {
      attempt: caseStudyAttempt,
      status: 'failed',
      reason: selectTruthyValue(() => (e.message), () => ('missing_error_message')),
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(lastCaseStudyStatus)), () => (caseStudyDispatchId))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(lastCaseStudyStatus)), () => (sessionKey))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(lastCaseStudyStatus)), () => (caseStudyGatewayLabel))), () => (null))),
      model,
      runtime: dispatch,
    });
    log('WARN', `Case study generation failed (non-critical): ${e.message}`);
    const failedDiscordIdentity = {
      run_id: runId,
      attempt: caseStudyAttempt,
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(lastCaseStudyStatus)), () => (caseStudyDispatchId))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(lastCaseStudyStatus)), () => (caseStudyGatewayLabel))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(lastCaseStudyStatus)), () => (sessionKey))), () => (null))),
    };
    await deps.discord(config, 'WARN', '📝 Case Study Failed', `Case study agent error: ${selectTruthyValue(() => (e.message?.split('\n')[0]), () => ('missing_error_message'))}`,
      buildCaseStudyDiscordFields(failedDiscordIdentity, [
        ...(agentId ? [{ name: 'Agent', value: agentId, inline: true }] : []),
        ...(model ? [{ name: 'Model', value: model, inline: true }] : []),
      ]),
      { correlation: buildCaseStudyDiscordCorrelation(failedDiscordIdentity) },
    ).catch((discordError) => {
      log('DEBUG', `Case study failure Discord notice failed: ${errorMessage(discordError)}`);
    });
    return buildGeneratorResult('case_study', {
      artifacts: [
        buildGeneratorArtifactRef('case_study', caseStudyOutputPath(config, cs), { role: 'output', format: 'markdown' }),
        buildGeneratorArtifactRef('case_study_instructions', instructionsPath, { role: 'input', format: 'markdown' }),
      ],
      outputs: {
        status: 'failed',
        reason: selectTruthyValue(() => (e.message), () => ('missing_error_message')),
        attempt: caseStudyAttempt,
        runtime: dispatch,
        model,
      },
      diagnostics: {
        dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusDispatchId(lastCaseStudyStatus)), () => (caseStudyDispatchId))), () => (null))),
        session_key: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusSessionKey(lastCaseStudyStatus)), () => (sessionKey))), () => (null))),
        gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (resolveStatusGatewayLabel(lastCaseStudyStatus)), () => (caseStudyGatewayLabel))), () => (null))),
      },
    });
  } finally {
    await cleanupSummarySession('finally');
  }
}
