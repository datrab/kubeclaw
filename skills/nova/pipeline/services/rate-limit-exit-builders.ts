import {
  buildGateSessionRateLimitStatus,
  buildModuleSessionRateLimitStatus,
  buildSessionRateLimitExhaustedResult,
  resolveRateLimitIdentity,
  resolveSessionRateLimitExhaustedStatus,
  resolveSessionRateLimitMaxPauses,
  resolveSessionRateLimitRunId,
} from "./rate-limit-builders.ts";
import {
  resolveResultAttempt,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
  resolveResultSessionKey,
} from "./correlation.ts";
import {
  firstDefinedValue as firstDefined,
  objectRecord,
  selectPresentValue,
} from "../value-boundary.ts";

const EXHAUSTED = "rate_limit_exhausted";
const MAX_PAUSES = "max_pauses_exceeded";
const MISSING_SOURCE = "missing_completion_source";

function requiredNonnegativeInteger(value: any, label: string) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0)
    throw new Error(`${label} is required for rate-limit exhaustion results`);
  return Math.trunc(count);
}

function nullable(value: any) {
  return value ?? null;
}

function exitBuildOptions(options: any) {
  return {
    identity: options.identity ?? {},
    maxPauses: nullable(options.maxPauses),
    statusOverrides: options.statusOverrides ?? {},
    resultOverrides: options.resultOverrides ?? {},
    exit: options.exit,
    resolvers: {
      runId: options.resolveRunId ?? resolveSessionRateLimitRunId,
      attempt: options.resolveAttempt ?? resolveResultAttempt,
      dispatchId: options.resolveDispatchId ?? resolveResultDispatchId,
      gatewayLabel: options.resolveGatewayLabel ?? resolveResultGatewayLabel,
      sessionKey: options.resolveSessionKey ?? resolveResultSessionKey,
    },
  };
}

function resultCorrelation(result: any, identity: any, resolvers: any) {
  const runId = resolvers.runId(result, identity.run_id);
  const attempt =
    resolvers.attempt(result) != null
      ? resolvers.attempt(result)
      : (identity.attempt ?? null);
  return {
    attempt,
    dispatch_id: resolvers.dispatchId(result) ?? null,
    gateway_label: resolvers.gatewayLabel(result) ?? null,
    session_key: resolvers.sessionKey(result) ?? null,
    ...(runId == null ? {} : { run_id: runId }),
  };
}

export function buildSessionRateLimitExitResult(
  result: any = {},
  reason: any = EXHAUSTED,
  options: any = {},
) {
  const resolved = exitBuildOptions(options);
  const status = resolveSessionRateLimitExhaustedStatus(result);
  if (!status) {
    throw new Error("rate-limit status must be an object");
  }
  if (typeof status !== "object") {
    throw new Error(
      "rate_limit_status is required for rate-limit exhaustion results",
    );
  }
  const identity = resolveRateLimitIdentity(resolved.identity, {
    result,
    rateLimitStatus: status,
  });
  const maxPauses = requiredNonnegativeInteger(
    resolveSessionRateLimitMaxPauses(result, resolved.maxPauses),
    "max_rate_limit_pauses",
  );
  const correlation = resultCorrelation(result, identity, resolved.resolvers);
  const {
    status: _status,
    rate_limit_status: _rateLimitStatus,
    rate_limit_pauses: _pauses,
    max_rate_limit_pauses: _max,
    ...rest
  } = objectRecord(result);
  return buildSessionRateLimitExhaustedResult(
    { ...status, ...correlation, ...resolved.statusOverrides },
    requiredNonnegativeInteger(result?.rate_limit_pauses, "rate_limit_pauses"),
    maxPauses,
    {
      ...rest,
      ...correlation,
      ...resolved.resultOverrides,
      ...(resolved.exit == null ? {} : { exit: resolved.exit }),
      reason,
    },
  );
}

function statusAuthority(status: any, key: string, fallback: any) {
  return Object.prototype.hasOwnProperty.call(status, key)
    ? status[key]
    : fallback;
}

function terminalIdentity(redis: any, expected: any) {
  const runId = redis.run_id ? redis.run_id : (expected.run_id ?? null);
  const attempt =
    resolveResultAttempt(redis) != null
      ? resolveResultAttempt(redis)
      : nullable(expected.attempt);
  return {
    run_id: runId,
    attempt,
    dispatch_id: expected.dispatch_id ?? null,
    gateway_label: expected.gateway_label ?? null,
    session_key: expected.session_key ?? null,
    max_rate_limit_pauses: redis.max_rate_limit_pauses ?? null,
  };
}

