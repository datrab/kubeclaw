import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
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
} from '../services/verdict-schema.js';
import type { Finding, SuiteVerdict } from '../services/verdict-schema.js';
import { sleep } from '../timing.js';
import { buildLocalhostSuiteUrl } from './url-paths.js';
import {
  createSuiteLog,
  suiteErrorMessage as errorMessage,
  suiteNonEmptyString as nonEmptyString,
  suiteObject as objectRecord,
  suiteObjectOrEmpty as objectRecordOrEmpty,
} from './support.js';

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

interface HealthSettings {
  port: number;
  url: string;
  retries: number;
  baseDelay: number;
  timeout: number;
  smokePaths: string[] | null;
  smokeExpectedText: Record<string, string>;
}

interface HealthAttemptSummary {
  lastResult: AttemptResult;
  passed: boolean;
  attempts: number;
}

const DEFAULTS = {
  static_port:  9999,
  server_port:  3000,
  health_path:  '/',
  retries:      3,
  base_delay:   1000,
  timeout:      10000,
};

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

function invalidSettingsVerdict(startTime: number, reason: string, message: string, rule: string): SuiteVerdict {
  return createSuiteVerdict('health', STATUS.ERROR, {
    critical: true,
    duration_ms: Date.now() - startTime,
    error: message,
    reason,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule })],
  });
}

function resolveHealthSettings(serve: AnyRecord): HealthSettings {
  const type = nonEmptyString(serve.type) ?? 'static';
  const port = serve.port ?? (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const url = buildLocalhostSuiteUrl(port, nonEmptyString(serve.health_path) ?? DEFAULTS.health_path, 'serve.health_path');
  const smokePaths = normalizeSmokePaths(serve.smoke_paths);
  return {
    port,
    url,
    retries: serve.health_retries ?? DEFAULTS.retries,
    baseDelay: serve.health_base_delay ?? DEFAULTS.base_delay,
    timeout: serve.health_timeout ?? DEFAULTS.timeout,
    smokePaths,
    smokeExpectedText: normalizeSmokeExpectedText(serve.smoke_expected_text, smokePaths),
  };
}

async function attemptUntilHealthy(settings: HealthSettings, log: (message: string) => void): Promise<HealthAttemptSummary> {
  let lastResult: AttemptResult = { ok: false, status: null, responseTime: 0, error: 'not attempted', body: null };
  for (let index = 0; index < settings.retries; index += 1) {
    if (index > 0) {
      const delay = settings.baseDelay * Math.pow(2, index - 1);
      log(`Retry ${index}/${settings.retries - 1} in ${delay}ms...`);
      await sleep(delay);
    }
    lastResult = await attempt(settings.url, settings.timeout);
    if (lastResult.ok) {
      log(`✅ ${lastResult.status} in ${lastResult.responseTime}ms`);
      return { lastResult, passed: true, attempts: index + 1 };
    }
    const detail = lastResult.error ?? `HTTP ${lastResult.status}`;
    log(`Attempt ${index + 1}/${settings.retries}: ${detail} (${lastResult.responseTime}ms)`);
  }
  return { lastResult, passed: false, attempts: settings.retries };
}

function failedHealthVerdict(startTime: number, settings: HealthSettings, summary: HealthAttemptSummary): SuiteVerdict {
  const { lastResult } = summary;
  const reason = lastResult.error ?? `HTTP ${lastResult.status}`;
  const message = lastResult.error ? `${settings.url}: ${lastResult.error}` : `${settings.url}: expected 2xx, got ${lastResult.status}`;
  return createSuiteVerdict('health', STATUS.FAIL, {
    critical: true,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule: lastResult.error ? 'connection' : 'status-code' })],
    metadata: { url: settings.url, status_code: lastResult.status, response_time_ms: lastResult.responseTime, attempts: summary.attempts, last_error: reason },
  });
}

function completedHealthVerdict(startTime: number, settings: HealthSettings, summary: HealthAttemptSummary, findings: Finding[]): SuiteVerdict {
  const smokeCount = settings.smokePaths?.length ?? 0;
  const errors = findings.filter((finding) => finding.severity === SEVERITY.SERIOUS || finding.severity === SEVERITY.CRITICAL);
  const status = errors.length > 0 ? STATUS.FAIL : STATUS.PASS;
  return createSuiteVerdict('health', status, {
    critical: errors.length === 0,
    duration_ms: Date.now() - startTime,
    checks_total: 1 + smokeCount,
    checks_passed: errors.length > 0 ? 1 : 1 + smokeCount,
    checks_failed: errors.length,
    findings,
    metadata: {
      url: settings.url,
      status_code: summary.lastResult.status,
      response_time_ms: summary.lastResult.responseTime,
      attempts: summary.attempts,
      ...(settings.smokePaths ? { smoke_paths: settings.smokePaths, smoke_expected_text: settings.smokeExpectedText } : {}),
      ...(errors.length > 0 ? { smoke_errors: errors.length } : {}),
    },
  });
}

export default async function healthSuite(context: HealthContext): Promise<SuiteVerdict> {
  const log = createSuiteLog('health', 'HEALTH', context.logSink);
  const startTime = Date.now();
  const serve = objectRecordOrEmpty(context.config?.serve);
  let settings: HealthSettings;
  try {
    settings = resolveHealthSettings(serve);
  } catch (error) {
    const message = errorMessage(error);
    const smokeFailure = message.includes('smoke_');
    return invalidSettingsVerdict(startTime, smokeFailure ? 'invalid_smoke_paths' : 'invalid_health_path', message, smokeFailure ? 'smoke-paths' : 'health-path');
  }
  log(`Checking ${settings.url} (retries=${settings.retries}, timeout=${settings.timeout}ms)`);
  const summary = await attemptUntilHealthy(settings, log);
  if (!summary.passed) return failedHealthVerdict(startTime, settings, summary);
  const smokeFindings = settings.smokePaths?.length
    ? await smokeHttp(settings.port, settings.smokePaths, settings.smokeExpectedText, settings.timeout, log)
    : [];
  return completedHealthVerdict(startTime, settings, summary, smokeFindings);
}
