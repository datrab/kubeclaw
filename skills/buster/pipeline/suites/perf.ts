import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: perf — Lighthouse Performance Audit
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: bounded perf defaults and tool failures remain inside the
// verdict contract; no-threshold scores use explicit evidence-only PASS mode.
// DELETE_LEGACY: legacy perf.output_path authority remains rejected, and
// enforced thresholds fail when requested Lighthouse categories are missing.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { buildSubprocessEnv } from '../security.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface PerfContext {
  moduleId?: string | undefined;
  module?: string | undefined;
  runId?: string | undefined;
  run_id?: string | undefined;
  logSink?: LogSink | null | undefined;
  attempt?: number | undefined;
  resultsDir?: string | undefined;
  testsLogDir?: string | null | undefined;
  suiteAbortSignal?: AbortSignal | undefined;
  suiteDeadlineMs?: number | undefined;
  config?: {
    serve?: AnyRecord;
    perf?: AnyRecord;
  };
}

interface PerfReportPaths {
  scratchPath: string;
  finalPath: string;
}

const DEFAULTS = {
  static_port: 9999,
  server_port: 3000,
  path: '/',
  timeout: 60,
};

const execFileAsync = promisify(execFile) as any;

const DEFAULT_RESULTS_DIR = process.env.BUSTER_RESULTS_DIR ?? '/home/builder/.openclaw/results';
const CATEGORY_NAMES: Record<string, string> = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best Practices',
  seo: 'SEO',
};

let _logSink: LogSink | null = null;
function log(msg: string): void {
  console.log(`[SUITE] [PERF] ${msg}`);
  if (_logSink) _logSink({ suite: 'perf', msg });
}

function objectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error == null ? 'missing_error_detail' : String(error);
}

function safeArtifactSegment(value: unknown, fallback = 'missing_artifact_segment'): string {
  const source = selectTruthyValue(() => (value == null), () => (value === '')) ? fallback : value;
  const segment = String(source).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
  if (segment) return segment;
  return fallback;
}

function timeoutWithinSuite(timeoutMs: number, context: PerfContext): number {
  if (typeof context.suiteDeadlineMs !== 'number') return timeoutMs;
  return Math.max(1, Math.min(timeoutMs, context.suiteDeadlineMs - Date.now()));
}

function evidenceMode(enforced: boolean): 'enforced' | 'evidence-only' {
  return enforced ? 'enforced' : 'evidence-only';
}

function lighthouseCategoryName(category: string): string {
  if (Object.prototype.hasOwnProperty.call(CATEGORY_NAMES, category)) return CATEGORY_NAMES[category];
  return category;
}

