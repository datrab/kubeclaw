import fs from 'fs';
import path from 'path';
import { swarmRoot } from '../core/paths.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from './discord-fields.ts';
import { createTrackedSummarySessionCleanup } from './summary-session-cleanup.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

export function buildSummaryDiscordFields(identity: any = {}, extra: any = []) {
  return buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, identity, extra);
}

export function buildSummaryDiscordCorrelation(identity: any = {}) {
  return {
    run_id: selectTruthyValue(() => (identity.run_id), () => (null)),
    attempt: selectDefinedValue(() => (identity.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (identity.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (identity.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (identity.session_key), () => (null)),
  };
}

export function requirePositiveSummaryTimeout(value: any, label: any) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}: required positive number in swarm.config.json`);
  }
  return value;
}

export function createSummarySessionCleanup(state: any, summaryType: string) {
  return createTrackedSummarySessionCleanup(state.deps, {
    config: state.config,
    sessionKey: () => state.sessionKey,
    trackingKey: () => state.trackingKey,
    runtime: () => state.runtime,
    model: () => state.model,
    agentId: () => state.agentId,
    label: () => state.label,
  }, { summaryType });
}

export function buildSummarySpawnOptions(
  state: any,
  thinkingLevel: string | null,
) {
  return {
    ...sessionLifecyclePolicies(state.config),
    runtime: state.runtime,
    model: state.model,
    agentId: state.agentId,
    cwd: state.config.repo_root,
    label: state.label,
    thinking: thinkingLevel,
    trackActive: false,
    budget: state.opts.budget ?? null,
    signal: state.opts.signal ?? null,
  };
}

export function archiveSummaryTranscript(
  state: any,
  summaryDirectory: string,
  filenamePrefix: string,
) {
  if (
    state.runtime !== 'acp'
    || !state.streamLogPath
    || !fs.existsSync(state.streamLogPath)
  ) return;
  const archiveDir = path.join(swarmRoot(state.config), 'logs', summaryDirectory);
  fs.mkdirSync(archiveDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  state.deps.copyTranscriptArtifact(
    state.streamLogPath,
    path.join(archiveDir, `${filenamePrefix}-${timestamp}.jsonl`),
  );
}
