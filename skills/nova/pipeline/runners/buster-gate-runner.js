// runners/buster-gate-runner.js — Buster gate runner
// Handles the buster gate lifecycle:
//   1. Completion check (output_file + gate-status.json fallback)
//   2. Stale file cleanup
//   3. Main loop: run Buster → optional fix-and-retest (Forge fixes, Buster retests)
//
// The fix-and-retest loop tracks fix history to prevent repeated failed approaches
// via anti-pattern framing in subsequent Forge prompts.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from '../core/constants.js';
import { getRunStats } from '../core/runtime.js';
import { resolveModel, validateBusterConfig, resolvePolicy, logEffectivePolicy } from '../core/config.js';
import { swarmRoot, relPath, gateLogDir, gateStatusPath } from '../core/paths.js';
import { headHash } from '../core/git.js';
import { discord } from '../integrations/discord.js';
import { gitCommitAndPush } from '../integrations/git.js';
import { mapRedisStatus } from '../integrations/redis.js';
import { archiveGateOutputIfPresent } from '../services/status-store.js';
import { formatRateLimitEmbed } from '../services/failures.js';
import { pollResult, pollGeneric, sleep, archiveModuleCompletions, readCompletionFromRedis, pollForSessionEnd } from '../services/polling.js';
import { readGateInstructions, buildBusterGatePrompt } from '../prompts/buster-gate.js';
import { buildGateFixPrompt } from '../prompts/gate-fix.js';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive } from '../agents/lifecycle.js';
import { transcriptShowsProgress } from '../agents/acp-monitor.js';
import { getTrackedAgent } from '../agents/shutdown.js';
import { getActiveContext } from '../core/logger.js';
import { onGateStarted, onGatePass, onGateFail } from '../services/telemetry.js';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

const DEFAULT_DEPS = {
  resolveModel,
  resolvePolicy,
  logEffectivePolicy,
  validateBusterConfig,
  headHash,
  discord,
  gitCommitAndPush,
  archiveGateOutputIfPresent,
  pollResult,
  pollGeneric,
  sleep,
  archiveModuleCompletions,
  readCompletionFromRedis,
  pollForSessionEnd,
  readGateInstructions,
  buildBusterGatePrompt,
  buildGateFixPrompt,
  acpLabel,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  getTrackedAgent,
};

function getDeps(config) {
  return { ...DEFAULT_DEPS, ...(config?._testOverrides?.busterGate || {}) };
}

function getGateStats(config) {
  return getRunStats(config);
}

/**
 * Extract actionable issues from a Buster gate result for Forge to fix.
 *
 * Input shapes (depending on poll source):
 *   Redis:       { gate, status: 'FAIL', reason: '...', source: 'orchestrator', verdict: {...} }
 *   Output file: { status: 'FAIL', issues: [...] }
 *   gate-status: { status: 'FAIL', reason: '...' }
 */
function extractGateIssues(gateResult) {
  if (!gateResult) return [];

  const data = (typeof gateResult.status === 'object' && gateResult.status !== null)
    ? gateResult.status
    : gateResult;

  if (Array.isArray(data.issues)) {
    return data.issues
      .filter(i => i.severity === 'critical' || i.severity === 'moderate' || !i.severity)
      .map(i => ({
        title: i.title || 'Unknown issue',
        description: i.description || '',
        affected_module: i.affected_module || null,
        affected_files: i.affected_files || [],
        severity: i.severity || 'unknown',
        reproduction: i.reproduction || null,
      }));
  }

  // Verdict JSON from orchestrator (enriched Redis FAIL) — extract per-suite failures
  const verdict = data.verdict || data._verdict;
  if (verdict?.suites) {
    const issues = [];
    for (const [suiteName, suite] of Object.entries(verdict.suites)) {
      if (suite.status !== 'FAIL' && suite.status !== 'ERROR') continue;
      if (suite.findings?.length > 0) {
        for (const f of suite.findings.slice(0, 5)) {
          issues.push({
            title: `${suiteName}: ${f.message || 'test failure'}`,
            description: f.rule ? `Rule: ${f.rule}` : '',
            severity: f.severity || 'critical',
            affected_files: f.file ? [f.file] : [],
          });
        }
      } else {
        issues.push({
          title: `${suiteName}: ${suite.error || suite.reason || 'failed'}`,
          description: `Suite ${suiteName} ${suite.status} with ${suite.checks_failed || 0} check(s) failed`,
          severity: suite.critical ? 'critical' : 'moderate',
          affected_files: [],
        });
      }
    }
    if (issues.length > 0) return issues;
  }

  const reason = data.reason || data.summary || 'Gate test failed without details';
  return [{ title: 'Gate test failure', description: reason, severity: 'unknown', affected_files: [] }];
}

