import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';

function objectRecord(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function evaluationAttempt(status: any, attempt: any) {
  return status?.attempt ?? attempt;
}

const SIMPLE_FAILURES: Record<string, (ctx: any) => any> = {
  config_invalid: (ctx) => {
    const error = ctx.resultStatus?.error ?? 'missing_error_detail';
    return { log: `config invalid: ${error}`, reason: error, title: 'Config Invalid', description: `Gate '${ctx.gateId}' config invalid: ${error}`, failure_class: 'config_invalid', outcome_class: 'needs_nova' };
  },
  commit_hash_missing: (ctx) => {
    const error = ctx.resultStatus?.error ?? `Gate '${ctx.gateId}' Buster dispatch requires commit_hash`;
    return { log: `commit identity missing: ${error}`, reason: error, title: 'Commit Identity Missing', description: error.slice(0, 300), failure_class: 'commit_hash_missing', outcome_class: 'needs_nova' };
  },
  spawn_failed: (ctx) => {
    const error = ctx.resultStatus?.error ?? 'missing_error_detail';
    const reason = `Gate '${ctx.gateId}' spawn failed: ${error}`;
    return { log: `agent spawn failed: ${error}`, reason, title: 'Spawn Failed', description: `Buster agent could not be spawned: ${error}`, failure_class: 'spawn_failed', outcome_class: 'error' };
  },
  parse_corrupted: (ctx) => {
    const reason = `Gate '${ctx.gateId}' status file permanently corrupted`;
    return { log: 'status file permanently corrupted', reason, title: 'Parse Corrupted', description: 'Gate status file is permanently unparseable after multiple attempts.', failure_class: 'parse_corrupted', outcome_class: 'needs_nova' };
  },
  timeout: (ctx) => {
    const reason = `Gate '${ctx.gateId}' timed out`;
    return { log: `timed out after ${ctx.timeout}min`, reason, title: 'TIMEOUT', description: `Buster did not complete within ${ctx.timeout}min`, failure_class: 'timeout', outcome_class: 'timeout' };
  },
  git_error: (ctx) => {
    const reason = ctx.resultStatus?.message ?? 'Polling git sync failed closed during gate execution';
    return { log: `polling git sync failed closed: ${reason}`, reason, title: 'Polling Git Unsafe', description: reason.slice(0, 300), failure_class: 'git_error', outcome_class: 'error', polling_git: selectTruthyValue(() => ctx.resultStatus?.details, () => ctx.resultStatus) || null };
  },
};

export async function handleSimpleBusterGateFailure(ctx: any) {
  const build = SIMPLE_FAILURES[ctx.evaluation.type];
  if (!build) return null;
  const details = build(ctx);
  log('ERROR', `Gate '${ctx.gateId}' ${details.log}`);
  await ctx.reportFailure({ reason: details.reason, title: `Gate '${ctx.gateId}' ${details.title}`, description: details.description });
  return ctx.control(details);
}

export async function handleInvalidBusterGateContract(ctx: any) {
  const invalid = selectDefinedValue(() => objectRecord(ctx.resultStatus), () => ({}));
  const reason = invalid.reason ?? `Gate '${ctx.gateId}' output contract invalid`;
  log('ERROR', `Gate '${ctx.gateId}' output contract invalid: ${reason}`);
  await ctx.reportFailure({
    reason,
    title: `Gate '${ctx.gateId}' Invalid Output`,
    description: reason.slice(0, 300),
    identityAttempt: evaluationAttempt(invalid, ctx.attempt),
    extraFields: invalid.invalid_reason ? [{ name: 'Invalid Reason', value: String(invalid.invalid_reason).slice(0, 200), inline: true }] : [],
  });
  return ctx.control({ reason, failure_class: 'invalid_contract', outcome_class: 'error', status: invalid });
}

function completionFailureDescription(gateId: any, reason: any, status: any) {
  if (reason === 'completion_conflict') return selectDefinedValue(() => status.reason, () => selectDefinedValue(() => status.summary, () => `Gate '${gateId}' completion conflict`));
  if (reason === 'completion_archive_failed') return selectDefinedValue(() => status.reason, () => selectDefinedValue(() => status.error, () => `Gate '${gateId}' completion archive failed`));
  if (reason === 'completion_event_adapter_failed') return selectDefinedValue(() => status.reason, () => selectDefinedValue(() => status.error, () => `Gate '${gateId}' completion event adapter failed`));
  return selectDefinedValue(() => status.reason, () => selectDefinedValue(() => status.error, () => `Gate '${gateId}' completion event unresolved`));
}

export async function handleNonVerdictBusterGateFailure(ctx: any) {
  const status = selectDefinedValue(() => objectRecord(ctx.resultStatus), () => ({}));
  const reason = completionFailureDescription(ctx.gateId, ctx.resultReason, status);
  log('ERROR', `Gate '${ctx.gateId}' completion failed before verdict: ${reason}`);
  await ctx.reportFailure({ reason, title: `Gate '${ctx.gateId}' Completion Failed`, description: reason.slice(0, 300), identityAttempt: evaluationAttempt(status, ctx.attempt) });
  return ctx.control({ reason, status, failure_class: ctx.resultReason, outcome_class: 'error' });
}
