import fs from 'fs';
import { fileURLToPath } from 'url';
import { gatewayInvoke, resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.js';
import {
  ACP_MONITOR_REASONS,
  isSessionTerminalState,
  isStoppedSessionState,
  isUnreachableSessionState,
} from './session-semantics.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function log(level, msg) {
  console.log(`[ACP-MONITOR] [${level}] ${msg}`);
}

// ── Transcript delta publishing ──────────────────────────────────────────────
// Rate limiter: max 5 events per second per agent session.

const _transcriptRateLimits = new Map(); // agentLabel -> { count, windowStart }
const TRANSCRIPT_MAX_PER_SEC = 5;
const VALID_LINE_KINDS = new Set(['assistant', 'assistant_delta', 'tool_call', 'tool_result', 'system_event', 'lifecycle', 'thinking', 'info']);

export function publishTranscriptDelta(ctx, identity, newLines, emitFn) {
  const agentLabel = identity?.label || null;
  const moduleId = identity?.module_id ?? null;
  const gateId = identity?.gate_id ?? null;
  const gateType = identity?.gate_type ?? null;
  const sessionKey = identity?.session_key ?? null;
  const dispatchId = identity?.dispatch_id ?? null;
  const agentType = identity?.agent_type || agentLabel?.split('-')[0] || 'forge';

  if (!emitFn || !newLines || newLines.length === 0) return;

  const now = Date.now();
  const rl = _transcriptRateLimits.get(agentLabel) || { count: 0, windowStart: now };

  if (now - rl.windowStart >= 1000) {
    rl.count = 0;
    rl.windowStart = now;
  }

  const wouldExceed = (rl.count + newLines.length) > TRANSCRIPT_MAX_PER_SEC;

  if (wouldExceed) {
    const texts = newLines.map(l => {
      try { const e = JSON.parse(l); return e?.text || l; } catch { return l; }
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
      try { evt = JSON.parse(line); } catch { evt = null; }
      const rawKind = evt?.kind;
      const kind = rawKind && VALID_LINE_KINDS.has(rawKind) ? rawKind : 'info';
      const text = evt?.text || evt?.data?.text || line;
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
        transcript_offset: evt?.offset ?? null,
      });
      rl.count++;
    }
  }

  _transcriptRateLimits.set(agentLabel, rl);
}

// ── Session State ────────────────────────────────────────────────────────────

export function parseSessionState(statusResult) {
  if (!statusResult) return { active: false, state: 'unknown' };

  const acpState = statusResult?.acp?.state || statusResult?.state || statusResult?.status || null;
  if (acpState) {
    const active = /^(running|creating|cancelling)$/i.test(acpState);
    return { active, state: String(acpState).toLowerCase() };
  }

  const statusText = statusResult?.statusText || statusResult?.raw || '';
  if (statusText) {
    if (/\b(closed|error)\b/i.test(statusText)) {
      const m = statusText.match(/\b(closed|error)\b/i);
      return { active: false, state: m?.[1]?.toLowerCase() || 'unknown' };
    }
    if (/Queue:\s*running/i.test(statusText)) return { active: true, state: 'running' };
    if (/Queue:\s*collect/i.test(statusText)) return { active: false, state: 'idle' };
    return { active: false, state: `unknown (${statusText.slice(0, 80)})` };
  }

  return { active: false, state: 'unknown' };
}

// ── Config ───────────────────────────────────────────────────────────────────

