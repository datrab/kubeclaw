import { selectDefinedValue } from "../optional-absence.ts";
import {
  callRateLimitResolver,
  resolveRateLimitIdentity,
  resolveRateLimitOption,
  resolvedOptionRecord,
  resolvedRateLimitStatusBase,
  statusRecord,
} from "./rate-limit-builder-primitives.ts";

export function buildGateSessionRateLimitStatus(
  status: any = {},
  { gateId = null, gateType = null, identity = {} }: any = {},
) {
  const resolvedGateId = gateId != null ? gateId : (status?.gate_id ?? null);
  const resolvedIdentity = resolveRateLimitIdentity(identity, { status });
  return {
    ...resolvedRateLimitStatusBase(status, resolvedIdentity),
    ...(resolvedGateId == null ? {} : { gate_id: resolvedGateId }),
    ...(gateType == null ? {} : { gate_type: gateType }),
  };
}

export function buildTrackedGateSessionRateLimitStatus(
  status: any = {},
  options: any = {},
) {
  return createTrackedGateSessionRateLimitStatusBuilder(options)(status, {
    status,
  });
}

export function createTrackedGateSessionRateLimitStatusBuilder(
  options: any = {},
) {
  const {
    gateId = null,
    gateType = null,
    identity = {},
    updateCorrelation = null,
  } = options;
  const tracked = { dispatch_id: null, gateway_label: null };
  const update = (status: any = null, ctx: any = { status }) => {
    const external = callRateLimitResolver(updateCorrelation, status);
    resolveRateLimitIdentity(identity, ctx);
    tracked.dispatch_id = external.dispatch_id ?? null;
    tracked.gateway_label = external.gateway_label ?? null;
    return { ...tracked };
  };
  const normalize: any = (status: any = {}, ctx: any = { status }) => {
    const correlation = update(status, ctx);
    const resolved = resolveRateLimitIdentity(identity, ctx);
    return buildGateSessionRateLimitStatus(status, {
      gateId,
      gateType,
      identity: {
        ...resolved,
        dispatch_id: correlation.dispatch_id ?? null,
        gateway_label: correlation.gateway_label ?? null,
        session_key: resolved.session_key,
      },
    });
  };
  normalize.getTrackedCorrelation = (
    status: any = null,
    ctx: any = status == null ? null : { status },
  ) => (status != null ? update(status, ctx) : { ...tracked });
  return normalize;
}

export function createTrackedGateSessionRateLimitExhaustedResultOptions(
  options: any = {},
) {
  const {
    gateId = null,
    gateType = null,
    identity = {},
    updateCorrelation = null,
    statusOverrides = {},
    resultOverrides = {},
    exit = null,
  } = options;
  return ({
    result = {},
    status = statusRecord(result?.status),
    maxPauses,
  }: any = {}) => {
    const ctx = { result, status, maxPauses };
    const correlation = callRateLimitResolver(updateCorrelation, status);
    const resolvedStatus = resolvedOptionRecord(statusOverrides, ctx);
    const resolvedResult = resolvedOptionRecord(resultOverrides, ctx);
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);
    const resolvedExit = resolveRateLimitOption(exit, ctx);
    const gateIdentity = {
      ...(gateId == null ? {} : { gate_id: gateId }),
      ...(gateType == null ? {} : { gate_type: gateType }),
    };
    return {
      identity: {
        ...resolvedIdentity,
        dispatch_id: correlation.dispatch_id ?? null,
        gateway_label: correlation.gateway_label ?? null,
        session_key: resolvedIdentity.session_key,
      },
      maxPauses,
      statusOverrides: { ...gateIdentity, ...resolvedStatus },
      ...(resolvedExit == null ? {} : { exit: resolvedExit }),
      resultOverrides: { ...gateIdentity, ...resolvedResult },
    };
  };
}

export function createTrackedModuleSessionRateLimitExhaustedResultOptions(
  options: any = {},
) {
  const {
    moduleId = null,
    moduleDir = null,
    phase = null,
    identity = {},
    statusOverrides = {},
    resultOverrides = {},
    exit = null,
  } = options;
  return ({
    result = {},
    status = statusRecord(result?.status),
    maxPauses,
  }: any = {}) => {
    const ctx = { result, status, maxPauses };
    const resolvedStatus = resolvedOptionRecord(statusOverrides, ctx);
    const resolvedResult = resolvedOptionRecord(resultOverrides, ctx);
    const resolvedIdentity = resolveRateLimitIdentity(identity, ctx);
    const resolvedExit = resolveRateLimitOption(exit, ctx);
    const moduleIdentity = {
      ...(moduleId == null ? {} : { module_id: moduleId }),
      ...(moduleDir == null ? {} : { module_dir: moduleDir }),
      ...(phase == null ? {} : { phase, current_phase: phase }),
    };
    return {
      identity: {
        ...resolvedIdentity,
        session_key: resolvedIdentity.session_key,
      },
      maxPauses,
      statusOverrides: { ...moduleIdentity, ...resolvedStatus },
      ...(resolvedExit == null ? {} : { exit: resolvedExit }),
      resultOverrides: { ...moduleIdentity, ...resolvedResult },
    };
  };
}
