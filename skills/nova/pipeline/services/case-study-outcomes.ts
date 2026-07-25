import fs from 'fs';
import { log } from '../core/logger.ts';
import { sanitizeMarkdownText } from '../egress.ts';
import {
  createTrackedSummarySessionRateLimitExhaustionOptions,
  finalizeSummarySessionRateLimitExit,
} from './rate-limit.ts';
import { onSummaryCompleted } from './telemetry.ts';
import {
  buildGeneratorArtifactRef,
  buildGeneratorResult,
} from './contracts/generator-result.ts';
import {
  buildSummaryDiscordCorrelation as buildCaseStudyDiscordCorrelation,
  buildSummaryDiscordFields as buildCaseStudyDiscordFields,
} from './summary-session-values.ts';
import { errorMessage } from './text-values.ts';
import {
  caseStudyOutputPath,
  firstDefined,
  requireNonEmptyString,
  resolveCaseStudyCorrelation,
} from './case-study-values.ts';

function outputArtifacts(state: any) {
  return [
    buildGeneratorArtifactRef(
      'case_study',
      caseStudyOutputPath(state.config, state.caseStudy),
      { role: 'output', format: 'markdown' }
    ),
    buildGeneratorArtifactRef(
      'case_study_instructions',
      state.instructionsPath,
      { role: 'input', format: 'markdown' }
    ),
  ];
}

export async function buildRateLimitResult(state: any) {
  const exit = await finalizeSummarySessionRateLimitExit(state.pollResult, {
    config: state.config,
    moduleId: 'case-study',
    summaryType: 'case_study',
    phase: 'case_study',
    exhaustedReason: 'Case study generation exceeded max ACP rate limit pauses',
    identity: {
      agent_type: 'echo',
      run_id: state.runId,
      attempt: state.attempt,
      dispatch_id: state.dispatchId,
      gateway_label: state.gatewayLabel,
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
      discordTitle: '📝 Case Study Rate Limit Exhausted',
      discordSubject: 'Case study',
      discordFieldBuilder: buildCaseStudyDiscordFields,
      discordIdentity: { run_id: state.runId },
    }),
  });
  state.attempt = firstDefined(exit?.attempt, state.attempt, null);
  state.lastStatus = firstDefined(
    exit?.rate_limit_status,
    state.lastStatus,
    null
  );
  return {
    ...exit,
    ...buildGeneratorResult('case_study', {
      outputs: {
        status: 'failed',
        reason: firstDefined(exit.reason, 'rate_limit_exhausted'),
        rate_limit_exhausted: true,
      },
      diagnostics: {
        rate_limit_status: exit.rate_limit_status ?? null,
      },
    }),
  };
}

async function notifyMissingOutput(state: any, failureReason: string) {
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    ...resolveCaseStudyCorrelation(state.pollResult?.status, state),
  };
  await state.deps.discord(
    state.config,
    'WARN',
    '📝 Case Study: No Output',
    `Case study agent finished without producing a report. Reason: ${failureReason}`,
    buildCaseStudyDiscordFields(identity, [
      { name: 'Timeout', value: `${state.timeoutMinutes}min`, inline: true },
      { name: 'Agent', value: state.agentId, inline: true },
      { name: 'Model', value: state.model, inline: true },
      {
        name: 'Full Report',
        value: `\`${requireNonEmptyString(
          state.caseStudy.output_file,
          'config.case_study.output_file'
        )}\``,
        inline: false,
      },
    ]),
    { correlation: buildCaseStudyDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'DEBUG',
      `Case study timeout/failure Discord notice failed: ${errorMessage(error)}`
    );
  });
}

export async function requireCaseStudyOutput(state: any) {
  if (state.pollResult.ok) return;
  state.attempt = firstDefined(
    state.pollResult?.attempt,
    state.pollResult?.status?.attempt,
    state.attempt,
    null
  );
  const detail = state.pollResult?.status?.detail;
  const failureReason = detail
    ? `${state.pollResult.reason} (${detail})`
    : state.pollResult.reason;
  await notifyMissingOutput(state, failureReason);
  throw new Error(`Case study generation failed: ${failureReason}`);
}

function emitSuccessfulCompletion(state: any, outputPath: string) {
  const correlation = resolveCaseStudyCorrelation(
    state.pollResult?.status,
    state
  );
  onSummaryCompleted({ config: state.config }, 'case_study', {
    attempt: state.attempt,
    status: 'ok',
    output: outputPath,
    ...correlation,
    model: state.model,
    runtime: state.runtime,
  });
  return correlation;
}

async function notifySuccessfulCompletion(
  state: any,
  markdown: string,
  correlation: any
) {
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    ...correlation,
  };
  await state.deps.discord(
    state.config,
    'OK',
    '📝 Case Study Complete',
    markdown.slice(0, 500),
    buildCaseStudyDiscordFields(identity, [{
      name: 'Full Report',
      value: `\`${requireNonEmptyString(
        state.caseStudy.output_file,
        'config.case_study.output_file'
      )}\``,
      inline: false,
    }]),
    { correlation: buildCaseStudyDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'WARN',
      `Case study Discord post failed (non-critical): ${errorMessage(error)}`
    );
  });
}

export async function buildSuccessfulCaseStudyResult(state: any) {
  const outputPath = caseStudyOutputPath(state.config, state.caseStudy);
  const markdown = fs.readFileSync(outputPath, 'utf8');
  const safeMarkdown = sanitizeMarkdownText(markdown);
  if (safeMarkdown !== markdown) {
    fs.writeFileSync(outputPath, safeMarkdown);
  }
  const correlation = emitSuccessfulCompletion(state, outputPath);
  await notifySuccessfulCompletion(state, safeMarkdown, correlation);
  log('OK', 'Case study generation completed');
  return buildGeneratorResult('case_study', {
    artifacts: outputArtifacts(state),
    outputs: {
      status: 'ok',
      output: outputPath,
      ...correlation,
      attempt: state.attempt,
      runtime: state.runtime,
      model: state.model,
    },
  });
}

async function notifyFailedCaseStudy(state: any, reason: string) {
  const correlation = resolveCaseStudyCorrelation(state.lastStatus, state);
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    ...correlation,
  };
  await state.deps.discord(
    state.config,
    'WARN',
    '📝 Case Study Failed',
    `Case study agent error: ${reason.split('\n')[0]}`,
    buildCaseStudyDiscordFields(identity, [
      ...(state.agentId
        ? [{ name: 'Agent', value: state.agentId, inline: true }]
        : []),
      ...(state.model
        ? [{ name: 'Model', value: state.model, inline: true }]
        : []),
    ]),
    { correlation: buildCaseStudyDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'DEBUG',
      `Case study failure Discord notice failed: ${errorMessage(error)}`
    );
  });
  return correlation;
}

export async function buildFailedCaseStudyResult(state: any, error: any) {
  const reason = errorMessage(error) || 'missing_error_message';
  const correlation = resolveCaseStudyCorrelation(state.lastStatus, state);
  onSummaryCompleted({ config: state.config }, 'case_study', {
    attempt: state.attempt,
    status: 'failed',
    reason,
    ...correlation,
    model: state.model,
    runtime: state.runtime,
  });
  log('WARN', `Case study generation failed (non-critical): ${reason}`);
  await notifyFailedCaseStudy(state, reason);
  return buildGeneratorResult('case_study', {
    artifacts: outputArtifacts(state),
    outputs: {
      status: 'failed',
      reason,
      attempt: state.attempt,
      runtime: state.runtime,
      model: state.model,
    },
    diagnostics: correlation,
  });
}
