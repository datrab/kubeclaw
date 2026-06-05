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
import { takeScreenshotBatch } from '../tools/screenshot.ts';
import type { ScreenshotBatchTarget, ScreenshotResult } from '../tools/screenshot.ts';
import { emitPluginEvent } from '../services/telemetry.ts';
import { resolveDiscordWebhookUrl } from '../services/runtime.ts';
import { REPO_DIR, resolveRepoScopedPath } from './repo-paths.ts';
import { deliverySkippedCapability, discordSingle, discordSummary } from './visual-reg-discord.ts';
import type { VisualDiscordDeliveryResult } from './visual-reg-discord.ts';
import { BUSTER_CAPABILITIES, resolveContextCapabilities } from '../services/capabilities.ts';

// DELETE_LEGACY: visual-reg requires explicit reviewed baseline metadata in
// paths.json plus per-route baseline PNGs. Legacy baseline path config,
// HTML auto-generation, missing-baseline SKIP, and implicit single-path mode
// are removed.
// KEEP_TYPED_POLICY: visual diffs remain evidence-only PASS without thresholds,
// artifact fan-out failures are noncritical, and task log/result fallback
// artifact directories preserve evidence when a task-specific screenshot dir is
// absent.
// STRICTIFY_TS_SLICE: Discord delivery telemetry requires typed delivery result
// shapes instead of accepting arbitrary unknown objects.

const DEFAULTS = {
  static_port: 9999,
  server_port: 3000,
  pixelmatch_threshold: 0.1,
  repo_dir: REPO_DIR,
  discord_diff_threshold: 2,
};

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;
type LogFn = (msg: string) => void;

interface VisualRegContext {
  module?: string;
  moduleId?: string;
  project?: string;
  runId?: string;
  run_id?: string;
  dispatchId?: string;
  dispatch_id?: string;
  sessionKey?: string;
  session_key?: string;
  attempt?: number;
  screenshotsDir?: string;
  testsLogDir?: string;
  resultsDir?: string;
  logDir?: string;
  pipelineLogPath?: string;
  pipeline_log_path?: string;
  pipelineRunLogPath?: string;
  pipeline_run_log_path?: string;
  telemetryContext?: unknown;
  payload?: AnyRecord;
  logSink?: LogSink | null;
  config?: {
    project?: string;
    runId?: string;
    run_id?: string;
    serve?: AnyRecord;
    'visual-reg'?: AnyRecord;
  };
  [key: string]: unknown;
}

interface VisualPathEntry {
  name: string;
  path: string;
  nav?: string;
}

interface ImageComparison {
  diffCount: number;
  diffPercent: number;
  width: number;
  height: number;
  baselineWidth: number;
  baselineHeight: number;
}

interface PageResult {
  name: string;
  status: SuiteStatus;
  diffPercent: number | null;
  diffCount?: number;
  diffPath?: string | null;
  actualPath?: string;
  baselinePath?: string;
  canvasSize?: string;
  error?: string;
}

interface MultiPathResult {
  findings: Finding[];
  pageResults: PageResult[];
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
}

