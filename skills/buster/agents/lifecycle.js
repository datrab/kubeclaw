// ═══════════════════════════════════════════════════════════════
// Lifecycle — Session Spawn / Kill (Buster Edition)
// ═══════════════════════════════════════════════════════════════
//
// Handles spawning and killing child sessions for both ACP and
// subagent runtimes. Adapted from pipeline/agents/lifecycle.js
// for the buster pod (direct fetch() instead of gatewayInvoke).
//
// ACP runtime:      sessions_spawn with runtime: "acp", agentId, streamTo: "parent"
// Subagent runtime: sessions_spawn with runtime: "subagent", mode: "run", thread: false
//
// Module-level state tracks the currently active session so the
// SIGTERM handler can clean up via killActiveSession().

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveGatewayBaseUrl } from './gateway.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function log(level, msg) {
  console.log(`[LIFECYCLE] [${level}] ${msg}`);
}

// ── Active session state (for SIGTERM cleanup) ───────────────────

let _activeSession = null;

/**
 * Return a copy of the currently tracked active session, or null.
 * @returns {{ childSessionKey, agentId, label, runtime } | null}
 */
export function getActiveSession() {
  return _activeSession ? { ..._activeSession } : null;
}

/** Clear the active session record without killing it. */
export function clearActiveSession() {
  _activeSession = null;
}

function setActiveSession(data) {
  _activeSession = { ...data };
}

// ── Gateway helpers ──────────────────────────────────────────────

async function gatewayFetch(endpoint, body, gatewayUrl, gatewayToken, timeoutMs = 30000) {
  const url = `${gatewayUrl}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gateway ${endpoint} returned ${res.status}`);
  return res.json();
}

// ── ACP cleanup ──────────────────────────────────────────────────

function acpxCleanup(agentId, gatewayLabel) {
  if (!agentId || !gatewayLabel) return;
  try {
    execFileSync('acpx', [agentId, 'sessions', 'close', '--name', gatewayLabel], { stdio: 'ignore', timeout: 10000 });
    log('DEBUG', `acpx session closed: ${agentId} / ${gatewayLabel}`);
  } catch {
    log('DEBUG', `acpx session close failed (non-critical): ${agentId} / ${gatewayLabel}`);
  }
}

// ── Spawn ────────────────────────────────────────────────────────

/**
 * Spawn a child session (ACP or subagent) via the Gateway.
 *
 * Retries up to 3 times with a 5s delay on transient failures.
 *
 * @param {object} payload          - Task payload (provides session defaults)
 * @param {string} prompt           - Task prompt to pass to the spawned session
 * @param {number} timeoutSeconds   - Session timeout in seconds (informational)
 * @param {object} opts
 * @param {string} opts.gatewayUrl    - Gateway base URL (default: GATEWAY_URL env)
 * @param {string} opts.gatewayToken  - Gateway bearer token (default: GATEWAY_TOKEN env)
 * @param {string} opts.runtime       - "acp" or "subagent" (default: payload.session.runtime or "acp")
 * @param {string} opts.model         - Model ID override (default: payload.session.model)
 * @param {string} opts.agentId       - ACP agent ID (default: payload.session.agentId or "claude")
 * @param {string} opts.cwd           - Working directory (default: payload.session.cwd)
 * @param {string} opts.label         - Session label (default: payload.session.label)
 * @returns {{ childSessionKey, runId, label, agentId, streamLogPath, runtime }}
 */
