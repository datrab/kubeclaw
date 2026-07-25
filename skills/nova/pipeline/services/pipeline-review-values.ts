import fs from 'fs';
import path from 'path';
import { selectDeps } from '../core/deps.ts';
import { swarmRoot } from '../core/paths.ts';
import { modelToHarness, resolveRuntime } from '../agents/runtime.ts';
import { spawnSession, trackAgent, untrackAgent } from '../agents/lifecycle.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { pollForFile, sleep } from './polling.ts';
import { discord } from '../integrations/discord.ts';
import { copyTranscriptArtifact } from '../egress.ts';
import {
  resolveStatusDispatchId,
  resolveStatusSessionKey,
} from './correlation.ts';
import {
  buildGeneratorArtifactRef,
  buildGeneratorResult,
} from './contracts/generator-result.ts';

const DEFAULT_DEPS = {
  spawnSession,
  terminateSession,
  trackAgent,
  untrackAgent,
  pollForFile,
  sleep,
  discord,
  copyTranscriptArtifact,
};

const OUTPUT_FILE = 'logs/pipeline-review/PIPELINE-REVIEW.md';
const JSON_OUTPUT_FILE = 'logs/pipeline-review/PIPELINE-REVIEW.json';
const INSTRUCTIONS_FILE = 'pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md';
const SUBAGENT_MODEL = 'gpt5';
const HARNESS_AGENT = 'claude';

export function requireReviewText(value: any, label: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${label}: required non-empty string`);
}

export function firstReviewValue(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

export function getPipelineReviewConfig(config: any, progress: any = null) {
  return firstReviewValue(
    objectRecord(config?.pipeline_review),
    objectRecord(progress?.pipeline_review),
    {}
  );
}

export function getPipelineReviewDeps(overrides: any = {}) {
  return {
    ...DEFAULT_DEPS,
    ...selectDeps(overrides, 'pipelineReview'),
  };
}

function configuredPath(review: any, key: string, fallback: string) {
  return review[key] ?? fallback;
}

export function pipelineReviewOutputPath(config: any, review: any = {}) {
  return path.join(
    swarmRoot(config),
    configuredPath(review, 'output_file', OUTPUT_FILE)
  );
}

export function pipelineReviewJsonPath(config: any, review: any = {}) {
  return path.join(
    swarmRoot(config),
    configuredPath(review, 'json_output_file', JSON_OUTPUT_FILE)
  );
}

export function pipelineReviewInstructionsPath(config: any, review: any = {}) {
  return path.join(
    swarmRoot(config),
    configuredPath(review, 'instructions_file', INSTRUCTIONS_FILE)
  );
}

export function pipelineReviewAgentId(model: any, review: any = {}) {
  if (review.agent_id) return review.agent_id;
  if (resolveRuntime({ model }) === 'subagent') {
    const modelName = firstReviewValue(
      String(model ?? SUBAGENT_MODEL).split('/').pop(),
      SUBAGENT_MODEL
    );
    return `${modelName.replace(/[^a-zA-Z0-9._-]+/g, '-')}_pipeline-review`;
  }
  return modelToHarness(model) ?? HARNESS_AGENT;
}

export function resolvePipelineReviewGatewayLabel(status: any) {
  return firstReviewValue(
    status?.gateway_label,
    status?.active_agent?.gateway_label,
    null
  );
}

export function resolvePipelineReviewCorrelation(status: any, fallback: any) {
  return {
    dispatch_id: firstReviewValue(
      resolveStatusDispatchId(status),
      fallback.dispatch_id,
      null
    ),
    gateway_label: firstReviewValue(
      resolvePipelineReviewGatewayLabel(status),
      fallback.gateway_label,
      null
    ),
    session_key: firstReviewValue(
      resolveStatusSessionKey(status),
      fallback.sessionKey,
      null
    ),
  };
}

function requirePositiveInteger(value: any, label: string) {
  if (Number.isInteger(value) && value > 0) return value;
  throw new Error(
    `${label}: required positive integer in swarm.config.json`
  );
}

export function pipelineReviewExecutionAttempt(opts: any) {
  return requirePositiveInteger(
    Number(opts.pipelineReviewExecutionAttempt ?? 1),
    'pipeline_review.execution_attempt'
  );
}

export function pipelineReviewMaxAttempts(review: any) {
  return requirePositiveInteger(
    Number(review.agent_max_attempts ?? 1),
    'config.pipeline_review.agent_max_attempts'
  );
}

export function removePipelineReviewOutputArtifacts(
  config: any,
  review: any
) {
  for (const artifactPath of [
    pipelineReviewOutputPath(config, review),
    pipelineReviewJsonPath(config, review),
  ]) {
    try {
      if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
    } catch (_error: any) {
      /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): stale review artifacts are replaced after a successful run. */
    }
  }
}

export function archivePipelineReviewTranscript(state: any) {
  const archiveDir = path.join(
    swarmRoot(state.config),
    'logs',
    'pipeline-review'
  );
  fs.mkdirSync(archiveDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (
    state.runtime === 'acp'
    && state.streamLogPath
    && fs.existsSync(state.streamLogPath)
  ) {
    state.deps.copyTranscriptArtifact(
      state.streamLogPath,
      path.join(archiveDir, `pipeline-review-transcript-${timestamp}.jsonl`)
    );
  }
}

export function buildPipelineReviewGeneratorResult(
  state: any,
  outputs: any,
  diagnostics: any = null
) {
  return buildGeneratorResult('pipeline_review', {
    artifacts: [
      buildGeneratorArtifactRef(
        'pipeline_review',
        pipelineReviewOutputPath(state.config, state.review),
        { role: 'output', format: 'markdown' }
      ),
      buildGeneratorArtifactRef(
        'pipeline_review',
        pipelineReviewJsonPath(state.config, state.review),
        { role: 'output', format: 'json' }
      ),
      buildGeneratorArtifactRef(
        'pipeline_review_instructions',
        state.instructionsPath,
        { role: 'input', format: 'markdown' }
      ),
    ],
    outputs,
    ...(diagnostics ? { diagnostics } : {}),
  });
}