export function getAcpMonitorConfig(input = {}) {
  const src = input?.acp_monitor && typeof input.acp_monitor === 'object'
    ? input.acp_monitor
    : input;

  const unknownPollLimit = src?.unknown_poll_limit ?? src?.unknownPollLimit ?? 10;
  const stalePollLimit = src?.stale_poll_limit ?? src?.stalePollLimit ?? 10;
  const maxTranscriptExtensions = src?.max_transcript_extensions ?? src?.maxTranscriptExtensions ?? 3;
  const transcriptGraceMs = src?.transcript_grace_ms ?? src?.transcriptGraceMs ?? 300000;
  const monitorPollMs = src?.monitor_poll_ms ?? src?.monitorPollMs ?? 10000;

  return {
    unknownPollLimit,
    stalePollLimit,
    maxTranscriptExtensions,
    transcriptGraceMs,
    monitorPollMs,
    unknown_poll_limit: unknownPollLimit,
    stale_poll_limit: stalePollLimit,
    max_transcript_extensions: maxTranscriptExtensions,
    transcript_grace_ms: transcriptGraceMs,
    monitor_poll_ms: monitorPollMs,
  };
}

// ── Transcript Classification ────────────────────────────────────────────────

export function classifyTranscriptText(text) {
  if (!text) return { kind: 'unknown', detail: '' };
  const lower = String(text).toLowerCase();

  if (/rate limit|rate-limit|429|too many requests|retry after|quota exceeded/.test(lower)) {
    return { kind: 'rate_limited', detail: String(text).slice(0, 200) };
  }

  if (
    /acpx exited with code\s*[1-9]\d*/.test(lower)
    || /run failed/.test(lower)
    || /spawn failed/.test(lower)
    || /adapter command missing/.test(lower)
    || /command not found/.test(lower)
  ) {
    return { kind: 'hard_error', detail: String(text).slice(0, 200) };
  }

  return { kind: 'info', detail: String(text).slice(0, 200) };
}

// ── Transcript State ─────────────────────────────────────────────────────────

