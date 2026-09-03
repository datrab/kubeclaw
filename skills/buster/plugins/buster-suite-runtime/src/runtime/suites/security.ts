import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: security — HTTP Response Header Audit
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: security defaults enable predictable baseline checks;
// network failures become verdict findings; no-threshold findings use explicit
// evidence-only PASS mode.

import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { buildLocalhostSuiteUrl } from './url-paths.ts';
import { createSuiteLog } from './support.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface SecurityContext {
  logSink?: LogSink | null;
  config?: {
    serve?: AnyRecord;
    security?: AnyRecord;
  };
}

interface HeaderIssue {
  message: string;
  rule: string;
}

interface HeaderCheck {
  name: string;
  severity: Finding['severity'];
  check: (headers: Headers, config: AnyRecord) => HeaderIssue | null;
}

interface SecuritySettings {
  config: AnyRecord;
  port: number;
  paths: string[];
  urls: Array<{ path: string; url: string }>;
  checkCors: boolean;
  thresholds: AnyRecord | null;
  timeoutMs: number;
}

interface PathScanResult {
  findings: Finding[];
  totalChecks: number;
  failedChecks: number;
  metadata: AnyRecord;
}

const DEFAULTS = {
  timeout_ms: 10000,
  max_findings: 50,
  min_hsts_max_age: 31536000,
};

const HEADER_CHECKS: HeaderCheck[] = [
  {
    name: 'strict-transport-security',
    severity: SEVERITY.SERIOUS,
    check(headers, config) {
      const val = headers.get('strict-transport-security');
      if (!val) return { message: 'Missing Strict-Transport-Security (HSTS) header', rule: 'hsts-missing' };
      const maxAgeMatch = val.match(/max-age=(\d+)/);
      if (!maxAgeMatch?.[1]) return { message: 'HSTS header missing max-age directive', rule: 'hsts-max-age' };
      const minAge = config.min_hsts_max_age ?? DEFAULTS.min_hsts_max_age;
      const maxAge = Number.parseInt(maxAgeMatch[1], 10);
      if (maxAge < minAge) return { message: `HSTS max-age ${maxAge}s is below minimum ${minAge}s`, rule: 'hsts-max-age-low' };
      return null;
    },
  },
  {
    name: 'content-security-policy',
    severity: SEVERITY.SERIOUS,
    check(headers) {
      const val = headers.get('content-security-policy');
      if (!val) return { message: 'Missing Content-Security-Policy (CSP) header', rule: 'csp-missing' };
      if (val.includes("'unsafe-inline'") && val.includes("'unsafe-eval'")) return { message: 'CSP contains both unsafe-inline and unsafe-eval — weak policy', rule: 'csp-weak' };
      return null;
    },
  },
  {
    name: 'x-frame-options',
    severity: SEVERITY.MODERATE,
    check(headers) {
      const val = headers.get('x-frame-options');
      if (!val) return { message: 'Missing X-Frame-Options header', rule: 'x-frame-missing' };
      const upper = val.toUpperCase();
      if (upper !== 'DENY' && upper !== 'SAMEORIGIN') return { message: `X-Frame-Options "${val}" — expected DENY or SAMEORIGIN`, rule: 'x-frame-invalid' };
      return null;
    },
  },
  {
    name: 'x-content-type-options',
    severity: SEVERITY.MODERATE,
    check(headers) {
      const val = headers.get('x-content-type-options');
      if (!val) return { message: 'Missing X-Content-Type-Options header', rule: 'xcto-missing' };
      if (val.toLowerCase() !== 'nosniff') return { message: `X-Content-Type-Options "${val}" — expected "nosniff"`, rule: 'xcto-invalid' };
      return null;
    },
  },
  {
    name: 'x-xss-protection',
    severity: SEVERITY.MINOR,
    check(headers) {
      const val = headers.get('x-xss-protection');
      if (!val) return { message: 'Missing X-XSS-Protection header (consider "0" for modern browsers)', rule: 'xxss-missing' };
      return null;
    },
  },
  {
    name: 'referrer-policy',
    severity: SEVERITY.MINOR,
    check(headers) {
      const val = headers.get('referrer-policy');
      if (!val) return { message: 'Missing Referrer-Policy header', rule: 'referrer-missing' };
      return null;
    },
  },
];

