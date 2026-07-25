import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Project summary report formatters
// ═══════════════════════════════════════════════════════════════

export function formatDuration(seconds: any) {
  if (selectTruthyValue(() => (!seconds), () => (seconds <= 0))) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}
export function formatNum(n: any) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function pct(a: any, b: any) { return b > 0 ? Math.round((a / b) * 100) : 0; }

export const DISPLAY_ABSENT = '—';
export const PASS_STATUSES = new Set(['PASS']);
export const FAIL_STATUSES = new Set(['FAIL']);

function isRecord(value: any) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function reportRecord(value: any, field: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return {};
  if (!isRecord(value)) throw new Error(`${field}: expected project-summary object`);
  return value;
}

export function reportArray(value: any, field: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return [];
  if (!Array.isArray(value)) throw new Error(`${field}: expected project-summary array`);
  return value;
}

export function reportNumber(value: any, field: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`${field}: expected project-summary number`);
}

export function reportString(value: any, field: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return '';
  if (typeof value === 'string') return value;
  throw new Error(`${field}: expected project-summary string`);
}

export function reportDisplay(value: any) {
  const text = reportString(value, 'project_summary.display');
  return text.length > 0 ? text : DISPLAY_ABSENT;
}

export function displayList(items: any) {
  const text = reportArray(items, 'project_summary.display_list').join(', ');
  return text.length > 0 ? text : DISPLAY_ABSENT;
}

function firstReportText(field: any, values: any) {
  for (const value of values) {
    const text = reportString(value, field).trim();
    if (text.length > 0) return text;
  }
  return '';
}

export function passGateCount(gateStats: any) {
  return reportArray(gateStats, 'pipeline.gateStats').filter((gate: any) => PASS_STATUSES.has(gate.status)).length;
}

export function failedGateCount(gateStats: any) {
  return reportArray(gateStats, 'pipeline.gateStats').filter((gate: any) => !PASS_STATUSES.has(gate.status)).length;
}

export function finalStatusLabel({ allModulesPassed, allGatesPassed, blockedCount = 0 }: any) {
  if (allModulesPassed && allGatesPassed) return 'PASS';
  return blockedCount > 0 ? 'BLOCKED' : 'INCOMPLETE';
}

export function blockedOutcomeLine(moduleStats: any) {
  const blocked = reportArray(moduleStats, 'pipeline.moduleStats').find((module: any) => module.status === 'BLOCKED');
  if (!blocked) return null;
  const phase = firstReportText('pipeline.moduleStats.blockedPhase', [
    selectDefinedValue(() => (blocked.blockedPhase), () => (null)),
    selectDefinedValue(() => (blocked.blocked_phase), () => (null)),
  ]);
  const reason = firstReportText('pipeline.moduleStats.blockedReason', [
    selectDefinedValue(() => (blocked.blockedReason), () => (null)),
    selectDefinedValue(() => (blocked.completionSummary), () => (null)),
  ]);
  return `- **Blocking Point:** ${moduleDisplayName(blocked)}${phase ? ` / ${phase}` : ''}${reason ? ` — ${reason}` : ''}`;
}

export function hasPassedAllGates(gateStats: any) {
  return reportArray(gateStats, 'pipeline.gateStats').every((gate: any) => PASS_STATUSES.has(gate.status));
}

export function normalizeFormatterInput({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents }: any) {
  return {
    code: reportRecord(code, 'code'),
    pipeline: reportRecord(pipeline, 'pipeline'),
    tests: reportRecord(tests, 'tests'),
    unitCensus: reportRecord(unitCensus, 'unitCensus'),
    apiCensus: reportRecord(apiCensus, 'apiCensus'),
    reviews: reportRecord(reviews, 'reviews'),
    agents: reportRecord(agents, 'agents'),
  };
}

export function pythonUnitFunctions(unitCensus: any) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const python = reportRecord(census.python, 'unitCensus.python');
  if (python.functions !== undefined && python.functions !== null) return reportNumber(python.functions, 'unitCensus.python.functions');
  return reportNumber(census.pythonFunctions, 'unitCensus.pythonFunctions');
}

export function frontendUnitFunctions(unitCensus: any) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const frontend = reportRecord(census.frontend, 'unitCensus.frontend');
  if (frontend.functions !== undefined && frontend.functions !== null) return reportNumber(frontend.functions, 'unitCensus.frontend.functions');
  return reportNumber(census.frontendBlocks, 'unitCensus.frontendBlocks');
}

