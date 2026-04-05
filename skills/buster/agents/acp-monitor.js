// ═══════════════════════════════════════════════════════════════
// ACP Monitor — Buster Edition
// ═══════════════════════════════════════════════════════════════
//
// Adapted from pipeline/agents/acp-monitor.js for the buster pod.
//
// Key differences from pipeline version:
//   - Uses direct fetch() to GATEWAY_URL instead of gatewayInvoke()
//   - Config via function parameters with defaults, not PipelineContext
//   - No dependency on pipeline/integrations/gateway.js
//   - Supports transcript-aware deadline extension in waitForSessionIdle()
//
// This is a copy-and-own module. Buster runs on a separate pod and
// cannot import pipeline code.

import fs from 'fs';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function log(level, msg) {
  console.log(`[ACP-MONITOR] [${level}] ${msg}`);
}

// ── Session State ────────────────────────────────────────────────

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

// ── Config ───────────────────────────────────────────────────────

export function getAcpMonitorConfig(overrides = {}) {
  return {
    maxTranscriptExtensions: overrides.max_transcript_extensions ?? overrides.maxTranscriptExtensions ?? 3,
    transcriptGraceMs:       overrides.transcript_grace_ms       ?? overrides.transcriptGraceMs       ?? 300000,
    unknownPollLimit:        overrides.unknown_poll_limit         ?? overrides.unknownPollLimit         ?? 10,
    stalePollLimit:          overrides.stale_poll_limit           ?? overrides.stalePollLimit           ?? 10,
    monitorPollMs:           overrides.monitor_poll_ms            ?? overrides.monitorPollMs            ?? 10000,
  };
}

// ── Transcript Classification ────────────────────────────────────

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

// ── Transcript State ─────────────────────────────────────────────

export function readAcpTranscriptState(streamLogPath, prev = {}) {
  const state = {
    offset:           prev.offset           ?? 0,
    eventCount:       prev.eventCount       ?? 0,
    lastEventTs:      prev.lastEventTs      ?? null,
    lastActivityPoll: prev.lastActivityPoll ?? 0,
    hardError:        prev.hardError        ?? false,
    rateLimited:      prev.rateLimited      ?? false,
    terminal:         prev.terminal         ?? false,
    lastDetail:       prev.lastDetail       ?? '',
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

      // NOTE: system_event and assistant text are NOT classified for rate limits.
      // They reflect agent work output and cause false positives. Only lifecycle
      // errors (above) are trustworthy.
    }
  } catch (e) {
    state.lastDetail = `transcript-read-failed: ${e.message}`;
  }

  return state;
}

function transcriptShowsProgress(transcript) {
  if (!transcript) return false;
  if (transcript.hardError || transcript.terminal) return false;
  return transcript.eventCount > 0 && transcript.lastActivityPoll === 0;
}

// ── Gateway ──────────────────────────────────────────────────────
//
// Buster has no access to pipeline/integrations/gateway.js.
// We invoke the gateway directly via fetch().

async function fetchSessionStatus(sessionKey, gatewayUrl, gatewayToken) {
  const url = `${gatewayUrl}/session_status`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(gatewayToken ? { 'Authorization': `Bearer ${gatewayToken}` } : {}),
    },
    body: JSON.stringify({ sessionKey }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
  return res.json();
}

// ── Monitor State ────────────────────────────────────────────────

/**
 * Get the current ACP monitor state for a child session.
 *
 * @param {string} childSessionKey  - ACP session key to query
 * @param {string} streamLogPath    - Path to the session's stream log (JSONL)
 * @param {object} prev             - Previous monitor state (for poll counters)
 * @param {object} opts
 * @param {string} opts.gatewayUrl       - Gateway base URL (default: GATEWAY_URL env)
 * @param {string} opts.gatewayToken     - Gateway bearer token (default: GATEWAY_TOKEN env)
 * @param {number} opts.unknownPollLimit - Consecutive unknown polls before timeout (default: 10)
 * @param {number} opts.stalePollLimit   - Stale transcript polls before timeout (default: 10)
 */
