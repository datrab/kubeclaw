import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: bundle — Build Output Size Check
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: no-threshold bundle findings use explicit evidence-only
// PASS mode.
// DELETE_LEGACY: requested bundle suite fails typed validation when build
// output is missing.
// STRICTIFY_TS_SLICE: filesystem/du probe failures remain nonfatal only as
// typed degraded/unknown metadata, never as silent zero-size evidence.

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
import { buildSubprocessEnv, validateAllowedPath } from '../security.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface BundleContext {
  logSink?: LogSink | null;
  suiteAbortSignal?: AbortSignal;
  suiteDeadlineMs?: number;
  config?: { bundle?: AnyRecord };
}

interface BundleFile {
  path: string;
  size_kb: number;
}

interface ScanResult {
  count: number;
  files: BundleFile[];
  degraded: boolean;
  probe_errors: string[];
}

const DEFAULTS = {
  www_dir: '/sandbox/www',
};

const execFileAsync = promisify(execFile) as any;

function createLog(logSink: LogSink | null | undefined): (msg: string) => void {
  return (msg: string): void => {
    console.log(`[SUITE] [BUNDLE] ${msg}`);
    if (logSink) logSink({ suite: 'bundle', msg });
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(selectTruthyValue(() => (error), () => ('missing_error_detail')));
}

function timeoutWithinSuite(timeoutMs: number, context: BundleContext): number {
  if (typeof context.suiteDeadlineMs !== 'number') return timeoutMs;
  return Math.max(1, Math.min(timeoutMs, context.suiteDeadlineMs - Date.now()));
}

function evidenceMode(enforced: boolean): 'enforced' | 'evidence-only' {
  return enforced ? 'enforced' : 'evidence-only';
}

function scanDir(dir: string, log: (msg: string) => void): ScanResult {
  const files: BundleFile[] = [];
  const probeErrors: string[] = [];

  function recordProbeError(message: string): void {
    probeErrors.push(message);
    log(message);
  }

  function walk(current: string): void {
    let entries: any[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch (error) {
      recordProbeError(`bundle directory scan degraded: ${current}: ${errorMessage(error)}`);
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        try {
          const stats = fs.statSync(full);
          files.push({ path: full.replace(`${dir}/`, ''), size_kb: Math.round(stats.size / 1024) });
        } catch (error) {
          recordProbeError(`bundle file stat degraded: ${full}: ${errorMessage(error)}`);
        }
      }
    }
  }

  walk(dir);
  return { count: files.length, files, degraded: probeErrors.length > 0, probe_errors: probeErrors };
}

function missingOutputFailure(startTime: number, wwwDir: string, log: (msg: string) => void): SuiteVerdict {
  const message = `Build output directory not found: ${wwwDir}`;
  log(`${message} — FAIL`);
  return createSuiteVerdict('bundle', STATUS.FAIL, {
    critical: false,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    reason: message,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'bundle-output-required' })],
    metadata: { www_dir: wwwDir, output_present: false },
  });
}

