// core/policy.js — Deterministic model and thinking override policy resolver
//
// PRECEDENCE (highest wins):
//   1. runtime override  — config._runtimeOverrides.model / .thinking
//                          (set by CLI --model / --thinking flags)
//   2. scope policy      — per-module (mod.forge_model, mod.thinking_level) or
//                          per-gate (gate.model, gate.thinking_level) override
//   3. project default   — progress.defaults.models[agentName]
//                          progress.defaults.thinking[agentName]
//   4. config default    — config.models[agentName]
//                          config.agents[agentName].thinking_level
//   5. no value (null)   — callers decide their own hardcoded fallback
//
// THINKING SUPPORT BOUNDARIES:
//   ACP / subagent paths (Forge, Echo/reviewer): fully supported.
//   Redis / Buster dispatch: NOT supported.
//     Rationale: Buster receives a JSON task payload dispatched over Redis.
//     The Redis dispatcher does not have a channel to forward thinking settings
//     to the Buster agent; any thinking value would be silently discarded by the
//     harness layer. Rather than pretend it applies, the policy resolver
//     explicitly records thinking_source as 'not_supported_on_redis' so that
//     post-run analysis can see the boundary was respected rather than confused.

import fs from 'fs';
import path from 'path';
import { log } from './logger.js';
import { getRunId } from './runtime.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const VALID_THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh'];

/** Dispatch paths that support forwarding thinking to the agent harness. */
export const THINKING_SUPPORTED_PATHS = ['acp', 'subagent'];

/** Dispatch paths where thinking parameters are silently dropped by the harness. */
export const THINKING_UNSUPPORTED_PATHS = ['redis'];

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a thinking level value. Throws clearly on invalid input.
 * null / undefined / empty string are treated as "no override" and pass validation.
 *
 * @param {string|null|undefined} value
 * @param {string} context - for error messages
 * @throws {Error} if value is non-empty and not in VALID_THINKING_LEVELS
 */
export function validateThinkingLevel(value, context = 'thinking') {
  if (value === null || value === undefined || value === '') return;
  if (!VALID_THINKING_LEVELS.includes(String(value))) {
    throw new Error(
      `${context}: invalid thinking level '${value}'. ` +
      `Valid values: ${VALID_THINKING_LEVELS.join(', ')}`
    );
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function normalize(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'object' && typeof v.model === 'string') return v.model.trim() || null;
  return null;
}

// ── Policy resolver ───────────────────────────────────────────────────────────

/**
 * Resolve model and thinking policy for one execution spawn.
 *
 * Runtime overrides are read automatically from config._runtimeOverrides
 * (set by the CLI parser before pipeline execution begins).
 *
 * @param {object} config    - Pipeline config. Runtime overrides live in
 *                             config._runtimeOverrides = { model, thinking }.
 * @param {object} progress  - Project progress. Project-level defaults in
 *                             progress.defaults.models[name] / .thinking[name].
 * @param {string} agentName - Role name: 'forge', 'buster', 'echo', 'arch_validator', etc.
 * @param {object} opts
 *   opts.scopeModel     - per-module or per-gate model override
 *   opts.scopeThinking  - per-module or per-gate thinking override
 *   opts.dispatchPath   - 'acp' | 'subagent' | 'redis' (determines thinking support)
 *
 * @returns {{
 *   model: string|null,
 *   thinking: string|null,
 *   model_source: string,
 *   thinking_source: string,
 *   thinking_supported: boolean,
 * }}
 * @throws {Error} if any thinking value fails validation
 */
export function resolvePolicy(config, progress, agentName, opts = {}) {
  const {
    scopeModel = null,
    scopeThinking = null,
    dispatchPath = null,
  } = opts;

  const runtimeModel   = config?._runtimeOverrides?.model    ?? null;
  const runtimeThinking = config?._runtimeOverrides?.thinking ?? null;

  // Validate all incoming thinking values upfront — fail early, fail clearly
  validateThinkingLevel(runtimeThinking,  'runtime --thinking');
  validateThinkingLevel(scopeThinking,    `${agentName} scope thinking`);

  // ── Model resolution ───────────────────────────────────────────────────────
  let model = null;
  let model_source = 'none';

  const modelCandidates = [
    [normalize(runtimeModel),                                     'runtime_override'],
    [normalize(scopeModel),                                       'scope_policy'],
    [normalize(progress?.defaults?.models?.[agentName]),          'project_default'],
    [normalize(config?.models?.[agentName]),                      'config_default'],
  ];
  for (const [value, source] of modelCandidates) {
    if (value) { model = value; model_source = source; break; }
  }

  // ── Thinking resolution ────────────────────────────────────────────────────
  let thinking = null;
  let thinking_source = 'none';
  const thinking_supported = !dispatchPath || !THINKING_UNSUPPORTED_PATHS.includes(dispatchPath);

  if (!thinking_supported) {
    // Do not pretend thinking applies on this dispatch path
    thinking_source = `not_supported_on_${dispatchPath}`;
  } else {
    const thinkingCandidates = [
      [runtimeThinking || null,                                          'runtime_override'],
      [scopeThinking   || null,                                          'scope_policy'],
      [progress?.defaults?.thinking?.[agentName] || null,               'project_default'],
      [config?.agents?.[agentName]?.thinking_level || null,             'config_default'],
    ];
    for (const [value, source] of thinkingCandidates) {
      if (value) {
        validateThinkingLevel(value, `${agentName} ${source} thinking`);
        thinking = value;
        thinking_source = source;
        break;
      }
    }
  }

  return { model, thinking, model_source, thinking_source, thinking_supported };
}

// ── Policy artifact logging ───────────────────────────────────────────────────

/**
 * Append an effective-policy resolution record to
 * .swarm/logs/pipeline/model-policy.jsonl.
 *
 * Non-blocking — never throws, never delays pipeline execution.
 * Each record captures the resolved model/thinking and the source of each
 * value so post-run analysis can reconstruct why a particular choice was made.
 *
 * @param {object} config
 * @param {object} entry
 *   entry.scope             - 'module_forge' | 'module_buster' | 'gate_buster' |
 *                             'gate_forge_fix' | 'reviewer' | 'arch_validator'
 *   entry.agent             - agent/role name
 *   entry.moduleId          - (optional) module identifier
 *   entry.gateId            - (optional) gate identifier
 *   entry.model             - resolved model (null if none)
 *   entry.model_source      - source of the model value
 *   entry.thinking          - resolved thinking level (null if none)
 *   entry.thinking_source   - source of the thinking value
 *   entry.thinking_supported - whether thinking applies on this dispatch path
 */
export function logEffectivePolicy(config, entry) {
  if (!config?._logDir) return;
  try {
    const record = {
      ts:                 new Date().toISOString(),
      run_id:             getRunId(config),
      project:            config.project || '',
      scope:              entry.scope              || 'unknown',
      agent:              entry.agent              || 'unknown',
      ...(entry.moduleId && { module_id: entry.moduleId }),
      ...(entry.gateId   && { gate_id:   entry.gateId }),
      model:              entry.model              ?? null,
      model_source:       entry.model_source       || 'none',
      thinking:           entry.thinking           ?? null,
      thinking_source:    entry.thinking_source    || 'none',
      thinking_supported: entry.thinking_supported !== false,
    };
    const policyLog = path.join(config._logDir, 'pipeline', 'model-policy.jsonl');
    fs.appendFileSync(policyLog, JSON.stringify(record) + '\n');
  } catch (e) {
    log('DEBUG', `[policy] logEffectivePolicy failed (non-critical): ${e.message}`);
  }
}
