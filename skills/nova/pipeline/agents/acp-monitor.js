import fs from 'fs';
import { gatewayInvoke } from '../integrations/gateway.js';
import { log } from '../core/logger.js';
import { getTrackedAgent } from './shutdown.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function parseSessionState(statusResult) {
  if (!statusResult) return { active: false, state: 'unknown' };

  const acpState = statusResult?.acp?.state || statusResult?.state || null;
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

export function getAcpMonitorConfig(config) {
  return {
    unknown_poll_limit: config.acp_monitor?.unknown_poll_limit ?? 10,
    stale_poll_limit: config.acp_monitor?.stale_poll_limit ?? 10,
  };
}

export function classifyTranscriptText(text) {
  if (!text) return { kind: 'unknown', detail: '' };
  const lower = String(text).toLowerCase();

  if (/rate limit|rate-limit|429|too many requests|retry after|quota exceeded/.test(lower)) {
    return { kind: 'rate_limited', detail: String(text).slice(0, 200) };
  }

  if (
    /acpx exited with code\s*[1-9]\d*/.test(lower) ||
    /run failed/.test(lower) ||
    /spawn failed/.test(lower) ||
    /adapter command missing/.test(lower) ||
    /command not found/.test(lower)
  ) {
    return { kind: 'hard_error', detail: String(text).slice(0, 200) };
  }

  return { kind: 'info', detail: String(text).slice(0, 200) };
}

export function readAcpTranscriptState(streamLogPath, prev = {}) {
  const state = {
    offset: prev.offset ?? 0,
    eventCount: prev.eventCount ?? 0,
    lastEventTs: prev.lastEventTs ?? null,
    lastActivityPoll: prev.lastActivityPoll ?? 0,
    hardError: prev.hardError ?? false,
    rateLimited: prev.rateLimited ?? false,
    terminal: prev.terminal ?? false,
    lastDetail: prev.lastDetail ?? '',
  };

  if (!streamLogPath || !fs.existsSync(streamLogPath)) return state;

  try {
    const lines = fs.readFileSync(streamLogPath, 'utf8').split('\n').filter(Boolean);
    const newLines = lines.slice(state.offset);
    state.offset = lines.length;

    if (newLines.length === 0) {
      state.lastActivityPoll = (prev.lastActivityPoll || 0) + 1;
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

      if (evt.kind === 'system_event' || evt.kind === 'assistant_delta' || evt.kind === 'assistant') {
        const eventText = evt.text || evt.delta || '';
        const cls = classifyTranscriptText(eventText);
        if (cls.kind === 'rate_limited') {
          state.rateLimited = true;
          state.lastDetail = cls.detail;
        } else if (cls.kind === 'hard_error') {
          state.hardError = true;
          state.terminal = true;
          state.lastDetail = cls.detail;
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

export async function getAcpMonitorState(config, sessionLabel, prev = {}) {
  const monitorCfg = getAcpMonitorConfig(config);
  const entry = getTrackedAgent(sessionLabel) || {};
  const sessionKey = entry?.sessionKey || null;
  const transcript = readAcpTranscriptState(entry?.streamLogPath, prev.transcript || {});

  let sessionState = 'no_session_key';
  let sessionActive = false;
  try {
    if (sessionKey) {
      const raw = await gatewayInvoke('session_status', { sessionKey }, 10000);
      const statusResult = raw?.result?.details || raw;
      const parsed = parseSessionState(statusResult);
      sessionState = parsed.state;
      sessionActive = parsed.active;
    }
  } catch {
    if (transcriptShowsProgress(transcript)) {
      sessionState = 'running';
      sessionActive = true;
    } else {
      sessionState = 'unreachable';
      sessionActive = false;
    }
  }

  const unknownLike = /^(unknown|unreachable|no_session_key)/i.test(sessionState);
  const unknownPolls = unknownLike ? ((prev.unknownPolls || 0) + 1) : 0;
  const staleExceeded = transcript.lastActivityPoll >= monitorCfg.stale_poll_limit;
  const unknownExceeded = unknownPolls >= monitorCfg.unknown_poll_limit;

  let terminal = false;
  let reason = null;

  if (transcript.rateLimited) {
    reason = 'rate_limited';
  } else if (transcript.hardError || transcript.terminal) {
    terminal = true;
    reason = 'transcript_error';
  } else if (/^(closed|error)$/i.test(sessionState)) {
    terminal = true;
    reason = 'session_terminal';
  } else if (unknownExceeded && staleExceeded) {
    terminal = true;
    reason = 'unknown_stale_timeout';
  }

  return {
    sessionKey,
    sessionState,
    sessionActive,
    transcript,
    unknownPolls,
    transcriptStalePolls: transcript.lastActivityPoll,
    terminal,
    rateLimited: reason === 'rate_limited',
    reason,
    detail: transcript.lastDetail || sessionState,
  };
}

export async function isSessionTerminal(sessionLabel, prev = {}, config = {}) {
  const mon = await getAcpMonitorState(config, sessionLabel, prev);
  return {
    terminal: mon.terminal,
    state: mon.sessionState,
    reason: mon.reason,
    detail: mon.detail,
    next: mon,
  };
}

export async function waitForSessionIdle(sessionKey, extraGraceMs = 120000, totalTimeoutMs = 600000) {
  const deadline = Date.now() + totalTimeoutMs;
  const pollMs = 10000;

  while (Date.now() < deadline) {
    try {
      const raw = await gatewayInvoke('session_status', { sessionKey }, 10000);
      const statusResult = raw?.result?.details || raw;
      const { active, state } = parseSessionState(statusResult);

      if (/^(closed|error)$/i.test(state) || state === 'unknown' || state === 'unreachable') {
        log('DEBUG', `Session already ${state} — no grace needed`);
        return;
      }

      if (!active) {
        log('DEBUG', `Session ${state} — waiting ${extraGraceMs / 1000}s grace period for thread summary`);
        await sleep(Math.min(extraGraceMs, Math.max(0, deadline - Date.now())));
        return;
      }
    } catch {
      return;
    }
    await sleep(pollMs);
  }

  log('DEBUG', `Grace timeout (${totalTimeoutMs / 1000}s) — proceeding with kill`);
}
