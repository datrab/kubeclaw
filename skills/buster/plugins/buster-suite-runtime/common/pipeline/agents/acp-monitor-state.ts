import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { getGatewaySessionStatus, resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.js';
import { ACP_MONITOR_REASONS, parseSessionState, isSessionTerminalState, isStoppedSessionState, isUnreachableSessionState } from './session-semantics.js';
import { getTrackedAgent } from './tracked-agents.js';
import { assertValidAcpMonitorState } from '../services/acp-gateway-contract.js';
import {
  assertGatewayStatusPolicy,
  getAcpMonitorConfig,
  nonEmptyString,
  nonNegativeNumber,
  objectRecordOrEmpty,
  readAcpTranscriptState,
  readGatewayStatusPolicy,
  transcriptShowsProgress,
} from './acp-monitor-transcript.js';
type AnyRecord = Record<string, any>;

export async function fetchSessionStatus(sessionKey: any, gatewayUrl: any, gatewayToken: any, opts: AnyRecord = {}) {
  const policy = assertGatewayStatusPolicy(
    opts.gatewayStatusPolicy,
    'gatewayStatusPolicy',
  );
  return getGatewaySessionStatus(sessionKey, policy.timeoutMs, {
    ...policy,
    gatewayUrl,
    gatewayToken,
    budget: selectDefinedValue(() => (opts.budget), () => (null)),
    signal: selectDefinedValue(() => (opts.signal), () => (null)),
  });
}

export function buildMonitorState(childSessionKey: any, transcript: AnyRecord, sessionState: any, sessionActive: boolean, prev: AnyRecord, thresholds: AnyRecord, gateway: AnyRecord = {}): AnyRecord {
  const pollLimit = thresholds.pollLimit;
  if (!Number.isFinite(pollLimit)) {
    throw new Error('ACP monitor thresholds must be validated explicit config');
  }
  const unknownLike = isUnreachableSessionState(sessionState);
  const parsedPreviousUnknownPolls = nonNegativeNumber(prev.unknownPolls);
  const previousUnknownPolls = parsedPreviousUnknownPolls === null ? 0 : parsedPreviousUnknownPolls;
  const unknownPolls = unknownLike ? previousUnknownPolls + 1 : 0;
  const staleExceeded = transcript.lastActivityPoll >= pollLimit;
  const unknownExceeded = unknownPolls >= pollLimit;
  const gatewayUnreachable = gateway.gatewayUnreachable === true;
  const gatewayDetail = selectDefinedValue(() => (gateway.gatewayDetail), () => (null));
  const gatewayRateLimited = gateway.gatewayRateLimited === true;

  let terminal = false;
  let reason = null;

  if ([transcript.rateLimited, gatewayRateLimited].some(Boolean)) {
    reason = ACP_MONITOR_REASONS.RATE_LIMITED;
  } else if ([transcript.hardError, transcript.terminal].some(Boolean)) {
    terminal = true;
    reason = ACP_MONITOR_REASONS.TRANSCRIPT_ERROR;
  } else if (isSessionTerminalState(sessionState)) {
    terminal = true;
    reason = ACP_MONITOR_REASONS.SESSION_TERMINAL;
  } else if (unknownExceeded && staleExceeded) {
    terminal = true;
    reason = ACP_MONITOR_REASONS.STALE_STATUS_TIMEOUT;
  }

  const detail = (selectDefinedValue(() => (transcript.lastDetail), () => (null)));
  const sessionTerminal = isSessionTerminalState(sessionState);
  const stopped = !sessionActive && [isStoppedSessionState(sessionState), isUnreachableSessionState(sessionState)].some(Boolean);

  return assertValidAcpMonitorState({
    sessionKey: childSessionKey,
    sessionState,
    sessionActive,
    transcript,
    unknownPolls,
    transcriptStalePolls: transcript.lastActivityPoll,
    gatewayUnreachable,
    gatewayDetail,
    terminal,
    rateLimited: reason === ACP_MONITOR_REASONS.RATE_LIMITED,
    reason,
    detail,
    lastDetail: detail,
    lastSummary: detail,
    failed: terminal,
    sessionTerminal,
    stopped,
  }) as AnyRecord;
}

export async function getDirectAcpMonitorState(childSessionKey: any, streamLogPath: any, prev: AnyRecord = {}, opts: AnyRecord = {}): Promise<AnyRecord> {
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const monitorCfg = getAcpMonitorConfig(opts);
  const previousTranscript = objectRecordOrEmpty(prev.transcript);
  const transcript = readAcpTranscriptState(streamLogPath, previousTranscript) as AnyRecord;

  let sessionState = 'no_session_key';
  let sessionActive = false;
  let gatewayUnreachable = false;
  let gatewayDetail = null;
  let gatewayRateLimited = false;

  if (childSessionKey && gatewayUrl) {
    try {
      const raw: any = await fetchSessionStatus(childSessionKey, gatewayUrl, gatewayToken, opts);
      const statusResult = selectDefinedValue(() => (raw?.result?.details), () => (raw));
      const parsed = parseSessionState(statusResult);
      const parsedRecord = objectRecordOrEmpty(parsed);
      sessionState = parsed.state;
      sessionActive = parsed.active;
      gatewayDetail = selectDefinedValue(() => (parsedRecord.detail), () => (null));
      gatewayRateLimited = parsedRecord.rateLimited === true;
    } catch (err) {
      gatewayUnreachable = true;
      gatewayDetail = (selectDefinedValue(() => ((err as any)?.message), () => ('session status unreachable')));
      if (transcriptShowsProgress(transcript as AnyRecord)) {
        sessionState = 'running';
        sessionActive = true;
      } else {
        sessionState = 'unreachable';
        sessionActive = false;
      }
    }
  }

  return buildMonitorState(childSessionKey, transcript, sessionState, sessionActive, prev, monitorCfg, {
    gatewayUnreachable,
    gatewayDetail,
    gatewayRateLimited,
  });
}

export function resolveTrackedAgent(sessionLabel: any) {
  return objectRecordOrEmpty(getTrackedAgent(sessionLabel));
}

export function looksLikeSessionKey(value: any) {
  return typeof value === 'string' && value.includes(':');
}

export function resolveConfigSessionLabelOrKey(request: AnyRecord): string | null {
  const candidate = selectDefinedValue(() => (selectDefinedValue(() => (nonEmptyString(request.sessionLabelOrKey)), () => (nonEmptyString(request.sessionLabel)))), () => (nonEmptyString(request.sessionKey)));
  return candidate;
}

export function resolveConfigTrackedAgent(request: AnyRecord, sessionLabelOrKey: string | null): AnyRecord {
  if (request.trackedAgent !== undefined && request.trackedAgent !== null) {
    return objectRecordOrEmpty(request.trackedAgent);
  }
  if (!sessionLabelOrKey) return {};
  return resolveTrackedAgent(sessionLabelOrKey);
}

export function resolveMonitorSessionKey(request: AnyRecord, trackedAgent: AnyRecord, sessionLabelOrKey: string | null): string | null {
  const childSessionKey = nonEmptyString(request.childSessionKey);
  if (childSessionKey) return childSessionKey;
  const trackedSessionKey = nonEmptyString(trackedAgent.sessionKey);
  if (trackedSessionKey) return trackedSessionKey;
  if (looksLikeSessionKey(sessionLabelOrKey)) return sessionLabelOrKey;
  return null;
}

export async function getAcpMonitorState(request: AnyRecord) {
  if (arguments.length !== 1) {
    throw new TypeError('getAcpMonitorState requires exactly one options object');
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (!request), () => (typeof request !== 'object'))), () => (Array.isArray(request)))) {
    throw new TypeError('getAcpMonitorState requires a single options object');
  }

  if (request.config) {
    const config = request.config;
    const sessionLabelOrKey = resolveConfigSessionLabelOrKey(request);
    const entry = resolveConfigTrackedAgent(request, sessionLabelOrKey);
    const streamLogPath = selectDefinedValue(() => (selectDefinedValue(() => (entry?.streamLogPath), () => (request.streamLogPath))), () => (null));
    const previousState = objectRecordOrEmpty(request.previousState);
    const sessionKey = resolveMonitorSessionKey(request, entry, sessionLabelOrKey);
    const monitorCfg = getAcpMonitorConfig(config);
    return getDirectAcpMonitorState(sessionKey, streamLogPath, previousState, {
      ...monitorCfg,
      gatewayStatusPolicy: readGatewayStatusPolicy(config),
      gatewayUrl: config.gatewayUrl,
      gatewayToken: config.gatewayToken,
    });
  }

  const {
    childSessionKey = null,
    sessionKey = null,
    streamLogPath = null,
    previousState = {},
    monitorOptions = null,
    ...monitorPolicy
  } = request;
  return getDirectAcpMonitorState(
    selectDefinedValue(() => (childSessionKey), () => (sessionKey)),
    streamLogPath,
    previousState,
    monitorOptions === null ? monitorPolicy : objectRecordOrEmpty(monitorOptions),
  );
}


// ── ACP Edge Event Adapter ───────────────────────────────────────────────────
