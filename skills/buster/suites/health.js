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

import fs   from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../verdict-schema.js';

const REPO_DIR = '/home/node/.openclaw/workspace/git-repo';

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

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [HEALTH] ${msg}`);
  if (_logSink) _logSink({ suite: 'health', msg });
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

// ── Smoke Navigation ────────────────────────────────────────────

/**
 * Map a JS pageerror message to a structured finding message.
 */
function mapJsError(message) {
  if (message.includes('Minified React error #31')) {
    return createFinding(SEVERITY.SERIOUS, 'React render error: attempted to render non-text value as JSX child', { rule: 'react-error-31' });
  }
  if (message.includes('Minified React error #418')) {
    return createFinding(SEVERITY.SERIOUS, 'React hydration mismatch', { rule: 'react-error-418' });
  }
  if (message.includes('Cannot read properties of undefined')) {
    return createFinding(SEVERITY.SERIOUS, 'Runtime error: accessing property on undefined value', { rule: 'undefined-property' });
  }
  return createFinding(SEVERITY.SERIOUS, `Frontend JS error: ${message}`, { rule: 'js-error' });
}

/**
 * Auto-detect smoke paths from visual-reg baseline_dir/paths.json.
 * Returns string[] or null.
 */
function autoDetectSmokePaths(config) {
  const baselineDir = config?.['visual-reg']?.baseline_dir;
  if (!baselineDir) return null;

  const pathsFile = path.isAbsolute(baselineDir)
    ? path.join(baselineDir, 'paths.json')
    : path.join(REPO_DIR, baselineDir, 'paths.json');

  if (!fs.existsSync(pathsFile)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(pathsFile, 'utf8'));
    return Array.isArray(data) ? data : (Array.isArray(data.paths) ? data.paths : null);
  } catch {
    return null;
  }
}

/**
 * Navigate to each path in a headless browser, collect pageerror findings.
 * Returns Finding[].
 */
async function smokeNavigate(baseUrl, paths, settleMs) {
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    return [createFinding(
      SEVERITY.MODERATE,
      'Playwright not available for smoke navigation',
      { rule: 'smoke-playwright-unavailable' },
    )];
  }

  const findings = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    for (const navPath of paths) {
      const url = `${baseUrl}${navPath}`;
      log(`Smoke: ${url}`);

      const page   = await browser.newPage();
      const errors = [];
      page.on('pageerror', err => errors.push(err.message || String(err)));

      try {
        await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
        if (settleMs > 0) await page.waitForTimeout(settleMs);
      } catch (err) {
        findings.push(createFinding(
          SEVERITY.SERIOUS,
          `Navigation failed for ${navPath}: ${err.message}`,
          { rule: 'smoke-nav-error' },
        ));
      }

      for (const msg of errors) {
        findings.push(mapJsError(msg));
      }

      await page.close().catch(() => {});
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return findings;
}

// ── Suite Entry Point ───────────────────────────────────────────

export default async function healthSuite(context) {
  _logSink = context.logSink || null;
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

  let lastResult  = null;
  let httpPassed  = false;
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

    const reason = lastResult.error || `HTTP ${lastResult.status}`;
    log(`Attempt ${i + 1}/${retries}: ${reason} (${lastResult.responseTime}ms)`);
  }

  // HTTP check failed — return immediately (critical)
  if (!httpPassed) {
    const duration_ms = Date.now() - startTime;
    const reason = lastResult.error || `HTTP ${lastResult.status}`;

    log(`❌ FAIL after ${retries} attempts: ${reason}`);

    const findings = [];
    if (lastResult.error) {
      findings.push(createFinding(SEVERITY.CRITICAL, `${url}: ${lastResult.error}`, { rule: 'connection' }));
    } else {
      findings.push(createFinding(SEVERITY.CRITICAL, `${url}: expected 2xx, got ${lastResult.status}`, { rule: 'status-code' }));
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
  }

  // ── HTTP passed — run smoke navigation if configured ──
  const smokePaths  = serve.smoke_paths || autoDetectSmokePaths(context.config);
  const smokeFindings = [];

  if (smokePaths && smokePaths.length > 0) {
    const settleMs  = serve.smoke_settle_ms ?? 1000;
    const baseUrl   = `http://localhost:${port}`;
    log(`Smoke navigation: ${smokePaths.length} path(s), settleMs=${settleMs}`);

    const navFindings = await smokeNavigate(baseUrl, smokePaths, settleMs);
    smokeFindings.push(...navFindings);

    const errors = navFindings.filter(f => f.severity === SEVERITY.SERIOUS || f.severity === SEVERITY.CRITICAL);
    if (errors.length > 0) {
      log(`❌ Smoke navigation: ${errors.length} issue(s) found`);
    } else {
      log(`✅ Smoke navigation: all ${smokePaths.length} path(s) clean`);
    }
  }

  const duration_ms    = Date.now() - startTime;
  const smokeErrors    = smokeFindings.filter(f => f.severity === SEVERITY.SERIOUS || f.severity === SEVERITY.CRITICAL);
  const hasSmokeFail   = smokeErrors.length > 0;

  if (hasSmokeFail) {
    return createSuiteVerdict('health', STATUS.FAIL, {
      critical:      false, // Subagent can still be spawned to investigate
      duration_ms,
      checks_total:  1 + smokePaths.length,
      checks_passed: 1,
      checks_failed: smokeErrors.length,
      findings:      smokeFindings,
      metadata: {
        url,
        status_code:      lastResult.status,
        response_time_ms: lastResult.responseTime,
        attempts:         httpAttempts,
        smoke_paths:      smokePaths,
        smoke_errors:     smokeErrors.length,
      },
    });
  }

  return createSuiteVerdict('health', STATUS.PASS, {
    critical:      true,
    duration_ms,
    checks_total:  1 + (smokePaths ? smokePaths.length : 0),
    checks_passed: 1 + (smokePaths ? smokePaths.length : 0),
    checks_failed: 0,
    findings:      smokeFindings,
    metadata: {
      url,
      status_code:      lastResult.status,
      response_time_ms: lastResult.responseTime,
      attempts:         httpAttempts,
      ...(smokePaths ? { smoke_paths: smokePaths } : {}),
    },
  });
}
