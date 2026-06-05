// ═══════════════════════════════════════════════════════════════
// Suite: health — HTTP Health Check
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: bounded health defaults allow minimal serve config; HTTP
// reachability and capability failures block spawn while smoke findings remain
// noncritical investigation evidence; browser/page cleanup failures are logged
// without masking navigation results.
// DELETE_LEGACY: smoke navigation is only run from explicit typed
// serve.smoke_paths, and requested smoke requires Playwright availability.

import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteVerdict } from '../services/verdict-schema.ts';
import { sleep } from '../timing.ts';
import { BUSTER_CAPABILITIES, assertBusterCapabilities } from '../services/capabilities.ts';
import { buildLocalhostSuiteUrl } from './url-paths.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface HealthContext {
  logSink?: LogSink | null;
  config?: { serve?: AnyRecord };
  [key: string]: unknown;
}

interface AttemptResult {
  ok: boolean;
  status: number | null;
  responseTime: number;
  error: string | null;
}

const DEFAULTS = {
  static_port:  9999,
  server_port:  3000,
  health_path:  '/',
  retries:      3,
  base_delay:   1000,
  timeout:      10000,
};

function createLog(logSink: LogSink | null | undefined): (msg: string) => void {
  return (msg: string): void => {
    console.log(`[SUITE] [HEALTH] ${msg}`);
    if (logSink) logSink({ suite: 'health', msg });
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

async function attempt(url: string, timeoutMs: number): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html, application/json, */*' } });
    return { ok: res.ok, status: res.status, responseTime: Date.now() - start, error: null };
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : errorMessage(error);
    return { ok: false, status: null, responseTime: Date.now() - start, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function mapJsError(message: string): Finding {
  if (message.includes('Minified React error #31')) return createFinding(SEVERITY.SERIOUS, 'React render error: attempted to render non-text value as JSX child', { rule: 'react-error-31' });
  if (message.includes('Minified React error #418')) return createFinding(SEVERITY.SERIOUS, 'React hydration mismatch', { rule: 'react-error-418' });
  if (message.includes('Cannot read properties of undefined')) return createFinding(SEVERITY.SERIOUS, 'Runtime error: accessing property on undefined value', { rule: 'undefined-property' });
  return createFinding(SEVERITY.SERIOUS, `Frontend JS error: ${message}`, { rule: 'js-error' });
}

async function smokeNavigate(port: number, paths: string[], settleMs: number, log: (msg: string) => void): Promise<Finding[]> {
  let chromium: any;
  try {
    // @ts-expect-error Optional runtime dependency may be absent in migration island.
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch (error) {
    throw new Error(`Playwright is required for configured health smoke navigation: ${errorMessage(error)}`);
  }

  const findings: Finding[] = [];
  let browser: any;
  try {
    browser = await chromium.launch({ headless: true });
    for (const navPath of paths) {
      const url = buildLocalhostSuiteUrl(port, navPath, 'serve.smoke_paths[]');
      log(`Smoke: ${url}`);
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error: any) => errors.push(error?.message || String(error)));

      try {
        await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
        if (settleMs > 0) await page.waitForTimeout(settleMs);
      } catch (error) {
        findings.push(createFinding(SEVERITY.SERIOUS, `Navigation failed for ${navPath}: ${errorMessage(error)}`, { rule: 'smoke-nav-error' }));
      }

      for (const msg of errors) findings.push(mapJsError(msg));
      await page.close().catch((error: unknown) => log(`non-blocking page close failed: ${errorMessage(error)}`));
    }
  } finally {
    if (browser) await browser.close().catch((error: unknown) => log(`non-blocking browser close failed: ${errorMessage(error)}`));
  }

  return findings;
}

function normalizeSmokePaths(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) {
    throw new Error('serve.smoke_paths must be an array of absolute URL paths when provided');
  }
  for (const entry of value) buildLocalhostSuiteUrl(0, entry, 'serve.smoke_paths[]');
  return value;
}

export default async function healthSuite(context: HealthContext): Promise<SuiteVerdict> {
  const log = createLog(context.logSink);
  const startTime = Date.now();
  const serve = context.config?.serve || {};

  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  let url: string;
  try {
    url = buildLocalhostSuiteUrl(port, serve.health_path || DEFAULTS.health_path, 'serve.health_path');
  } catch (error) {
    const message = errorMessage(error);
    return createSuiteVerdict('health', STATUS.ERROR, {
      critical: true,
      duration_ms: Date.now() - startTime,
      error: message,
      reason: 'invalid_health_path',
      findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'health-path' })],
    });
  }
  const retries = serve.health_retries || DEFAULTS.retries;
  const baseDelay = serve.health_base_delay || DEFAULTS.base_delay;
  const timeout = serve.health_timeout || DEFAULTS.timeout;

  let smokePaths: string[] | null;
  try {
    smokePaths = normalizeSmokePaths(serve.smoke_paths);
  } catch (error) {
    const message = errorMessage(error);
    return createSuiteVerdict('health', STATUS.ERROR, {
      critical: true,
      duration_ms: Date.now() - startTime,
      error: message,
      reason: 'invalid_smoke_paths',
      findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'smoke-paths' })],
    });
  }

  log(`Checking ${url} (retries=${retries}, timeout=${timeout}ms)`);

  let lastResult: AttemptResult = { ok: false, status: null, responseTime: 0, error: 'not attempted' };
  let httpPassed = false;
  let httpAttempts = 0;

  for (let i = 0; i < retries; i++) {
    if (i > 0) {
      const delay = baseDelay * Math.pow(2, i - 1);
      log(`Retry ${i}/${retries - 1} in ${delay}ms...`);
      await sleep(delay);
    }
    lastResult = await attempt(url, timeout);
    httpAttempts = i + 1;
    if (lastResult.ok) {
      log(`✅ ${lastResult.status} in ${lastResult.responseTime}ms`);
      httpPassed = true;
      break;
    }
    log(`Attempt ${i + 1}/${retries}: ${lastResult.error || `HTTP ${lastResult.status}`} (${lastResult.responseTime}ms)`);
  }

  if (!httpPassed) {
    const reason = lastResult.error || `HTTP ${lastResult.status}`;
    const findings = [createFinding(SEVERITY.CRITICAL, lastResult.error ? `${url}: ${lastResult.error}` : `${url}: expected 2xx, got ${lastResult.status}`, { rule: lastResult.error ? 'connection' : 'status-code' })];
    return createSuiteVerdict('health', STATUS.FAIL, {
      critical: true,
      duration_ms: Date.now() - startTime,
      checks_total: 1,
      checks_passed: 0,
      checks_failed: 1,
      findings,
      metadata: { url, status_code: lastResult.status, response_time_ms: lastResult.responseTime, attempts: retries, last_error: reason },
    });
  }

  const smokeFindings: Finding[] = [];
  if (smokePaths && smokePaths.length > 0) {
    try {
      assertBusterCapabilities(context, { suite: 'health', action: 'run Playwright smoke navigation', required: [BUSTER_CAPABILITIES.BROWSER_AUTOMATION] });
    } catch (error) {
      const message = errorMessage(error);
      return createSuiteVerdict('health', STATUS.ERROR, {
        critical: true,
        duration_ms: Date.now() - startTime,
        error: message,
        reason: 'buster_capability_denied',
        findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'buster-capability-denied' })],
      });
    }

    const settleMs = serve.smoke_settle_ms ?? 1000;
    log(`Smoke navigation: ${smokePaths.length} path(s), settleMs=${settleMs}`);
    try {
      smokeFindings.push(...await smokeNavigate(port, smokePaths, settleMs, log));
    } catch (error) {
      const message = errorMessage(error);
      return createSuiteVerdict('health', STATUS.ERROR, {
        critical: true,
        duration_ms: Date.now() - startTime,
        error: message,
        reason: 'smoke_playwright_unavailable',
        findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'smoke-playwright-unavailable' })],
      });
    }
  }

  const duration_ms = Date.now() - startTime;
  const smokeErrors = smokeFindings.filter((finding) => finding.severity === SEVERITY.SERIOUS || finding.severity === SEVERITY.CRITICAL);
  if (smokeErrors.length > 0) {
    return createSuiteVerdict('health', STATUS.FAIL, {
      critical: false,
      duration_ms,
      checks_total: 1 + (smokePaths?.length || 0),
      checks_passed: 1,
      checks_failed: smokeErrors.length,
      findings: smokeFindings,
      metadata: { url, status_code: lastResult.status, response_time_ms: lastResult.responseTime, attempts: httpAttempts, smoke_paths: smokePaths, smoke_errors: smokeErrors.length },
    });
  }

  return createSuiteVerdict('health', STATUS.PASS, {
    critical: true,
    duration_ms,
    checks_total: 1 + (smokePaths?.length || 0),
    checks_passed: 1 + (smokePaths?.length || 0),
    checks_failed: 0,
    findings: smokeFindings,
    metadata: { url, status_code: lastResult.status, response_time_ms: lastResult.responseTime, attempts: httpAttempts, ...(smokePaths ? { smoke_paths: smokePaths } : {}) },
  });
}
