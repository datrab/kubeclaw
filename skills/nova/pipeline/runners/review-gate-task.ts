// runners/review-gate-task.ts — one Echo review cycle.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { relPath, reviewGateOutputPath } from '../core/paths.ts';
import { resolveStatusSessionKey } from '../services/correlation.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { appendDurableOperatorAlert } from '../services/durable-operator-alert.ts';
import { prepareReviewGateTask } from './review-gate-preparation.ts';
import { publishReviewGateResult } from './review-gate-publication.ts';
import { runReviewerSession } from './review-gate-reviewer-session.ts';

type AnyRecord = Record<string, any>;

function telemetryContext(config: AnyRecord) {
  return { config, runId: getRunId(config) };
}

export function reviewOutputPath(config: AnyRecord, gate: AnyRecord, reviewerLabel: string) {
  return reviewGateOutputPath(config, gate, reviewerLabel);
}

function reviewStats(parsed: AnyRecord) {
  const result = parsed?.mergedResult || {};
  const count = (value: unknown) => Array.isArray(value) ? value.length : 0;
  return {
    critical: count(result.critical_issues) + count(result.critical_blockers),
    deferred: count(result.deferred_issues),
    findings: count(result.findings),
  };
}

function reviewRunId(config: AnyRecord) {
  if (config._runId) return config._runId;
  return config.run_id ?? null;
}

async function emitReviewDiscord(context: AnyRecord, parsed: AnyRecord) {
  const { deps, config, gateId, gate, reviewer, reviewerPolicy, startedAt, reviewAttempt, gatewayLabel, sessionKey } = context;
  const status = parsed?.decision === 'pass' ? 'PASS' : parsed?.decision === 'fail' ? 'FAIL' : 'INVALID';
  const stats = reviewStats(parsed);
  const correlation = {
    run_id: reviewRunId(config),
    gate_id: gateId, gate_type: gate.type, attempt: reviewAttempt,
    gateway_label: gatewayLabel, session_key: sessionKey,
  };
  await deps.discord(config, status === 'PASS' ? 'OK' : 'WARN', `Echo result: ${gate.title} ${status}`, `Reviewer: ${reviewer.label}`, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, correlation),
    { name: 'Status', value: status, inline: true },
    { name: 'Critical Issues', value: String(stats.critical), inline: true },
    { name: 'Deferred Issues', value: String(stats.deferred), inline: true },
    { name: 'Findings', value: String(stats.findings), inline: true },
    { name: 'Duration', value: `${Math.round((Date.now() - startedAt) / 60000)}min`, inline: true },
    { name: 'Model', value: reviewerPolicy.model, inline: true },
    { name: 'Reviewer', value: reviewer.label, inline: true },
  ], { correlation });
}

function emitArtifactFailure(context: AnyRecord, artifact: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error || 'missing_artifact_error_detail');
  log('WARN', `Review artifact ${artifact} failed (non-authoritative): ${detail}`);
  appendDurableOperatorAlert(context.config, 'pipeline.operator_alert', {
    reason: 'review_artifact_write_failed', artifact, detail,
    gate_id: context.gateId, gate_type: context.gate.type || 'review',
    source: 'review_gate_artifact', attempt: context.reviewAttempt,
  }, {
    severity: 'WARN', source: 'review_gate_artifact',
    emitter: 'nova/pipeline/runners/review-gate-task',
    gateId: context.gateId, gateType: context.gate.type || 'review',
    attempt: context.reviewAttempt,
  });
}

function emitLintSetupFailure(context: AnyRecord, reason: string, tier: string) {
  appendDurableOperatorAlert(context.config, 'pipeline.operator_alert', {
    reason: 'review_lint_setup_failed', detail: reason, lint_tier: tier,
    gate_id: context.gateId, gate_type: context.gate.type || 'review', source: 'review_gate_setup',
  }, {
    severity: 'CRITICAL', source: 'review_gate_setup',
    emitter: 'nova/pipeline/runners/review-gate-task',
    gateId: context.gateId, gateType: context.gate.type || 'review',
    attempt: context.reviewAttempt,
  });
}

