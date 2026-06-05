// ═══════════════════════════════════════════════════════════════
// Suite: api — API Test Runner (JSON-Spec)
// ═══════════════════════════════════════════════════════════════
//
// Reads a typed JSON API spec from config.api.spec_file, fires HTTP and
// optional WebSocket requests against the running app, and compares responses
// against expectations.
//
// KEEP_TYPED_POLICY: API defaults support compact typed specs and payload
// config. When thresholds are absent, API findings are evidence-only and the
// suite stays PASS.
// DELETE_LEGACY: requested API suites must provide an existing non-empty spec;
// auth setup/template failures are typed suite failures, never silent partial
// unauthenticated fallbacks.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { REPO_DIR, resolveRepoScopedPath } from './repo-paths.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface ApiContext {
  logSink?: LogSink | null;
  config?: {
    serve?: AnyRecord;
    api?: AnyRecord;
  };
}

interface ApiTestResult {
  passed: boolean;
  failures: string[];
  status: number | null;
  elapsed: number;
}

interface AuthSetupResult {
  ok: boolean;
  vars: Record<string, string>;
  error?: string;
}

const DEFAULTS = {
  static_port:   9999,
  server_port:   3000,
  timeout_ms:    5000,
  ws_timeout_ms: 5000,
  max_findings:  50,
  project_dir:   REPO_DIR,
};

let _logSink: LogSink | null = null;
function log(msg: string): void {
  console.log(`[SUITE] [API] ${msg}`);
  if (_logSink) _logSink({ suite: 'api', msg });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

function resolveSpecPath(specFile: unknown, projectDir: string): string {
  const resolved = resolveRepoScopedPath(specFile, {
    baseDir: projectDir,
    scopeDir: projectDir,
    field: 'api.spec_file',
  });
  if (!resolved) throw new Error('api.spec_file is required');
  return resolved;
}

function interpolate(str: unknown, vars: Record<string, string>): unknown {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => vars[key] ?? `{{${key}}}`);
}

function interpolateObj(obj: any, vars: Record<string, string>): any {
  if (!obj || Object.keys(vars).length === 0) return obj;
  if (typeof obj === 'string') return interpolate(obj, vars);
  if (Array.isArray(obj)) return obj.map((value: any) => interpolateObj(value, vars));
  if (typeof obj === 'object') {
    const result: AnyRecord = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObj(value, vars);
    }
    return result;
  }
  return obj;
}

function getByPath(obj: any, dotPath: unknown): any {
  if (!dotPath) return obj;
  const parts = String(dotPath).split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function collectTemplateVars(value: any, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{(\w+)\}\}/g)) {
      if (match[1]) out.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectTemplateVars(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectTemplateVars(item, out);
  }
  return out;
}

function missingTemplateVarsForTest(test: AnyRecord, vars: Record<string, string>, defaults: AnyRecord = {}): string[] {
  const effectiveHeaders = {
    ...(defaults.headers || {}),
    ...(test.headers || {}),
  };
  const required = collectTemplateVars({
    path: test.path,
    headers: effectiveHeaders,
    body: test.body,
    ws_messages: test.ws_messages,
  });
  return [...required].filter((key) => vars[key] == null || vars[key] === '');
}

