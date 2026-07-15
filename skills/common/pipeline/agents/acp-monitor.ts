// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
declare const Buffer: any;
type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;
import { getGatewaySessionStatus, resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.ts';
import {
  ACP_MONITOR_REASONS,
  parseSessionState,
  isSessionTerminalState,
  isStoppedSessionState,
  isUnreachableSessionState,
} from './session-semantics.ts';
import { getTrackedAgent } from './tracked-agents.ts';
import { createBudget, isBudgetExhaustedError, sleep } from '../timing.ts';
import {
  createPipelineEventBus,
  waitForAny,
} from '../services/pipeline-event-contract.ts';
import {
  assertValidAcpMonitorState,
  assertValidAcpSessionStateEventPayload,
  assertValidAcpTranscriptState,
  assertValidAcpTranscriptDeltaEventPayload,
} from '../services/acp-gateway-contract.ts';

function log(level: any, msg: any) {
  console.log(`[ACP-MONITOR] [${level}] ${msg}`);
}

// ── Transcript delta publishing ──────────────────────────────────────────────
// Rate limiter: max 5 events per second per agent session.

const _transcriptRateLimits = new Map(); // agentLabel -> { count, windowStart }
const TRANSCRIPT_MAX_PER_SEC = 5;
const VALID_LINE_KINDS = new Set(['assistant', 'assistant_delta', 'tool_call', 'tool_result', 'system_event', 'lifecycle', 'thinking', 'info']);

function transcriptRateLimitFor(agentLabel: string, now: number): AnyRecord {
  const existing = objectRecord(_transcriptRateLimits.get(agentLabel));
  if (existing) return existing;
  return { count: 0, windowStart: now };
}

function objectRecord(value: any): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value: any): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function requiredNonEmptyString(value: any, label: string): string {
  const text = nonEmptyString(value);
  if (!text) throw new Error(`ACP monitor requires explicit ${label}`);
  return text;
}

function nonNegativeNumber(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function publishTranscriptDelta(ctx: any, identity: AnyRecord, newLines: string[], emitFn: AnyFunction | null) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!emitFn), () => (!newLines))), () => (newLines.length === 0))) return;

  const agentLabel = requiredNonEmptyString(identity?.label, 'transcript identity.label');
  const moduleId = selectDefinedValue(() => (identity?.module_id), () => (null));
  const gateId = selectDefinedValue(() => (identity?.gate_id), () => (null));
  const gateType = selectDefinedValue(() => (identity?.gate_type), () => (null));
  const sessionKey = selectDefinedValue(() => (identity?.session_key), () => (null));
  const dispatchId = selectDefinedValue(() => (identity?.dispatch_id), () => (null));
  const agentType = requiredNonEmptyString(identity?.agent_type, 'transcript identity.agent_type');

  const now = Date.now();
  const rl = transcriptRateLimitFor(agentLabel, now);

  if (now - rl.windowStart >= 1000) {
    rl.count = 0;
    rl.windowStart = now;
  }

  const wouldExceed = (rl.count + newLines.length) > TRANSCRIPT_MAX_PER_SEC;

  if (wouldExceed) {
    const texts = newLines.map(l => {
      try { const e = JSON.parse(l); return selectDefinedValue(() => (e?.text), () => (l)); } catch (_error) { return l; }
    });
    emitFn(ctx, {
      agent_type: agentType,
      label: agentLabel,
      module_id: moduleId,
      gate_id: gateId,
      gate_type: gateType,
      session_key: sessionKey,
      dispatch_id: dispatchId,
      line_kind: 'info',
      text: texts.join('\n'),
      transcript_offset: null,
      line_count: newLines.length,
    });
    rl.count++;
  } else {
    for (const line of newLines) {
      let evt;
      try { evt = JSON.parse(line); } catch (_error) { evt = null; }
      const rawKind = evt?.kind;
      const kind = rawKind && VALID_LINE_KINDS.has(rawKind) ? rawKind : 'info';
      const text = selectDefinedValue(() => (selectDefinedValue(() => (evt?.text), () => (evt?.data?.text))), () => (line));
      emitFn(ctx, {
        agent_type: agentType,
        label: agentLabel,
        module_id: moduleId,
        gate_id: gateId,
        gate_type: gateType,
        session_key: sessionKey,
        dispatch_id: dispatchId,
        line_kind: kind,
        text,
        transcript_offset: selectDefinedValue(() => (evt?.offset), () => (null)),
      });
      rl.count++;
    }
  }

  _transcriptRateLimits.set(agentLabel, rl);
}

