// ═══════════════════════════════════════════════════════════════
// Suite: security — HTTP Response Header Audit
// ═══════════════════════════════════════════════════════════════
//
// Checks HTTP response headers and cookie flags against security
// best practices. Pure fetch-based — no browser, no Playwright.
//
// Checks performed:
//   - Strict-Transport-Security (HSTS): present + max-age
//   - Content-Security-Policy (CSP): present + non-empty
//   - X-Frame-Options: DENY or SAMEORIGIN
//   - X-Content-Type-Options: nosniff
//   - X-XSS-Protection: 0 (modern recommendation) or 1; mode=block
//   - Referrer-Policy: present
//   - Cookie flags: HttpOnly, Secure, SameSite on Set-Cookie headers
//   - CORS: Access-Control-Allow-Origin not wildcard * (optional)
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, missing
//     headers reported as findings for awareness.
//   Thresholds configured → ENFORCED: FAIL if missing/bad header count
//     exceeds thresholds. e.g. { max_missing_headers: 0 }
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config.security):
//   Informational: {} or absent
//   Enforced: { thresholds: { max_missing_headers: 0 } }
//   Optional: { paths: ["/", "/api/health"], check_cors: true }
//
// No paths configured → uses serve.health_path or "/".
//
// Dependencies: build + health (needs a running app)

import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../verdict-schema.js';

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  static_port:  9999,
  server_port:  3000,
  timeout_ms:   10000,
  max_findings: 50,
  min_hsts_max_age: 31536000, // 1 year in seconds
};

// ── Header Checks ───────────────────────────────────────────────
//
// Each check returns null (pass) or a Finding object (issue found).

const HEADER_CHECKS = [
  {
    name: 'strict-transport-security',
    severity: SEVERITY.SERIOUS,
    check(headers, config) {
      const val = headers.get('strict-transport-security');
      if (!val) {
        return { message: 'Missing Strict-Transport-Security (HSTS) header', rule: 'hsts-missing' };
      }
      const maxAgeMatch = val.match(/max-age=(\d+)/);
      if (!maxAgeMatch) {
        return { message: 'HSTS header missing max-age directive', rule: 'hsts-max-age' };
      }
      const minAge = config.min_hsts_max_age ?? DEFAULTS.min_hsts_max_age;
      const maxAge = parseInt(maxAgeMatch[1]);
      if (maxAge < minAge) {
        return {
          message: `HSTS max-age ${maxAge}s is below minimum ${minAge}s`,
          rule: 'hsts-max-age-low',
        };
      }
      return null;
    },
  },
  {
    name: 'content-security-policy',
    severity: SEVERITY.SERIOUS,
    check(headers) {
      const val = headers.get('content-security-policy');
      if (!val) {
        return { message: 'Missing Content-Security-Policy (CSP) header', rule: 'csp-missing' };
      }
      if (val.includes("'unsafe-inline'") && val.includes("'unsafe-eval'")) {
        return {
          message: 'CSP contains both unsafe-inline and unsafe-eval — weak policy',
          rule: 'csp-weak',
        };
      }
      return null;
    },
  },
  {
    name: 'x-frame-options',
    severity: SEVERITY.MODERATE,
    check(headers) {
      const val = headers.get('x-frame-options');
      if (!val) {
        return { message: 'Missing X-Frame-Options header', rule: 'x-frame-missing' };
      }
      const upper = val.toUpperCase();
      if (upper !== 'DENY' && upper !== 'SAMEORIGIN') {
        return {
          message: `X-Frame-Options "${val}" — expected DENY or SAMEORIGIN`,
          rule: 'x-frame-invalid',
        };
      }
      return null;
    },
  },
  {
    name: 'x-content-type-options',
    severity: SEVERITY.MODERATE,
    check(headers) {
      const val = headers.get('x-content-type-options');
      if (!val) {
        return { message: 'Missing X-Content-Type-Options header', rule: 'xcto-missing' };
      }
      if (val.toLowerCase() !== 'nosniff') {
        return {
          message: `X-Content-Type-Options "${val}" — expected "nosniff"`,
          rule: 'xcto-invalid',
        };
      }
      return null;
    },
  },
  {
    name: 'x-xss-protection',
    severity: SEVERITY.MINOR,
    check(headers) {
      const val = headers.get('x-xss-protection');
      if (!val) {
        return { message: 'Missing X-XSS-Protection header (consider "0" for modern browsers)', rule: 'xxss-missing' };
      }
      // Modern recommendation: "0" (disable browser XSS filter, rely on CSP)
      // Legacy acceptable: "1; mode=block"
      return null;
    },
  },
  {
    name: 'referrer-policy',
    severity: SEVERITY.MINOR,
    check(headers) {
      const val = headers.get('referrer-policy');
      if (!val) {
        return { message: 'Missing Referrer-Policy header', rule: 'referrer-missing' };
      }
      return null;
    },
  },
];

// ── Cookie Check ────────────────────────────────────────────────

