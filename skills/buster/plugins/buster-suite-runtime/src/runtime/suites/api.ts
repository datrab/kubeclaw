import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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

import fs from 'fs';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import { REPO_DIR, resolveRepoScopedPath } from './repo-paths.ts';
import {
  createSuiteLog,
  suiteErrorMessage as errorMessage,
  suiteNonEmptyString as nonEmptyString,
  suiteObject as objectRecord,
  suiteObjectOrEmpty as objectRecordOrEmpty,
} from './support.ts';
import type { AnyRecord } from './api-values.ts';
import { buildApiVerdict, executeApiTests } from './api-runner.ts';

type LogSink = (entry: Record<string, unknown>) => void;

interface ApiContext {
  logSink?: LogSink | null;
  config?: {
    serve?: AnyRecord;
    api?: AnyRecord;
  };
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

const apiSuiteState: { logSink: LogSink | null } = { logSink: null };
const log = createSuiteLog('api', 'API', (entry) => apiSuiteState.logSink?.(entry));

function resolveSpecPath(specFile: unknown, projectDir: string): string {
  const resolved = resolveRepoScopedPath(specFile, {
    baseDir: projectDir,
    scopeDir: projectDir,
    field: 'api.spec_file',
  });
  if (!resolved) throw new Error('api.spec_file is required');
  return resolved;
}

function getByPath(obj: any, dotPath: unknown): any {
  if (!dotPath) return obj;
  let current = obj;
  for (const part of String(dotPath).split(".")) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

async function runAuthSetup(setup: AnyRecord | null, baseUrl: string, timeoutMs: number): Promise<AuthSetupResult> {
  if (!setup?.auth_endpoint) return { ok: true, vars: {} };

  const url  = `${baseUrl}${setup.auth_endpoint}`;
  const body = objectRecordOrEmpty(setup.auth_body);

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
    const tokenPath = selectDefinedValue(() => (nonEmptyString(setup.token_path)), () => ('token'));
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

function apiProjectDirAuthority(serve: AnyRecord): string {
  const requestedProjectDir = nonEmptyString(serve.project_dir);
  if (requestedProjectDir) {
    const resolved = resolveRepoScopedPath(requestedProjectDir, { field: 'serve.project_dir' });
    if (!resolved) throw new Error('serve.project_dir is outside allowed repository scope');
    return resolved;
  }
  return DEFAULTS.project_dir;
}

function apiTimeoutMsAuthority(defaults: AnyRecord, field: 'timeout_ms' | 'ws_timeout_ms'): number {
  const configured = defaults[field];
  if (configured !== undefined && configured !== null) return Number(configured);
  return field === 'ws_timeout_ms' ? DEFAULTS.ws_timeout_ms : DEFAULTS.timeout_ms;
}

export default async function apiSuite(context: ApiContext): Promise<SuiteVerdict> {
  apiSuiteState.logSink = typeof context.logSink === 'function' ? context.logSink : null;
  const startTime = Date.now();
  const serve = objectRecordOrEmpty(context.config?.serve);
  const apiConf = objectRecordOrEmpty(context.config?.api);

  const type = selectDefinedValue(() => (nonEmptyString(serve.type)), () => ('static'));
  const port = selectDefinedValue(() => (serve.port), () => ((type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port)));
  const baseUrl = `http://localhost:${port}`;
  const projectDir = apiProjectDirAuthority(serve);
  const specFile = selectTruthyValue(() => (apiConf.spec_file), () => (null));

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

  const defaults = objectRecordOrEmpty(spec.defaults);
  const setup = objectRecord(spec.setup);
  const configuredBase = nonEmptyString(spec.base_url);
  const specBase = configuredBase === null ? baseUrl : configuredBase;
  const thresholds = selectTruthyValue(() => (apiConf.thresholds), () => (null));
  const enforced = thresholds !== null;
  const timeoutMs = apiTimeoutMsAuthority(defaults, 'timeout_ms');
  const wsTimeout = apiTimeoutMsAuthority(defaults, 'ws_timeout_ms');

  log(`Running ${tests.length} tests from ${specPath} (mode: ${enforced ? 'enforced' : 'informational'})`);

  const auth = await runAuthSetup(setup, specBase, timeoutMs);
  if (!auth.ok) return apiContractFailure(startTime, auth.error === undefined ? 'API auth setup failed' : auth.error, 'api-auth-setup');

  const summary = await executeApiTests({ tests, defaults, vars: auth.vars, baseUrl: specBase, timeoutMs, wsTimeout, maxFindings: DEFAULTS.max_findings, log });
  return buildApiVerdict({ startTime, summary, tests, thresholds, specPath, baseUrl: specBase, hasAuth: Boolean(setup?.auth_endpoint), log });
}
