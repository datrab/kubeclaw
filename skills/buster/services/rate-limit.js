// ═══════════════════════════════════════════════════════════════
// Buster Rate-Limit Recovery Service
// ═══════════════════════════════════════════════════════════════
//
// Handles rate-limit recovery at the session monitor level.
// When the ACP monitor detects a rate limit, instead of
// immediately killing the session, this service:
//
//   1. Logs the detection with provider info
//   2. Emits buster.session.rate_limited telemetry event
//   3. Sends a yellow Discord embed (pause notification)
//   4. Waits for a configurable cooldown (exponential backoff)
//   5. Checks session liveness after cooldown
//   6. Returns { action: 'resume' | 'kill', cooldownMs }
//
// The monitor loop in buster-orchestrator.js uses this to
// decide whether to resume monitoring or kill the session.

import { execFileSync } from 'child_process';
import { getAcpMonitorState } from '../agents/acp-monitor.js';
import { emitEvent } from './telemetry.js';
import { resolveDiscordWebhookUrl } from './runtime.js';

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

function sendRateLimitEmbed(webhookUrl, { moduleId, provider, cooldownS, pauseCount, maxPauses, childSessionKey }) {
  if (!webhookUrl) return;
  try {
    const embed = {
      title:     `⏸️ Rate Limit Pause: Module ${moduleId}`,
      color:     16776960, // yellow
      fields: [
        { name: 'Provider', value: String(provider),                           inline: true },
        { name: 'Cooldown', value: `${cooldownS}s`,                            inline: true },
        { name: 'Pause',    value: `${pauseCount}/${maxPauses}`,               inline: true },
        { name: 'Session',  value: String(childSessionKey || 'unknown'),        inline: false },
      ],
      footer:    { text: 'Buster Orchestrator v2.0' },
      timestamp: new Date().toISOString(),
    };
    const payload = JSON.stringify({ embeds: [embed] });
    execFileSync('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload, webhookUrl], {
      stdio:   'ignore',
      timeout: 10000,
    });
  } catch {
    // Fire-and-forget — Discord delivery failure must not block recovery.
  }
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
 * @returns {Promise<{ action: 'resume' | 'kill', cooldownMs: number }>}
 */
export async function handleRateLimit(state, opts = {}) {
  const {
    childSessionKey,
    gatewayUrl,
    gatewayToken,
    discord,
    telemetryCtx,
    moduleId  = 'unknown',
    provider  = 'Unknown',
  } = opts;

  // Increment before acting so logs show the current pause number.
  state.pauseCount++;
  const cooldownS  = state.currentCooldownS;
  const cooldownMs = cooldownS * 1000;

  // 1. Log with provider info
  log('WARN', `Rate limit detected — module=${moduleId} session=${childSessionKey} provider=${provider} pause=${state.pauseCount}/${state.maxPauses} cooldown=${cooldownS}s`);

  // 2. Emit telemetry event
  await emitEvent(telemetryCtx, 'buster.session.rate_limited', {
    module_id:         moduleId,
    child_session_key: childSessionKey,
    provider,
    pause_number:      state.pauseCount,
    max_pauses:        state.maxPauses,
    cooldown_s:        cooldownS,
  });

  // 3. Send yellow Discord embed
  const webhookUrl = resolveDiscordWebhookUrl(discord?.webhookUrl || null);
  sendRateLimitEmbed(webhookUrl, {
    moduleId,
    provider,
    cooldownS,
    pauseCount:   state.pauseCount,
    maxPauses:    state.maxPauses,
    childSessionKey,
  });

  // 4. Sleep for cooldown
  log('INFO', `Sleeping ${cooldownS}s for rate-limit cooldown...`);
  await sleep(cooldownMs);

  // 5. Check session liveness after cooldown
  let sessionAlive = false;
  try {
    const monitorState = await getAcpMonitorState(
      childSessionKey,
      null,           // streamLogPath not needed for liveness-only check
      {},             // fresh prev — we only care about gateway session state
      { gatewayUrl, gatewayToken },
    );
    sessionAlive = monitorState.sessionActive === true;
  } catch (err) {
    log('WARN', `Liveness check failed after cooldown: ${err.message}`);
    sessionAlive = false;
  }

  log('INFO', `Post-cooldown liveness check: session=${childSessionKey} alive=${sessionAlive}`);

  // 6. Advance cooldown for next hit (exponential backoff, capped at maxCooldownS)
  state.currentCooldownS = Math.min(state.currentCooldownS * 2, state.maxCooldownS);

  return {
    action:     sessionAlive ? 'resume' : 'kill',
    cooldownMs,
  };
}