/**
 * Run a single Buster gate attempt: spawn -> poll -> kill -> interpret.
 * Returns the poll result for the caller to handle.
 * @private
 */
async function _runBusterGateOnce(deps, config, progress, gateId, gate, model, timeout, instructions, attempt) {
  getGateStats(config).total_buster_attempts++;
  const commitHash = deps.headHash();
  const busterPromptResult = deps.buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt);
  const busterPrompt = busterPromptResult.prompt;

  try {
    const logDir = gateLogDir(config, gateId);
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, `buster-prompt-attempt-${attempt}.md`), busterPrompt);
  } catch { /* non-critical */ }

  // Pre-dispatch config validation (gate) — only on first attempt
  if (attempt === 1) {
    try {
      deps.validateBusterConfig(config);
    } catch (e) {
      const reason = `Gate '${gateId}' config validation failed: ${e.message}`;
      log('ERROR', reason);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' — Config Invalid`,
        `Pre-dispatch validation caught config issues. Fix before retrying.`,
        [{ name: 'Issue', value: e.message.slice(0, 200) }]
      );
      return deps.pollResult(false, 'config_invalid', { error: reason, errors: [e.message] });
    }
  }

  // Archive stale Redis completions for this gate before dispatching
  await deps.archiveModuleCompletions(config, gateId);

  try {
    await deps.spawnAgent(config, progress, 'buster', gateId, model, busterPrompt, {
      taskType: 'gate_test',
      gate,
    });
  } catch (e) {
    return deps.pollResult(false, 'spawn_failed', { error: e.message });
  }

  const result = await deps.pollGeneric(config, async () => {
    // Channel 0: Redis Completion Stream (fast path)
    try {
      const redisEntry = await deps.readCompletionFromRedis(config, gateId);
      if (redisEntry && redisEntry.status) {
        const mappedStatus = mapRedisStatus(redisEntry.status);
        log('OK', `Gate '${gateId}' Redis completion: status=${redisEntry.status} mapped=${mappedStatus} source=${redisEntry.source || 'unknown'}`);

        if (mappedStatus === STATUS.PASS) {
          return { done: true, result: deps.pollResult(true, 'target_reached', {
            gate: gateId,
            status: mappedStatus,
            summary: redisEntry.summary || null,
            _source: 'redis',
          })};
        }
        if (mappedStatus === STATUS.FAIL) {
          let verdict = null;
          if (redisEntry.verdict) {
            try { verdict = JSON.parse(redisEntry.verdict); } catch { /* malformed */ }
          }
          return { done: true, result: deps.pollResult(false, 'gate_fail', {
            gate: gateId,
            status: mappedStatus,
            reason: redisEntry.reason || redisEntry.summary || 'unknown',
            source: redisEntry.source || 'unknown',
            verdict,
            _source: 'redis',
          })};
        }
        if (mappedStatus === STATUS.RATE_LIMITED) {
          return { rate_limited: true, status: redisEntry };
        }
      }
    } catch (e) {
      log('DEBUG', `Gate '${gateId}' Redis poll error (non-critical): ${e.message}`);
    }

    // Channel 1: Output file (primary file signal)
    if (gate.output_file) {
      const outPath = path.join(swarmRoot(config), gate.output_file);
      if (fs.existsSync(outPath)) {
        let data = { gate: gateId };
        try { data = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* raw file */ }

        const resultStatus = (data.status || '').toUpperCase();
        if (resultStatus === 'FAIL' || resultStatus === 'ISSUES_FOUND') {
          return { done: true, result: deps.pollResult(false, 'gate_fail', data) };
        }
        return { done: true, result: deps.pollResult(true, 'target_reached', data) };
      }
    }

    // Channel 2: gate-status.json (FAIL/RATE_LIMITED/crash detection)
    const gateStatusFile = gateStatusPath(config, gateId);
    if (!fs.existsSync(gateStatusFile)) {
      return { done: false, logMsg: 'waiting for output' };
    }

    let gateStatus;
    try {
      gateStatus = JSON.parse(fs.readFileSync(gateStatusFile, 'utf8'));
    } catch {
      return { parse_error: true };
    }

    if (gateStatus?.status === STATUS.FAIL || gateStatus?.status === 'ISSUES_FOUND') {
      return { done: true, result: deps.pollResult(false, 'gate_fail', gateStatus) };
    }
    if (gateStatus?.status === STATUS.RATE_LIMITED) {
      return { rate_limited: true, status: gateStatus };
    }
    const gsUpper = (gateStatus?.status || '').toUpperCase();
    if (gsUpper === 'PASS' || gsUpper === 'OK') {
      log('INFO', `Gate '${gateId}' PASS detected via gate-status.json (output_file not yet written)`);
      return { done: true, result: deps.pollResult(true, 'target_reached', gateStatus) };
    }

    return { done: false, logMsg: `status=${gateStatus?.status || 'unknown'}` };
  }, timeout, `Gate '${gateId}'`);

  await deps.killAgent(config, 'buster', gateId);
  return result;
}