// ── Config ───────────────────────────────────────────────────────────────────

function readRequiredNonNegativeNumber(src: AnyRecord, snakeKey: string, errors: string[]) {
  const raw = src?.[snakeKey];
  if (selectTruthyValue(() => (selectTruthyValue(() => (raw === undefined), () => (raw === null))), () => (raw === ''))) {
    errors.push(`${snakeKey} is required`);
    return null;
  }
  const value = Number(raw);
  if (selectTruthyValue(() => (!Number.isFinite(value)), () => (value < 0))) {
    errors.push(`${snakeKey} must be a non-negative number`);
    return null;
  }
  return value;
}

function requireConfigObject(value: any, source: string) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))), () => (Array.isArray(value)))) {
    throw new Error(`ACP monitor requires ${source} object from swarm.config.json`);
  }
  return value;
}

function normalizeGatewayStatusPolicy(statusPolicy: any, retryPolicy: any) {
  const status = requireConfigObject(statusPolicy, 'gateway.invoke.session_status');
  const retry = requireConfigObject(retryPolicy, 'gateway.invoke.retry');
  const timeoutMs = status.timeout_ms;
  const maxRetries = retry.max_attempts;
  const retryDelayMs = retry.retry_delay_ms;
  if (!Number.isFinite(timeoutMs)) {
    throw new Error('ACP monitor requires numeric gateway.invoke.session_status.timeout_ms from swarm.config.json');
  }
  if (selectTruthyValue(() => (!Number.isInteger(maxRetries)), () => (maxRetries < 1))) {
    throw new Error('ACP monitor requires positive integer gateway.invoke.retry.max_attempts from swarm.config.json');
  }
  if (!Number.isFinite(retryDelayMs)) {
    throw new Error('ACP monitor requires numeric gateway.invoke.retry.retry_delay_ms from swarm.config.json');
  }
  return { timeoutMs, maxRetries, retryDelayMs };
}

function assertGatewayStatusPolicy(policy: any, source: string) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!policy), () => (typeof policy !== 'object'))), () => (Array.isArray(policy)))) {
    throw new Error(`ACP monitor requires ${source} object from swarm.config.json`);
  }
  if (!Number.isFinite(policy.timeoutMs)) {
    throw new Error(`ACP monitor requires numeric ${source}.timeoutMs from swarm.config.json`);
  }
  if (!Number.isInteger(policy.maxRetries)) {
    throw new Error(`ACP monitor requires integer ${source}.maxRetries from swarm.config.json`);
  }
  if (!Number.isFinite(policy.retryDelayMs)) {
    throw new Error(`ACP monitor requires numeric ${source}.retryDelayMs from swarm.config.json`);
  }
  return policy;
}

function readGatewayStatusPolicy(config: AnyRecord = {}) {
  const statusPolicyKey = ['session', 'status'].join('_');
  return normalizeGatewayStatusPolicy(
    config?.gateway?.invoke?.[statusPolicyKey],
    config?.gateway?.invoke?.retry,
  );
}

export function getAcpMonitorConfig(input: AnyRecord = {}) {
  const src = input?.acp_monitor && typeof input.acp_monitor === 'object'
    ? input.acp_monitor
    : input;
  const errors: string[] = [];

  const pollLimit = readRequiredNonNegativeNumber(src, 'poll_limit', errors);
  const maxTranscriptExtensions = readRequiredNonNegativeNumber(src, 'max_transcript_extensions', errors);
  const transcriptGraceMs = readRequiredNonNegativeNumber(src, 'transcript_grace_ms', errors);
  const monitorPollMs = readRequiredNonNegativeNumber(src, 'monitor_poll_ms', errors);

  if (errors.length > 0) {
    throw new Error(`ACP monitor config invalid: ${errors.join('; ')}`);
  }

  return {
    pollLimit,
    maxTranscriptExtensions,
    transcriptGraceMs,
    monitorPollMs,
    poll_limit: pollLimit,
    max_transcript_extensions: maxTranscriptExtensions,
    transcript_grace_ms: transcriptGraceMs,
    monitor_poll_ms: monitorPollMs,
  };
}

