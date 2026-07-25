import fs from 'fs';
import { log } from '../core/logger.ts';
import { onSummaryCompleted } from './telemetry.ts';
import {
  buildSummaryDiscordCorrelation as buildPipelineReviewDiscordCorrelation,
  buildSummaryDiscordFields as buildPipelineReviewDiscordFields,
} from './summary-session-values.ts';
import { errorMessage } from './text-values.ts';
import {
  buildPipelineReviewGeneratorResult,
  pipelineReviewJsonPath,
  pipelineReviewOutputPath,
  resolvePipelineReviewCorrelation,
} from './pipeline-review-values.ts';

function buildDiscordContent(markdown: string) {
  const maxDescription = 3900;
  const description = markdown.length <= maxDescription
    ? markdown
    : `${markdown.slice(0, maxDescription)}\n\n*[truncated — see full report]*`;
  const fields: any[] = [{
    name: 'Full Report',
    value: '`.swarm/logs/pipeline-review/PIPELINE-REVIEW.md`',
    inline: false,
  }];
  if (markdown.length > maxDescription) {
    const remaining = markdown.slice(maxDescription);
    for (
      let index = 0;
      index < remaining.length && fields.length < 8;
      index += 950
    ) {
      fields.push({
        name: `(continued ${fields.length})`,
        value: remaining.slice(index, index + 950),
        inline: false,
      });
    }
  }
  return { description, fields };
}

function successfulOutputs(state: any, correlation: any) {
  return {
    status: 'ok',
    output: pipelineReviewOutputPath(state.config, state.review),
    json_output: pipelineReviewJsonPath(state.config, state.review),
    ...correlation,
    attempt: state.attempt,
    runtime: state.runtime,
    model: state.model,
  };
}

async function notifySuccessfulReview(state: any, correlation: any) {
  const markdown = fs.readFileSync(
    pipelineReviewOutputPath(state.config, state.review),
    'utf8'
  );
  const content = buildDiscordContent(markdown);
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    ...correlation,
  };
  content.fields.unshift(
    ...buildPipelineReviewDiscordFields(identity)
  );
  await state.deps.discord(
    state.config,
    'OK',
    '📋 Pipeline Review Complete',
    content.description,
    content.fields,
    { correlation: buildPipelineReviewDiscordCorrelation(identity) }
  );
}

function emitSuccessfulReviewCompletion(state: any, correlation: any) {
  onSummaryCompleted({ config: state.config }, 'pipeline_review', {
    attempt: state.attempt,
    status: 'ok',
    output: pipelineReviewOutputPath(state.config, state.review),
    ...correlation,
    model: state.model,
    runtime: state.runtime,
  });
}

async function notifyPostError(state: any, message: string, correlation: any) {
  const identity = {
    run_id: state.runId,
    attempt: state.attempt,
    ...correlation,
  };
  await state.deps.discord(
    state.config,
    'WARN',
    '📋 Pipeline Review: Post Error',
    `Review completed but Discord post failed: ${message}`,
    buildPipelineReviewDiscordFields(identity),
    { correlation: buildPipelineReviewDiscordCorrelation(identity) }
  ).catch((error: any) => {
    log(
      'DEBUG',
      `Pipeline review post-error Discord notice failed: ${errorMessage(error)}`
    );
  });
}

export async function buildSuccessfulPipelineReviewResult(state: any) {
  const correlation = resolvePipelineReviewCorrelation(
    state.pollResult?.status,
    state
  );
  const outputs = successfulOutputs(state, correlation);
  try {
    await notifySuccessfulReview(state, correlation);
    emitSuccessfulReviewCompletion(state, correlation);
    log('OK', 'Pipeline review completed');
    return buildPipelineReviewGeneratorResult(state, outputs);
  } catch (error: any) {
    const message = errorMessage(error);
    log(
      'WARN',
      `Pipeline review Discord post failed (non-critical): ${message}`
    );
    await notifyPostError(state, message, correlation);
    return buildPipelineReviewGeneratorResult(
      state,
      outputs,
      { post_error: message }
    );
  }
}