function createLog(logSink: LogSink | null | undefined): (msg: string) => void {
  return createSuiteLog('security', 'SECURITY', logSink);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(selectTruthyValue(() => (error), () => ('missing_error_detail')));
}

function objectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

function requireObject(value: unknown, field: string): AnyRecord {
  const record = objectRecord(value);
  if (!record) throw new Error(`${field}: required object`);
  return record;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}: required non-empty string`);
  return value.trim();
}

function requirePort(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${field}: required integer port`);
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry: unknown) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${field}: required non-empty string array`);
  }
  return value.map((entry: string) => entry.trim());
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${field}: required non-negative integer`);
  return value;
}

function evidenceMode(enforced: boolean): 'enforced' | 'evidence-only' {
  return enforced ? 'enforced' : 'evidence-only';
}

function checkCookies(headers: Headers): { findings: Finding[]; cookieCount: number } {
  const findings: Finding[] = [];
  let cookies: string[] = [];
  const headerAny = headers as any;

  if (typeof headerAny.getSetCookie === 'function') {
    cookies = headerAny.getSetCookie();
  } else {
    const raw = headers.get('set-cookie');
    if (raw) cookies = raw.split(/,\s*(?=\w+=)/).filter(Boolean);
  }

  for (const cookie of cookies) {
    const parts = cookie.toLowerCase();
    const parsedName = cookie.split('=')[0]?.trim();
    const name = parsedName ? parsedName : 'missing_cookie_name';
    if (!parts.includes('httponly')) findings.push(createFinding(SEVERITY.SERIOUS, `Cookie "${name}" missing HttpOnly flag`, { rule: 'cookie-httponly', element: name }));
    if (!parts.includes('secure')) findings.push(createFinding(SEVERITY.SERIOUS, `Cookie "${name}" missing Secure flag`, { rule: 'cookie-secure', element: name }));
    if (!parts.includes('samesite')) findings.push(createFinding(SEVERITY.MODERATE, `Cookie "${name}" missing SameSite attribute`, { rule: 'cookie-samesite', element: name }));
  }

  return { findings, cookieCount: cookies.length };
}

function checkCors(headers: Headers): Finding | null {
  const acao = headers.get('access-control-allow-origin');
  if (!acao) return null;
  if (acao === '*') return createFinding(SEVERITY.SERIOUS, 'Access-Control-Allow-Origin is wildcard (*) — consider restricting to specific origins', { rule: 'cors-wildcard' });
  return null;
}

function resolveSecuritySettings(context: SecurityContext): SecuritySettings {
  const serve = requireObject(context.config?.serve, 'test_config.serve');
  const config = requireObject(context.config?.security, 'test_config.security');
  requireNonEmptyString(serve.type, 'test_config.serve.type');
  const port = requirePort(serve.port, 'test_config.serve.port');
  const paths = requireStringArray(config.paths, 'test_config.security.paths');
  const thresholds = config.thresholds == null ? null : requireObject(config.thresholds, 'test_config.security.thresholds');
  const timeoutMs = config.timeout_ms === undefined ? DEFAULTS.timeout_ms : requireNonNegativeInteger(config.timeout_ms, 'test_config.security.timeout_ms');
  const urls = paths.map((urlPath) => ({ path: urlPath, url: buildLocalhostSuiteUrl(port, urlPath, 'security.paths[]') }));
  return { config, port, paths, urls, checkCors: config.check_cors !== false, thresholds, timeoutMs };
}

