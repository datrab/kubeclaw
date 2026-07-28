import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

import fs from 'fs';
import { getActiveContext, log } from './logger.ts';
import { getRunId } from './runtime.ts';
import { pipelineLogDir } from './paths.ts';
import { emitPolicyAuditAppendWarning } from '../services/system-io-warning.ts';
import { canonicalizeModelId } from '../agents/runtime.ts';

export const VALID_THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'adaptive'];

/** Dispatch paths that support forwarding thinking to the agent harness. */
export const THINKING_SUPPORTED_PATHS = ['acp', 'subagent', 'redis'];

/** Dispatch paths where thinking parameters are silently dropped by the harness. */
export const THINKING_UNSUPPORTED_PATHS: any[] = [];

export function validateThinkingLevel(value: unknown, context: any = 'thinking') {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === null), () => (value === undefined))), () => (value === ''))) return;
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

function firstPolicyCandidate(candidates: Array<[any, string]>): { value: any; source: string } {
  for (const [value, source] of candidates) {
    if (value) return { value, source };
  }
  return { value: null, source: 'none' };
}

function selectThinkingPolicy(agentName: string, supported: boolean, dispatchPath: string | null, candidates: Array<[any, string]>) {
  if (!supported) return { value: null, source: `not_supported_on_${dispatchPath}` };
  const selected = firstPolicyCandidate(candidates);
  if (selected.value) validateThinkingLevel(selected.value, `${agentName} ${selected.source} thinking`);
  return selected;
}

export function resolvePolicy(config: any, progress: any, agentName: string, opts: any = {}) {
  const {
    scopeModel = null,
    scopeThinking = null,
    dispatchPath = null,
  } = opts;

  const runtimeOverrides =
    (getActiveContext()?.runtimeOverrides as Record<string, any> | null)
    ?? null;
  const runtimeModel   = selectDefinedValue(() => (runtimeOverrides?.model), () => (null));
  const runtimeThinking = selectDefinedValue(() => (runtimeOverrides?.thinking), () => (null));

  validateThinkingLevel(runtimeThinking,  'runtime --thinking');
  validateThinkingLevel(scopeThinking,    `${agentName} scope thinking`);

  const modelCandidates: Array<[string | null, string]> = [
    [normalize(runtimeModel),                                     'runtime_override'],
    [normalize(scopeModel),                                       'scope_policy'],
    [normalize(progress?.defaults?.models?.[agentName]),          'project_default'],
    [normalize(config?.fallback_model),                           'platform_fallback'],
  ];
  const selectedModel = firstPolicyCandidate(modelCandidates);
  const thinking_supported = selectTruthyValue(() => (!dispatchPath), () => (!THINKING_UNSUPPORTED_PATHS.includes(dispatchPath)));
  const selectedThinking = selectThinkingPolicy(agentName, thinking_supported, dispatchPath, [
    [runtimeThinking, 'runtime_override'],
    [scopeThinking, 'scope_policy'],
    [progress?.defaults?.thinking?.[agentName], 'project_default'],
  ]);
  return {
    model: selectedModel.value,
    thinking: selectedThinking.value,
    model_source: selectedModel.source,
    thinking_source: selectedThinking.source,
    thinking_supported,
  };
}

export function logEffectivePolicy(config: any, entry: any) {
  const logDir = pipelineLogDir(config); if (!logDir) return;
  const policyLog = `${logDir}/model-policy.jsonl`;
  try {
    const record = {
      ts:                 new Date().toISOString(),
      run_id:             getRunId(config),
      project:            selectDefinedValue(() => (config.project), () => ('')),
      scope:              selectTruthyValue(() => (entry.scope), () => ('missing_policy_scope')),
      agent:              selectTruthyValue(() => (entry.agent), () => ('missing_policy_agent')),
      ...(entry.moduleId && { module_id: entry.moduleId }),
      ...(entry.gateId   && { gate_id:   entry.gateId }),
      model:              selectDefinedValue(() => (entry.model), () => (null)),
      model_source:       selectDefinedValue(() => (entry.model_source), () => ('none')),
      thinking:           selectDefinedValue(() => (entry.thinking), () => (null)),
      thinking_source:    selectDefinedValue(() => (entry.thinking_source), () => ('none')),
      thinking_supported: entry.thinking_supported !== false,
    };
    fs.appendFileSync(policyLog, JSON.stringify(record) + '\n');
  } catch (e: any) {
    const error = e as Error;
    log('DEBUG', `[policy] logEffectivePolicy failed (non-critical): ${error.message}`);
    emitPolicyAuditAppendWarning(config, policyLog, error, entry);
  }
}
