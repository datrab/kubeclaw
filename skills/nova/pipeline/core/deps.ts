// core/deps.ts — explicit dependency-injection helpers
//
// Dependencies flow through function options (typically opts.deps). They are
// never read from or attached to runtime config.

const DI_SCOPES = new Set([
  'adapters',
  'approvalGate',
  'busterGate',
  'caseStudy',
  'completionEventAdapters',
  'discord',
  'failures',
  'gateRunner',
  'moduleRunner',
  'pipelineReview',
  'pipelineRunner',
  'rateLimit',
  'reviewGate',
  'telemetry',
]);

function isPlainObject(value: any) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function selectDeps(explicit: any = null, scope: any = null) {
  if (!isPlainObject(explicit)) return {};
  const scoped = scope && isPlainObject(explicit[scope]) ? explicit[scope] : {};
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(explicit)) {
    if (DI_SCOPES.has(key) && isPlainObject(value)) continue;
    flat[key] = value;
  }
  return { ...scoped, ...flat };
}