export async function getAcpMonitorState(childSessionKey, streamLogPath, prev = {}, opts = {}) {
  const gatewayUrl     = opts.gatewayUrl     || process.env.GATEWAY_URL;
  const gatewayToken   = opts.gatewayToken   || process.env.GATEWAY_TOKEN;
  const unknownPollLimit = opts.unknownPollLimit ?? 10;
  const stalePollLimit   = opts.stalePollLimit   ?? 10;

  const transcript = readAcpTranscriptState(streamLogPath, prev.transcript || {});

  let sessionState  = 'no_session_key';
  let sessionActive = false;

  if (childSessionKey && gatewayUrl) {
    try {
      const raw = await fetchSessionStatus(childSessionKey, gatewayUrl, gatewayToken);
      const statusResult = raw?.result?.details || raw;
      const parsed = parseSessionState(statusResult);
      sessionState  = parsed.state;
      sessionActive = parsed.active;
    } catch {
      if (transcriptShowsProgress(transcript)) {
        sessionState  = 'running';
        sessionActive = true;
      } else {
        sessionState  = 'unreachable';
        sessionActive = false;
      }
    }
  }

  const unknownLike    = /^(unknown|unreachable|no_session_key)/i.test(sessionState);
  const unknownPolls   = unknownLike ? ((prev.unknownPolls || 0) + 1) : 0;
  const staleExceeded  = transcript.lastActivityPoll >= stalePollLimit;
  const unknownExceeded = unknownPolls >= unknownPollLimit;

  let terminal = false;
  let reason   = null;

  if (transcript.rateLimited) {
    reason = 'rate_limited';
  } else if (transcript.hardError || transcript.terminal) {
    terminal = true;
    reason   = 'transcript_error';
  } else if (/^(closed|error)$/i.test(sessionState)) {
    terminal = true;
    reason   = 'session_terminal';
  } else if (unknownExceeded && staleExceeded) {
    terminal = true;
    reason   = 'unknown_stale_timeout';
  }

  return {
    sessionKey:          childSessionKey,
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

// ── Terminal Check ───────────────────────────────────────────────

/**
 * Pure check: is the given monitor state in a terminal condition?
 *
 * @param {object} state - Result of getAcpMonitorState()
 * @returns {boolean}
 */
export function isSessionTerminal(state) {
  if (!state) return false;
  return !!state.terminal;
}

// ── Wait for Idle ────────────────────────────────────────────────

/**
 * Poll until a session goes idle (not active), applying a grace period
 * after it becomes inactive. Extends the deadline when transcript shows
 * recent activity (up to maxTranscriptExtensions times).
 *
 * @param {string} childSessionKey
 * @param {object} opts
 * @param {string} opts.gatewayUrl               - Gateway base URL
 * @param {string} opts.gatewayToken             - Gateway bearer token
 * @param {string} [opts.streamLogPath]          - Path to stream log for transcript checks
 * @param {number} [opts.extraGraceMs=120000]    - Grace period after session goes inactive
 * @param {number} [opts.totalTimeoutMs=600000]  - Hard timeout for the whole wait
 * @param {number} [opts.pollMs=10000]           - Polling interval
 * @param {number} [opts.maxTranscriptExtensions=3]  - Max deadline extensions for transcript activity
 * @param {number} [opts.transcriptGraceMs=300000]   - Extension duration per transcript extension
 */
export async function waitForSessionIdle(childSessionKey, opts = {}) {
  const gatewayUrl     = opts.gatewayUrl     || process.env.GATEWAY_URL;
  const gatewayToken   = opts.gatewayToken   || process.env.GATEWAY_TOKEN;
  const extraGraceMs   = opts.extraGraceMs   ?? 120000;
  const totalTimeoutMs = opts.totalTimeoutMs ?? 600000;
  const pollMs         = opts.pollMs         ?? 10000;
  const maxTranscriptExtensions = opts.maxTranscriptExtensions ?? 3;
  const transcriptGraceMs       = opts.transcriptGraceMs       ?? 300000;

  let deadline = Date.now() + totalTimeoutMs;
  let transcriptExtensions = 0;
  let transcriptState = {};

  while (Date.now() < deadline) {
    try {
      const raw = await fetchSessionStatus(childSessionKey, gatewayUrl, gatewayToken);
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

    // Transcript-aware extension: if transcript shows recent activity and deadline
    // is running low, extend it (up to maxTranscriptExtensions times).
    if (opts.streamLogPath && transcriptExtensions < maxTranscriptExtensions) {
      transcriptState = readAcpTranscriptState(opts.streamLogPath, transcriptState);
      if (transcriptShowsProgress(transcriptState)) {
        const remaining = deadline - Date.now();
        if (remaining < transcriptGraceMs) {
          deadline = Date.now() + transcriptGraceMs;
          transcriptExtensions++;
          log('DEBUG', `Transcript active — extended deadline by ${transcriptGraceMs / 1000}s (extension ${transcriptExtensions}/${maxTranscriptExtensions})`);
        }
      }
    }

    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }

  log('DEBUG', `Grace timeout (${totalTimeoutMs / 1000}s) — proceeding with kill`);
}