function pollFailureClass(result: AnyRecord, reason: string, statusClass: string) {
  let failureClass = 'review_failed';
  if (reason === 'timeout' || statusClass === 'timeout') failureClass = 'timeout';
  if (reason === 'rate_limit_exhausted') failureClass = 'rate_limit_exhausted';
  if (statusClass === 'rate_limit_exhausted') failureClass = 'rate_limit_exhausted';
  if (result?.rate_limit_exhausted === true) failureClass = 'rate_limit_exhausted';
  return failureClass;
}

function pollFailure(result: AnyRecord, sessionKey: string | null) {
  const reason = result?.reason || 'missing_poll_reason';
  const detail = result?.status?.detail;
  const description = detail ? `${reason} (${detail})` : reason;
  const statusClass = String(result?.status?.failure_class || '').toLowerCase();
  const failureClass = pollFailureClass(result, reason, statusClass);
  log('WARN', `Review poll ended: ${description}. Review file not received.`);
  return {
    ok: false, error: `Review file not received (${description})`, failure_class: failureClass,
    session_key: resolveStatusSessionKey(result?.status) ?? sessionKey,
    transcript: result?.transcript || null,
  };
}

function taskContext(input: AnyRecord, reviewer: AnyRecord, outputFilePath: string) {
  const context = { ...input, reviewer, outputFilePath };
  return {
    ...context,
    relOutput: relPath(input.config, outputFilePath),
    emitArtifactFailure: (artifact: string, error: unknown) => emitArtifactFailure(context, artifact, error),
    emitLintSetupFailure: (reason: string, tier: string) => emitLintSetupFailure(context, reason, tier),
  };
}

export async function runReviewGateOnce(input: AnyRecord) {
  const { deps, config, progress, gateId, gate, reviewConfig } = input;
  const reviewAttempt = input.reviewAttempt ?? 1;
  if (reviewConfig.reviewers.length === 0) return { ok: false, error: 'No reviewers configured' };
  const reviewer = reviewConfig.primaryReviewer;
  if (!reviewer) return { ok: false, error: `Review gate '${gateId}' requires typed primary reviewer policy` };
  const outputFilePath = reviewOutputPath(config, gate, reviewer.label);
  if (!outputFilePath) return { ok: false, error: `Review gate '${gateId}' requires a canonical output path` };
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
  getRunStats(config).total_echo_reviews++;
  log('STEP', `Review cycle: reviewer=${reviewer.label}, output=${path.basename(outputFilePath)}`);

  const context = taskContext({ ...input, reviewAttempt, lintTier: reviewConfig.lintTier, lintRequired: reviewConfig.lintRequired }, reviewer, outputFilePath);
  const prepared: AnyRecord = prepareReviewGateTask(context);
  if (!prepared.ok) return prepared;
  const reviewerPolicy = prepared.reviewerPolicy;
  deps.logEffectivePolicy(config, { scope: 'reviewer', agent: 'echo', gateId, ...reviewerPolicy });
  log('INFO', `Reviewer '${reviewer.label}' model: ${reviewerPolicy.model || 'model_not_configured'} [${reviewerPolicy.model_source}]`);

  const startedAt = Date.now();
  const session = await runReviewerSession({
    ...context, reviewerPrompt: prepared.reviewerPrompt, reviewerPolicy,
    timeout: reviewConfig.timeout,
  });
  if (!session.ok) return session;
  if (!session.pollResult?.ok) return pollFailure(session.pollResult, session.sessionKey);

  const publication = {
    ...context, reviewerPolicy, startedAt,
    pollResult: session.pollResult, gatewayLabel: session.gatewayLabel, sessionKey: session.sessionKey,
    telemetryContext: telemetryContext(config),
  };
  return publishReviewGateResult({
    ...publication,
    emitDiscord: (parsed: AnyRecord) => emitReviewDiscord(publication, parsed),
  });
}