function terminalStatus(redis: any, status: any, identity: any) {
  return {
    ...status,
    reason:
      status.reason ??
      selectPresentValue(redis.reason, redis.summary, MAX_PAUSES),
    source: status.source ?? selectPresentValue(redis.source, MISSING_SOURCE),
    run_id: statusAuthority(status, "run_id", identity.run_id),
    attempt: statusAuthority(status, "attempt", identity.attempt),
    dispatch_id: statusAuthority(status, "dispatch_id", identity.dispatch_id),
    gateway_label: statusAuthority(
      status,
      "gateway_label",
      identity.gateway_label,
    ),
    session_key: statusAuthority(status, "session_key", identity.session_key),
    max_rate_limit_pauses: statusAuthority(
      status,
      "max_rate_limit_pauses",
      identity.max_rate_limit_pauses,
    ),
    _source: "redis",
    _redis_entry: redis,
  };
}

function buildTerminalOwnedRedisRateLimitExitResult(redis: any, options: any) {
  const expected = options.expectedIdentity ?? {};
  const identity = terminalIdentity(redis, expected);
  const status = terminalStatus(redis, options.status ?? {}, identity);
  const pauses = requiredNonnegativeInteger(
    redis.rate_limit_pauses,
    "redis rate_limit_pauses",
  );
  return buildSessionRateLimitExitResult(
    {
      ...redis,
      ...identity,
      rate_limit_pauses: pauses,
      rate_limit_status: status,
      source: selectPresentValue(redis.source, MISSING_SOURCE),
      status,
      _source: "redis",
      _redis_entry: redis,
      ...(options.resultOverrides ?? {}),
    },
    options.reason ?? EXHAUSTED,
    {
      identity: expected,
      maxPauses: identity.max_rate_limit_pauses,
      ...(options.exit == null ? {} : { exit: options.exit }),
    },
  );
}

export function buildModuleTerminalOwnedRedisRateLimitExitResult(
  redis: any = {},
  options: any = {},
) {
  const moduleId = options.moduleId ?? null;
  const expected = options.expectedIdentity ?? {};
  const identity = options.identity ?? {};
  const status = buildModuleSessionRateLimitStatus(redis, {
    moduleId,
    phase: options.phase ?? null,
    identity: {
      ...identity,
      run_id: firstDefined(expected.run_id, identity.run_id),
      attempt: firstDefined(expected.attempt, identity.attempt),
      dispatch_id: firstDefined(expected.dispatch_id, identity.dispatch_id),
      gateway_label: firstDefined(
        expected.gateway_label,
        identity.gateway_label,
      ),
      session_key: firstDefined(expected.session_key, identity.session_key),
    },
  });
  const summary = firstDefined(
    status.completion_summary,
    options.completionSummary,
    redis.summary,
    null,
  );
  const commit = status.forge_commit_hash ?? null;
  return buildTerminalOwnedRedisRateLimitExitResult(redis, {
    ...options,
    expectedIdentity: expected,
    status: {
      ...status,
      completion_summary: summary,
      forge_commit_hash: commit,
    },
    resultOverrides: {
      ...(moduleId == null ? {} : { module: moduleId, module_id: moduleId }),
      ...(summary == null ? {} : { completion_summary: summary }),
      ...(commit == null ? {} : { forge_commit_hash: commit }),
      ...(options.resultOverrides ?? {}),
    },
  });
}

export function buildGateTerminalOwnedRedisRateLimitExitResult(
  redis: any = {},
  options: any = {},
) {
  const gateId = options.gateId ?? null;
  const gateType = options.gateType ?? null;
  return buildTerminalOwnedRedisRateLimitExitResult(redis, {
    ...options,
    status: buildGateSessionRateLimitStatus(redis, {
      gateId,
      gateType,
      ...(options.statusOptions ?? {}),
    }),
    resultOverrides: {
      ...(gateId == null ? {} : { gate: gateId, gate_id: gateId }),
      ...(gateType == null ? {} : { gate_type: gateType }),
      ...(options.resultOverrides ?? {}),
    },
  });
}
