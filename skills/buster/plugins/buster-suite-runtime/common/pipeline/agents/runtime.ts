import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
export function modelToHarness(modelId: any) {
  if (!modelId) return null;
  const m = String(modelId).toLowerCase();
  if (m.includes('claude')) return 'claude';
  if (m.includes('codex')) return 'codex';
  if (m.includes('gpt')) return 'codex';
  if (m.includes('gemini')) return 'gemini';
  if (m.includes('opencode')) return 'opencode';
  if (m.includes('kimi')) return 'kimi';
  return null;
}

export function canonicalizeModelId(modelId: any) {
  if (!modelId) return null;
  const raw = String(modelId).trim();
  if (!raw) return null;
  return raw
    .replace(/^openai-codex\//i, 'openai/')
    .replace(/^codex-(?=\d)/i, 'gpt-');
}

export function isSubagentModel(modelId: any) {
  const m = String(selectDefinedValue(() => (canonicalizeModelId(modelId)), () => (''))).toLowerCase();
  return selectTruthyValue(() => (selectTruthyValue(() => (m.startsWith('openai/')), () => (m.includes('gpt-5')))), () => (m.includes('codex')));
}

export function resolveRuntime(input: any = {}) {
  if (typeof input === 'string') return isSubagentModel(input) ? 'subagent' : 'acp';

  const runtime = typeof input?.runtime === 'string'
    ? input.runtime.trim().toLowerCase()
    : typeof input?.dispatch === 'string'
      ? input.dispatch.trim().toLowerCase()
      : null;

  if (selectTruthyValue(() => (runtime === 'acp'), () => (runtime === 'subagent'))) return runtime;
  return isSubagentModel(input?.model) ? 'subagent' : 'acp';
}
