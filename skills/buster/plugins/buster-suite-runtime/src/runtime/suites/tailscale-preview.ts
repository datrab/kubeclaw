import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// Suite: tailscale-preview — final-preview exposure and served-content evidence.
//
// KEEP_TYPED_POLICY: preview reachability uses one explicit source contract.
// `source_suite: "explicit"` requires `preview_url`.
// DELETE_LEGACY: this suite does not infer preview URLs from unrelated fields.

import dns from 'dns/promises';
import { createFinding, createSuiteVerdict, SEVERITY, STATUS } from '../services/verdict-schema.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import { createSuiteLog } from './support.ts';

type AnyRecord = Record<string, any>;
type Check = { name: string; passed: boolean; detail: string };
type LogSink = (entry: Record<string, unknown>) => void;
type PreviewFetchResult = { status: number; body: string };
type StaticSurfaceCheck = {
  path: string;
  url: string;
  status: number | null;
  body_bytes: number | null;
  expected_text: string | null;
  passed: boolean;
  detail: string;
};

interface TailscalePreviewContext {
  config?: AnyRecord;
  logSink?: LogSink | null;
}

interface PreviewTarget {
  previewUrl: string;
  contentUrl: string;
  expectedText: string | null;
  sourceSuite: 'explicit';
  provider: string | null;
  smokePaths: string[];
  smokeExpectedText: Record<string, string>;
}

const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;
const DEFAULT_MAX_TIME_SECONDS = 30;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimOut(value: unknown, max = 800): string {
  const str = String(selectDefinedValue(() => (value), () => (''))).trim();
  return str.length <= max ? str : `${str.slice(0, max)}...[${str.length - max} chars]`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(selectTruthyValue(() => (error), () => ('missing_error_detail')));
}

function makeCheck(name: string, passed: boolean, detail: string): Check {
  return { name, passed, detail };
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeSmokePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('/')))];
}

function normalizeSmokeExpectedText(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([pathValue, marker]) => (
    pathValue.startsWith('/') && typeof marker === 'string' && marker.length > 0
  )));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resolveTailscalePreviewTarget(context: TailscalePreviewContext): PreviewTarget {
  const cfg = isRecord(context.config?.tailscale_preview) ? context.config.tailscale_preview : null;
  if (!cfg) throw new Error('tailscale-preview suite requires test_config.tailscale_preview');

  if (cfg.source_suite !== 'explicit') {
    throw new Error('test_config.tailscale_preview.source_suite must be "explicit"');
  }
  return resolveExplicitTarget(cfg);
}

function resolveExplicitTarget(cfg: AnyRecord): PreviewTarget {
  if (typeof cfg.preview_url !== 'string' || !cfg.preview_url.trim()) {
    throw new Error('test_config.tailscale_preview.preview_url is required when source_suite is "explicit"');
  }
  return {
    previewUrl: cfg.preview_url.trim(),
    contentUrl: cfg.preview_url.trim(),
    expectedText: typeof cfg.expected_text === 'string' && cfg.expected_text ? cfg.expected_text : null,
    sourceSuite: 'explicit',
    provider: cfg.provider === 'tailscale-ingress' ? cfg.provider : null,
    smokePaths: normalizeSmokePaths(cfg.smoke_paths),
    smokeExpectedText: normalizeSmokeExpectedText(cfg.smoke_expected_text),
  };
}

class PreviewCheckRunner {
  readonly checks: Check[] = [];
  private readonly log: (message: string) => void;

  constructor(log: (message: string) => void) {
    this.log = log;
  }

  async run(name: string, action: () => Promise<string>): Promise<void> {
    if (this.checks.some((check) => !check.passed)) return;
    try {
      const detail = await action();
      this.checks.push(makeCheck(name, true, detail));
      this.log(`${name}: ${detail}`);
    } catch (error) {
      const detail = `${name} failed: ${trimOut(errorMessage(error))}`;
      this.checks.push(makeCheck(name, false, detail));
      this.log(detail);
    }
  }
}

async function checkStaticSurfaces(target: PreviewTarget, timeoutMs: number): Promise<StaticSurfaceCheck[]> {
  const checks: StaticSurfaceCheck[] = [];
  for (const smokePath of target.smokePaths) {
    const url = previewUrlForPath(target.contentUrl, smokePath);
    const expectedText = target.smokeExpectedText[smokePath] || null;
    try {
      const result = await fetchPreviewResponse(url, timeoutMs);
      const passed = expectedText ? result.body.includes(expectedText) : true;
      const detail = passed
        ? `${smokePath} served ${result.body.length} byte(s)${expectedText ? ` containing "${expectedText}"` : ''}`
        : `${smokePath} did not serve expected text "${expectedText}"`;
      checks.push({ path: smokePath, url, status: result.status, body_bytes: result.body.length, expected_text: expectedText, passed, detail });
    } catch (error) {
      checks.push({ path: smokePath, url, status: null, body_bytes: null, expected_text: expectedText, passed: false, detail: `${smokePath} failed: ${trimOut(errorMessage(error))}` });
    }
  }
  const failures = checks.filter((check) => !check.passed);
  if (failures.length > 0) throw new Error(failures.map((failure) => failure.detail).join('; '));
  return checks;
}