// ── Transcript Classification ────────────────────────────────────────────────

export function classifyTranscriptText(text: any) {
  if (!text) return { kind: 'transcript_empty', detail: '' };
  const lower = String(text).toLowerCase();

  if (/rate limit|rate-limit|429|too many requests|retry after|quota exceeded|usage limit|usage-limit|usage cap|usage quota|quota limit/.test(lower)) {
    return { kind: 'rate_limited', detail: String(text).slice(0, 200) };
  }

  const hardErrorPatterns = [
    /acpx exited with code\s*[1-9]\d*/,
    /run failed/,
    /spawn failed/,
    /adapter command missing/,
    /command not found/,
  ];
  if (hardErrorPatterns.some((pattern) => pattern.test(lower))) {
    return { kind: 'hard_error', detail: String(text).slice(0, 200) };
  }

  return { kind: 'info', detail: String(text).slice(0, 200) };
}

// ── Transcript State ─────────────────────────────────────────────────────────

function normalizePreviousTranscriptState(prev: AnyRecord = {}) {
  const source = selectDefinedValue(() => (objectRecord(prev)), () => ({}));
  return assertValidAcpTranscriptState({
    offset: selectDefinedValue(() => (nonNegativeNumber(source.offset)), () => (0)),
    byteOffset: selectDefinedValue(() => (nonNegativeNumber(source.byteOffset)), () => (0)),
    eventCount: selectDefinedValue(() => (nonNegativeNumber(source.eventCount)), () => (0)),
    lastEventTs: selectDefinedValue(() => (source.lastEventTs), () => (null)),
    lastActivityPoll: selectDefinedValue(() => (nonNegativeNumber(source.lastActivityPoll)), () => (0)),
    hardError: source.hardError === true,
    rateLimited: source.rateLimited === true,
    terminal: source.terminal === true,
    lastDetail: typeof source.lastDetail === 'string' ? source.lastDetail : '',
    partialLine: typeof source.partialLine === 'string' ? source.partialLine : '',
    newLines: [],
  }) as AnyRecord;
}

export function readAcpTranscriptState(streamLogPath: any, prev: AnyRecord = {}) {
  const state: AnyRecord = normalizePreviousTranscriptState(prev);

  if (selectTruthyValue(() => (!streamLogPath), () => (!fs.existsSync(streamLogPath)))) return assertValidAcpTranscriptState(state);

  try {
    const stat = fs.statSync(streamLogPath);
    const fileSize = stat.size;

    if (fileSize < state.byteOffset) {
      state.byteOffset = 0;
      state.offset = 0;
      state.partialLine = '';
    }

    if (fileSize === state.byteOffset) {
      state.lastActivityPoll += 1;
      return state;
    }

    const start = state.byteOffset;
    const bytesToRead = Math.max(0, fileSize - start);
    const fd = fs.openSync(streamLogPath, 'r');
    let chunk = '';
    try {
      const buffer = Buffer.alloc(bytesToRead);
      if (bytesToRead > 0) fs.readSync(fd, buffer, 0, bytesToRead, start);
      chunk = buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }

    state.byteOffset = fileSize;

    const combined = `${state.partialLine}${chunk}`;
    const rawLines = combined.split('\n');
    if (combined.endsWith('\n')) {
      state.partialLine = '';
    } else {
      state.partialLine = selectDefinedValue(() => (rawLines.pop()), () => (''));
    }

    const newLines = rawLines.filter(Boolean);
    state.newLines = newLines;
    state.offset += newLines.length;

    if (newLines.length === 0) {
      state.lastActivityPoll = 0;
      return state;
    }

    state.eventCount += newLines.length;
    state.lastActivityPoll = 0;

    for (const line of newLines) {
      let evt;
      try { evt = JSON.parse(line); } catch (_error) { continue; }
      state.lastEventTs = selectDefinedValue(() => (evt.ts), () => (state.lastEventTs));

      if (evt.kind === 'lifecycle' && evt.phase === 'error') {
        const detail = selectDefinedValue(() => (selectDefinedValue(() => (evt?.data?.error), () => (evt?.text))), () => ('ACP lifecycle error'));
        const cls = classifyTranscriptText(detail);
        state.lastDetail = detail;
        if (cls.kind === 'rate_limited') state.rateLimited = true;
        else {
          state.hardError = true;
          state.terminal = true;
        }
      }
    }
  } catch (e) {
    state.lastDetail = `transcript-read-failed: ${(e as any).message}`;
  }

  return assertValidAcpTranscriptState(state);
}

