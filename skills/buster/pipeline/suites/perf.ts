import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: perf — Lighthouse Performance Audit
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: bounded perf defaults and tool failures remain inside the
// verdict contract; no-threshold scores use explicit evidence-only PASS mode.
// DELETE_LEGACY: legacy perf.output_path authority remains rejected, and
// enforced thresholds fail when requested Lighthouse categories are missing.

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { buildSubprocessEnv } from '../security.ts';
import {
  createSuiteLog,
  suiteErrorMessage as errorMessage,
  suiteNonEmptyString as nonEmptyString,
  suiteObject as objectRecord,
  suiteObjectOrEmpty as objectRecordOrEmpty,
} from './support.ts';
import { readBusterEnvironment } from '../runtime-environment.ts';

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

interface PerfSettings extends PerfReportPaths {
  url: string;
  thresholds: AnyRecord | null;
  timeout: number;
}

interface PerfEvaluation {
  findings: Finding[];
  checksTotal: number;
  checksFailed: number;
}

const DEFAULTS = {
  static_port: 9999,
  server_port: 3000,
  path: '/',
  timeout: 60,
};

const execFileAsync = promisify(execFile) as any;

const DEFAULT_RESULTS_DIR = readBusterEnvironment('BUSTER_RESULTS_DIR') ?? '/home/builder/.openclaw/results';
const CATEGORY_NAMES: Record<string, string> = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best Practices',
  seo: 'SEO',
};

const perfSuiteState: { logSink: LogSink | null } = { logSink: null };
const log = createSuiteLog('perf', 'PERF', (entry) => perfSuiteState.logSink?.(entry));

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
  const configuredName = CATEGORY_NAMES[category];
  if (configuredName !== undefined) return configuredName;
  return category;
}

function scratchRunSegment(context: PerfContext): string {
  const runSegment = safeArtifactSegment(context.runId, '');
  const uniqueSegment = safeArtifactSegment(`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return runSegment ? `${runSegment}-${uniqueSegment}` : uniqueSegment;
}

export function resolvePerfReportPaths(context: PerfContext = {}, perfConf: AnyRecord = {}): PerfReportPaths {
  const normalizedPerfConf = objectRecordOrEmpty(perfConf);
  if (Object.prototype.hasOwnProperty.call(normalizedPerfConf, 'output_path')) {
    throw new Error('perf.output_path is no longer supported; Lighthouse reports are written to the module test log directory');
  }
  const attempt = selectDefinedValue(() => (context.attempt), () => (1));
  const moduleSegment = safeArtifactSegment(context.moduleId);
  const configuredResultsRoot = nonEmptyString(context.resultsDir);
  const resultsRoot = configuredResultsRoot === null ? DEFAULT_RESULTS_DIR : configuredResultsRoot;
  const configuredArtifactDir = nonEmptyString(context.testsLogDir);
  const artifactDir = configuredArtifactDir === null ? path.join(resultsRoot, `${moduleSegment}-attempt-${attempt}`) : configuredArtifactDir;
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

function resolvePerfSettings(context: PerfContext): PerfSettings {
  const serve = objectRecordOrEmpty(context.config?.serve);
  const config = objectRecordOrEmpty(context.config?.perf);
  const type = nonEmptyString(serve.type) ?? 'static';
  const port = serve.port ?? (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const urlPath = nonEmptyString(config.path) ?? DEFAULTS.path;
  return {
    ...resolvePerfReportPaths(context, config),
    url: `http://localhost:${port}${urlPath}`,
    thresholds: objectRecord(config.thresholds),
    timeout: timeoutWithinSuite((config.timeout ?? DEFAULTS.timeout) * 1000, context),
  };
}

async function runLighthouse(context: PerfContext, settings: PerfSettings): Promise<AnyRecord> {
  for (const targetDir of new Set([path.dirname(settings.scratchPath), path.dirname(settings.finalPath)])) {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.rmSync(settings.scratchPath, { force: true });
  const args = [
    settings.url,
    '--output', 'json',
    '--output-path', settings.scratchPath,
    '--chrome-flags=--headless --no-sandbox --disable-setuid-sandbox --disable-gpu',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--quiet',
  ];
  await execFileAsync('lighthouse', args, {
    encoding: 'utf8',
    timeout: settings.timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: buildSubprocessEnv(),
    signal: context.suiteAbortSignal,
  });
  if (!fs.existsSync(settings.scratchPath)) throw new Error(`Lighthouse report not found at ${settings.scratchPath}`);
  const report = JSON.parse(fs.readFileSync(settings.scratchPath, 'utf8'));
  fs.renameSync(settings.scratchPath, settings.finalPath);
  return report;
}

function extractScores(report: AnyRecord): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const [key, value] of Object.entries(objectRecordOrEmpty(report.categories))) {
    scores[key] = Math.round(((value as AnyRecord).score ?? 0) * 100);
  }
  return scores;
}