export async function spawnSession(payload, prompt, timeoutSeconds, opts = {}) {
  const session      = payload?.session || {};
  const gatewayUrl   = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = opts.gatewayToken || process.env.GATEWAY_TOKEN;
  const runtime      = opts.runtime      || session.runtime || 'acp';
  const model        = opts.model        || session.model   || null;
  const agentId      = opts.agentId      || session.agentId || 'claude';
  const cwd          = opts.cwd          || session.cwd     || process.cwd();
  const label        = opts.label        || session.label   || `buster-session-${Date.now()}`;
  const isSubagent   = runtime === 'subagent';

  const spawnArgs = {
    task: prompt,
    runtime,
    label,
    model,
    cwd,
    thread: false,
    mode: 'run',
    cleanup: 'keep',
  };
  if (!isSubagent) {
    spawnArgs.agentId  = agentId;
    spawnArgs.streamTo = 'parent';
  }

  log('STEP', `Spawning ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (model: ${model}, agentId: ${agentId})`);

  const MAX_RETRIES    = 3;
  const RETRY_DELAY_MS = 5000;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw    = await gatewayFetch('sessions_spawn', spawnArgs, gatewayUrl, gatewayToken, 30000);
      const result = raw?.result?.details || raw;
      if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);

      let streamLogPath = result.streamLogPath || null;

      // For subagents, streamLogPath is not returned by the gateway (streamTo:'parent' is ACP-only).
      // Resolve the transcript path by reading sessions.json for the parent agent:
      //   childSessionKey = "agent:<parentAgentId>:subagent:<uuid>"
      //   sessions.json[childSessionKey].sessionId  →  actual transcript filename
      //   transcript lives at ~/.openclaw/agents/<parentAgentId>/sessions/<sessionId>.jsonl
      if (isSubagent && !streamLogPath && result.childSessionKey) {
        try {
          const parentAgentId = result.childSessionKey.split(':')[1];
          if (parentAgentId) {
            const sessionsJsonPath = path.join(os.homedir(), '.openclaw', 'agents', parentAgentId, 'sessions', 'sessions.json');
            const sessionsData = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf8'));
            const sessionId = sessionsData[result.childSessionKey]?.sessionId;
            if (sessionId) {
              streamLogPath = path.join(os.homedir(), '.openclaw', 'agents', parentAgentId, 'sessions', `${sessionId}.jsonl`);
              log('DEBUG', `Subagent transcript path (resolved): ${streamLogPath}`);
            }
          }
        } catch { /* non-critical — sessions.json unreadable or entry not yet written */ }
      }

      log('OK', `Session spawned: ${label} → ${result.childSessionKey}${streamLogPath ? ` (stream: ${streamLogPath})` : ''}`);

      const sessionData = {
        childSessionKey: result.childSessionKey,
        runId:           result.runId,
        label,
        agentId,
        streamLogPath,
        runtime,
        gatewayLabel: label,
      };
      setActiveSession(sessionData);
      return sessionData;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        log('WARN', `Spawn attempt ${attempt}/${MAX_RETRIES} failed: ${e.message} — retrying in ${RETRY_DELAY_MS / 1000}s`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(`Failed to spawn session '${label}' after ${MAX_RETRIES} attempts: ${lastErr?.message}`);
}

// ── Kill ─────────────────────────────────────────────────────────

/**
 * Kill a child session by sending /stop and cleaning up ACP state if needed.
 *
 * ACP:      sends /stop via sessions_send + runs acpx cleanup
 * Subagent: sends /stop via sessions_send only
 *
 * @param {string} childSessionKey
 * @param {object} opts
 * @param {string} opts.gatewayUrl    - Gateway base URL (default: GATEWAY_URL env)
 * @param {string} opts.gatewayToken  - Gateway bearer token (default: GATEWAY_TOKEN env)
 * @param {string} [opts.runtime]     - "acp" or "subagent" (default: "acp")
 * @param {string} [opts.agentId]     - ACP agent ID (for acpx cleanup, ACP only)
 * @param {string} [opts.label]       - Gateway label (for acpx cleanup, ACP only)
 */
export async function killSession(childSessionKey, opts = {}) {
  if (!childSessionKey) return;
  const gatewayUrl   = resolveGatewayBaseUrl(opts.gatewayUrl);
  const gatewayToken = opts.gatewayToken || process.env.GATEWAY_TOKEN;
  const runtime      = opts.runtime      || 'acp';
  const isSubagent   = runtime === 'subagent';
  const label        = opts.label        || '';

  log('STEP', `Killing ${isSubagent ? 'subagent' : 'ACP'} session: ${childSessionKey}${label ? ` (${label})` : ''}`);
  try {
    await gatewayFetch('sessions_send', { sessionKey: childSessionKey, message: '/stop' }, gatewayUrl, gatewayToken, 15000);
    log('OK', `Session stopped: ${childSessionKey}`);
  } catch {
    log('WARN', `Could not stop session '${childSessionKey}' — may have already exited`);
  }

  if (!isSubagent && opts.agentId) {
    acpxCleanup(opts.agentId, label);
  }
}

// ── Active session helpers ───────────────────────────────────────

/**
 * Kill whatever session is currently tracked as active.
 * Intended for use in SIGTERM handlers to clean up on unexpected shutdown.
 */
export async function killActiveSession() {
  const session = _activeSession;
  if (!session) {
    log('DEBUG', 'killActiveSession: no active session tracked');
    return;
  }
  log('INFO', `killActiveSession: killing ${session.childSessionKey} (${session.label})`);
  await killSession(session.childSessionKey, {
    runtime:  session.runtime,
    agentId:  session.agentId,
    label:    session.gatewayLabel || session.label,
  });
  _activeSession = null;
}
