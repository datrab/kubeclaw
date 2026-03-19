// ═══════════════════════════════════════════════════════════════
// Suite: health — HTTP Health Check
// ═══════════════════════════════════════════════════════════════
//
// Verifies the app is responding after build.js brought it up.
// Fetch with retry (3x, exponential backoff), status code check,
// response time measurement.
//
// Config (from context.config.serve):
//   { type: "static", port: 9999, health_path: "/" }
//   { type: "server", port: 3000, health_path: "/api/health" }
//
// Defaults: port 9999 for static, 3000 for server. Path "/".

const {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} = require('../verdict-schema.js');

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  static_port:  9999,
  server_port:  3000,
  health_path:  '/',
  retries:      3,
  base_delay:   1000,  // ms — doubles each retry
  timeout:      10000, // ms per request
};

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SUITE] [HEALTH] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Single fetch attempt with timeout via AbortController.
 * Returns { ok, status, responseTime, error }
 */
async function attempt(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'text/html, application/json, */*' },
    });
    const responseTime = Date.now() - start;
    return { ok: res.ok, status: res.status, responseTime, error: null };
  } catch (err) {
    const responseTime = Date.now() - start;
    const message = err.name === 'AbortError'
      ? `Timeout after ${timeoutMs}ms`
      : err.message;
    return { ok: false, status: null, responseTime, error: message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Suite Entry Point ───────────────────────────────────────────

module.exports = async function healthSuite(context) {
  const startTime = Date.now();
  const serve = context.config?.serve || {};

  // Determine port and path
  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const healthPath = serve.health_path || DEFAULTS.health_path;
  const url = `http://localhost:${port}${healthPath}`;

  const retries   = serve.health_retries   || DEFAULTS.retries;
  const baseDelay = serve.health_base_delay || DEFAULTS.base_delay;
  const timeout   = serve.health_timeout    || DEFAULTS.timeout;

  log(`Checking ${url} (retries=${retries}, timeout=${timeout}ms)`);

  let lastResult = null;

  for (let i = 0; i < retries; i++) {
    if (i > 0) {
      const delay = baseDelay * Math.pow(2, i - 1);
      log(`Retry ${i}/${retries - 1} in ${delay}ms...`);
      await sleep(delay);
    }

    lastResult = await attempt(url, timeout);

    if (lastResult.ok) {
      const duration_ms = Date.now() - startTime;
      log(`✅ ${lastResult.status} in ${lastResult.responseTime}ms (total ${duration_ms}ms)`);

      return createSuiteVerdict('health', STATUS.PASS, {
        critical: true,
        duration_ms,
        checks_total: 1,
        checks_passed: 1,
        checks_failed: 0,
        findings: [],
        metadata: {
          url,
          status_code: lastResult.status,
          response_time_ms: lastResult.responseTime,
          attempts: i + 1,
        },
      });
    }

    // Log failed attempt
    const reason = lastResult.error || `HTTP ${lastResult.status}`;
    log(`Attempt ${i + 1}/${retries}: ${reason} (${lastResult.responseTime}ms)`);
  }

  // All retries exhausted
  const duration_ms = Date.now() - startTime;
  const reason = lastResult.error || `HTTP ${lastResult.status}`;

  log(`❌ FAIL after ${retries} attempts: ${reason}`);

  const findings = [];

  if (lastResult.error) {
    // Connection-level failure (ECONNREFUSED, timeout, etc.)
    findings.push(createFinding(SEVERITY.CRITICAL, `${url}: ${lastResult.error}`, {
      rule: 'connection',
    }));
  } else {
    // Got a response but wrong status code
    findings.push(createFinding(SEVERITY.CRITICAL, `${url}: expected 2xx, got ${lastResult.status}`, {
      rule: 'status-code',
    }));
  }

  return createSuiteVerdict('health', STATUS.FAIL, {
    critical: true,
    duration_ms,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings,
    metadata: {
      url,
      status_code: lastResult.status,
      response_time_ms: lastResult.responseTime,
      attempts: retries,
      last_error: reason,
    },
  });
};