function checkCookies(headers) {
  const findings = [];

  // fetch() API doesn't expose Set-Cookie directly in browser,
  // but in Node.js it's available via headers.getSetCookie() or raw headers
  let cookies = [];

  // Node 18+ has getSetCookie() — returns proper array of individual cookies
  if (typeof headers.getSetCookie === 'function') {
    cookies = headers.getSetCookie();
  } else {
    // Fallback: headers.get('set-cookie') merges multiple headers into one string.
    // Split on ", " followed by a cookie name (word chars + "=") to avoid splitting
    // inside values like "Expires=Thu, 01 Jan 2026 ..."
    const raw = headers.get('set-cookie');
    if (raw) {
      cookies = raw.split(/,\s*(?=\w+=)/).filter(Boolean);
    }
  }

  for (const cookie of cookies) {
    const parts = cookie.toLowerCase();
    const name = cookie.split('=')[0]?.trim() || 'unknown';

    if (!parts.includes('httponly')) {
      findings.push(createFinding(SEVERITY.SERIOUS,
        `Cookie "${name}" missing HttpOnly flag`,
        { rule: 'cookie-httponly', element: name }
      ));
    }

    if (!parts.includes('secure')) {
      findings.push(createFinding(SEVERITY.SERIOUS,
        `Cookie "${name}" missing Secure flag`,
        { rule: 'cookie-secure', element: name }
      ));
    }

    if (!parts.includes('samesite')) {
      findings.push(createFinding(SEVERITY.MODERATE,
        `Cookie "${name}" missing SameSite attribute`,
        { rule: 'cookie-samesite', element: name }
      ));
    }
  }

  return { findings, cookieCount: cookies.length };
}

// ── CORS Check ──────────────────────────────────────────────────

function checkCors(headers) {
  const acao = headers.get('access-control-allow-origin');
  if (!acao) return null; // No CORS header = not a CORS endpoint, fine

  if (acao === '*') {
    return createFinding(SEVERITY.SERIOUS,
      'Access-Control-Allow-Origin is wildcard (*) — consider restricting to specific origins',
      { rule: 'cors-wildcard' }
    );
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [SECURITY] ${msg}`);
  if (_logSink) _logSink({ suite: 'security', msg });
}

// ── Suite Entry Point ───────────────────────────────────────────

export default async function securitySuite(context) {
  _logSink = context.logSink || null;
  const startTime = Date.now();
  const serve     = context.config?.serve    || {};
  const secConf   = context.config?.security || {};

  // Determine base URL
  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const baseUrl = `http://localhost:${port}`;

  // Paths to check
  const paths = secConf.paths || [serve.health_path || '/'];
  const checkCorsEnabled = secConf.check_cors !== false; // default: true
  const thresholds = secConf.thresholds || null;
  const enforced   = thresholds !== null;
  const timeoutMs  = secConf.timeout_ms || DEFAULTS.timeout_ms;

  log(`Checking ${paths.length} path(s) on ${baseUrl} (mode: ${enforced ? 'enforced' : 'informational'})`);

  const allFindings   = [];
  let totalChecks     = 0;
  let failedChecks    = 0;
  const pathResults   = [];

  for (const urlPath of paths) {
    const url = `${baseUrl}${urlPath}`;
    log(`  Scanning ${url}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let headers;
    let status;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'text/html, application/json, */*' },
      });
      headers = res.headers;
      status  = res.status;
    } catch (err) {
      clearTimeout(timer);
      const msg = err.name === 'AbortError'
        ? `Timeout after ${timeoutMs}ms`
        : err.message;
      log(`  ❌ ${url}: ${msg}`);

      allFindings.push(createFinding(SEVERITY.CRITICAL,
        `Cannot reach ${url}: ${msg}`,
        { rule: 'connection', element: urlPath }
      ));
      failedChecks++;
      totalChecks++;
      pathResults.push({ path: urlPath, error: msg });
      continue;
    } finally {
      clearTimeout(timer);
    }

    const pathFindings = [];

    // Run header checks
    for (const check of HEADER_CHECKS) {
      totalChecks++;
      const issue = check.check(headers, secConf);
      if (issue) {
        failedChecks++;
        if (allFindings.length < DEFAULTS.max_findings) {
          pathFindings.push(createFinding(check.severity,
            `${urlPath}: ${issue.message}`,
            { rule: issue.rule, element: urlPath }
          ));
        }
      }
    }

    // Cookie check
    const { findings: cookieFindings, cookieCount } = checkCookies(headers);
    totalChecks += cookieCount > 0 ? cookieCount : 0;
    for (const f of cookieFindings) {
      failedChecks++;
      if (allFindings.length + pathFindings.length < DEFAULTS.max_findings) {
        pathFindings.push(f);
      }
    }

    // CORS check
    if (checkCorsEnabled) {
      totalChecks++;
      const corsIssue = checkCors(headers);
      if (corsIssue) {
        failedChecks++;
        if (allFindings.length + pathFindings.length < DEFAULTS.max_findings) {
          pathFindings.push(corsIssue);
        }
      }
    }

    allFindings.push(...pathFindings);
    pathResults.push({
      path:     urlPath,
      status,
      issues:   pathFindings.length,
      headers_present: HEADER_CHECKS
        .filter(c => headers.get(c.name))
        .map(c => c.name),
    });

    const icon = pathFindings.length === 0 ? '✅' : '⚠️';
    log(`  ${icon} ${urlPath}: ${pathFindings.length} issue(s)`);
  }

  // Determine status
  let suiteStatus = STATUS.PASS;
  if (enforced && failedChecks > 0) {
    const maxMissing = thresholds.max_missing_headers ?? 0;
    if (failedChecks > maxMissing) {
      suiteStatus = STATUS.FAIL;
    }
  }

  const passedChecks = totalChecks - failedChecks;
  const duration_ms  = Date.now() - startTime;
  const icon = suiteStatus === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${passedChecks}/${totalChecks} checks passed, ${failedChecks} issues (${duration_ms}ms)`);

  return createSuiteVerdict('security', suiteStatus, {
    critical: false,
    duration_ms,
    checks_total:  totalChecks,
    checks_passed: passedChecks,
    checks_failed: failedChecks,
    findings:      allFindings,
    metadata: {
      paths_checked: paths,
      path_results:  pathResults,
      mode:          enforced ? 'enforced' : 'informational',
      check_cors:    checkCorsEnabled,
      ...(enforced ? { thresholds } : {}),
    },
  });
}
