import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayValue(value: any) {
  return Array.isArray(value) ? value : [];
}

function issueTitles(issues: any) {
  const titles = arrayValue(issues).map((issue: any) => objectRecord(issue)?.title).filter(Boolean);
  return titles.join('; ') || 'missing_error_detail';
}

function hasK8sInfrastructureFailure(status: any) {
  const suites = selectDefinedValue(() => objectRecord(status?.verdict?.suites), () => objectRecord(status?.suites)) ?? {};
  const suite = suites?.k8s;
  const result = arrayValue(status?.results).find((entry: any) => entry?.suite === 'k8s');
  return [...arrayValue(suite?.findings), ...arrayValue(result?.findings)].some((finding: any) => {
    const record = objectRecord(finding) ?? {};
    const rule = typeof record.rule === 'string' ? record.rule.trim() : '';
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    return rule === 'k8s-capability-preflight'
      || message.includes('k8s-capability-preflight failed')
      || message.includes('returned HTML instead of Kubernetes API data');
  });
}

async function handleK8sFailure(ctx: any, status: any, issues: any[], issueSummary: string) {
  const reason = `Gate '${ctx.gateId}' blocked by Kubernetes infrastructure preflight: ${issueSummary}`;
  await ctx.reportFailure({
    reason,
    title: `Gate '${ctx.gateId}' Kubernetes Infra Unavailable`,
    description: reason.slice(0, 300),
    issuesCount: issues.length,
    fixCycle: ctx.attempt - 1,
  });
  return ctx.control({ reason, failure_class: 'k8s_infra_unavailable', outcome_class: 'error', remaining_issues: issues, status });
}

async function requestGateFix(ctx: any, status: any, issues: any[], issueSummary: string) {
  await ctx.reportFailure({
    reason: issueSummary,
    title: `Gate '${ctx.gateId}' FAIL`,
    description: `Buster found ${issues.length} issue(s). Entering the shared request_fix remediation handoff.`,
    level: 'WARN',
    issuesCount: issues.length,
    fixCycle: ctx.attempt - 1,
    markFailed: false,
  });
  return ctx.callbacks.buildBusterRequestFixControlResult(ctx.config, ctx.gateId, ctx.gate, status, issues, {
    remediationPolicy: { maxFixCycles: ctx.maxFixCycles, nextFixCycle: ctx.attempt, rerunStageId: 'gate:buster' },
    gateStartedAt: ctx.gateStartedAt,
    dispatchId: ctx.dispatchId,
    gatewayLabel: ctx.gatewayLabel,
    sessionKey: ctx.sessionKey,
  });
}

async function handleTerminalVerdictFailure(ctx: any, issues: any[], issueSummary: string) {
  const reason = `Gate '${ctx.gateId}' failed: ${issueSummary}`;
  await ctx.reportFailure({
    reason: issueSummary,
    title: `Gate '${ctx.gateId}' FAIL`,
    description: `Agent reported failure: ${issueSummary}`,
    issuesCount: issues.length,
    fixCycle: 0,
  });
  return ctx.control({ reason, failure_class: 'verdict_fail', outcome_class: 'needs_nova', remaining_issues: issues });
}

export async function handleBusterGateVerdictFailure(ctx: any) {
  const status = selectDefinedValue(() => objectRecord(ctx.resultStatus), () => ({}));
  const issues = ctx.callbacks.extractGateIssues(status);
  const issueSummary = issueTitles(issues);
  log('WARN', `Gate '${ctx.gateId}' FAIL: ${issueSummary}`);
  if (hasK8sInfrastructureFailure(status)) return handleK8sFailure(ctx, status, issues, issueSummary);
  if (ctx.hasFixLoop) return requestGateFix(ctx, status, issues, issueSummary);
  return handleTerminalVerdictFailure(ctx, issues, issueSummary);
}
