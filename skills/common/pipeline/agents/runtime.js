export function modelToHarness(modelId) {
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

export function isSubagentModel(modelId) {
  const m = String(modelId || '').toLowerCase();
  return m.startsWith('openai/')
    || m.startsWith('openai-codex/')
    || m.includes('gpt-5')
    || m.includes('codex');
}

export function resolveRuntime(input = {}) {
  if (typeof input === 'string') return isSubagentModel(input) ? 'subagent' : 'acp';

  const runtime = typeof input?.runtime === 'string'
    ? input.runtime.trim().toLowerCase()
    : typeof input?.dispatch === 'string'
      ? input.dispatch.trim().toLowerCase()
      : null;

  if (runtime === 'acp' || runtime === 'subagent') return runtime;
  return isSubagentModel(input?.model) ? 'subagent' : 'acp';
}