export default async function bundleSuite(context: BundleContext): Promise<SuiteVerdict> {
  const log = createLog(context.logSink);
  const startTime = Date.now();
  const config = selectDefinedValue(() => (context.config?.bundle), () => ({}));
  const wwwDir = validateAllowedPath(bundleWwwDirAuthority(config), 'bundle.www_dir');
  const thresholds = selectTruthyValue(() => (config.thresholds), () => (null));
  const enforced = thresholds !== null;
  const mode = evidenceMode(enforced);

  if (!fs.existsSync(wwwDir)) return missingOutputFailure(startTime, wwwDir, log);

  let totalSizeKb: number | null = null;
  let sizeProbeError: string | null = null;
  try {
    const { stdout: output } = await execFileAsync('du', ['-sk', wwwDir], {
      encoding: 'utf8',
      env: buildSubprocessEnv(),
      timeout: timeoutWithinSuite(10000, context),
      signal: context.suiteAbortSignal,
    });
    const first = String(output).trim().split(/\s+/)[0];
    const parsed = Number.parseInt(selectDefinedValue(() => (first), () => ('')), 10);
    if (Number.isFinite(parsed)) totalSizeKb = parsed;
    else sizeProbeError = `bundle size probe degraded: du output did not start with a size: ${String(output).slice(0, 120)}`;
  } catch (error) {
    sizeProbeError = `bundle size probe degraded: ${errorMessage(error)}`;
  }
  if (sizeProbeError) log(sizeProbeError);

  const scan = scanDir(wwwDir, log);
  const fileCount = scan.count;
  const largestFiles = scan.files
    .sort((a, b) => b.size_kb - a.size_kb)
    .slice(0, 5)
    .map((file) => `${file.path} (${file.size_kb} KB)`);

  log(`Size: ${totalSizeKb === null ? 'missing_bundle_size' : `${totalSizeKb} KB`} (${fileCount} files) — mode: ${mode}`);

  const findings: Finding[] = [];
  let checksFailed = 0;
  const checksTotal = 2;

  if (sizeProbeError) {
    findings.push(createFinding(SEVERITY.MODERATE, 'Bundle size is unavailable because size probe failed', { rule: 'bundle-size-unavailable' }));
  }
  if (scan.degraded) {
    findings.push(createFinding(SEVERITY.MINOR, `Bundle file scan degraded (${scan.probe_errors.length} probe error${scan.probe_errors.length === 1 ? '' : 's'})`, { rule: 'bundle-scan-degraded' }));
  }

  if (enforced) {
    const maxSizeKb = thresholds.max_size_kb;
    const maxFiles = thresholds.max_file_count;

    if (maxSizeKb != null) {
      if (totalSizeKb === null) {
        checksFailed++;
        findings.push(createFinding(SEVERITY.SERIOUS, 'Cannot enforce max_size_kb because bundle size is unavailable', { rule: 'max-size-unavailable' }));
      } else if (totalSizeKb > maxSizeKb) {
        checksFailed++;
        findings.push(createFinding(SEVERITY.SERIOUS, `Bundle size ${totalSizeKb} KB exceeds max ${maxSizeKb} KB`, { rule: 'max-size' }));
      }
    }

    if (maxFiles != null && fileCount > maxFiles) {
      checksFailed++;
      findings.push(createFinding(SEVERITY.MODERATE, `File count ${fileCount} exceeds max ${maxFiles}`, { rule: 'max-files' }));
    }
  } else if (totalSizeKb !== null) {
    if (totalSizeKb > 5120) findings.push(createFinding(SEVERITY.MODERATE, `Bundle size ${totalSizeKb} KB is large (>5 MB)`, { rule: 'size-info' }));
    else if (totalSizeKb > 3072) findings.push(createFinding(SEVERITY.MINOR, `Bundle size ${totalSizeKb} KB (>3 MB)`, { rule: 'size-info' }));
  }

  const checksPassed = checksTotal - checksFailed;
  const duration_ms = Date.now() - startTime;
  const status: SuiteStatus = (enforced && checksFailed > 0) ? STATUS.FAIL : STATUS.PASS;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${mode}: ${totalSizeKb === null ? 'missing_size' : `${totalSizeKb} KB`}, ${fileCount} files (${duration_ms}ms)`);

  return createSuiteVerdict('bundle', status, {
    critical: false,
    duration_ms,
    checks_total: checksTotal,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
    findings,
    metadata: {
      total_size_kb: totalSizeKb,
      size_known: totalSizeKb !== null,
      file_count: fileCount,
      largest_files: largestFiles,
      mode,
      degraded: bundleScanDegraded(sizeProbeError, scan),
      probe_errors: [sizeProbeError, ...scan.probe_errors].filter(Boolean),
      ...(enforced ? { thresholds } : {}),
    },
  });
}

function bundleWwwDirAuthority(config: AnyRecord): string {
  if (config.www_dir !== undefined && config.www_dir !== null) return config.www_dir;
  return DEFAULTS.www_dir;
}

function bundleScanDegraded(sizeProbeError: unknown, scan: AnyRecord): boolean {
  if (sizeProbeError) return true;
  return scan.degraded === true;
}