export function readAcpTranscriptState(streamLogPath, prev = {}) {
  const state = {
    offset: prev.offset ?? 0,
    byteOffset: prev.byteOffset ?? 0,
    eventCount: prev.eventCount ?? 0,
    lastEventTs: prev.lastEventTs ?? null,
    lastActivityPoll: prev.lastActivityPoll ?? 0,
    hardError: prev.hardError ?? false,
    rateLimited: prev.rateLimited ?? false,
    terminal: prev.terminal ?? false,
    lastDetail: prev.lastDetail ?? '',
    partialLine: prev.partialLine ?? '',
    newLines: [],
  };

  if (!streamLogPath || !fs.existsSync(streamLogPath)) return state;

  try {
    const stat = fs.statSync(streamLogPath);
    const fileSize = stat.size;

    if (fileSize < state.byteOffset) {
      state.byteOffset = 0;
      state.offset = 0;
      state.partialLine = '';
    }

    if (fileSize === state.byteOffset) {
      state.lastActivityPoll = (prev.lastActivityPoll || 0) + 1;
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
      state.partialLine = rawLines.pop() || '';
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
      try { evt = JSON.parse(line); } catch { continue; }
      state.lastEventTs = evt.ts || state.lastEventTs;

      if (evt.kind === 'lifecycle' && evt.phase === 'error') {
        const detail = evt?.data?.error || evt?.text || 'ACP lifecycle error';
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
    state.lastDetail = `transcript-read-failed: ${e.message}`;
  }

  return state;
}

export function transcriptShowsProgress(transcript) {
  if (!transcript) return false;
  if (transcript.hardError || transcript.terminal) return false;
  return transcript.eventCount > 0 && transcript.lastActivityPoll === 0;
}

// ── Core state builder ───────────────────────────────────────────────────────

async function fetchSessionStatus(sessionKey, gatewayUrl, gatewayToken) {
  return gatewayInvoke('session_status', { sessionKey }, 10000, {
    gatewayUrl,
    gatewayToken,
  });
}

function buildMonitorState(childSessionKey, transcript, sessionState, sessionActive, prev = {}, thresholds = {}, gateway = {}) {
  const unknownPollLimit = thresholds.unknownPollLimit ?? 10;
  const stalePollLimit = thresholds.stalePollLimit ?? 10;
  const unknownLike = isUnreachableSessionState(sessionState);
  const unknownPolls = unknownLike ? ((prev.unknownPolls || 0) + 1) : 0;
  const staleExceeded = transcript.lastActivityPoll >= stalePollLimit;
  const unknownExceeded = unknownPolls >= unknownPollLimit;
  const gatewayUnreachable = gateway.gatewayUnreachable === true;
  const gatewayDetail = gateway.gatewayDetail || null;

  let terminal = false;
  let reason = null;

  if (transcript.rateLimited) {
    reason = ACP_MONITOR_REASONS.RATE_LIMITED;
  } else if (transcript.hardError || transcript.terminal) {
    terminal = true;
    reason = ACP_MONITOR_REASONS.TRANSCRIPT_ERROR;
  } else if (isSessionTerminalState(sessionState)) {
    terminal = true;
    reason = ACP_MONITOR_REASONS.SESSION_TERMINAL;
  } else if (unknownExceeded && staleExceeded) {
    terminal = true;
    reason = ACP_MONITOR_REASONS.UNKNOWN_STALE_TIMEOUT;
  }

  const detail = transcript.lastDetail || gatewayDetail || sessionState;
  const sessionTerminal = isSessionTerminalState(sessionState);
  const stopped = !sessionActive && (isStoppedSessionState(sessionState) || isUnreachableSessionState(sessionState));

  return {
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
  };
}

async function getDirectAcpMonitorState(childSessionKey, streamLogPath, prev = {}, opts = {}) {
  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const monitorCfg = getAcpMonitorConfig(opts);
  const transcript = readAcpTranscriptState(streamLogPath, prev.transcript || {});

  let sessionState = 'no_session_key';
  let sessionActive = false;
  let gatewayUnreachable = false;
  let gatewayDetail = null;

  if (childSessionKey && gatewayUrl) {
    try {
      const raw = await fetchSessionStatus(childSessionKey, gatewayUrl, gatewayToken);
      const statusResult = raw?.result?.details || raw;
      const parsed = parseSessionState(statusResult);
      sessionState = parsed.state;
      sessionActive = parsed.active;
    } catch (err) {
      gatewayUnreachable = true;
      gatewayDetail = err?.message || 'session status unreachable';
      if (transcriptShowsProgress(transcript)) {
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
  });
}

async function resolveTrackedAgent(sessionLabel) {
  try {
    const lifecycleUrl = new URL('./lifecycle.js', import.meta.url);
    const lifecyclePath = fileURLToPath(lifecycleUrl);
    if (!fs.existsSync(lifecyclePath)) return {};
    // Justified dynamic import: acp-monitor and lifecycle depend on each other, so this
    // stays lazy to avoid turning the shared monitor/lifecycle boundary into a hard ESM cycle.
    const mod = await import(lifecycleUrl.href);
    return typeof mod?.getTrackedAgent === 'function' ? (mod.getTrackedAgent(sessionLabel) || {}) : {};
  } catch {
    return {};
  }
}

function looksLikeSessionKey(value) {
  return typeof value === 'string' && value.includes(':');
}

function isNovaSignature(args) {
  return args.length >= 2 && args[0] && typeof args[0] === 'object' && typeof args[1] === 'string';
}

export async function getAcpMonitorState(...args) {
  if (isNovaSignature(args)) {
    const [config, sessionLabelOrKey, prevOrStream = {}, maybeStreamLogPath = null] = args;
    const entry = (typeof prevOrStream === 'string' || prevOrStream === null)
      ? {}
      : await resolveTrackedAgent(sessionLabelOrKey);
    const prev = (typeof prevOrStream === 'string' || prevOrStream === null) ? {} : (prevOrStream || {});
    const streamLogPath = (typeof prevOrStream === 'string' || prevOrStream === null)
      ? (prevOrStream || maybeStreamLogPath || null)
      : (entry?.streamLogPath || maybeStreamLogPath || null);
    const sessionKey = entry?.sessionKey || (looksLikeSessionKey(sessionLabelOrKey) ? sessionLabelOrKey : null);
    const monitorCfg = getAcpMonitorConfig(config);
    return getDirectAcpMonitorState(sessionKey, streamLogPath, prev, {
      unknownPollLimit: monitorCfg.unknownPollLimit,
      stalePollLimit: monitorCfg.stalePollLimit,
    });
  }

  const [childSessionKey, streamLogPath, prev = {}, opts = {}] = args;
  return getDirectAcpMonitorState(childSessionKey, streamLogPath, prev, opts);
}

// ── Terminal Check ───────────────────────────────────────────────────────────

export function isSessionTerminal(stateOrLabel, prev = {}, config = {}) {
  if (stateOrLabel && typeof stateOrLabel === 'object' && ('terminal' in stateOrLabel || 'sessionState' in stateOrLabel)) {
    return !!stateOrLabel.terminal;
  }

  return (async () => {
    const mon = await getAcpMonitorState(config, stateOrLabel, prev);
    return {
      terminal: mon.terminal,
      state: mon.sessionState,
      reason: mon.reason,
      detail: mon.detail,
      next: mon,
    };
  })();
}

// ── Wait for Idle ────────────────────────────────────────────────────────────

export async function waitForSessionIdle(childSessionKey, optsOrGraceMs = {}, maybeTimeoutMs = 600000) {
  const opts = (optsOrGraceMs && typeof optsOrGraceMs === 'object')
    ? optsOrGraceMs
    : { extraGraceMs: optsOrGraceMs, totalTimeoutMs: maybeTimeoutMs };

  const gatewayUrl = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = resolveGatewayToken(opts.gatewayToken);
  const monitorCfg = getAcpMonitorConfig(opts);
  const extraGraceMs = opts.extraGraceMs ?? 120000;
  const totalTimeoutMs = opts.totalTimeoutMs ?? 600000;
  const pollMs = opts.pollMs ?? monitorCfg.monitorPollMs;
  const maxTranscriptExtensions = opts.maxTranscriptExtensions ?? monitorCfg.maxTranscriptExtensions;
  const transcriptGraceMs = opts.transcriptGraceMs ?? monitorCfg.transcriptGraceMs;

  let deadline = Date.now() + totalTimeoutMs;
  let transcriptExtensions = 0;
  let monitorState = {};

  while (Date.now() < deadline) {
    monitorState = await getAcpMonitorState(childSessionKey, opts.streamLogPath || null, monitorState, {
      gatewayUrl,
      gatewayToken,
      unknownPollLimit: monitorCfg.unknownPollLimit,
      stalePollLimit: monitorCfg.stalePollLimit,
    });

    const transcriptActive = transcriptShowsProgress(monitorState.transcript);
    const transcriptGraceActive = transcriptExtensions > 0;
    const sessionState = monitorState.sessionState;

    if (isSessionTerminalState(sessionState)) {
      log('DEBUG', `Session already ${sessionState} - no grace needed`);
      return;
    }

    if (isUnreachableSessionState(sessionState) && !transcriptActive && !transcriptGraceActive) {
      log('DEBUG', `Session already ${sessionState} - no grace needed`);
      return;
    }

    if (!monitorState.sessionActive && !isUnreachableSessionState(sessionState)) {
      log('DEBUG', `Session ${sessionState} - waiting ${extraGraceMs / 1000}s grace period for thread summary`);
      await sleep(Math.min(extraGraceMs, Math.max(0, deadline - Date.now())));
      return;
    }

    if (transcriptActive && transcriptExtensions < maxTranscriptExtensions) {
      const remaining = deadline - Date.now();
      if (remaining < transcriptGraceMs) {
        deadline = Date.now() + transcriptGraceMs;
        transcriptExtensions++;
        log('DEBUG', `Transcript active - extended deadline by ${transcriptGraceMs / 1000}s (extension ${transcriptExtensions}/${maxTranscriptExtensions})`);
      }
    }

    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }

  log('DEBUG', `Grace timeout (${totalTimeoutMs / 1000}s) - proceeding with kill`);
}

export {
  ACP_MONITOR_REASONS,
  isSessionTerminalState,
  isStoppedSessionState,
  isUnreachableSessionState,
};
