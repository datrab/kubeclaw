import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: health — HTTP Health Check
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: bounded health defaults allow minimal serve config; HTTP
// reachability and capability failures block spawn while explicit smoke paths
// are verified as bounded HTTP checks. Browser automation belongs to a11y/e2e
// suites, not this health suite.

import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteVerdict } from '../services/verdict-schema.ts';
import { sleep } from '../timing.ts';
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
  body: string | null;
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

async function attempt(url: string, timeoutMs: number): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html, application/json, */*' } });
    const body = await res.text().catch(() => null);
    return { ok: res.ok, status: res.status, responseTime: Date.now() - start, error: null, body };
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : errorMessage(error);
    return { ok: false, status: null, responseTime: Date.now() - start, error: message, body: null };
  } finally {
    clearTimeout(timer);
  }
}

async function smokeHttp(port: number, paths: string[], expectedText: Record<string, string>, timeoutMs: number, log: (msg: string) => void): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const smokePath of paths) {
    const smokeUrl = buildLocalhostSuiteUrl(port, smokePath, 'serve.smoke_paths[]');
    log(`Smoke HTTP: ${smokeUrl}`);
    const result = await attempt(smokeUrl, timeoutMs);
    if (!result.ok) {
      const detail = selectDefinedValue(() => (result.error), () => (`HTTP ${result.status}`));
      findings.push(createFinding(SEVERITY.CRITICAL, `${smokeUrl}: ${detail}`, { rule: result.error ? 'smoke-connection' : 'smoke-status-code' }));
      continue;
    }
    const expected = expectedText[smokePath];
    const body = String(selectDefinedValue(() => (result.body), () => ('')));
    if (expected && !body.includes(expected)) {
      findings.push(createFinding(SEVERITY.CRITICAL, `${smokeUrl}: expected response text ${JSON.stringify(expected)}`, { rule: 'smoke-response-text' }));
    }
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

function normalizeSmokeExpectedText(value: unknown, smokePaths: string[] | null): Record<string, string> {
  if (value == null) return {};
  const record = objectRecord(value);
  if (!record) throw new Error('serve.smoke_expected_text must be an object keyed by smoke path when provided');
  const allowed = new Set(smokePaths || []);
  const normalized: Record<string, string> = {};
  for (const [smokePath, expected] of Object.entries(record)) {
    buildLocalhostSuiteUrl(0, smokePath, 'serve.smoke_expected_text key');
    if (!allowed.has(smokePath)) throw new Error(`serve.smoke_expected_text key must also be listed in serve.smoke_paths: ${smokePath}`);
    const expectedText = nonEmptyString(expected);
    if (!expectedText) throw new Error(`serve.smoke_expected_text[${smokePath}] must be a non-empty string`);
    normalized[smokePath] = expectedText;
  }
  return normalized;
}

export default async function healthSuite(context: HealthContext): Promise<SuiteVerdict> {
  const log = createLog(context.logSink);
  const startTime = Date.now();
  const serve = selectDefinedValue(() => (objectRecord(context.config?.serve)), () => ({}));

  const type = selectDefinedValue(() => (nonEmptyString(serve.type)), () => ('static'));
  const port = selectDefinedValue(() => (serve.port), () => ((type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port)));
  let url: string;
  try {
    url = buildLocalhostSuiteUrl(port, selectDefinedValue(() => (nonEmptyString(serve.health_path)), () => (DEFAULTS.health_path)), 'serve.health_path');
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
  const retries = selectDefinedValue(() => (serve.health_retries), () => (DEFAULTS.retries));
  const baseDelay = selectDefinedValue(() => (serve.health_base_delay), () => (DEFAULTS.base_delay));
  const timeout = selectDefinedValue(() => (serve.health_timeout), () => (DEFAULTS.timeout));

  let smokePaths: string[] | null;
  let smokeExpectedText: Record<string, string>;
  try {
    smokePaths = normalizeSmokePaths(serve.smoke_paths);
    smokeExpectedText = normalizeSmokeExpectedText(serve.smoke_expected_text, smokePaths);
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

  let lastResult: AttemptResult = { ok: false, status: null, responseTime: 0, error: 'not attempted', body: null };
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
    const detail = selectDefinedValue(() => (lastResult.error), () => (`HTTP ${lastResult.status}`));
    log(`Attempt ${i + 1}/${retries}: ${detail} (${lastResult.responseTime}ms)`);
  }

  if (!httpPassed) {
    const reason = selectDefinedValue(() => (lastResult.error), () => (`HTTP ${lastResult.status}`));
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
    log(`Smoke HTTP checks: ${smokePaths.length} path(s)`);
    smokeFindings.push(...await smokeHttp(port, smokePaths, smokeExpectedText, timeout, log));
  }

  const duration_ms = Date.now() - startTime;
  const smokeErrors = smokeFindings.filter((finding) => selectTruthyValue(() => (finding.severity === SEVERITY.SERIOUS), () => (finding.severity === SEVERITY.CRITICAL)));
  if (smokeErrors.length > 0) {
    return createSuiteVerdict('health', STATUS.FAIL, {
      critical: false,
      duration_ms,
      checks_total: 1 + (selectDefinedValue(() => (smokePaths?.length), () => (0))),
      checks_passed: 1,
      checks_failed: smokeErrors.length,
      findings: smokeFindings,
      metadata: { url, status_code: lastResult.status, response_time_ms: lastResult.responseTime, attempts: httpAttempts, smoke_paths: smokePaths, smoke_expected_text: smokeExpectedText, smoke_errors: smokeErrors.length },
    });
  }

  return createSuiteVerdict('health', STATUS.PASS, {
    critical: true,
    duration_ms,
    checks_total: 1 + (selectDefinedValue(() => (smokePaths?.length), () => (0))),
    checks_passed: 1 + (selectDefinedValue(() => (smokePaths?.length), () => (0))),
    checks_failed: 0,
    findings: smokeFindings,
    metadata: { url, status_code: lastResult.status, response_time_ms: lastResult.responseTime, attempts: httpAttempts, ...(smokePaths ? { smoke_paths: smokePaths, smoke_expected_text: smokeExpectedText } : {}) },
  });
}