export function pythonUnitFiles(unitCensus: any) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const python = reportRecord(census.python, 'unitCensus.python');
  if (python.files !== undefined && python.files !== null) return reportNumber(python.files, 'unitCensus.python.files');
  return reportNumber(census.pythonFiles, 'unitCensus.pythonFiles');
}

export function frontendUnitFiles(unitCensus: any) {
  const census = reportRecord(unitCensus, 'unitCensus');
  const frontend = reportRecord(census.frontend, 'unitCensus.frontend');
  if (frontend.files !== undefined && frontend.files !== null) return reportNumber(frontend.files, 'unitCensus.frontend.files');
  return reportNumber(census.frontendFiles, 'unitCensus.frontendFiles');
}

export function apiSpecs(apiCensus: any) {
  return reportArray(reportRecord(apiCensus, 'apiCensus').specs, 'apiCensus.specs');
}

export function apiTotalCases(apiCensus: any) {
  return reportNumber(reportRecord(apiCensus, 'apiCensus').totalCases, 'apiCensus.totalCases');
}

export function totalTestSurface(unitCensus: any, apiCensus: any) {
  return pythonUnitFunctions(unitCensus) + frontendUnitFunctions(unitCensus) + apiTotalCases(apiCensus);
}

export function moduleFailCount(module: any) {
  const record = reportRecord(module, 'pipeline.module');
  if (record.failCount !== undefined && record.failCount !== null) return reportNumber(record.failCount, 'pipeline.module.failCount');
  return reportNumber(record.fails, 'pipeline.module.fails');
}

const SCOPE_GROUP_KEYS = new Set([
  'platform_backend',
  'frontend_ui',
  'delivery_ops',
  'data_security',
  'other',
]);

function normalizeScopeGroup(value: any) {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return SCOPE_GROUP_KEYS.has(normalized) ? normalized : 'other';
}

export function moduleDisplayName(module: any) {
  if (typeof module === 'string') return module;
  const record = reportRecord(module, 'pipeline.module');
  return firstReportText('pipeline.module.display_name', [record.title, record.name, record.id]);
}

function moduleScopeGroup(module: any) {
  if (selectTruthyValue(() => (!module), () => (typeof module === 'string'))) return 'other';
  const record = reportRecord(module, 'pipeline.module');
  const scope = reportRecord(record.scope, 'pipeline.module.scope');
  const metadata = reportRecord(record.metadata, 'pipeline.module.metadata');
  return normalizeScopeGroup(
    firstReportText('pipeline.module.scope_group', [
      record.scope_group,
      record.scopeGroup,
      scope.group,
      record.category,
      metadata.scope_group,
      metadata.scopeGroup,
    ])
  );
}

export function groupDeliveredScope(modules: any) {
  const groups: Record<string, string[]> = {
    platform_backend: [],
    frontend_ui: [],
    delivery_ops: [],
    data_security: [],
    other: [],
  };
  for (const module of reportArray(modules, 'pipeline.modules')) {
    const title = moduleDisplayName(module);
    if (title.length === 0) continue;
    groups[moduleScopeGroup(module)]!.push(title);
  }
  return groups;
}

function languageTotalLines(code: any) {
  const byLang = reportRecord(code.byLang, 'code.byLang');
  const json = reportRecord(byLang.JSON, 'code.byLang.JSON');
  const markdown = reportRecord(byLang.Markdown, 'code.byLang.Markdown');
  const yaml = reportRecord(byLang.YAML, 'code.byLang.YAML');
  return Math.max(1,
    reportNumber(code.totalLines, 'code.totalLines')
    - reportNumber(json.total, 'code.byLang.JSON.total')
    - reportNumber(markdown.total, 'code.byLang.Markdown.total')
    - reportNumber(yaml.total, 'code.byLang.YAML.total')
  );
}

export function languageRows(code: any) {
  const totalLines = languageTotalLines(code);
  return Object.entries(reportRecord(code.byLang, 'code.byLang'))
    .map(([lang, value]: any) => {
      const stats = reportRecord(value, `code.byLang.${lang}`);
      const lines = reportNumber(stats.code, `code.byLang.${lang}.code`);
      return { name: lang, lines, share_pct: pct(lines, totalLines) };
    })
    .filter((entry: any) => entry.lines > 0);
}