function createLog(logSink: LogSink | null = null): LogFn {
  return (msg: string): void => {
    console.log(`[SUITE] [VISUAL-REG] ${msg}`);
    if (logSink) logSink({ suite: 'visual-reg', msg });
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

async function compareImages(baselinePath: string, actualPath: string, diffPath: string, pmThreshold: number): Promise<ImageComparison> {
  // @ts-expect-error Optional runtime dependency declaration is not installed for this migration island.
  const { PNG } = await import('pngjs');
  // @ts-expect-error Optional runtime dependency declaration is not installed for this migration island.
  const { default: pixelmatch } = await import('pixelmatch');

  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const actualPng = PNG.sync.read(fs.readFileSync(actualPath));

  const width = Math.max(baselinePng.width, actualPng.width);
  const height = Math.max(baselinePng.height, actualPng.height);

  const baselineData = resizeBuffer(baselinePng, width, height);
  const actualData = resizeBuffer(actualPng, width, height);

  const diff = new PNG({ width, height });
  const diffCount = pixelmatch(baselineData, actualData, diff.data, width, height, {
    threshold: pmThreshold,
    includeAA: true,
  });

  const totalPixels = width * height;
  const diffPercent = totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0;
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    diffCount,
    diffPercent: Math.round(diffPercent * 100) / 100,
    width,
    height,
    baselineWidth: baselinePng.width,
    baselineHeight: baselinePng.height,
  };
}

function resizeBuffer(png: AnyRecord, targetWidth: number, targetHeight: number): Uint8Array {
  if (png.width === targetWidth && png.height === targetHeight) return png.data;

  const data = new Uint8Array(targetWidth * targetHeight * 4);
  data.fill(0);

  const rowBytes = png.width * 4;
  for (let y = 0; y < png.height; y += 1) {
    const srcOffset = y * rowBytes;
    const destOffset = y * targetWidth * 4;
    data.set(png.data.subarray(srcOffset, srcOffset + rowBytes), destOffset);
  }

  return data;
}

function isDeliveryResult(value: unknown): value is VisualDiscordDeliveryResult {
  if (!value || typeof value !== 'object') return false;
  const record = value as AnyRecord;
  return (record.status === 'sent' || record.status === 'skipped_no_webhook' || record.status === 'skipped_capability' || record.status === 'failed_noncritical')
    && typeof record.sent === 'boolean';
}

export function summarizeDiscordDelivery(results: VisualDiscordDeliveryResult[] = []): Record<string, unknown> {
  const deliveries = Array.isArray(results) ? results : [];
  for (const delivery of deliveries) {
    if (!isDeliveryResult(delivery)) {
      throw new Error('visual-reg Discord delivery result must be a typed delivery result');
    }
  }

  const sent = deliveries.filter((delivery) => delivery.status === 'sent' && delivery.sent).length;
  const failed = deliveries.filter((delivery) => delivery.status === 'failed_noncritical').length;
  const skipped = deliveries.filter((delivery) => delivery.status === 'skipped_no_webhook' || delivery.status === 'skipped_capability').length;
  const skippedCapability = deliveries.filter((delivery) => delivery.status === 'skipped_capability').length;

  let discordStatus = 'not_attempted';
  if (deliveries.length > 0) {
    if (sent === deliveries.length) discordStatus = 'sent';
    else if (skippedCapability === deliveries.length) discordStatus = 'skipped_capability';
    else if (skipped === deliveries.length) discordStatus = 'skipped_no_webhook';
    else if (failed === deliveries.length) discordStatus = 'failed_noncritical';
    else if (sent > 0) discordStatus = 'partial';
    else if (failed > 0) discordStatus = 'failed_noncritical';
    else if (skipped > 0) discordStatus = 'skipped';
  }

  return {
    discord_sent: sent > 0,
    discord_status: discordStatus,
    discord_attempts: deliveries.length,
    discord_successes: sent,
    discord_failures: failed,
    discord_skipped: skipped,
    discord_skipped_capability: skippedCapability,
  };
}

export function resolveVisualRegOverallStatus(pageResults: Array<{ status: SuiteStatus }>, enforced = false): SuiteStatus {
  if (pageResults.some((p) => p.status === STATUS.ERROR)) return STATUS.ERROR;
  if (pageResults.some((p) => p.status === STATUS.FAIL)) return enforced ? STATUS.FAIL : STATUS.ERROR;
  return STATUS.PASS;
}

function contractFailure(startTime: number, message: string, log: LogFn, metadata: Record<string, unknown> = {}): SuiteVerdict {
  const duration_ms = Date.now() - startTime;
  log(`Contract failure: ${message}`);
  return createSuiteVerdict('visual-reg', STATUS.ERROR, {
    critical: false,
    duration_ms,
    error: message,
    findings: [createFinding(SEVERITY.SERIOUS, message, { rule: 'visual-baseline-contract' })],
    metadata,
  });
}

function assertNoLegacyVisualRegPathConfig(vrConf: AnyRecord = {}): void {
  if (Object.prototype.hasOwnProperty.call(vrConf, 'baseline_dir')) {
    throw new Error('visual-reg.baseline_dir is no longer supported; baselines are derived from .swarm/modules/<module>/baselines');
  }
  if (Object.prototype.hasOwnProperty.call(vrConf, 'baseline_file')) {
    throw new Error('visual-reg.baseline_file is no longer supported; explicit paths.json metadata and per-route baselines are required');
  }
  if (Object.prototype.hasOwnProperty.call(vrConf, 'path')) {
    throw new Error('visual-reg.path single-path compatibility is no longer supported; explicit paths.json metadata is required');
  }
}

function safeModulePathSegment(moduleId: unknown): string {
  const segment = String(moduleId || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
  return segment || 'unknown';
}

function requireRepoScopedPath(value: string | null, field: string): string {
  if (!value) throw new Error(`${field} must resolve to a repo-scoped path`);
  return value;
}

export function resolveVisualRegProjectDir(serve: AnyRecord = {}): string {
  return serve.project_dir
    ? requireRepoScopedPath(resolveRepoScopedPath(serve.project_dir, { repoDir: DEFAULTS.repo_dir, field: 'serve.project_dir' }), 'serve.project_dir')
    : DEFAULTS.repo_dir;
}

export function resolveVisualRegBaselineDir(context: VisualRegContext = {}): string {
  const moduleSegment = safeModulePathSegment(context.moduleId || context.module || context.payload?.module_id || context.payload?.module);
  return requireRepoScopedPath(resolveRepoScopedPath(path.join('.swarm', 'modules', moduleSegment, 'baselines'), {
    repoDir: DEFAULTS.repo_dir,
    field: 'visual-reg.baseline_dir',
  }), 'visual-reg.baseline_dir');
}

function resolveArtifactDir(context: VisualRegContext = {}): string {
  const preferred = context.screenshotsDir || (context.testsLogDir ? path.join(context.testsLogDir, 'visual-reg') : null);
  return preferred || path.join(context.resultsDir || '/sandbox/results', 'visual-reg');
}

function resolveChildArtifactPath(dir: string, fileName: string, field: string): string {
  const raw = String(fileName || '');
  if (!raw || raw.includes('/') || raw.includes('\\') || raw.includes('\0')) {
    throw new Error(`${field} must be a file name inside ${dir}`);
  }
  return requireRepoScopedPath(resolveRepoScopedPath(raw, {
    repoDir: dir,
    baseDir: dir,
    scopeDir: dir,
    field,
  }), field);
}

function baselinePathForName(baselineDir: string, name: string): string {
  return resolveChildArtifactPath(baselineDir, `${name}-baseline.png`, 'visual-reg.baseline_file');
}

function outputPathForName(artifactDir: string, name: string, suffix: string): string {
  return resolveChildArtifactPath(artifactDir, `visual-reg-${name}-${suffix}.png`, `visual-reg.${suffix}_path`);
}

function parsePathsJson(pathsJsonPath: string): VisualPathEntry[] {
  if (!fs.existsSync(pathsJsonPath)) {
    throw new Error(`Missing explicit visual-reg baseline metadata: ${pathsJsonPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(pathsJsonPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid visual-reg paths.json: ${errorMessage(error)}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('visual-reg paths.json must be a non-empty array of route entries');
  }

  const names = new Set<string>();
  return parsed.map((entry, index) => {
    const record = entry as AnyRecord;
    if (!record || typeof record !== 'object' || typeof record.name !== 'string' || typeof record.path !== 'string') {
      throw new Error(`visual-reg paths.json entry ${index} must include string name and path`);
    }
    if (names.has(record.name)) {
      throw new Error(`visual-reg paths.json contains duplicate route name: ${record.name}`);
    }
    names.add(record.name);
    if (!record.path.startsWith('/')) {
      throw new Error(`visual-reg paths.json entry ${record.name} path must start with /`);
    }
    return { name: record.name, path: record.path, ...(typeof record.nav === 'string' ? { nav: record.nav } : {}) };
  });
}

async function runMultiPath(
  context: VisualRegContext,
  pathsJson: VisualPathEntry[],
  baselineDir: string,
  artifactDir: string,
  baseUrl: string,
  pmThreshold: number,
  thresholds: AnyRecord | null,
  enforced: boolean,
  vrConf: AnyRecord,
  log: LogFn,
): Promise<MultiPathResult> {
  fs.mkdirSync(artifactDir, { recursive: true });
  const findings: Finding[] = [];
  const pageResults: PageResult[] = [];
  let checksTotal = 0;
  let checksPassed = 0;
  let checksFailed = 0;

  const unsafeNames = new Set<string>();
  const targets: ScreenshotBatchTarget[] = [];
  for (const entry of pathsJson) {
    try {
      targets.push({
        name: entry.name,
        url: `${baseUrl}${entry.path}`,
        outputPath: outputPathForName(artifactDir, entry.name, 'actual'),
      });
    } catch (error) {
      const message = errorMessage(error);
      unsafeNames.add(entry.name);
      log(`ERROR: ${entry.name} — unsafe visual-reg artifact name: ${message}`);
      pageResults.push({ name: entry.name, status: STATUS.ERROR, diffPercent: null, diffPath: null, error: message });
      findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: unsafe visual-reg artifact name — ${message}`, { rule: 'path-boundary' }));
      checksTotal += 1;
      checksFailed += 1;
    }
  }

  log(`Taking ${targets.length} screenshots via batch...`);
  const screenshots = await takeScreenshotBatch(targets, {
    viewport: vrConf.viewport || { width: 1280, height: 720 },
    fullPage: vrConf.fullPage ?? true,
  });

  for (const entry of pathsJson) {
    if (unsafeNames.has(entry.name)) continue;
    const shot: ScreenshotResult | undefined = screenshots.find((s) => s.name === entry.name);
    let baselinePath: string;
    let actualPath: string;
    let diffPath: string;
    try {
      baselinePath = baselinePathForName(baselineDir, entry.name);
      actualPath = outputPathForName(artifactDir, entry.name, 'actual');
      diffPath = outputPathForName(artifactDir, entry.name, 'diff');
    } catch (error) {
      const message = errorMessage(error);
      log(`ERROR: ${entry.name} — unsafe visual-reg artifact name: ${message}`);
      pageResults.push({ name: entry.name, status: STATUS.ERROR, diffPercent: null, diffPath: null, error: message });
      findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: unsafe visual-reg artifact name — ${message}`, { rule: 'path-boundary' }));
      checksFailed += 1;
      continue;
    }

    checksTotal += 1;

    if (!shot || !shot.ok) {
      const message = shot?.error || 'Screenshot not taken';
      log(`ERROR: ${entry.name} — screenshot failed: ${message}`);
      pageResults.push({ name: entry.name, status: STATUS.ERROR, diffPercent: null, diffPath: null, error: message });
      findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: screenshot failed — ${message}`, { rule: 'screenshot-error' }));
      checksFailed += 1;
      continue;
    }

    if (!fs.existsSync(baselinePath)) {
      const message = `${entry.name}: missing explicit reviewed baseline at ${baselinePath}`;
      log(`ERROR: ${message}`);
      pageResults.push({ name: entry.name, status: STATUS.ERROR, diffPercent: null, diffPath: null, actualPath, baselinePath, error: message });
      findings.push(createFinding(SEVERITY.SERIOUS, message, { rule: 'baseline-required', file: baselinePath }));
      checksFailed += 1;
      continue;
    }

    let comparison: ImageComparison;
    try {
      comparison = await compareImages(baselinePath, actualPath, diffPath, pmThreshold);
    } catch (error) {
      const message = errorMessage(error);
      log(`ERROR: ${entry.name} — comparison failed: ${message}`);
      pageResults.push({ name: entry.name, status: STATUS.ERROR, diffPercent: null, diffPath: null, error: message });
      findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: comparison failed — ${message}`, { rule: 'compare-error' }));
      checksFailed += 1;
      continue;
    }

    const { diffPercent, diffCount, width, height, baselineWidth, baselineHeight } = comparison;
    log(`${entry.name}: ${diffPercent}% diff (${diffCount} px of ${width}x${height})`);

    let pageStatus: SuiteStatus = STATUS.PASS;
    if (enforced && diffPercent > (thresholds?.max_diff_percent || 0)) {
      pageStatus = STATUS.FAIL;
      checksFailed += 1;
    } else {
      checksPassed += 1;
    }

    pageResults.push({
      name: entry.name,
      status: pageStatus,
      diffPercent,
      diffCount,
      diffPath: diffPercent > 0 ? diffPath : null,
      actualPath,
      baselinePath,
      canvasSize: `${width}x${height}`,
    });

    if (diffPercent > 0) {
      const severity = diffPercent > 10 ? SEVERITY.SERIOUS
        : diffPercent > 2 ? SEVERITY.MODERATE
          : SEVERITY.MINOR;
      findings.push(createFinding(severity, `${entry.name}: ${diffPercent}% diff (${diffCount} pixels)`, { rule: 'pixel-diff', file: diffPath }));

      if (baselineWidth !== shot.width || baselineHeight !== shot.height) {
        findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: size mismatch — baseline ${baselineWidth}x${baselineHeight}, actual ${shot.width}x${shot.height}`, { rule: 'size-mismatch' }));
      }
    }

    if (context.screenshotsDir) {
      try {
        fs.mkdirSync(context.screenshotsDir, { recursive: true });
        const att = context.attempt || 1;
        if (fs.existsSync(actualPath)) fs.copyFileSync(actualPath, path.join(context.screenshotsDir, `${entry.name}-actual-attempt-${att}.png`));
        if (diffPath && fs.existsSync(diffPath)) fs.copyFileSync(diffPath, path.join(context.screenshotsDir, `${entry.name}-diff-attempt-${att}.png`));
      } catch (error) {
        log(`non-blocking visual artifact fan-out failed: ${errorMessage(error)}`);
      }
    }
  }

  return { findings, pageResults, checksTotal, checksPassed, checksFailed };
}

