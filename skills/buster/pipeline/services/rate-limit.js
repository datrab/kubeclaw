// ═══════════════════════════════════════════════════════════════
// Buster Rate-Limit Recovery Service
// ═══════════════════════════════════════════════════════════════
//
// Handles rate-limit recovery at the child-session monitor level.
// Buster keeps the local cooldown/liveness probe because it is the only
// process attached to the child session, but canonical rate-limit signal
// payloads and operator-facing pause presentation come from the shared
// pipeline contract helpers that Nova also uses.
//
// In practice this layer should stay thin:
//   1. record the cooldown hit
//   2. emit the shared canonical pause signal only when this task owns it
//   3. wait the configured cooldown
//   4. probe child-session liveness
//   5. return the post-cooldown observation back to the monitor loop

import { getAcpMonitorState } from '../../../common/pipeline/agents/acp-monitor.js';
import { sendDiscord } from './discord.js';
import { emitEvent } from './telemetry.js';
import {
  buildRateLimitDetectedPayload,
  buildSessionRateLimitDiscordFields,
  formatRateLimitEmbed,
  resolveRateLimitRecoveryAction,
} from '../../../common/pipeline/services/rate-limit-contract.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function log(label, msg) {
  console.log(`[RATE-LIMIT] [${label.toUpperCase()}] ${msg}`);
}

// ── State ─────────────────────────────────────────────────────────

/**
 * Create mutable rate-limit tracking state for a single task.
 *
 * @param {object} [config]
 * @param {number} [config.maxPauses=3]          - Max recovery pauses before kill
 * @param {number} [config.initialCooldownS=120]  - First cooldown in seconds
 * @param {number} [config.maxCooldownS=600]      - Cooldown cap in seconds
 * @returns {RateLimitState}
 */
export function createRateLimitState(config = {}) {
  const initialCooldownS = config.initialCooldownS ?? 120;
  return {
    maxPauses:        config.maxPauses     ?? 3,
    initialCooldownS,
    maxCooldownS:     config.maxCooldownS  ?? 600,
    pauseCount:       0,
    currentCooldownS: initialCooldownS,
  };
}

/**
 * Returns true if another recovery pause is allowed.
 *
 * @param {RateLimitState} state
 * @returns {boolean}
 */
export function shouldRetryAfterRateLimit(state) {
  return state.pauseCount < state.maxPauses;
}

// ── Discord ───────────────────────────────────────────────────────

function sendRateLimitEmbed({
  moduleId,
  gateId,
  gateType,
  phase,
  provider,
  detail,
  cooldownMs,
  pauseCount,
  maxPauses,
  childSessionKey,
  project,
  runId,
  attempt,
  dispatchId,
  gatewayLabel,
  logDir,
  webhookUrl,
}) {
  const embed = formatRateLimitEmbed({ detail }, pauseCount, maxPauses, cooldownMs);
  return sendDiscord({
    title: embed.title,
    description: embed.description,
    color: 16776960,
    fields: buildSessionRateLimitDiscordFields({
      run_id: runId,
      module_id: moduleId,
      gate_id: gateId,
      gate_type: gateType,
      phase,
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: childSessionKey,
    }, [
      { name: 'Provider', value: String(provider), inline: true },
      ...embed.fields,
    ]),
    footer: { text: 'Buster Pipeline v2.0' },
    timestamp: new Date().toISOString(),
  }, {
    moduleId,
    gateId,
    project,
    runId,
    attempt,
    dispatchId,
    sessionKey: childSessionKey,
    logDir,
    webhookUrl,
  });
}

// ── Recovery ──────────────────────────────────────────────────────

/**
 * Handle a detected rate limit: notify, sleep, check liveness, return action.
 *
 * Mutates `state` (increments pauseCount, advances currentCooldownS).
 *
 * @param {RateLimitState} state          - Mutable state created by createRateLimitState()
 * @param {object}         opts
 * @param {string}         opts.childSessionKey  - Session key for liveness check
 * @param {string}         [opts.gatewayUrl]     - Gateway URL for liveness check
 * @param {string}         [opts.gatewayToken]   - Gateway auth token
 * @param {object}         [opts.discord]        - Discord config { webhookUrl }
 * @param {object|null}    [opts.telemetryCtx]   - Telemetry context for emitEvent()
 * @param {string}         [opts.moduleId]       - Module identifier for logs/embeds
 * @param {string}         [opts.provider]       - Rate-limit provider name
 * @param {boolean}        [opts.ownsCanonicalSignal] - Whether this caller owns the canonical pause signal
 * @returns {Promise<{ action: 'resume' | 'kill', cooldownMs: number, gatewayUnreachable?: boolean, gatewayDetail?: string|null, sessionAlive?: boolean }>}
 */