/**
 * Run a type:"buster" gate with optional fix-and-retest loop.
 *
 * If gate.on_fail === 'fix_and_retest':
 *   FAIL -> extract issues -> Forge fix -> cleanup old output -> retest (max N cycles)
 * Otherwise: FAIL -> EXIT_NEEDS_NOVA
 */
export async function runBusterGate(config, progress, gateId) {
  const deps = getDeps(config);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  log('STEP', `═══════════════════════════════════════════════════════`);
  log('STEP', `  GATE: ${gate.title}`);
  log('STEP', `═══════════════════════════════════════════════════════`);

  // Already completed? Check output file AND its content.
  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    if (fs.existsSync(outPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        const resultStatus = (data.status || '').toUpperCase();
        if (resultStatus !== 'FAIL' && resultStatus !== 'ISSUES_FOUND') {
          log('OK', `Gate '${gateId}' already completed (status: ${data.status || 'ok'}) — skipping`);
          return { exit: EXIT_OK, status: STATUS.PASS };
        }
        log('INFO', `Gate '${gateId}' output file exists but status is '${data.status}' — re-running`);
      } catch {
        // Non-JSON file (e.g. markdown review) — existence = done
        log('OK', `Gate '${gateId}' already completed — skipping`);
        return { exit: EXIT_OK, status: STATUS.PASS };
      }
    }
  }

  // Fallback: check gate-status.json when output_file is absent
  const gsPath = gateStatusPath(config, gateId);
  if (fs.existsSync(gsPath)) {
    try {
      const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
      const s = (gs.status || '').toUpperCase();
      if (s === 'PASS' || s === 'OK') {
        log('OK', `Gate '${gateId}' already completed via gate-status.json (output_file missing) — skipping`);
        return { exit: EXIT_OK, status: STATUS.PASS };
      }
    } catch { /* unparseable = not completed */ }
  }

  // Clean up stale output files from previous runs BEFORE entering the main loop.
  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    try {
      const archived = deps.archiveGateOutputIfPresent(config, gateId, outPath);
      if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch { /* ok */ }
  }
  try {
    const gsp = gateStatusPath(config, gateId);
    const archivedStatus = deps.archiveGateOutputIfPresent(config, gateId, gsp, { label: 'gate-status' });
    if (archivedStatus) log('INFO', `Archived previous gate status: ${relPath(config, archivedStatus)}`);
    if (fs.existsSync(gsp)) fs.unlinkSync(gsp);
  } catch { /* ok */ }

  let instructions;
  try { instructions = deps.readGateInstructions(config, gate); }
  catch (e) {
    log('ERROR', `Gate '${gateId}' instructions read failed: ${e.message}`);
    return { exit: EXIT_ERROR, reason: e.message };
  }

  const busterGatePolicy = deps.resolvePolicy(config, progress, 'buster', {
    scopeModel: gate.model || null,
    dispatchPath: 'redis',
  });
  const model = busterGatePolicy.model;
  deps.logEffectivePolicy(config, { scope: 'gate_buster', agent: 'buster', gateId, ...busterGatePolicy });
  log('INFO', `Gate '${gateId}' model: ${model ?? '(none)'} [${busterGatePolicy.model_source}] thinking: not_supported_on_redis`);
  const timeout = gate.timeout_minutes ?? config.default_timeout_minutes;
  const maxFixCycles = gate.max_fix_cycles ?? config.default_max_fails;
  const hasFixLoop = gate.on_fail === 'fix_and_retest';

  await deps.discord(config, 'INFO', `Gate: ${gate.title}`, `Starting buster gate${hasFixLoop ? ` (fix loop: max ${maxFixCycles})` : ''}`);
  onGateStarted(_telemetryCtx(config), gateId, gate);

  const _gateStartedAt = Date.now();

  // Rate limit tracking — gate-level
  let rateLimitPauses = 0;
  const maxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;

  // Fix history — tracks what each previous fix attempt did
  const fixHistory = [];

  // ── Main loop: run gate, optionally fix and retry ──
  for (let attempt = 1; attempt <= (hasFixLoop ? maxFixCycles + 1 : 1); attempt++) {

    if (attempt > 1) {
      log('STEP', `Gate '${gateId}' retry attempt ${attempt - 1}/${maxFixCycles}`);
    }

    const result = await (deps.runOnce || _runBusterGateOnce)(deps, config, progress, gateId, gate, model, timeout, instructions, attempt);

    // ── PASS ──
    if (result.ok) {
      log('OK', `Gate '${gateId}' PASS${attempt > 1 ? ` (after ${attempt - 1} fix cycle(s))` : ''}`);
      getGateStats(config).gates_completed.push(gateId);

      // Persist PASS locally so findNextStep() recognises completion on resume.
      try {
        const gsp = gateStatusPath(config, gateId);
        const gsDir = path.dirname(gsp);
        if (!fs.existsSync(gsDir)) fs.mkdirSync(gsDir, { recursive: true });
        fs.writeFileSync(gsp, JSON.stringify({
          status: 'PASS',
          gate: gateId,
          source: result.status?._source || 'unknown',
          completed_at: new Date().toISOString(),
          fix_cycles: attempt > 1 ? attempt - 1 : 0,
        }, null, 2) + '\n');
        await deps.gitCommitAndPush(config, `[pipeline] Gate '${gateId}' PASS (persisted)`, { softFail: true });
      } catch (e) {
        log('WARN', `Failed to persist gate-status.json for '${gateId}': ${e.message} (non-critical)`);
      }

      // Write output_file on PASS so findNextStep()/printStatus() detect completion via file check.
      // Only write if not already present (another channel may have written it during the poll).
      if (gate.output_file) {
        try {
          const outPath = path.join(swarmRoot(config), gate.output_file);
          if (!fs.existsSync(outPath)) {
            const outDir = path.dirname(outPath);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(outPath, JSON.stringify({
              status: 'PASS',
              gate: gateId,
              source: result.status?._source || 'unknown',
              completed_at: new Date().toISOString(),
              fix_cycles: attempt > 1 ? attempt - 1 : 0,
            }, null, 2) + '\n');
            log('OK', `Gate '${gateId}' output_file written: ${relPath(config, outPath)}`);
          }
        } catch (e) {
          log('WARN', `Failed to write output_file for gate '${gateId}': ${e.message} (non-critical)`);
        }
      }

      await deps.discord(config, 'OK', `Gate: ${gate.title} PASS`,
        attempt > 1 ? `Passed after ${attempt - 1} fix cycle(s)` : 'Passed on first run');
      onGatePass(_telemetryCtx(config), gateId, {
        gate_type: gate.type,
        fix_cycle: attempt > 1 ? attempt - 1 : 0,
        duration_seconds: Math.round((Date.now() - _gateStartedAt) / 1000),
      });
      return { exit: EXIT_OK, status: STATUS.PASS };
    }

    // ── Non-fixable failures ──
    if (result.reason === 'config_invalid') {
      const err = result.status?.error || 'unknown (no error detail available)';
      log('ERROR', `Gate '${gateId}' config invalid: ${err}`);
      getGateStats(config).gates_failed.push(gateId);
      return { exit: EXIT_NEEDS_NOVA, reason: err };
    }
    if (result.reason === 'spawn_failed') {
      const err = result.status?.error || 'unknown (no error detail available)';
      log('ERROR', `Gate '${gateId}' agent spawn failed: ${err}`);
      getGateStats(config).gates_failed.push(gateId);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' Spawn Failed`,
        `Buster agent could not be spawned: ${err}`);
      return { exit: EXIT_ERROR, reason: `Gate '${gateId}' spawn failed: ${err}` };
    }
    if (result.reason === 'parse_corrupted') {
      log('ERROR', `Gate '${gateId}' status file permanently corrupted`);
      getGateStats(config).gates_failed.push(gateId);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' Parse Corrupted`,
        `Gate status file is permanently unparseable after multiple attempts.`);
      return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' status file permanently corrupted` };
    }
    if (result.reason === 'timeout') {
      log('ERROR', `Gate '${gateId}' timed out after ${timeout}min`);
      getGateStats(config).gates_failed.push(gateId);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' TIMEOUT`,
        `Buster did not complete within ${timeout}min`);
      return { exit: EXIT_TIMEOUT, reason: `Gate '${gateId}' timed out` };
    }
    if (result.reason === 'git_error') {
      const err = result.status?.message || 'Polling git sync failed closed during gate execution';
      log('ERROR', `Gate '${gateId}' polling git sync failed closed: ${err}`);
      getGateStats(config).gates_failed.push(gateId);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' Polling Git Unsafe`, err.slice(0, 300));
      return { exit: EXIT_ERROR, reason: err, polling_git: result.status?.details || result.status || null };
    }

    // ── Rate limit (gate-level handling) ──
    if (result.reason === 'rate_limited') {
      rateLimitPauses++;
      if (rateLimitPauses > maxRateLimitPauses) {
        log('ERROR', `Gate '${gateId}' rate limit pauses exceeded (${rateLimitPauses}/${maxRateLimitPauses})`);
        getGateStats(config).gates_failed.push(gateId);
        await deps.discord(config, 'CRITICAL', `Gate '${gateId}' Rate Limit Exhausted`,
          `Exceeded max rate limit pauses (${maxRateLimitPauses}). Pipeline cannot continue.`);
        return { exit: EXIT_RATE_LIMITED, reason: `Gate '${gateId}' exceeded max rate limit pauses` };
      }
      const cooldownHours = config.rate_limit?.cooldown_hours ?? 2;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const resumeAt = new Date(Date.now() + cooldownMs);
      log('WARN', `Gate '${gateId}' rate limited (pause ${rateLimitPauses}/${maxRateLimitPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`);
      const rateLimitDetail = result.status?.detail || result.status?.reason || null;
      const embed = formatRateLimitEmbed(config, { detail: rateLimitDetail }, rateLimitPauses, maxRateLimitPauses, cooldownMs);
      await deps.discord(config, 'WARN', embed.title, embed.description, [
        { name: 'Gate', value: gateId },
        ...embed.fields,
      ]);
      await deps.sleep(cooldownMs);
      log('OK', `Gate '${gateId}' rate limit cooldown complete — retrying (attempt stays at ${attempt} due to rate limit)`);
      // Rate limit pause is NOT a fix attempt — don't increment attempt counter
      attempt--;
      continue;
    }

    // ── FAIL ──
    const failData = result.status || {};
    const issues = extractGateIssues(failData);
    const failReason = issues.map(i => i.title).join('; ') || 'unknown (no error detail available)';

    log('WARN', `Gate '${gateId}' FAIL: ${failReason}`);

    if (!hasFixLoop) {
      getGateStats(config).gates_failed.push(gateId);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' FAIL`, `Agent reported failure: ${failReason}`);
      onGateFail(_telemetryCtx(config), gateId, {
        gate_type: gate.type,
        issues_count: issues.length,
        fix_cycle: 0,
        duration_seconds: Math.round((Date.now() - _gateStartedAt) / 1000),
        reason: failReason,
      });
      return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' failed: ${failReason}` };
    }

    if (attempt > maxFixCycles) {
      log('ERROR', `Gate '${gateId}' fix loop exhausted (${maxFixCycles} attempts)`);
      getGateStats(config).gates_failed.push(gateId);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' BLOCKED`,
        `Fix loop exhausted after ${maxFixCycles} attempts. Issues: ${failReason}`);
      onGateFail(_telemetryCtx(config), gateId, {
        gate_type: gate.type,
        issues_count: issues.length,
        fix_cycle: attempt - 1,
        duration_seconds: Math.round((Date.now() - _gateStartedAt) / 1000),
        reason: `Fix loop exhausted after ${maxFixCycles} attempts`,
      });
      return {
        exit: EXIT_NEEDS_NOVA,
        reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
        gate: gateId,
        fix_attempts: maxFixCycles,
        remaining_issues: issues,
      };
    }

    // ── Fix cycle: Forge fixes, then retry ──
    log('STEP', `Gate '${gateId}' fix cycle ${attempt}/${maxFixCycles}`);
    await deps.discord(config, 'WARN', `Gate '${gateId}' FAIL — Auto-Fix`,
      `Attempt ${attempt}/${maxFixCycles}. Spawning Forge to fix ${issues.length} issue(s).`);

    const fixPromptResult = deps.buildGateFixPrompt(config, gate, issues, attempt, maxFixCycles, fixHistory);
    const fixPrompt = fixPromptResult.prompt;
    const forgeFixPolicy = deps.resolvePolicy(config, progress, 'forge', {
      scopeModel: gate.forge_model || null,
      scopeThinking: gate.forge_thinking_level || null,
      dispatchPath: 'acp',
    });
    const forgeModel = forgeFixPolicy.model;
    deps.logEffectivePolicy(config, { scope: 'gate_forge_fix', agent: 'forge', gateId, ...forgeFixPolicy });
    const fixLabel = `gatefix-${gateId}-${attempt}`;
    const fixAcpLabel = deps.acpLabel('forge', fixLabel);

    try {
      const logDir = gateLogDir(config, gateId);
      fs.writeFileSync(path.join(logDir, `forge-fix-prompt-cycle-${attempt}.md`), fixPrompt);
    } catch { /* non-critical */ }

    try {
      await deps.spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPrompt, { thinking: forgeFixPolicy.thinking });
    } catch (e) {
      log('ERROR', `Forge spawn for gate fix failed: ${e.message}`);
      await deps.discord(config, 'CRITICAL', `Gate Fix: Forge Spawn Failed`,
        `Attempt ${attempt}/${maxFixCycles}. Error: ${e.message}`);
      continue;
    }

    if (!(await deps.verifyAgentAlive(config, 'forge', fixLabel))) {
      log('WARN', `Forge health check failed for gate fix — skipping to next attempt`);
      await deps.discord(config, 'WARN', `Gate Fix: Forge Not Responding`,
        `Attempt ${attempt}/${maxFixCycles}. Forge spawned but health check failed. Retrying.`);
      await deps.killAgent(config, 'forge', fixLabel);
      continue;
    }

    await deps.discord(config, 'INFO', `Gate Fix: Forge Working`,
      `Attempt ${attempt}/${maxFixCycles}. Forge is fixing ${issues.length} issue(s)...`);

    const forgeTimeout = gate.timeout_minutes ?? config.default_timeout_minutes;
    const sessionResult = await deps.pollForSessionEnd(config, fixAcpLabel, forgeTimeout, fixLabel);

    // Save Forge gate-fix stream log before killing session
    const fixStreamPath = deps.getTrackedAgent(fixAcpLabel)?.streamLogPath;
    if (fixStreamPath) {
      try {
        if (fs.existsSync(fixStreamPath)) {
          const logDir = gateLogDir(config, gateId);
          const destPath = path.join(logDir, `forge-fix-transcript-cycle-${attempt}.jsonl`);
          fs.copyFileSync(fixStreamPath, destPath);
          log('OK', `Gate fix stream log saved: gates/${gateId}/forge-fix-transcript-cycle-${attempt}.jsonl`);
        }
      } catch (e) { log('DEBUG', `Gate fix stream log save failed (non-critical): ${e.message}`); }
    }

    await deps.killAgent(config, 'forge', fixLabel, sessionResult.hasChanges);

    fixHistory.push({ attempt, hasChanges: sessionResult.hasChanges, issues });

    if (!sessionResult.hasChanges) {
      const _transcript = sessionResult.transcript;
      const _tsActive = transcriptShowsProgress(_transcript);
      const reason = sessionResult.completed
        ? (_tsActive ? 'no file changes' : 'no changes (crashed?)')
        : 'timeout';
      const _tsField = _transcript
        ? (_tsActive
            ? `active (${_transcript.eventCount} events)`
            : `stale (no activity for ${_transcript.lastActivityPoll} polls)`)
        : 'unknown';
      log('WARN', `Gate fix '${fixLabel}' ${reason}. Skipping retest.`);
      await deps.discord(config, 'WARN', `Gate Fix ${reason}: ${gateId}`,
        `Fix attempt ${attempt}/${maxFixCycles} produced no usable output.`, [
          { name: 'Transcript', value: _tsField },
        ]);
      continue;
    }

    await deps.gitCommitAndPush(config, `[pipeline] Gate fix: ${gateId} attempt ${attempt}`, { softFail: true });

    // Cleanup old output so Buster writes fresh results
    if (gate.output_file) {
      const outPath = path.join(swarmRoot(config), gate.output_file);
      try {
        const archived = deps.archiveGateOutputIfPresent(config, gateId, outPath, { attempt });
        if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      } catch { /* ok */ }
    }
    const gateStatusFile = gateStatusPath(config, gateId);
    try {
      const archivedStatus = deps.archiveGateOutputIfPresent(config, gateId, gateStatusFile, { attempt, label: 'gate-status' });
      if (archivedStatus) log('INFO', `Archived previous gate status: ${relPath(config, archivedStatus)}`);
      if (fs.existsSync(gateStatusFile)) fs.unlinkSync(gateStatusFile);
    } catch { /* ok */ }

    await deps.discord(config, 'INFO', `Gate Fix: Retesting with Buster`,
      `Forge fix attempt ${attempt}/${maxFixCycles} committed. Running Buster gate again...`);

    // Loop continues -> next iteration runs _runBusterGateOnce again
  }

  // Should not reach here, but safety net
  log('ERROR', `Gate '${gateId}' ended unexpectedly — this should not happen`);
  return { exit: EXIT_NEEDS_NOVA, reason: `Gate '${gateId}' ended unexpectedly` };
}
