import fs from 'node:fs';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { assertValidAcpTranscriptState } from '../services/acp-gateway-contract.js';
import { writeRuntimeLog } from '../runtime-log.js';
declare const Buffer: any;
type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;
function log(level: any, msg: any) { writeRuntimeLog(String(level).toLowerCase() as 'debug' | 'info' | 'warn' | 'error', 'common/acp-monitor', String(msg)); }

const _transcriptRateLimits = new Map(); // agentLabel -> { count, windowStart }
const TRANSCRIPT_MAX_PER_SEC = 5;
const VALID_LINE_KINDS = new Set(['assistant', 'assistant_delta', 'tool_call', 'tool_result', 'system_event', 'lifecycle', 'thinking', 'info']);

export function transcriptRateLimitFor(agentLabel: string, now: number): AnyRecord {
  const existing = objectRecord(_transcriptRateLimits.get(agentLabel));
  if (existing) return existing;
  return { count: 0, windowStart: now };
}

export function objectRecord(value: any): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function objectRecordOrEmpty(value: unknown): AnyRecord {
  const record = objectRecord(value);
  return record === null ? {} : record;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'missing_error_detail');
}

export function nonEmptyString(value: any): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function requiredNonEmptyString(value: any, label: string): string {
  const text = nonEmptyString(value);
  if (!text) throw new Error(`ACP monitor requires explicit ${label}`);
  return text;
}

export function nonNegativeNumber(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function publishTranscriptDelta(ctx: any, identity: AnyRecord, newLines: string[], emitFn: AnyFunction | null) {
  if (emitFn === null || newLines.length === 0) return;

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

export function readRequiredNonNegativeNumber(src: AnyRecord, snakeKey: string, errors: string[]) {
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

export function requireConfigObject(value: any, source: string) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))), () => (Array.isArray(value)))) {
    throw new Error(`ACP monitor requires ${source} object from swarm.config.json`);
  }
  return value;
}

export function normalizeGatewayStatusPolicy(statusPolicy: any, retryPolicy: any) {
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

export function assertGatewayStatusPolicy(policy: any, source: string) {
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

export function readGatewayStatusPolicy(config: AnyRecord = {}) {
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

export function normalizePreviousTranscriptState(prev: AnyRecord = {}) {
  const source = objectRecordOrEmpty(prev);
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

function readTranscriptChunk(streamLogPath: string, state: AnyRecord, fileSize: number) {
  const start = state.byteOffset;
  const bytesToRead = Math.max(0, fileSize - start);
  const fd = fs.openSync(streamLogPath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    if (bytesToRead > 0) fs.readSync(fd, buffer, 0, bytesToRead, start);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function splitTranscriptLines(state: AnyRecord, chunk: string) {
  const combined = `${state.partialLine}${chunk}`;
  const rawLines = combined.split('\n');
  state.partialLine = combined.endsWith('\n')
    ? ''
    : selectDefinedValue(() => (rawLines.pop()), () => (''));
  return rawLines.filter(Boolean);
}

function applyTranscriptEvent(state: AnyRecord, line: string) {
  let event;
  try {
    event = JSON.parse(line);
  } catch (_error) {
    /* INTENTIONAL_NONCRITICAL(optional_probe_failed): non-JSON transcript lines do not carry lifecycle state. */
    return;
  }
  state.lastEventTs = selectDefinedValue(() => (event.ts), () => (state.lastEventTs));
  if (event.kind !== 'lifecycle' || event.phase !== 'error') return;

  const detail = selectDefinedValue(
    () => (selectDefinedValue(() => (event?.data?.error), () => (event?.text))),
    () => ('ACP lifecycle error'),
  );
  state.lastDetail = detail;
  if (classifyTranscriptText(detail).kind === 'rate_limited') {
    state.rateLimited = true;
    return;
  }
  state.hardError = true;
  state.terminal = true;
}

export function readAcpTranscriptState(streamLogPath: any, prev: AnyRecord = {}): AnyRecord {
  const state: AnyRecord = normalizePreviousTranscriptState(prev);
  if (selectTruthyValue(() => (!streamLogPath), () => (!fs.existsSync(streamLogPath)))) return assertValidAcpTranscriptState(state) as AnyRecord;

  try {
    const fileSize = fs.statSync(streamLogPath).size;
    if (fileSize < state.byteOffset) {
      state.byteOffset = 0;
      state.offset = 0;
      state.partialLine = '';
    }
    if (fileSize === state.byteOffset) {
      state.lastActivityPoll += 1;
      return state;
    }

    const chunk = readTranscriptChunk(streamLogPath, state, fileSize);
    state.byteOffset = fileSize;
    const newLines = splitTranscriptLines(state, chunk);
    state.newLines = newLines;
    state.offset += newLines.length;
    if (newLines.length === 0) {
      state.lastActivityPoll = 0;
      return state;
    }

    state.eventCount += newLines.length;
    state.lastActivityPoll = 0;
    newLines.forEach((line: string) => applyTranscriptEvent(state, line));
  } catch (e) {
    state.lastDetail = `transcript-read-failed: ${(e as any).message}`;
  }

  return assertValidAcpTranscriptState(state) as AnyRecord;
}

export function transcriptShowsProgress(transcript: AnyRecord | null) {
  if (!transcript) return false;
  if (selectTruthyValue(() => (transcript.hardError), () => (transcript.terminal))) return false;
  return transcript.eventCount > 0 && transcript.lastActivityPoll === 0;
}

// ── Core state builder ───────────────────────────────────────────────────────