function inspectHeaders(headers: Headers, urlPath: string, settings: SecuritySettings): Omit<PathScanResult, 'metadata'> {
  const findings: Finding[] = [];
  let totalChecks = 0;
  let failedChecks = 0;
  for (const check of HEADER_CHECKS) {
    totalChecks += 1;
    const issue = check.check(headers, settings.config);
    if (!issue) continue;
    failedChecks += 1;
    if (findings.length < DEFAULTS.max_findings) findings.push(createFinding(check.severity, `${urlPath}: ${issue.message}`, { rule: issue.rule, element: urlPath }));
  }
  const cookies = checkCookies(headers);
  totalChecks += cookies.cookieCount;
  failedChecks += cookies.findings.length;
  findings.push(...cookies.findings.slice(0, Math.max(0, DEFAULTS.max_findings - findings.length)));
  if (settings.checkCors) {
    totalChecks += 1;
    const issue = checkCors(headers);
    if (issue) {
      failedChecks += 1;
      if (findings.length < DEFAULTS.max_findings) findings.push(issue);
    }
  }
  return { findings, totalChecks, failedChecks };
}

async function scanSecurityPath(urlPath: string, url: string, settings: SecuritySettings, log: (message: string) => void): Promise<PathScanResult> {
  log(`  Scanning ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html, application/json, */*' } });
    const result = inspectHeaders(response.headers, urlPath, settings);
    const metadata = {
      path: urlPath, status: response.status, issues: result.findings.length,
      headers_present: HEADER_CHECKS.filter((check) => response.headers.get(check.name)).map((check) => check.name),
    };
    log(`  ${result.findings.length === 0 ? '✅' : '⚠️'} ${urlPath}: ${result.findings.length} issue(s)`);
    return { ...result, metadata };
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? `Timeout after ${settings.timeoutMs}ms` : errorMessage(error);
    log(`  ❌ ${url}: ${message}`);
    return {
      findings: [createFinding(SEVERITY.CRITICAL, `Cannot reach ${url}: ${message}`, { rule: 'connection', element: urlPath })],
      totalChecks: 1, failedChecks: 1, metadata: { path: urlPath, error: message },
    };
  } finally {
    clearTimeout(timer);
  }
}

function securityConfigError(startTime: number, error: unknown): SuiteVerdict {
  const message = errorMessage(error);
  return createSuiteVerdict('security', STATUS.ERROR, {
    critical: false, duration_ms: Date.now() - startTime, error: message,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'security-config' })],
  });
}

export default async function securitySuite(context: SecurityContext): Promise<SuiteVerdict> {
  const log = createLog(context.logSink);
  const startTime = Date.now();
  let settings: SecuritySettings;
  try {
    settings = resolveSecuritySettings(context);
  } catch (error) {
    return securityConfigError(startTime, error);
  }
  const enforced = settings.thresholds !== null;
  const mode = evidenceMode(enforced);
  log(`Checking ${settings.urls.length} path(s) on http://localhost:${settings.port} (mode: ${mode})`);
  const allFindings: Finding[] = [];
  let totalChecks = 0;
  let failedChecks = 0;
  const pathResults: AnyRecord[] = [];
  for (const { path: urlPath, url } of settings.urls) {
    const result = await scanSecurityPath(urlPath, url, settings, log);
    allFindings.push(...result.findings.slice(0, Math.max(0, DEFAULTS.max_findings - allFindings.length)));
    totalChecks += result.totalChecks;
    failedChecks += result.failedChecks;
    pathResults.push(result.metadata);
  }
  let suiteStatus: SuiteStatus = STATUS.PASS;
  if (settings.thresholds && failedChecks > requireNonNegativeInteger(settings.thresholds.max_missing_headers, 'test_config.security.thresholds.max_missing_headers')) suiteStatus = STATUS.FAIL;

  const passedChecks = totalChecks - failedChecks;
  const duration_ms = Date.now() - startTime;
  const icon = suiteStatus === STATUS.PASS ? '✅' : '⚠️';
  log(`${icon} ${mode}: ${passedChecks}/${totalChecks} checks passed, ${failedChecks} issues (${duration_ms}ms)`);

  return createSuiteVerdict('security', suiteStatus, {
    critical: false,
    duration_ms,
    checks_total: totalChecks,
    checks_passed: passedChecks,
    checks_failed: failedChecks,
    findings: allFindings,
    metadata: {
      paths_checked: settings.paths,
      path_results: pathResults,
      mode,
      check_cors: settings.checkCors,
      ...(enforced ? { thresholds: settings.thresholds } : {}),
    },
  });
}