function evaluateEnforcedScores(scores: Record<string, number>, thresholds: AnyRecord): PerfEvaluation {
  const findings: Finding[] = [];
  let checksFailed = 0;
  for (const [category, rawThreshold] of Object.entries(thresholds)) {
    const threshold = Number(rawThreshold);
    const score = scores[category];
    const name = lighthouseCategoryName(category);
    if (score === undefined) {
      checksFailed += 1;
      findings.push(createFinding(SEVERITY.SERIOUS, `${name}: Lighthouse category missing from report; cannot enforce threshold ${threshold}`, { rule: `lighthouse-${category}-missing` }));
    } else if (score < threshold) {
      checksFailed += 1;
      findings.push(createFinding(scoreSeverity(score, threshold), `${name}: score ${score} below threshold ${threshold}`, { rule: `lighthouse-${category}` }));
    }
  }
  return { findings, checksTotal: Object.keys(thresholds).length, checksFailed };
}

function evaluateInformationalScores(scores: Record<string, number>): PerfEvaluation {
  const findings: Finding[] = [];
  for (const [category, score] of Object.entries(scores)) {
    const name = lighthouseCategoryName(category);
    if (score < 50) findings.push(createFinding(SEVERITY.MODERATE, `${name}: score ${score} (low)`, { rule: `lighthouse-${category}` }));
    else if (score < 70) findings.push(createFinding(SEVERITY.MINOR, `${name}: score ${score} (could improve)`, { rule: `lighthouse-${category}` }));
  }
  return { findings, checksTotal: Object.keys(scores).length, checksFailed: 0 };
}

function evaluateScores(scores: Record<string, number>, thresholds: AnyRecord | null): PerfEvaluation {
  if (thresholds) return evaluateEnforcedScores(scores, thresholds);
  return evaluateInformationalScores(scores);
}

function completedPerfVerdict(startTime: number, settings: PerfSettings, scores: Record<string, number>, evaluation: PerfEvaluation): SuiteVerdict {
  const enforced = settings.thresholds !== null;
  const checksPassed = evaluation.checksTotal - evaluation.checksFailed;
  const status: SuiteStatus = enforced && evaluation.checksFailed > 0 ? STATUS.FAIL : STATUS.PASS;
  const durationMs = Date.now() - startTime;
  const mode = evidenceMode(enforced);
  log(`${status === STATUS.PASS ? '✅' : '⚠️'} ${mode}: ${checksPassed}/${evaluation.checksTotal} (${durationMs}ms)`);
  return createSuiteVerdict('perf', status, {
    critical: false,
    duration_ms: durationMs,
    checks_total: evaluation.checksTotal,
    checks_passed: checksPassed,
    checks_failed: evaluation.checksFailed,
    findings: evaluation.findings,
    metadata: {
      tool: 'Lighthouse CLI', url_tested: settings.url, scores, mode,
      ...(enforced ? { thresholds: settings.thresholds } : {}),
      report_path: settings.finalPath, scratch_report_path: settings.scratchPath,
    },
  });
}

export default async function perfSuite(context: PerfContext): Promise<SuiteVerdict> {
  perfSuiteState.logSink = typeof context.logSink === 'function' ? context.logSink : null;
  const startTime = Date.now();
  let settings: PerfSettings;
  try {
    settings = resolvePerfSettings(context);
  } catch (error) {
    return toolErrorVerdict(startTime, errorMessage(error), 'path-boundary');
  }
  const mode = evidenceMode(settings.thresholds !== null);
  log(`Auditing ${settings.url} (mode: ${mode}${settings.thresholds ? ', thresholds: ' + JSON.stringify(settings.thresholds) : ''})`);
  let report: AnyRecord;
  try {
    report = await runLighthouse(context, settings);
  } catch (error: any) {
    const message = error?.stderr ? String(error.stderr).slice(0, 500) : errorMessage(error);
    return toolErrorVerdict(startTime, message);
  }
  const scores = extractScores(report);
  log(`Scores: ${Object.entries(scores).map(([key, value]) => `${key}=${value}`).join(', ')}`);
  return completedPerfVerdict(startTime, settings, scores, evaluateScores(scores, settings.thresholds));
}
