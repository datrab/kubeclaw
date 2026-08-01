import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
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

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.js';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.js';
import { buildSubprocessEnv, validateAllowedPath } from '../security.js';
import { createSuiteLog } from './support.js';
import { readBusterEnvironment } from '../buster-environment.js';

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
  www_dir: readBusterEnvironment('BUSTER_BUILD_OUTPUT_DIR') ?? `${readBusterEnvironment('REPO_ROOT') ?? '/home/node/.openclaw/workspace/git-repo'}/dist`,
};

const execFileAsync = promisify(execFile) as any;

function createLog(logSink: LogSink | null | undefined): (msg: string) => void {
  return createSuiteLog('bundle', 'BUNDLE', logSink);
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

async function probeBundleSize(wwwDir: string, context: BundleContext): Promise<{ sizeKb: number | null; error: string | null }> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', wwwDir], {
      encoding: 'utf8',
      env: buildSubprocessEnv(),
      timeout: timeoutWithinSuite(10000, context),
      signal: context.suiteAbortSignal,
    });
    const first = String(stdout).trim().split(/\s+/)[0];
    const parsed = Number.parseInt(first === undefined ? '' : first, 10);
    if (Number.isFinite(parsed)) return { sizeKb: parsed, error: null };
    return { sizeKb: null, error: `bundle size probe degraded: du output did not start with a size: ${String(stdout).slice(0, 120)}` };
  } catch (error) {
    return { sizeKb: null, error: `bundle size probe degraded: ${errorMessage(error)}` };
  }
}

function enforcedBundleFindings(totalSizeKb: number | null, fileCount: number, thresholds: AnyRecord): Finding[] {
  const findings: Finding[] = [];
  if (thresholds.max_size_kb != null && totalSizeKb === null) {
    findings.push(createFinding(SEVERITY.SERIOUS, 'Cannot enforce max_size_kb because bundle size is unavailable', { rule: 'max-size-unavailable' }));
  } else if (thresholds.max_size_kb != null && totalSizeKb !== null && totalSizeKb > thresholds.max_size_kb) {
    findings.push(createFinding(SEVERITY.SERIOUS, `Bundle size ${totalSizeKb} KB exceeds max ${thresholds.max_size_kb} KB`, { rule: 'max-size' }));
  }
  if (thresholds.max_file_count != null && fileCount > thresholds.max_file_count) {
    findings.push(createFinding(SEVERITY.MODERATE, `File count ${fileCount} exceeds max ${thresholds.max_file_count}`, { rule: 'max-files' }));
  }
  return findings;
}

function informationalBundleFindings(totalSizeKb: number | null): Finding[] {
  if (totalSizeKb !== null && totalSizeKb > 5120) return [createFinding(SEVERITY.MODERATE, `Bundle size ${totalSizeKb} KB is large (>5 MB)`, { rule: 'size-info' })];
  if (totalSizeKb !== null && totalSizeKb > 3072) return [createFinding(SEVERITY.MINOR, `Bundle size ${totalSizeKb} KB (>3 MB)`, { rule: 'size-info' })];
  return [];
}

function bundlePolicyFindings(enforced: boolean, totalSizeKb: number | null, fileCount: number, thresholds: AnyRecord): Finding[] {
  if (enforced) return enforcedBundleFindings(totalSizeKb, fileCount, thresholds);
  return informationalBundleFindings(totalSizeKb);
}

export default async function bundleSuite(context: BundleContext): Promise<SuiteVerdict> {
  const log = createLog(context.logSink);
  const startTime = Date.now();
  const config: AnyRecord = context.config?.bundle === undefined ? {} : context.config.bundle;
  const wwwDir = validateAllowedPath(bundleWwwDirAuthority(config), 'bundle.www_dir');
  const thresholds = selectTruthyValue(() => (config.thresholds), () => (null));
  const enforced = thresholds !== null;
  const mode = evidenceMode(enforced);

  if (!fs.existsSync(wwwDir)) return missingOutputFailure(startTime, wwwDir, log);

  const { sizeKb: totalSizeKb, error: sizeProbeError } = await probeBundleSize(wwwDir, context);
  if (sizeProbeError) log(sizeProbeError);

  const scan = scanDir(wwwDir, log);
  const fileCount = scan.count;
  const largestFiles = scan.files
    .sort((a, b) => b.size_kb - a.size_kb)
    .slice(0, 5)
    .map((file) => `${file.path} (${file.size_kb} KB)`);

  log(`Size: ${totalSizeKb === null ? 'missing_bundle_size' : `${totalSizeKb} KB`} (${fileCount} files) — mode: ${mode}`);

  const findings: Finding[] = [];
  const checksTotal = 2;

  if (sizeProbeError) {
    findings.push(createFinding(SEVERITY.MODERATE, 'Bundle size is unavailable because size probe failed', { rule: 'bundle-size-unavailable' }));
  }
  if (scan.degraded) {
    findings.push(createFinding(SEVERITY.MINOR, `Bundle file scan degraded (${scan.probe_errors.length} probe error${scan.probe_errors.length === 1 ? '' : 's'})`, { rule: 'bundle-scan-degraded' }));
  }

  const policyFindings = bundlePolicyFindings(enforced, totalSizeKb, fileCount, thresholds);
  findings.push(...policyFindings);
  const checksFailed = enforced ? policyFindings.length : 0;

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