export function transcriptShowsProgress(transcript: AnyRecord | null) {
  if (!transcript) return false;
  if (selectTruthyValue(() => (transcript.hardError), () => (transcript.terminal))) return false;
  return transcript.eventCount > 0 && transcript.lastActivityPoll === 0;
}

// ── Core state builder ───────────────────────────────────────────────────────

async function fetchSessionStatus(sessionKey: any, gatewayUrl: any, gatewayToken: any, opts: AnyRecord = {}) {
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

function buildMonitorState(childSessionKey: any, transcript: AnyRecord, sessionState: any, sessionActive: boolean, prev: AnyRecord, thresholds: AnyRecord, gateway: AnyRecord = {}): AnyRecord {
  const pollLimit = thresholds.pollLimit;
  if (!Number.isFinite(pollLimit)) {
    throw new Error('ACP monitor thresholds must be validated explicit config');
  }
  const unknownLike = isUnreachableSessionState(sessionState);
  const previousUnknownPolls = selectDefinedValue(() => (nonNegativeNumber(prev.unknownPolls)), () => (0));
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

async function getDirectAcpMonitorState(childSessionKey: any, streamLogPath: any, prev: AnyRecord = {}, opts: AnyRecord = {}): Promise<AnyRecord> {
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const monitorCfg = getAcpMonitorConfig(opts);
  const previousTranscript = selectDefinedValue(() => (objectRecord(prev.transcript)), () => ({}));
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
      sessionState = parsed.state;
      sessionActive = parsed.active;
      gatewayDetail = selectDefinedValue(() => (parsed.detail), () => (null));
      gatewayRateLimited = parsed.rateLimited === true;
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

function resolveTrackedAgent(sessionLabel: any) {
  return selectDefinedValue(() => (objectRecord(getTrackedAgent(sessionLabel))), () => ({}));
}

function looksLikeSessionKey(value: any) {
  return typeof value === 'string' && value.includes(':');
}

function resolveConfigSessionLabelOrKey(request: AnyRecord): string | null {
  const candidate = selectDefinedValue(() => (selectDefinedValue(() => (nonEmptyString(request.sessionLabelOrKey)), () => (nonEmptyString(request.sessionLabel)))), () => (nonEmptyString(request.sessionKey)));
  return candidate;
}

function resolveConfigTrackedAgent(request: AnyRecord, sessionLabelOrKey: string | null): AnyRecord {
  if (request.trackedAgent !== undefined && request.trackedAgent !== null) {
    return selectDefinedValue(() => (objectRecord(request.trackedAgent)), () => ({}));
  }
  if (!sessionLabelOrKey) return {};
  return resolveTrackedAgent(sessionLabelOrKey);
}

function resolveMonitorSessionKey(request: AnyRecord, trackedAgent: AnyRecord, sessionLabelOrKey: string | null): string | null {
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
    const previousState = selectDefinedValue(() => (objectRecord(request.previousState)), () => ({}));
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
  return getDirectAcpMonitorState(selectDefinedValue(() => (childSessionKey), () => (sessionKey)), streamLogPath, previousState, selectDefinedValue(() => (objectRecord(monitorOptions)), () => (monitorPolicy)));
}


// ── ACP Edge Event Adapter ───────────────────────────────────────────────────

function buildAcpEventIdentity(identity: AnyRecord = {}, childSessionKey: any = null) {
  return {
    ...identity,
    session_key: (selectDefinedValue(() => (identity.session_key), () => (null))),
  };
}

function sessionStateSignature(state: AnyRecord = {}) {
  return JSON.stringify({
    sessionKey: selectDefinedValue(() => (state.sessionKey), () => (null)),
    sessionState: selectDefinedValue(() => (state.sessionState), () => (null)),
    sessionActive: state.sessionActive === true,
    gatewayUnreachable: state.gatewayUnreachable === true,
    gatewayDetail: selectDefinedValue(() => (state.gatewayDetail), () => (null)),
    terminal: state.terminal === true,
    rateLimited: state.rateLimited === true,
    reason: selectDefinedValue(() => (state.reason), () => (null)),
    detail: selectDefinedValue(() => (state.detail), () => (null)),
    failed: state.failed === true,
    sessionTerminal: state.sessionTerminal === true,
    stopped: state.stopped === true,
  });
}

function buildSessionStatePayload(state: AnyRecord = {}) {
  return assertValidAcpSessionStateEventPayload({
    session_key: selectDefinedValue(() => (state.sessionKey), () => (null)),
    session_state: selectDefinedValue(() => (state.sessionState), () => (null)),
    session_active: state.sessionActive === true,
    gateway_unreachable: state.gatewayUnreachable === true,
    gateway_detail: selectDefinedValue(() => (state.gatewayDetail), () => (null)),
    terminal: state.terminal === true,
    rate_limited: state.rateLimited === true,
    reason: selectDefinedValue(() => (state.reason), () => (null)),
    detail: selectDefinedValue(() => (state.detail), () => (null)),
    monitor_state: state,
  });
}

function buildTranscriptDeltaPayload(state: AnyRecord = {}) {
  const transcript = selectDefinedValue(() => (objectRecord(state.transcript)), () => ({}));
  const newLines = Array.isArray(transcript.newLines) ? transcript.newLines : [];
  return assertValidAcpTranscriptDeltaEventPayload({
    session_key: selectTruthyValue(() => (state.sessionKey), () => (null)),
    new_lines: newLines,
    line_count: newLines.length,
    transcript_offset: selectDefinedValue(() => (transcript.offset), () => (null)),
    byte_offset: selectDefinedValue(() => (transcript.byteOffset), () => (null)),
    transcript,
    monitor_state: state,
  });
}

export function createAcpMonitorEventAdapter(childSessionKey: any, streamLogPath: any = null, opts: AnyRecord = {}) {
  const eventBus = opts.eventBus !== undefined ? opts.eventBus : createPipelineEventBus();
  const identity = buildAcpEventIdentity(selectDefinedValue(() => (objectRecord(opts.identity)), () => ({})), childSessionKey);
  const budget = selectDefinedValue(() => (opts.budget), () => (null));
  const controller = new AbortController();
  const signal = controller.signal;
  const externalSignal = selectDefinedValue(() => (opts.signal), () => (null));
  const monitorOpts = { ...(selectDefinedValue(() => (objectRecord(opts.monitorOpts)), () => (opts))), budget, signal };
  const monitorCfg = getAcpMonitorConfig(monitorOpts);
  const pollMs = opts.pollMs !== undefined ? opts.pollMs : monitorCfg.monitorPollMs;
  const getState: AnyFunction = selectDefinedValue(() => (opts.getAcpMonitorState), () => (((request: AnyRecord = {}) => getDirectAcpMonitorState(request.childSessionKey, request.streamLogPath, request.previousState, request.monitorOptions))));
  const stopOnTerminal = opts.stopOnTerminal !== false;
  let previousState: AnyRecord = selectDefinedValue(() => (objectRecord(opts.initialState)), () => ({}));
  let lastSessionSignature: string | null = null;
  let started = false;
  let donePromise: Promise<any> | null = null;

  const abortFromExternal = () => stop('external_abort');
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(selectDefinedValue(() => (externalSignal.reason), () => ('external_abort')));
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  function stop(reason = 'stopped') {
    if (!signal.aborted) controller.abort(reason);
  }

  function emitSessionState(state: AnyRecord) {
    const signature = sessionStateSignature(state);
    if (signature === lastSessionSignature) return false;
    lastSessionSignature = signature;
    eventBus.emit({
      type: 'acp.session.state',
      source: 'acp_gateway',
      identity,
      payload: buildSessionStatePayload(state),
    });
    return true;
  }

  function emitTranscriptDelta(state: AnyRecord) {
    const newLines = selectDefinedValue(() => (state?.transcript?.newLines), () => ([]));
    if (selectTruthyValue(() => (!Array.isArray(newLines)), () => (newLines.length === 0))) return false;
    eventBus.emit({
      type: 'acp.transcript.delta',
      source: 'acp_gateway',
      identity,
      payload: buildTranscriptDeltaPayload(state),
    });
    return true;
  }

  async function run() {
    try {
      while (!signal.aborted) {
        budget?.throwIfExhausted?.('acp_monitor_event_adapter_budget_exhausted');
        const state = await getState({
          childSessionKey,
          streamLogPath,
          previousState,
          monitorOptions: monitorOpts,
          budget,
          signal,
        });
        emitSessionState(state);
        emitTranscriptDelta(state);
        previousState = state;
        if (stopOnTerminal && state?.terminal === true) break;
        await sleep(pollMs, { budget, signal });
      }
      return { stopped: true, reason: signal.aborted ? 'aborted' : 'completed', state: previousState };
    } catch (error) {
      if (selectTruthyValue(() => (selectTruthyValue(() => (isBudgetExhaustedError(error)), () => ((error as any)?.name === 'AbortError'))), () => ((error as any)?.code === 'ABORT_ERR'))) {
        return { stopped: true, reason: isBudgetExhaustedError(error) ? 'budget_exhausted' : 'aborted', state: previousState, error };
      }
      eventBus.emit({
        type: 'fatal.error',
        source: 'acp_gateway',
        identity,
        payload: {
          adapter: 'acp_monitor',
          reason: 'acp_monitor_adapter_failed',
          error: errorMessage(error),
        },
      });
      throw error;
    } finally {
      if (externalSignal) externalSignal.removeEventListener?.('abort', abortFromExternal);
    }
  }

  function start() {
    if (started) return donePromise;
    started = true;
    donePromise = run();
    return donePromise;
  }

  return {
    eventBus,
    identity,
    get signal() { return signal; },
    get done() { return donePromise; },
    start,
    stop,
  };
}

export function monitorStateFromAcpEvent(event: AnyRecord = {}) {
  return selectTruthyValue(() => (event?.payload?.monitor_state), () => (null));
}

// ── Terminal Check ───────────────────────────────────────────────────────────

export function isSessionTerminal(stateOrLabel: any) {
  if (stateOrLabel && typeof stateOrLabel === 'object' && ['terminal', 'sessionState'].some(field => field in stateOrLabel)) {
    return !!stateOrLabel.terminal;
  }

  throw new TypeError('isSessionTerminal expects an ACP monitor state object; await getAcpMonitorState(...) for label or session-key checks');
}

function isBudgetOwnedPipelineEventAbort(error: any, budget: AnyRecord) {
  return error?.code === 'PIPELINE_EVENT_WAIT_ABORTED'
    && budget?.signal?.aborted
    && isBudgetExhaustedError(budget.signal.reason);
}

// ── Wait for Idle ────────────────────────────────────────────────────────────

export async function waitForSessionIdle(childSessionKey: any, opts: AnyRecord = {}) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!opts), () => (typeof opts !== 'object'))), () => (Array.isArray(opts)))) {
    throw new TypeError('waitForSessionIdle requires an options object with acp_monitor policy fields');
  }

  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const monitorCfg = getAcpMonitorConfig(opts);
  if (selectTruthyValue(() => (!Number.isFinite(opts.extraGraceMs)), () => (opts.extraGraceMs < 0))) {
    throw new Error('waitForSessionIdle requires explicit extraGraceMs from swarm.config.json');
  }
  if (selectTruthyValue(() => (!Number.isFinite(opts.totalTimeoutMs)), () => (opts.totalTimeoutMs <= 0))) {
    throw new Error('waitForSessionIdle requires explicit totalTimeoutMs from swarm.config.json');
  }
  const extraGraceMs = opts.extraGraceMs;
  const totalTimeoutMs = opts.totalTimeoutMs;
  const budget = opts.budget !== undefined ? opts.budget : createBudget({ timeoutMs: totalTimeoutMs, signal: opts.signal, label: 'acp-session-idle' });
  const eventBus = opts.eventBus !== undefined ? opts.eventBus : createPipelineEventBus();
  const pollMs = opts.pollMs !== undefined ? opts.pollMs : monitorCfg.monitorPollMs;
  const adapter = createAcpMonitorEventAdapter(childSessionKey, selectDefinedValue(() => (opts.streamLogPath), () => (null)), {
    eventBus,
    identity: buildAcpEventIdentity(selectDefinedValue(() => (objectRecord(opts.identity)), () => ({})), childSessionKey),
    budget,
    pollMs,
    monitorOpts: {
      ...monitorCfg,
      gatewayUrl,
      gatewayToken,
      gatewayStatusPolicy: opts.gatewayStatusPolicy,
    },
    stopOnTerminal: false,
  });

  let monitorState: AnyRecord = {};
  adapter.start();

  async function waitForMonitorEvent(timeoutMs: number | null = null) {
    return waitForAny(eventBus, ['acp.session.state', 'acp.transcript.delta'], adapter.identity, {
      signal: budget.signal,
      budget,
      timeoutMs,
    });
  }

  try {
    while (budget.remainingMs() > 0) {
      let event;
      try {
        event = await waitForMonitorEvent(budget.remainingMs());
      } catch (error) {
        if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (isBudgetExhaustedError(error)), () => ((error as any)?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'))), () => (isBudgetOwnedPipelineEventAbort(error, budget)))), () => (((error as any)?.code === 'PIPELINE_EVENT_WAIT_ABORTED' && budget.remainingMs() <= 0)))) break;
        throw error;
      }

      const eventState = monitorStateFromAcpEvent(event);
      if (eventState) monitorState = eventState;
      if (!monitorState?.sessionState) continue;

      const transcriptActive = transcriptShowsProgress(monitorState.transcript as AnyRecord);
      const sessionState = monitorState.sessionState;

      if (isSessionTerminalState(sessionState)) {
        log('DEBUG', `Session already ${sessionState} - no grace needed`);
        return;
      }

      if (isUnreachableSessionState(sessionState) && !transcriptActive) {
        log('DEBUG', `Session already ${sessionState} - no grace needed`);
        return;
      }

      if (!monitorState.sessionActive && !isUnreachableSessionState(sessionState)) {
        log('DEBUG', `Session ${sessionState} - waiting ${extraGraceMs / 1000}s grace period for thread summary`);
        try {
          const graceEvent = await waitForMonitorEvent(Math.min(extraGraceMs, budget.remainingMs()));
          const graceState = monitorStateFromAcpEvent(graceEvent);
          if (graceState) monitorState = graceState;
          continue;
        } catch (error) {
          if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (isBudgetExhaustedError(error)), () => ((error as any)?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT'))), () => (isBudgetOwnedPipelineEventAbort(error, budget)))), () => (((error as any)?.code === 'PIPELINE_EVENT_WAIT_ABORTED' && budget.remainingMs() <= 0)))) return;
          throw error;
        }
      }
    }
  } finally {
    adapter.stop('waitForSessionIdle_done');
    await adapter.done?.catch?.(() => {});
  }

  log('DEBUG', `Grace timeout (${totalTimeoutMs / 1000}s) - proceeding with kill`);
}

export {
  ACP_MONITOR_REASONS,
  parseSessionState,
  isSessionTerminalState,
  isStoppedSessionState,
  isUnreachableSessionState,
};
