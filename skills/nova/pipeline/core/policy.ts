// core/policy.ts — Deterministic model and thinking override policy resolver
//
// PRECEDENCE (highest wins):
//   1. runtime override  — PipelineContext.runtimeOverrides.model / .thinking
//   2. scope policy      — per-module (mod.forge_model, mod.thinking_level) or
//                          per-gate (gate.model, gate.thinking_level) override
//   3. project default   — progress.defaults.models[agentName]
//                          progress.defaults.thinking[agentName]
//   4. platform fallback — config.fallback_model
//   5. no value (null)   — caller surfaces missing config
//
// THINKING SUPPORT BOUNDARIES:
//   ACP / subagent paths: fully supported.
//   Redis / Buster dispatch: supported when the Redis payload carries the
//   thinking level through to the Buster session launch.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { getActiveContext, log } from './logger.ts';
import { getRunId } from './runtime.ts';
import { pipelineLogDir } from './paths.ts';
import { emitPolicyAuditAppendWarning } from '../services/system-io-warning.ts';
import { canonicalizeModelId } from '../agents/runtime.ts';

export const VALID_THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'adaptive'];

/** Dispatch paths that support forwarding thinking to the agent harness. */
export const THINKING_SUPPORTED_PATHS = ['acp', 'subagent', 'redis'];

/** Dispatch paths where thinking parameters are silently dropped by the harness. */
export const THINKING_UNSUPPORTED_PATHS = [];

export function validateThinkingLevel(value: unknown, context = 'thinking') {
  if (value === null || value === undefined || value === '') return;
  if (!VALID_THINKING_LEVELS.includes(String(value))) {
    throw new Error(
      `${context}: invalid thinking level '${value}'. ` +
      `Valid values: ${VALID_THINKING_LEVELS.join(', ')}`
    );
  }
}

function normalize(v: any) {
  if (!v) return null;
  if (typeof v === 'string') return canonicalizeModelId(v);
  if (typeof v === 'object' && typeof v.model === 'string') return canonicalizeModelId(v.model);
  return null;
}

export function resolvePolicy(config: any, progress: any, agentName: string, opts: any = {}) {
  const {
    scopeModel = null,
    scopeThinking = null,
    dispatchPath = null,
  } = opts;

  const runtimeOverrides = getActiveContext()?.runtimeOverrides || null;
  const runtimeModel   = runtimeOverrides?.model    ?? null;
  const runtimeThinking = runtimeOverrides?.thinking ?? null;

  validateThinkingLevel(runtimeThinking,  'runtime --thinking');
  validateThinkingLevel(scopeThinking,    `${agentName} scope thinking`);

  let model = null;
  let model_source = 'none';

  const modelCandidates = [
    [normalize(runtimeModel),                                     'runtime_override'],
    [normalize(scopeModel),                                       'scope_policy'],
    [normalize(progress?.defaults?.models?.[agentName]),          'project_default'],
    [normalize(config?.fallback_model),                           'platform_fallback'],
  ];
  for (const [value, source] of modelCandidates) {
    if (value) { model = value; model_source = source; break; }
  }

  let thinking = null;
  let thinking_source = 'none';
  const thinking_supported = !dispatchPath || !THINKING_UNSUPPORTED_PATHS.includes(dispatchPath);

  if (!thinking_supported) {
    thinking_source = `not_supported_on_${dispatchPath}`;
  } else {
    const thinkingCandidates = [
      [runtimeThinking || null,                                          'runtime_override'],
      [scopeThinking   || null,                                          'scope_policy'],
      [progress?.defaults?.thinking?.[agentName] || null,                'project_default'],
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

export function logEffectivePolicy(config: any, entry: any) {
  const logDir = pipelineLogDir(config); if (!logDir) return;
  const policyLog = `${logDir}/model-policy.jsonl`;
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
    fs.appendFileSync(policyLog, JSON.stringify(record) + '\n');
  } catch (e) {
    const error = e as Error;
    log('DEBUG', `[policy] logEffectivePolicy failed (non-critical): ${error.message}`);
    emitPolicyAuditAppendWarning(config, policyLog, error, entry);
  }
}
