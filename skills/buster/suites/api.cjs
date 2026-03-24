// ═══════════════════════════════════════════════════════════════
// Suite: api — API Test Runner (JSON-Spec)
// ═══════════════════════════════════════════════════════════════
//
// Reads a test-spec.json (path configured via spec_file),
// fires HTTP (and optionally WebSocket) requests against the
// running app, and compares responses against expectations.
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, failures
//     reported as findings for awareness.
//   Thresholds configured → ENFORCED: FAIL if failure count exceeds
//     thresholds. e.g. { max_failures: 0 } = zero failures allowed
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config.api):
//   { spec_file: ".swarm/02-kubernetes-connection/test-spec.json" }
//   { spec_file: "...", thresholds: { max_failures: 0 } }
//
// No spec file found → SKIP (analogous to visual-reg without baseline).
//
// Dependencies: build + health (needs a running app)
// WebSocket support: tests with "protocol": "ws" use native WebSocket API.

const fs   = require('fs');
const path = require('path');
const {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} = require('../verdict-schema.cjs');

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  static_port:   9999,
  server_port:   3000,
  timeout_ms:    5000,
  ws_timeout_ms: 5000,
  max_findings:  50,
  project_dir:   '/home/node/.openclaw/workspace/git-repo',
};

const REPO_DIR = '/home/node/.openclaw/workspace/git-repo';

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SUITE] [API] ${msg}`);
}

/**
 * Resolve a path relative to REPO_DIR if not absolute.
 */
function resolveRepoPath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(REPO_DIR, p);
}

/**
 * Resolve spec_file path. Checks:
 *   1. Absolute path as-is
 *   2. Relative to project_dir (which is already resolved to absolute)
 */
function resolveSpecPath(specFile, projectDir) {
  if (path.isAbsolute(specFile)) return specFile;
  return path.join(projectDir, specFile);
}

/**
 * Simple template variable replacement.
 * Replaces {{varName}} with values from vars map.
 */
function interpolate(str, vars) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Deep-interpolate all string values in an object.
 */
function interpolateObj(obj, vars) {
  if (!obj || !vars || Object.keys(vars).length === 0) return obj;
  if (typeof obj === 'string') return interpolate(obj, vars);
  if (Array.isArray(obj)) return obj.map(v => interpolateObj(v, vars));
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = interpolateObj(v, vars);
    }
    return result;
  }
  return obj;
}

/**
 * Extract a nested value by dot-path.  e.g. "data.token" → obj.data.token
 */
function getByPath(obj, dotPath) {
  if (!dotPath) return obj;
  const parts = String(dotPath).split('.');
  let current = obj;
  for (const p of parts) {
    if (current == null) return undefined;
    current = current[p];
  }
  return current;
}

// ── Auth Setup ──────────────────────────────────────────────────

/**
 * Run setup.auth to obtain a token (if configured).
 * Returns vars map with { token: "..." }.
 */
async function runAuthSetup(setup, baseUrl, timeoutMs) {
  if (!setup?.auth_endpoint) return {};

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
      log(`Auth setup failed: HTTP ${res.status}`);
      return {};
    }

    const json = await res.json();
    const tokenPath = setup.token_path || 'token';
    const token = getByPath(json, tokenPath);

    if (token) {
      log(`Auth setup OK — token obtained (path: ${tokenPath})`);
      return { token: String(token) };
    }

    log(`Auth setup: token not found at path "${tokenPath}"`);
    return {};

  } catch (err) {
    log(`Auth setup error: ${err.message}`);
    return {};
  } finally {
    clearTimeout(timer);
  }
}

// ── HTTP Test Execution ─────────────────────────────────────────

async function runHttpTest(test, baseUrl, defaults, vars, timeoutMs) {
  const method  = (test.method || 'GET').toUpperCase();
  const urlPath = interpolate(test.path, vars);
  const url     = `${baseUrl}${urlPath}`;

  // Merge headers: defaults → test-level
  const headers = {
    ...(defaults.headers || {}),
    ...(interpolateObj(test.headers || {}, vars)),
  };

  const fetchOpts = {
    method,
    headers,
  };

  // Body for POST/PUT/PATCH
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
    const failures = [];

    // Check status code
    if (expect.status != null && res.status !== expect.status) {
      failures.push(`Expected status ${expect.status}, got ${res.status}`);
    }

    // Parse body if needed for further checks
    let body = null;
    if (expect.body_type || expect.body_contains || expect.body_min_length != null) {
      try {
        body = await res.json();
      } catch {
        try { body = await res.text(); } catch { body = null; }
      }
    }

    // Check body type
    if (expect.body_type) {
      const actual = Array.isArray(body) ? 'array' : typeof body;
      if (actual !== expect.body_type) {
        failures.push(`Expected body type "${expect.body_type}", got "${actual}"`);
      }
    }

    // Check body min length (for arrays)
    if (expect.body_min_length != null && Array.isArray(body)) {
      if (body.length < expect.body_min_length) {
        failures.push(`Expected array length >= ${expect.body_min_length}, got ${body.length}`);
      }
    }

    // Check body contains (key existence + optional value match)
    if (expect.body_contains && typeof body === 'object' && body !== null) {
      for (const [key, expectedVal] of Object.entries(expect.body_contains)) {
        const actualVal = getByPath(body, key);
        if (actualVal === undefined) {
          failures.push(`Expected body to contain key "${key}"`);
        } else if (expectedVal !== true && String(actualVal) !== String(expectedVal)) {
          // true means "just check existence", any other value means match
          failures.push(`Expected body.${key} = ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actualVal)}`);
        }
      }
    }

    // Check response time
    if (expect.max_response_ms != null && elapsed > expect.max_response_ms) {
      failures.push(`Response took ${elapsed}ms (max: ${expect.max_response_ms}ms)`);
    }

    return {
      passed: failures.length === 0,
      failures,
      status: res.status,
      elapsed,
    };

  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.name === 'AbortError'
      ? `Timeout after ${timeoutMs}ms`
      : err.message;
    return {
      passed: false,
      failures: [msg],
      status: null,
      elapsed,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── WebSocket Test Execution ────────────────────────────────────

async function runWsTest(test, baseUrl, vars, timeoutMs) {
  const urlPath = interpolate(test.path, vars);
  // Convert http(s):// to ws(s)://
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const url    = `${wsBase}${urlPath}`;

  return new Promise((resolve) => {
    const failures = [];
    const start    = Date.now();
    let timer;
    let ws;

    try {
      const WebSocket = require('ws');
      ws = new WebSocket(url);
    } catch {
      // Fallback: try global WebSocket
      try {
        ws = new WebSocket(url);
      } catch (err) {
        resolve({
          passed: false,
          failures: [`WebSocket not available: ${err.message}`],
          status: null,
          elapsed: Date.now() - start,
        });
        return;
      }
    }

    timer = setTimeout(() => {
      failures.push(`WebSocket timeout after ${timeoutMs}ms`);
      try { ws.close(); } catch {}
      resolve({
        passed: failures.length === 0,
        failures,
        status: null,
        elapsed: Date.now() - start,
      });
    }, timeoutMs);

    const expect     = test.expect || {};
    const messages   = test.ws_messages || [];
    const responses  = [];

    ws.on('open', () => {
      // Connection check
      if (expect.ws_connected === false) {
        failures.push('Expected connection to fail, but it succeeded');
      }

      // Send messages sequentially
      for (const msg of messages) {
        if (msg.send) {
          const payload = typeof msg.send === 'string'
            ? interpolate(msg.send, vars)
            : JSON.stringify(interpolateObj(msg.send, vars));
          ws.send(payload);
        }
      }
    });

    ws.on('message', (data) => {
      let parsed;
      try { parsed = JSON.parse(String(data)); }
      catch { parsed = String(data); }
      responses.push(parsed);

      // Check ws_response_contains after each message
      if (expect.ws_response_contains && typeof parsed === 'object') {
        // Will be evaluated once after close — collect for now
      }
    });

    ws.on('error', (err) => {
      if (expect.ws_connected === false) {
        // Expected failure — this is PASS
      } else {
        failures.push(`WebSocket error: ${err.message}`);
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);

      // Evaluate response expectations
      if (expect.ws_response_contains && responses.length > 0) {
        for (const [key, expectedVal] of Object.entries(expect.ws_response_contains)) {
          const found = responses.some(r => {
            if (typeof r !== 'object' || r === null) return false;
            const actual = getByPath(r, key);
            if (expectedVal === true) return actual !== undefined;
            return String(actual) === String(expectedVal);
          });
          if (!found) {
            failures.push(`No WS response contained "${key}": ${JSON.stringify(expectedVal)}`);
          }
        }
      }

      if (expect.ws_min_messages != null && responses.length < expect.ws_min_messages) {
        failures.push(`Expected >= ${expect.ws_min_messages} WS messages, got ${responses.length}`);
      }

      resolve({
        passed: failures.length === 0,
        failures,
        status: null,
        elapsed: Date.now() - start,
      });
    });

    // If connection expected to fail but ws_connected not set, give it a moment
    if (expect.ws_connected === false) {
      setTimeout(() => {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({
          passed: failures.length === 0,
          failures,
          status: null,
          elapsed: Date.now() - start,
        });
      }, 2000);
    }
  });
}

// ── Suite Entry Point ───────────────────────────────────────────

module.exports = async function apiSuite(context) {
  const startTime  = Date.now();
  const serve      = context.config?.serve || {};
  const apiConf    = context.config?.api   || {};

  // Determine base URL
  const type    = serve.type || 'static';
  const port    = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const baseUrl = `http://localhost:${port}`;

  // Resolve spec file
  const specFile  = apiConf.spec_file || null;
  const projectDir = resolveRepoPath(serve.project_dir || DEFAULTS.project_dir);

  if (!specFile) {
    const duration_ms = Date.now() - startTime;
    log('No spec_file configured — SKIP');
    return createSuiteVerdict('api', STATUS.SKIP, {
      duration_ms,
      reason: 'No spec_file configured in test_config.api',
    });
  }

  const specPath = resolveSpecPath(specFile, projectDir);

  if (!fs.existsSync(specPath)) {
    const duration_ms = Date.now() - startTime;
    log(`Spec file not found: ${specPath} — SKIP`);
    return createSuiteVerdict('api', STATUS.SKIP, {
      duration_ms,
      reason: `Spec file not found: ${specPath}`,
    });
  }

  // Load spec
  let spec;
  try {
    const raw = fs.readFileSync(specPath, 'utf8');
    spec = JSON.parse(raw);
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    log(`Spec parse error: ${err.message}`);
    return createSuiteVerdict('api', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: `Failed to parse spec: ${err.message}`,
      findings: [],
    });
  }

  const tests    = spec.tests || [];
  const defaults = spec.defaults || {};
  const setup    = spec.setup || null;
  const specBase = spec.base_url || baseUrl;

  const thresholds = apiConf.thresholds || null; // null = informational
  const enforced   = thresholds !== null;
  const timeoutMs  = defaults.timeout_ms || DEFAULTS.timeout_ms;
  const wsTimeout  = defaults.ws_timeout_ms || DEFAULTS.ws_timeout_ms;

  log(`Running ${tests.length} tests from ${specPath} (mode: ${enforced ? 'enforced' : 'informational'})`);

  if (tests.length === 0) {
    const duration_ms = Date.now() - startTime;
    log('Spec contains no tests — SKIP');
    return createSuiteVerdict('api', STATUS.SKIP, {
      duration_ms,
      reason: 'Spec file contains no tests',
    });
  }

  // Run auth setup if configured
  const vars = await runAuthSetup(setup, specBase, timeoutMs);

  // Execute tests sequentially
  const findings  = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const testName = test.name || `${test.method || 'GET'} ${test.path}`;
    const isWs     = test.protocol === 'ws';

    let result;
    if (isWs) {
      result = await runWsTest(test, specBase, vars, wsTimeout);
    } else {
      result = await runHttpTest(test, specBase, defaults, vars, timeoutMs);
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
            rule: isWs ? 'ws-test' : 'http-test',
            element: test.path,
          }));
        }
      }
    }
  }

  // Determine status
  let status = STATUS.PASS;
  if (enforced && failed > 0) {
    const maxFailures = thresholds.max_failures ?? 0;
    if (failed > maxFailures) {
      status = STATUS.FAIL;
    }
  }

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${passed}/${tests.length} passed, ${failed} failed (${duration_ms}ms)`);

  return createSuiteVerdict('api', status, {
    critical: false,
    duration_ms,
    checks_total:  tests.length,
    checks_passed: passed,
    checks_failed: failed,
    findings,
    metadata: {
      spec_file:   specPath,
      base_url:    specBase,
      mode:        enforced ? 'enforced' : 'informational',
      has_auth:    !!setup?.auth_endpoint,
      ws_tests:    tests.filter(t => t.protocol === 'ws').length,
      http_tests:  tests.filter(t => t.protocol !== 'ws').length,
      ...(enforced ? { thresholds } : {}),
    },
  });
};
