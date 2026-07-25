import { log } from '../core/logger.ts';
import { getRunId, getRunStats } from '../core/runtime.ts';
import { finalizeGateSessionRateLimitExit } from '../services/rate-limit.ts';
import { resolveResultGatewayLabel, resolveResultSessionKey } from '../services/correlation.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { arrayValue, objectRecord } from '../value-boundary.ts';
import { extractReviewIssues, summarizeReviewFailReason } from './review-gate-output.ts';
import { buildReviewGateControlResult } from './review-gate-control.ts';

type AnyRecord = Record<string, any>;

function control(context: AnyRecord, result: AnyRecord) {
  const { config, gateId, gate, opts, attempt } = context;
  return buildReviewGateControlResult(config, gateId, gate, result, { ...opts, input: { ids: { attempt } } });
}

async function rateLimitResult(context: AnyRecord, review: AnyRecord) {
  const { config, gateId, gate, deps, attempt, gateStartedAt, maxRateLimitPauses, telemetryContext } = context;
  const reason = `Review gate '${gateId}' exceeded max rate limit pauses`;
  const result = await finalizeGateSessionRateLimitExit(review, {
    config, gateId, gateType: gate.type,
    phase: attempt > 1 ? 'review_gate_rereview' : 'review_gate',
    exhaustedReason: reason,
    identity: { run_id: getRunId(config), attempt, gateway_label: resolveResultGatewayLabel(review) },
    maxPauses: maxRateLimitPauses, reason, resultOverrides: { outcome_class: 'rate_limited' },
    telemetryCtx: telemetryContext, runId: getRunId(config), discordFn: deps.discord,
    discordTitle: `Review Gate Rate Limit Exhausted: ${gate.title}`,
    discordDescription: (exit: AnyRecord) => `Review attempt ${exit.attempt} exceeded max ACP rate limit pauses (${exit.max_rate_limit_pauses}).`,
    beforeReturn: () => getRunStats(config).gates_failed.push(gateId),
    gateFailureData: (exit: AnyRecord) => ({
      fix_cycle: Math.max(0, (exit.attempt ?? 1) - 1),
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      presentation: { discord: {
        level: 'CRITICAL', title: `Review Gate Rate Limit Exhausted: ${gate.title}`,
        description: `Review attempt ${exit.attempt} exceeded max ACP rate limit pauses (${exit.max_rate_limit_pauses}).`,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
          run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: exit.attempt,
          gateway_label: exit.gateway_label, session_key: exit.session_key, dispatch_id: exit.dispatch_id,
        }),
      } },
    }),
    logMessage: `Review gate '${gateId}' rate limit pauses exhausted`,
  });
  return control(context, { ...result, failure_class: 'rate_limit_exhausted', outcome_class: 'rate_limited' });
}

function errorResult(context: AnyRecord, review: AnyRecord) {
  const gateway = resolveResultGatewayLabel(review);
  const session = resolveResultSessionKey(review);
  if (review.invalid_contract) {
    log('ERROR', `Review gate '${context.gateId}' invalid output contract: ${review.error}`);
    return control(context, { reason: `Review invalid output: ${review.error}`, failure_class: 'invalid_contract', outcome_class: 'error', gateway_label: gateway, session_key: session, attempt: context.attempt });
  }
  log('ERROR', `Review gate '${context.gateId}' failed: ${review.error}`);
  const failureClass = typeof review.failure_class === 'string' && review.failure_class.trim() ? review.failure_class.trim() : 'review_failed';
  return control(context, { reason: `Review failed: ${review.error}`, failure_class: failureClass, gateway_label: gateway, session_key: session, attempt: context.attempt });
}

function passedResult(context: AnyRecord, review: AnyRecord) {
  const merged = objectRecord(review.mergedResult);
  log('OK', `Review gate '${context.gateId}' PASS`);
  return control(context, {
    outcome_class: 'passed', attempt: context.attempt,
    gateway_label: resolveResultGatewayLabel(review), session_key: resolveResultSessionKey(review),
    critical_issues_count: arrayValue(merged.critical_issues).length + arrayValue(merged.critical_blockers).length,
    deferred_issues_count: arrayValue(merged.deferred_issues).length,
    findings_count: arrayValue(merged.findings).length,
    duration_seconds: Math.round((Date.now() - context.gateStartedAt) / 1000),
  });
}

function failedVerdictResult(context: AnyRecord, review: AnyRecord) {
  log('WARN', `Review gate '${context.gateId}' FAIL`);
  const issues = extractReviewIssues(review.mergedResult);
  log('INFO', `${issues.length} critical issue(s) extracted from review`);
  summarizeReviewFailReason(issues, review?.mergedResult);
  return control(context, {
    reason: `Review gate '${context.gateId}' FAIL`, failure_class: 'verdict_fail', outcome_class: 'needs_nova',
    attempt: context.attempt, last_review: review.mergedResult,
    gatewayLabel: resolveResultGatewayLabel(review), sessionKey: resolveResultSessionKey(review),
  });
}

export async function resolveReviewGateResult(context: AnyRecord, review: AnyRecord) {
  if (review.rate_limit_exhausted) return rateLimitResult(context, review);
  if (review.error) return errorResult(context, review);
  if (review.ok) return passedResult(context, review);
  return failedVerdictResult(context, review);
}
