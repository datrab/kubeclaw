import path from 'path';
import { selectDeps } from '../core/deps.ts';
import { swarmRoot } from '../core/paths.ts';
import { modelToHarness, resolveRuntime } from '../agents/runtime.ts';
import { spawnSession, trackAgent, untrackAgent } from '../agents/lifecycle.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { pollForFile, sleep } from './polling.ts';
import { discord } from '../integrations/discord.ts';
import { emitEvent } from './telemetry.ts';
import { copyTranscriptArtifact } from '../egress.ts';
import {
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from './correlation.ts';

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

export function requireNonEmptyString(value: any, label: any) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}: required non-empty string`);
  }
  return value.trim();
}

export function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function getCaseStudyDeps(overrides: any = {}) {
  return {
    ...DEFAULT_CASE_STUDY_DEPS,
    ...selectDeps(overrides, 'caseStudy'),
  };
}

export function caseStudyOutputPath(config: any, caseStudy: any = {}) {
  return path.join(
    swarmRoot(config),
    requireNonEmptyString(
      caseStudy.output_file,
      'config.case_study.output_file'
    )
  );
}

export function caseStudyInstructionsPath(config: any) {
  return path.join(
    swarmRoot(config),
    'pipeline-review/CASE-STUDY-INSTRUCTIONS.md'
  );
}

export function caseStudyAgentId(model: any, caseStudy: any = {}) {
  if (caseStudy.agent_id) return caseStudy.agent_id;
  const runtime = resolveRuntime({ model });
  const resolvedModel = requireNonEmptyString(model, 'config.case_study.model');
  if (runtime === 'subagent') {
    const modelName = resolvedModel.split('/').pop() ?? resolvedModel;
    return `${modelName.replace(/[^a-zA-Z0-9._-]+/g, '-')}_case-study`;
  }
  return requireNonEmptyString(
    modelToHarness(resolvedModel),
    'config.case_study.agent_id'
  );
}

export function resolveCaseStudyCorrelation(
  status: any,
  fallback: any
) {
  return {
    dispatch_id: firstDefined(
      resolveStatusDispatchId(status),
      fallback.dispatch_id,
      null
    ),
    gateway_label: firstDefined(
      resolveStatusGatewayLabel(status),
      fallback.gateway_label,
      null
    ),
    session_key: firstDefined(
      resolveStatusSessionKey(status),
      fallback.session_key,
      null
    ),
  };
}