async function runAuthSetup(setup: AnyRecord | null, baseUrl: string, timeoutMs: number): Promise<AuthSetupResult> {
  if (!setup?.auth_endpoint) return { ok: true, vars: {} };

  const url  = `${baseUrl}${setup.auth_endpoint}`;
  const body = setup.auth_body || {};

  log(`Auth setup: POST ${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });

    if (!res.ok) {
      return { ok: false, vars: {}, error: `Auth setup failed: HTTP ${res.status}` };
    }

    const json = await res.json();
    const tokenPath = setup.token_path || 'token';
    const token = getByPath(json, tokenPath);

    if (!token) {
      return { ok: false, vars: {}, error: `Auth setup token not found at path "${tokenPath}"` };
    }

    log(`Auth setup OK — token obtained (path: ${tokenPath})`);
    return { ok: true, vars: { token: String(token) } };
  } catch (error) {
    return { ok: false, vars: {}, error: `Auth setup error: ${errorMessage(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function runHttpTest(test: AnyRecord, baseUrl: string, defaults: AnyRecord, vars: Record<string, string>, timeoutMs: number): Promise<ApiTestResult> {
  const method  = String(test.method || 'GET').toUpperCase();
  const urlPath = interpolate(test.path, vars);
  const url     = `${baseUrl}${urlPath}`;
  const headers = interpolateObj({
    ...(defaults.headers || {}),
    ...(test.headers || {}),
  }, vars);
  const fetchOpts: RequestInit = { method, headers };

  if (test.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchOpts.body = JSON.stringify(interpolateObj(test.body, vars));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  fetchOpts.signal = controller.signal;

  const start = Date.now();
  try {
    const res      = await fetch(url, fetchOpts);
    const elapsed  = Date.now() - start;
    const expect   = test.expect || {};
    const failures: string[] = [];

    if (expect.status != null && res.status !== expect.status) {
      failures.push(`Expected status ${expect.status}, got ${res.status}`);
    }

    let body: any = null;
    if (expect.body_type || expect.body_contains || expect.body_min_length != null) {
      try {
        body = await res.json();
      } catch (_error) {
        try { body = await res.text(); } catch (_error) { body = null; }
      }
    }

    if (expect.body_type) {
      const actual = Array.isArray(body) ? 'array' : typeof body;
      if (actual !== expect.body_type) failures.push(`Expected body type "${expect.body_type}", got "${actual}"`);
    }

    if (expect.body_min_length != null && Array.isArray(body) && body.length < expect.body_min_length) {
      failures.push(`Expected array length >= ${expect.body_min_length}, got ${body.length}`);
    }

    if (expect.body_contains && typeof body === 'object' && body !== null) {
      for (const [key, expectedVal] of Object.entries(expect.body_contains)) {
        const actualVal = getByPath(body, key);
        if (actualVal === undefined) failures.push(`Expected body to contain key "${key}"`);
        else if (expectedVal !== true && String(actualVal) !== String(expectedVal)) {
          failures.push(`Expected body.${key} = ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actualVal)}`);
        }
      }
    }

    if (expect.max_response_ms != null && elapsed > expect.max_response_ms) {
      failures.push(`Response took ${elapsed}ms (max: ${expect.max_response_ms}ms)`);
    }

    return { passed: failures.length === 0, failures, status: res.status, elapsed };
  } catch (error: any) {
    const elapsed = Date.now() - start;
    const msg = error?.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : errorMessage(error);
    return { passed: false, failures: [msg], status: null, elapsed };
  } finally {
    clearTimeout(timer);
  }
}

async function runWsTest(test: AnyRecord, baseUrl: string, vars: Record<string, string>, timeoutMs: number): Promise<ApiTestResult> {
  const urlPath = interpolate(test.path, vars);
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const url    = `${wsBase}${urlPath}`;

  return new Promise((resolve) => {
    const failures: string[] = [];
    const start = Date.now();
    let timer: any;
    let ws: any;

    void (async () => {
      let WebSocketImpl: any;
      try {
        // @ts-expect-error Optional runtime dependency may be absent in migration island.
        const wsMod = await import('ws');
        WebSocketImpl = wsMod.default;
      } catch (_error) {
        WebSocketImpl = (globalThis as any).WebSocket;
      }

      if (!WebSocketImpl) {
        resolve({ passed: false, failures: ['WebSocket not available: neither "ws" package nor globalThis.WebSocket found'], status: null, elapsed: Date.now() - start });
        return;
      }

      try {
        ws = new WebSocketImpl(url);
      } catch (error) {
        resolve({ passed: false, failures: [`WebSocket connection failed: ${errorMessage(error)}`], status: null, elapsed: Date.now() - start });
        return;
      }

      timer = setTimeout(() => {
        failures.push(`WebSocket timeout after ${timeoutMs}ms`);
        try { ws.close(); }
        catch (error) { log(`non-blocking WebSocket timeout close failed: ${errorMessage(error)}`); }
        resolve({ passed: failures.length === 0, failures, status: null, elapsed: Date.now() - start });
      }, timeoutMs);

      const expect = test.expect || {};
      const messages = Array.isArray(test.ws_messages) ? test.ws_messages : [];
      const responses: any[] = [];

      ws.on('open', () => {
        if (expect.ws_connected === false) failures.push('Expected connection to fail, but it succeeded');
        for (const msg of messages) {
          if (msg.send) {
            const payload = typeof msg.send === 'string' ? interpolate(msg.send, vars) : JSON.stringify(interpolateObj(msg.send, vars));
            ws.send(payload);
          }
        }
      });

      ws.on('message', (data: any) => {
        let parsed: any;
        try { parsed = JSON.parse(String(data)); }
        catch (_error) { parsed = String(data); }
        responses.push(parsed);
      });

      ws.on('error', (error: any) => {
        if (expect.ws_connected !== false) failures.push(`WebSocket error: ${errorMessage(error)}`);
      });

      ws.on('close', () => {
        clearTimeout(timer);
        if (expect.ws_response_contains && responses.length > 0) {
          for (const [key, expectedVal] of Object.entries(expect.ws_response_contains)) {
            const found = responses.some((response: any) => {
              if (typeof response !== 'object' || response === null) return false;
              const actual = getByPath(response, key);
              if (expectedVal === true) return actual !== undefined;
              return String(actual) === String(expectedVal);
            });
            if (!found) failures.push(`No WS response contained "${key}": ${JSON.stringify(expectedVal)}`);
          }
        }

        if (expect.ws_min_messages != null && responses.length < expect.ws_min_messages) {
          failures.push(`Expected >= ${expect.ws_min_messages} WS messages, got ${responses.length}`);
        }

        resolve({ passed: failures.length === 0, failures, status: null, elapsed: Date.now() - start });
      });

      if (expect.ws_connected === false) {
        setTimeout(() => {
          clearTimeout(timer);
          try { ws.close(); }
          catch (error) { log(`non-blocking WebSocket expected-failure close failed: ${errorMessage(error)}`); }
          resolve({ passed: failures.length === 0, failures, status: null, elapsed: Date.now() - start });
        }, 2000);
      }
    })();
  });
}

function apiContractFailure(startTime: number, message: string, rule: string): SuiteVerdict {
  log(message);
  return createSuiteVerdict('api', STATUS.FAIL, {
    critical: false,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule })],
    reason: message,
  });
}

export default async function apiSuite(context: ApiContext): Promise<SuiteVerdict> {
  _logSink = context.logSink || null;
  const startTime = Date.now();
  const serve = context.config?.serve || {};
  const apiConf = context.config?.api || {};

  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const baseUrl = `http://localhost:${port}`;
  const projectDir = resolveRepoScopedPath(serve.project_dir || DEFAULTS.project_dir, { field: 'serve.project_dir' }) || DEFAULTS.project_dir;
  const specFile = apiConf.spec_file || null;

  if (!specFile) return apiContractFailure(startTime, 'api.spec_file is required when the API suite is requested', 'api-spec-required');

  const specPath = resolveSpecPath(specFile, projectDir);
  if (!fs.existsSync(specPath)) return apiContractFailure(startTime, `API spec file not found: ${specPath}`, 'api-spec-missing');

  let spec: AnyRecord;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (error) {
    const message = `Failed to parse API spec: ${errorMessage(error)}`;
    return createSuiteVerdict('api', STATUS.ERROR, {
      critical: false,
      duration_ms: Date.now() - startTime,
      error: message,
      findings: [createFinding(SEVERITY.CRITICAL, message, { rule: 'api-spec-parse' })],
    });
  }

  const tests = Array.isArray(spec.tests) ? spec.tests : [];
  if (tests.length === 0) return apiContractFailure(startTime, 'API spec must contain at least one test', 'api-spec-empty');

  const defaults = spec.defaults || {};
  const setup = spec.setup || null;
  const specBase = spec.base_url || baseUrl;
  const thresholds = apiConf.thresholds || null;
  const enforced = thresholds !== null;
  const timeoutMs = defaults.timeout_ms || DEFAULTS.timeout_ms;
  const wsTimeout = defaults.ws_timeout_ms || DEFAULTS.ws_timeout_ms;

  log(`Running ${tests.length} tests from ${specPath} (mode: ${enforced ? 'enforced' : 'informational'})`);

  const auth = await runAuthSetup(setup, specBase, timeoutMs);
  if (!auth.ok) return apiContractFailure(startTime, auth.error || 'API auth setup failed', 'api-auth-setup');

  const findings: Finding[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const testName = test.name || `${test.method || 'GET'} ${test.path}`;
    const isWs = test.protocol === 'ws';
    const missingVars = missingTemplateVarsForTest(test, auth.vars, defaults);
    let result: ApiTestResult;

    if (missingVars.length > 0) {
      result = {
        passed: false,
        failures: [`Missing API template variable(s): ${missingVars.join(', ')}`],
        status: null,
        elapsed: 0,
      };
    } else if (isWs) {
      result = await runWsTest(test, specBase, auth.vars, wsTimeout);
    } else {
      result = await runHttpTest(test, specBase, defaults, auth.vars, timeoutMs);
    }

    if (result.passed) {
      passed++;
      log(`  ✅ ${testName} (${result.elapsed}ms)`);
    } else {
      failed++;
      log(`  ❌ ${testName} (${result.elapsed}ms)`);
      if (findings.length < DEFAULTS.max_findings) {
        for (const failure of result.failures) {
          findings.push(createFinding(SEVERITY.SERIOUS, `${testName}: ${failure}`, {
            rule: missingVars.length > 0 ? 'api-template-variable' : (isWs ? 'ws-test' : 'http-test'),
            element: test.path,
          }));
        }
      }
    }
  }

  let status: SuiteStatus = STATUS.PASS;
  if (enforced && failed > (thresholds.max_failures ?? 0)) status = STATUS.FAIL;

  const duration_ms = Date.now() - startTime;
  log(`${status === STATUS.PASS ? '✅' : '⚠️'} ${enforced ? 'enforced' : 'informational'}: ${passed}/${tests.length} passed, ${failed} failed (${duration_ms}ms)`);

  return createSuiteVerdict('api', status, {
    critical: false,
    duration_ms,
    checks_total: tests.length,
    checks_passed: passed,
    checks_failed: failed,
    findings,
    metadata: {
      spec_file: specPath,
      base_url: specBase,
      mode: enforced ? 'enforced' : 'informational',
      has_auth: Boolean(setup?.auth_endpoint),
      ws_tests: tests.filter((test: AnyRecord) => test.protocol === 'ws').length,
      http_tests: tests.filter((test: AnyRecord) => test.protocol !== 'ws').length,
      ...(enforced ? { thresholds } : {}),
    },
  });
}
