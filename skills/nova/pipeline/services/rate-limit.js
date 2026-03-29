// services/rate-limit.js — Rate-limit pause/recovery logic
// Extracted from pipeline-original.js (module 08)

import { log } from '../core/logger.js';
import { loadStatus, saveStatus, addHistory } from './status-store.js';
import { discord } from '../integrations/discord.js';

// Imported from polling.js — circular import is safe because these are function
// references only used inside function bodies, never at module initialisation.
import { sleep, pollResult } from './polling.js';

const STATUS = {
  PENDING:           'PENDING',
  IN_PROGRESS:       'IN_PROGRESS',
  READY_FOR_TESTING: 'READY_FOR_TESTING',
  TESTING:           'TESTING',
  PASS:              'PASS',
  FAIL:              'FAIL',
  BLOCKED:           'BLOCKED',
  RATE_LIMITED:      'RATE_LIMITED',
};

/**
 * Generic rate-limit recovery wrapper for any poll function.
 * Handles the retry-after-cooldown loop that is identical for all polling modes.
 *
 * @param {object} config - Pipeline config
 * @param {string} moduleDir - Module directory (for handleRateLimit's saveStatus/loadStatus)
 * @param {function} pollFn - Zero-arg async function that returns a PollResult
 * @returns {PollResult}
 */
export async function withRateLimitRecovery(config, moduleDir, pollFn) {
  let rateLimitPauses = 0;
  const maxPauses = config.rate_limit?.max_pauses_per_module ?? 5;

  while (true) {
    const result = await pollFn();

    // Any result except rate_limited → pass through to caller
    if (result.reason !== 'rate_limited') return result;

    // Rate limit detected — check budget
    rateLimitPauses++;
    if (rateLimitPauses > maxPauses) {
      log('ERROR', `Rate limit pauses exceeded max (${rateLimitPauses}/${maxPauses}) — giving up`);
      return pollResult(false, 'rate_limit_exhausted', result.status);
    }

    // Pause (sleeps for hours, updates status, sends Discord alert)
    await handleRateLimit(config, result.status, moduleDir, rateLimitPauses, maxPauses);

    // After cooldown: pollFn restarts with its full original timeout.
    // Cooldown is "dead time" — doesn't count against the agent's work budget.
    log('INFO', `Rate limit cooldown complete — restarting poll (pause ${rateLimitPauses}/${maxPauses})`);
  }
}

export async function handleRateLimit(config, callerStatus, moduleDir, pauseCount = 1, maxPauses = 5) {
  const cooldownHours = config.rate_limit?.cooldown_hours ?? 2;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const resumeAt = new Date(Date.now() + cooldownMs);

  // Read caller's status for logging only — do NOT mutate it.
  // The caller may continue using their reference after we return.
  const moduleId = callerStatus.module_id || moduleDir;
  const currentPhase = callerStatus.current_phase;

  log('WARN', `Rate limit detected! Pause ${pauseCount}/${maxPauses}. Sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`);

  await discord(config, 'WARN', `Rate Limited — Pause ${pauseCount}/${maxPauses}`,
    `Module ${moduleId} hit API rate limit. Agent session preserved. Auto-resume at ${resumeAt.toLocaleTimeString()}.`, [
      { name: 'Module', value: moduleId },
      { name: 'Phase', value: currentPhase },
      { name: 'Pause', value: `${pauseCount}/${maxPauses}` },
      { name: 'Resume At', value: resumeAt.toISOString() },
    ]);

  // Load fresh status from disk, add history, save — without touching the caller's object
  const preStatus = loadStatus(config, moduleDir);
  if (preStatus) {
    addHistory(preStatus, STATUS.RATE_LIMITED, 'pipeline', `Paused ${cooldownHours}h (rate limit)`);
    saveStatus(config, moduleDir, preStatus);
  }

  // Sleep through the cooldown
  await sleep(cooldownMs);

  log('OK', 'Rate limit cooldown complete — resuming polling');
  await discord(config, 'INFO', 'Rate limit cooldown complete', `Resuming module ${moduleId}`);

  // IMPORTANT: Load FRESH status after sleep — another process may have
  // modified the file during the 2h cooldown.
  const freshStatus = loadStatus(config, moduleDir);
  if (freshStatus && freshStatus.status === STATUS.RATE_LIMITED) {
    freshStatus.status = currentPhase === 'forge' ? STATUS.IN_PROGRESS : STATUS.TESTING;
    addHistory(freshStatus, freshStatus.status, 'pipeline', 'Resumed after rate limit cooldown');
    saveStatus(config, moduleDir, freshStatus);
  }
}