function scratchRunSegment(context: PerfContext): string {
  const runSegment = safeArtifactSegment(context.runId, '');
  const uniqueSegment = safeArtifactSegment(`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return runSegment ? `${runSegment}-${uniqueSegment}` : uniqueSegment;
}

export function resolvePerfReportPaths(context: PerfContext = {}, perfConf: AnyRecord = {}): PerfReportPaths {
  const normalizedPerfConf = selectDefinedValue(() => (objectRecord(perfConf)), () => ({}));
  if (Object.prototype.hasOwnProperty.call(normalizedPerfConf, 'output_path')) {
    throw new Error('perf.output_path is no longer supported; Lighthouse reports are written to the module test log directory');
  }
  const attempt = selectDefinedValue(() => (context.attempt), () => (1));
  const moduleSegment = safeArtifactSegment(context.moduleId);
  const resultsRoot = selectDefinedValue(() => (nonEmptyString(context.resultsDir)), () => (DEFAULT_RESULTS_DIR));
  const artifactDir = selectDefinedValue(() => (nonEmptyString(context.testsLogDir)), () => (path.join(resultsRoot, `${moduleSegment}-attempt-${attempt}`)));
  const runSegment = scratchRunSegment(context);
  const scratchPath = path.join(artifactDir, `.lighthouse-report-${moduleSegment}-attempt-${attempt}-${runSegment}.tmp.json`);
  const finalPath = path.join(artifactDir, `lighthouse-report-${moduleSegment}-attempt-${attempt}-${runSegment}.json`);
  return { scratchPath, finalPath };
}

function scoreSeverity(score: number, threshold: number): Finding['severity'] {
  const gap = threshold - score;
  if (gap >= 30) return SEVERITY.CRITICAL;
  if (gap >= 15) return SEVERITY.SERIOUS;
  if (gap >= 5) return SEVERITY.MODERATE;
  return SEVERITY.MINOR;
}

function toolErrorVerdict(startTime: number, message: string, rule = 'lighthouse-error'): SuiteVerdict {
  log(`ERROR: ${message}`);
  return createSuiteVerdict('perf', STATUS.ERROR, {
    critical: false,
    duration_ms: Date.now() - startTime,
    error: message,
    findings: rule === 'lighthouse-error' ? [] : [createFinding(SEVERITY.SERIOUS, message, { rule })],
  });
}

export default async function perfSuite(context: PerfContext): Promise<SuiteVerdict> {
  _logSink = selectTruthyValue(() => (context.logSink), () => (null));
  const startTime = Date.now();
  const serve = selectDefinedValue(() => (objectRecord(context.config?.serve)), () => ({}));
  const perfConf = selectDefinedValue(() => (objectRecord(context.config?.perf)), () => ({}));

  const type = selectDefinedValue(() => (nonEmptyString(serve.type)), () => ('static'));
  const port = selectDefinedValue(() => (serve.port), () => ((type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port)));
  const urlPath = selectDefinedValue(() => (nonEmptyString(perfConf.path)), () => (DEFAULTS.path));
  const url = `http://localhost:${port}${urlPath}`;

  const thresholds = objectRecord(perfConf.thresholds);
  const enforced = thresholds !== null;
  const mode = evidenceMode(enforced);
  const timeout = timeoutWithinSuite((selectDefinedValue(() => (perfConf.timeout), () => (DEFAULTS.timeout))) * 1000, context);

  let reportPaths: PerfReportPaths;
  try {
    reportPaths = resolvePerfReportPaths(context, perfConf);
  } catch (error) {
    return toolErrorVerdict(startTime, errorMessage(error), 'path-boundary');
  }
  const { scratchPath, finalPath } = reportPaths;

  log(`Auditing ${url} (mode: ${mode}${enforced ? ', thresholds: ' + JSON.stringify(thresholds) : ''})`);

  for (const targetDir of new Set([path.dirname(scratchPath), path.dirname(finalPath)])) {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.rmSync(scratchPath, { force: true });

  let report: AnyRecord;
  try {
    const args = [
      url,
      '--output', 'json',
      '--output-path', scratchPath,
      '--chrome-flags=--headless --no-sandbox --disable-setuid-sandbox --disable-gpu',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--quiet',
    ];

    await execFileAsync('lighthouse', args, {
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildSubprocessEnv(),
      signal: context.suiteAbortSignal,
    });

    if (!fs.existsSync(scratchPath)) throw new Error(`Lighthouse report not found at ${scratchPath}`);
    report = JSON.parse(fs.readFileSync(scratchPath, 'utf8'));
    fs.renameSync(scratchPath, finalPath);
  } catch (error: any) {
    const message = error?.stderr ? String(error.stderr).slice(0, 500) : errorMessage(error);
    return toolErrorVerdict(startTime, message);
  }

  const categories = selectDefinedValue(() => (objectRecord(report.categories)), () => ({}));
  const scores: Record<string, number> = {};
  for (const [key, cat] of Object.entries(categories)) {
    const category = cat as AnyRecord;
    scores[key] = Math.round((selectDefinedValue(() => (category.score), () => (0))) * 100);
  }

  log(`Scores: ${Object.entries(scores).map(([key, value]) => `${key}=${value}`).join(', ')}`);

  const findings: Finding[] = [];
  let checksFailed = 0;
  let checksTotal = 0;

  if (enforced) {
    for (const [category, rawThreshold] of Object.entries(thresholds)) {
      const threshold = Number(rawThreshold);
      const score = scores[category];
      const name = lighthouseCategoryName(category);
      checksTotal++;

      if (score === undefined) {
        checksFailed++;
        findings.push(createFinding(SEVERITY.SERIOUS, `${name}: Lighthouse category missing from report; cannot enforce threshold ${threshold}`, { rule: `lighthouse-${category}-missing` }));
        continue;
      }

      if (score < threshold) {
        checksFailed++;
        findings.push(createFinding(scoreSeverity(score, threshold), `${name}: score ${score} below threshold ${threshold}`, { rule: `lighthouse-${category}` }));
      }
    }
  } else {
    for (const [category, score] of Object.entries(scores)) {
      checksTotal++;
      const name = lighthouseCategoryName(category);
      if (score < 50) findings.push(createFinding(SEVERITY.MODERATE, `${name}: score ${score} (low)`, { rule: `lighthouse-${category}` }));
      else if (score < 70) findings.push(createFinding(SEVERITY.MINOR, `${name}: score ${score} (could improve)`, { rule: `lighthouse-${category}` }));
    }
  }

  const checksPassed = checksTotal - checksFailed;
  const duration_ms = Date.now() - startTime;
  const status: SuiteStatus = (enforced && checksFailed > 0) ? STATUS.FAIL : STATUS.PASS;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${mode}: ${checksPassed}/${checksTotal} (${duration_ms}ms)`);

  return createSuiteVerdict('perf', status, {
    critical: false,
    duration_ms,
    checks_total: checksTotal,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
    findings,
    metadata: {
      tool: 'Lighthouse CLI',
      url_tested: url,
      scores,
      mode,
      ...(enforced ? { thresholds } : {}),
      report_path: finalPath,
      scratch_report_path: scratchPath,
    },
  });
}