export async function runVisualReg(context: Record<string, unknown>): Promise<SuiteVerdict> {
  const ctx = context as VisualRegContext;
  const log = createLog(ctx.logSink || null);
  const tctx = ctx.telemetryContext || null;
  const moduleId = String(ctx.moduleId || ctx.module || 'unknown');
  const discordDeliveryContext = {
    project: ctx.project || ctx.config?.project || null,
    run_id: ctx.runId || ctx.run_id || ctx.config?.runId || ctx.config?.run_id || null,
    module_id: moduleId,
    attempt: ctx.attempt ?? null,
    dispatch_id: ctx.dispatchId ?? ctx.dispatch_id ?? null,
    session_key: ctx.sessionKey ?? ctx.session_key ?? null,
    log_dir: ctx.logDir || ctx.testsLogDir || null,
    pipeline_log_path: ctx.pipelineLogPath || ctx.pipeline_log_path || null,
    pipeline_run_log_path: ctx.pipelineRunLogPath || ctx.pipeline_run_log_path || null,
    telemetry_context: tctx,
  };
  const startTime = Date.now();
  const serve = ctx.config?.serve || {};
  const vrConf = ctx.config?.['visual-reg'] || {};
  const webhookUrl = resolveDiscordWebhookUrl() || '';
  let discordCapabilitySkip: VisualDiscordDeliveryResult | null = null;

  try {
    assertNoLegacyVisualRegPathConfig(vrConf);
    resolveVisualRegProjectDir(serve);
  } catch (error) {
    return contractFailure(startTime, errorMessage(error), log);
  }

  if (webhookUrl) {
    const configuredCapabilities = resolveContextCapabilities(ctx) as string[];
    if (!configuredCapabilities.includes(BUSTER_CAPABILITIES.DISCORD_MEDIA)) {
      discordCapabilitySkip = deliverySkippedCapability(new Error(
        `Discord media upload requires ${BUSTER_CAPABILITIES.DISCORD_MEDIA}`,
      ));
      log(`Discord media upload skipped (non-critical): ${discordCapabilitySkip.error}`);
    }
  }

  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const baseUrl = `http://localhost:${port}`;
  const baselineDir = resolveVisualRegBaselineDir(ctx);
  const artifactDir = resolveArtifactDir(ctx);
  fs.mkdirSync(artifactDir, { recursive: true });

  const thresholds = vrConf.thresholds || null;
  const enforced = thresholds !== null;
  const mode = enforced ? 'enforced' : 'evidence-only';
  const pmThreshold = vrConf.pixelmatch?.threshold ?? DEFAULTS.pixelmatch_threshold;

  log(`Baseline dir: ${baselineDir} (mode: ${mode})`);

  const pathsJsonPath = path.join(baselineDir, 'paths.json');
  let pathsJson: VisualPathEntry[];
  try {
    pathsJson = parsePathsJson(pathsJsonPath);
  } catch (error) {
    return contractFailure(startTime, errorMessage(error), log, { baseline_dir: baselineDir, paths_json: pathsJsonPath });
  }

  const { findings, pageResults, checksTotal, checksPassed, checksFailed } = await runMultiPath(
    ctx,
    pathsJson,
    baselineDir,
    artifactDir,
    baseUrl,
    pmThreshold,
    thresholds,
    enforced,
    vrConf,
    log,
  );

  const overallStatus = resolveVisualRegOverallStatus(pageResults, enforced);

  const discordMode = vrConf.discord || (pathsJson.length > 3 ? 'summary' : 'all');
  const discordDeliveries: VisualDiscordDeliveryResult[] = [];

  if (discordCapabilitySkip) {
    discordDeliveries.push(discordCapabilitySkip);
  } else if (discordMode === 'summary') {
    discordDeliveries.push(await discordSummary(moduleId, pageResults, overallStatus, enforced, {
      webhookUrl,
      discordDiffThreshold: DEFAULTS.discord_diff_threshold,
      log,
      deliveryContext: discordDeliveryContext,
    }));
  } else {
    for (const pr of pageResults) {
      if (pr.actualPath) {
        discordDeliveries.push(await discordSingle(moduleId, pr.name, pr.actualPath, pr.diffPath || null, pr.diffPercent ?? 0, pr.status, {
          webhookUrl,
          log,
          deliveryContext: discordDeliveryContext,
        }));
      }
    }
  }

  const duration_ms = Date.now() - startTime;
  const icon = overallStatus === STATUS.PASS ? '✅' : '⚠️';
  log(`${icon} ${mode}: ${checksPassed}/${checksTotal} passed (${duration_ms}ms)`);

  const discordMetadata = summarizeDiscordDelivery(discordDeliveries);
  await emitPluginEvent(tctx, 'visual_reg', {
    module_id: moduleId,
    mode: 'multi_path',
    pages_total: pathsJson.length,
    pages_compared: pageResults.filter((p) => p.diffPercent != null).length,
    pages_skipped: 0,
    page_results: pageResults.map((p) => ({ name: p.name, status: p.status, diff_percent: p.diffPercent })),
    overall: overallStatus,
    ...discordMetadata,
  });

  return createSuiteVerdict('visual-reg', overallStatus, {
    critical: false,
    duration_ms,
    checks_total: checksTotal,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
    findings,
    metadata: {
      tool: 'pixelmatch',
      mode,
      multi_path: true,
      pages_total: pathsJson.length,
      pages_compared: pageResults.filter((p) => p.diffPercent != null).length,
      pages_skipped: 0,
      baseline_dir: baselineDir,
      discord_mode: discordMode,
      ...discordMetadata,
      page_results: pageResults.map((p) => ({ name: p.name, status: p.status, diff_percent: p.diffPercent })),
      ...(enforced ? { thresholds } : {}),
    },
  });
}