function previewUrlForPath(baseUrl: string, smokePath: string): string {
  const url = new URL(baseUrl);
  url.pathname = smokePath;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function fetchPreviewResponse(url: string, timeoutMs: number): Promise<PreviewFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html, text/plain, */*' },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} from preview URL`);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function previewVerdict(startTime: number, runner: PreviewCheckRunner, target: PreviewTarget | null, metadata: {
  resolvedAddresses: string[];
  bodyBytes: number | null;
  staticSurfaceChecks: StaticSurfaceCheck[];
  connectTimeoutSeconds: number;
  maxTimeSeconds: number;
}): SuiteVerdict {
  const checksFailed = runner.checks.filter((check) => !check.passed).length;
  return createSuiteVerdict('tailscale-preview', checksFailed === 0 ? STATUS.PASS : STATUS.FAIL, {
    critical: true,
    duration_ms: Date.now() - startTime,
    checks_total: runner.checks.length,
    checks_passed: runner.checks.length - checksFailed,
    checks_failed: checksFailed,
    findings: runner.checks.filter((check) => !check.passed)
      .map((check) => createFinding(SEVERITY.CRITICAL, check.detail, { rule: check.name })),
    metadata: {
      preview_url: target?.previewUrl ?? null,
      content_url: target?.contentUrl ?? null,
      expected_text: target?.expectedText ?? null,
      source_suite: target?.sourceSuite ?? null,
      resolved_addresses: metadata.resolvedAddresses,
      preview_body_bytes: metadata.bodyBytes,
      static_surface_checks: metadata.staticSurfaceChecks,
      connect_timeout_seconds: metadata.connectTimeoutSeconds,
      max_time_seconds: metadata.maxTimeSeconds,
      checks: runner.checks,
    },
  });
}

export default async function tailscalePreviewSuite(context: TailscalePreviewContext): Promise<SuiteVerdict> {
  const startTime = Date.now();
  const cfg = isRecord(context.config?.tailscale_preview) ? context.config.tailscale_preview : {};
  const connectTimeoutSeconds = positiveInteger(cfg.connect_timeout_seconds, DEFAULT_CONNECT_TIMEOUT_SECONDS);
  const maxTimeSeconds = positiveInteger(cfg.max_time_seconds, DEFAULT_MAX_TIME_SECONDS);
  const log = createSuiteLog('tailscale-preview', 'TAILSCALE-PREVIEW', context.logSink);
  const runner = new PreviewCheckRunner(log);
  let target: PreviewTarget | null = null;
  let bodyBytes: number | null = null;
  let resolvedAddresses: string[] = [];
  let staticSurfaceChecks: StaticSurfaceCheck[] = [];

  await runner.run('preview-target', async () => {
    target = resolveTailscalePreviewTarget(context);
    const parsed = new URL(target.previewUrl);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error(`Unsupported preview URL protocol: ${parsed.protocol}`);
    const content = new URL(target.contentUrl);
    if (!/^https?:$/.test(content.protocol)) throw new Error(`Unsupported content URL protocol: ${content.protocol}`);
    if (target.provider && target.provider !== 'tailscale-ingress') throw new Error(`Expected tailscale-ingress provider, got ${target.provider}`);
    return `${target.sourceSuite}: preview=${target.previewUrl} content=${target.contentUrl}`;
  });

  const resolvedTarget = target as PreviewTarget | null;
  if (resolvedTarget !== null && resolvedTarget.sourceSuite === 'explicit') await runner.run('dns-resolve', async () => {
    if (!target) throw new Error('preview target unavailable');
    const hostname = new URL(target.previewUrl).hostname;
    const addresses = await withTimeout(dns.lookup(hostname, { all: true }), connectTimeoutSeconds * 1000, `DNS lookup for ${hostname}`);
    resolvedAddresses = addresses.map((entry) => entry.address);
    if (resolvedAddresses.length === 0) throw new Error(`No DNS addresses returned for ${hostname}`);
    return `${hostname} -> ${resolvedAddresses.join(', ')}`;
  });

  await runner.run('preview-health-check', async () => {
    if (!target) throw new Error('preview target unavailable');
    const { body } = await fetchPreviewResponse(target.contentUrl, maxTimeSeconds * 1000);
    bodyBytes = body.length;
    if (target.expectedText && !body.includes(target.expectedText)) {
      throw new Error(`Preview content target did not serve expected text "${target.expectedText}"`);
    }
    return target.expectedText
      ? `Preview content target served ${body.length} byte(s) containing "${target.expectedText}"`
      : `Preview content target served ${body.length} byte(s)`;
  });

  await runner.run('static-surface-checks', async () => {
    if (!target) throw new Error('preview target unavailable');
    if (target.smokePaths.length === 0) return 'No static surface smoke paths configured';
    staticSurfaceChecks = await checkStaticSurfaces(target, maxTimeSeconds * 1000);
    return `Served ${staticSurfaceChecks.length} static surface(s): ${staticSurfaceChecks.map((check) => check.path).join(', ')}`;
  });

  return previewVerdict(startTime, runner, target, {
    resolvedAddresses, bodyBytes, staticSurfaceChecks, connectTimeoutSeconds, maxTimeSeconds,
  });
}