export async function handleRateLimit(state, opts = {}) {
  const {
    childSessionKey,
    gatewayUrl,
    gatewayToken,
    discord,
    telemetryCtx,
    moduleId  = 'unknown',
    gateId    = null,
    gateType  = null,
    provider  = 'Unknown',
    detail    = null,
    taskType  = null,
    phase     = 'buster',
    project   = telemetryCtx?.project || '',
    runId     = telemetryCtx?.runId || null,
    attempt   = null,
    dispatchId = null,
    gatewayLabel = dispatchId || null,
    logDir    = telemetryCtx?.logDir || null,
    ownsCanonicalSignal = taskType !== 'gate_test',
  } = opts;

  // Increment before acting so logs show the current pause number.
  state.pauseCount++;
  const cooldownS  = state.currentCooldownS;
  const cooldownMs = cooldownS * 1000;
  const resumeAt = new Date(Date.now() + cooldownMs).toISOString();

  // 1. Log with provider info
  log('WARN', `Rate limit detected — module=${moduleId} session=${childSessionKey} provider=${provider} pause=${state.pauseCount}/${state.maxPauses} cooldown=${cooldownS}s`);

  // 2. Emit telemetry / 3. send Discord only when this task owns the
  // canonical pause signal. Gate-owned work is surfaced by Nova's runner.
  if (ownsCanonicalSignal) {
    const signalIdentity = {
      run_id: runId,
      module_id: moduleId,
      gate_id: gateId,
      gate_type: gateType,
      agent_type: phase,
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: childSessionKey,
    };
    await emitEvent(telemetryCtx, 'rate_limit.detected', buildRateLimitDetectedPayload(signalIdentity, {
      provider,
      pauseCount: state.pauseCount,
      maxPauses: state.maxPauses,
      cooldownMs,
      resumeAt,
      detail: detail || `rate limit pause ${state.pauseCount}/${state.maxPauses}`,
    }));

    sendRateLimitEmbed({
      moduleId,
      gateId,
      gateType,
      phase,
      provider,
      detail: detail || `rate limit pause ${state.pauseCount}/${state.maxPauses}`,
      cooldownMs,
      pauseCount: state.pauseCount,
      maxPauses: state.maxPauses,
      childSessionKey,
      project,
      runId,
      attempt,
      dispatchId,
      gatewayLabel,
      logDir,
      webhookUrl: discord?.webhookUrl || null,
    });
  } else {
    log('INFO', `Suppressing duplicate canonical pause signal for gate-owned rate limit: module=${moduleId} session=${childSessionKey}`);
  }

  // 4. Sleep for cooldown
  log('INFO', `Sleeping ${cooldownS}s for rate-limit cooldown...`);
  await sleep(cooldownMs);

  // 5. Check session liveness after cooldown
  let sessionAlive = false;
  let gatewayUnreachable = false;
  let gatewayDetail = null;
  try {
    const monitorState = await getAcpMonitorState(
      childSessionKey,
      null,           // streamLogPath not needed for liveness-only check
      {},             // fresh prev — we only care about gateway session state
      { gatewayUrl, gatewayToken },
    );
    sessionAlive = monitorState.sessionActive === true;
    gatewayUnreachable = monitorState.gatewayUnreachable === true;
    gatewayDetail = monitorState.gatewayDetail || monitorState.detail || null;
  } catch (err) {
    log('WARN', `Liveness check failed after cooldown: ${err.message}`);
    sessionAlive = false;
  }

  log('INFO', `Post-cooldown liveness check: session=${childSessionKey} alive=${sessionAlive} gatewayUnreachable=${gatewayUnreachable}`);

  // 6. Advance cooldown for next hit (exponential backoff, capped at maxCooldownS)
  state.currentCooldownS = Math.min(state.currentCooldownS * 2, state.maxCooldownS);

  const action = resolveRateLimitRecoveryAction({ sessionAlive, gatewayUnreachable });
  if (gatewayUnreachable) {
    log('WARN', `Gateway unreachable after cooldown, preserving degraded visibility and resuming monitor for session=${childSessionKey}`);
  }

  return {
    action,
    cooldownMs,
    gatewayUnreachable,
    gatewayDetail,
    sessionAlive,
  };
}
