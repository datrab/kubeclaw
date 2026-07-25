import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { gateLogDir } from '../core/paths.ts';
import {
  createTrackedGateSessionRateLimitRecoveryOptions,
  getRateLimitConfig,
  withSessionRateLimitRecovery,
} from '../services/rate-limit.ts';
import { copyTranscriptArtifact } from '../egress.ts';
import { persistGateActiveSession, clearGateActiveSession } from '../services/gate-active-session.ts';
import { selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

function trackedGatewayLabel(agent: AnyRecord | null): string | null {
  if (agent?.gatewayLabel) return agent.gatewayLabel;
  if (agent?.gateway_label) return agent.gateway_label;
  return null;
}

function dispatchId(current: string | null, agent: AnyRecord | null): string | null {
  if (current) return current;
  if (agent?.telemetry_dispatch_id) return agent.telemetry_dispatch_id;
  return agent?.dispatch_id ?? null;
}

function gatewayLabel(current: string | null, agent: AnyRecord | null): string | null {
  return current ?? trackedGatewayLabel(agent);
}

function sessionKey(current: string | null, agent: AnyRecord | null): string | null {
  if (current) return current;
  return agent?.sessionKey ?? null;
}

export type ReviewerSessionResult =
  | { ok: false; error: string }
  | { ok: true; pollResult: AnyRecord; trackingKey: string; sessionKey: string | null; gatewayLabel: string | null };

async function spawnReviewer(context: AnyRecord, session: AnyRecord) {
  const { deps, config, progress, gateId, gate, reviewer, reviewerPrompt, reviewerPolicy, reviewAttempt } = context;
  clearGateActiveSession(config, gateId);
  try {
    await deps.spawnReviewerAgent(config, progress, gateId, reviewer, reviewerPrompt, {
      thinking: reviewerPolicy.thinking, gate_type: gate.type, attempt: reviewAttempt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log('ERROR', `Reviewer spawn failed: ${reviewer.label} — ${message}`);
    return { ok: false, error: `Reviewer spawn failed: ${message}` };
  }
  persistGateActiveSession(config, gateId, session.trackingKey, deps.getTrackedAgent(session.trackingKey), {
    phase: 'review', reviewer: reviewer.label, gate_type: gate.type, attempt: reviewAttempt,
  });
  const tracked = deps.getTrackedAgent(session.trackingKey);
  session.sessionKey = tracked?.sessionKey ?? null;
  session.dispatchId = dispatchId(null, tracked);
  session.gatewayLabel = trackedGatewayLabel(tracked);
  return null;
}

async function pollReviewer(context: AnyRecord, session: AnyRecord) {
  const { deps, config, gateId, gate, reviewer, outputFilePath, timeout, reviewAttempt } = context;
  const result = await withSessionRateLimitRecovery(config, async () => {
    const poll = await deps.pollForFile(config, outputFilePath, timeout, `Review '${gateId}'`, session.trackingKey);
    const tracked = deps.getTrackedAgent(session.trackingKey);
    session.streamPath = tracked?.streamLogPath ?? null;
    session.gatewayLabel = gatewayLabel(session.gatewayLabel, tracked);
    return poll;
  }, createTrackedGateSessionRateLimitRecoveryOptions(config, {
    sleepFn: deps.sleep, discordFn: deps.discord, gateId, gateType: gate.type,
    identity: {
      agent_type: 'echo', run_id: getRunId(config), attempt: reviewAttempt,
      dispatch_id: dispatchId(session.dispatchId, deps.getTrackedAgent(session.trackingKey)),
      gateway_label: gatewayLabel(session.gatewayLabel, deps.getTrackedAgent(session.trackingKey)),
      session_key: sessionKey(session.sessionKey, deps.getTrackedAgent(session.trackingKey)),
    },
    updateCorrelation: () => {
      const tracked = deps.getTrackedAgent(session.trackingKey);
      return { dispatch_id: dispatchId(session.dispatchId, tracked), gateway_label: gatewayLabel(session.gatewayLabel, tracked) };
    },
    extraFields: [{ name: 'Reviewer', value: reviewer.label }],
    resumeDescription: `Resuming review for ${gate.title}`,
    pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }: AnyRecord) => `Review gate '${gateId}' reviewer rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
    resumeLogMessage: () => `Review gate '${gateId}' reviewer cooldown complete — retrying review attempt ${reviewAttempt}`,
    exhaustedResultConfig: { resultOverrides: { review_attempt: reviewAttempt, outcome_class: 'rate_limited' } },
  }));
  session.rateLimitPauses = typeof result?.rate_limit_pauses === 'number' ? result.rate_limit_pauses : session.rateLimitPauses;
  return result;
}

async function saveReviewerTranscript(context: AnyRecord, session: AnyRecord) {
  const { config, gateId, reviewAttempt, emitArtifactFailure } = context;
  if (selectTruthyValue(() => !session.streamPath, () => !fs.existsSync(session.streamPath))) return;
  try {
    const logDir = gateLogDir(config, gateId);
    if (!logDir) throw new Error(`Review gate '${gateId}' requires a canonical log directory`);
    const destination = path.join(logDir, `echo-transcript-attempt-${reviewAttempt}.jsonl`);
    copyTranscriptArtifact(session.streamPath, destination);
    log('OK', `Echo stream metadata saved: gates/${gateId}/echo-transcript-attempt-${reviewAttempt}.jsonl`);
  } catch (error: unknown) {
    emitArtifactFailure('echo_transcript', error);
  }
}

async function cleanupReviewer(context: AnyRecord, session: AnyRecord) {
  const { deps, config, gateId, reviewer, reviewAttempt } = context;
  const tracked = deps.getTrackedAgent(session.trackingKey);
  if (!session.streamPath) session.streamPath = tracked?.streamLogPath ?? null;
  const identity = {
    run_id: getRunId(config), attempt: reviewAttempt,
    dispatch_id: dispatchId(session.dispatchId, tracked),
    gateway_label: gatewayLabel(session.gatewayLabel, tracked),
    session_key: sessionKey(session.sessionKey, tracked),
  };
  const killed = await deps.killReviewerAgent(config, gateId, reviewer, session.pollResult?.ok === true);
  if (killed) clearGateActiveSession(config, gateId, identity);
  await saveReviewerTranscript(context, session);
}

export async function runReviewerSession(context: AnyRecord): Promise<ReviewerSessionResult> {
  const session: AnyRecord = {
    trackingKey: `echo-${context.reviewer.label}-${context.gateId}`,
    pollResult: null, streamPath: null, sessionKey: null, dispatchId: null, gatewayLabel: null,
    rateLimitPauses: 0, maxRateLimitPauses: getRateLimitConfig(context.config).max_pauses_per_module,
  };
  try {
    const spawnFailure = await spawnReviewer(context, session);
    if (spawnFailure) return { ok: false, error: spawnFailure.error };
    session.pollResult = await pollReviewer(context, session);
    return { ok: true, ...session } as ReviewerSessionResult;
  } finally {
    await cleanupReviewer(context, session);
  }
}
