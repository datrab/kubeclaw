// ═══════════════════════════════════════════════════════════════
// Suite: a11y — Accessibility Check via axe-core
// ═══════════════════════════════════════════════════════════════
//
// Scans the running app with @axe-core/playwright for WCAG violations.
// Each violation becomes a Finding in the verdict.
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, violations
//     reported as findings for awareness. Typical for module tests.
//   Thresholds configured → ENFORCED: FAIL if violation counts exceed
//     thresholds per severity. Typical for gate tests.
//     e.g. { critical: 0, serious: 0 } = zero critical/serious allowed
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config.a11y):
//   Informational: { tags: ['wcag2a', 'wcag2aa'], exclude: ['.cookie-banner'] }
//   Enforced: { thresholds: { critical: 0, serious: 0 }, tags: [...] }
//
// Dependencies: build + health (needs a running app to scan)
// Requires: @axe-core/playwright (Dockerfile.sandbox)

const {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} = require('../verdict-schema.cjs');

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  static_port: 9999,
  server_port: 3000,
  path:        '/',
  tags:        ['wcag2a', 'wcag2aa'],
  exclude:     [],
  max_findings: 50,
  timeout:     15000, // ms — navigation timeout
};

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [A11Y] ${msg}`);
  if (_logSink) _logSink({ suite: 'a11y', msg });
}

/**
 * Map axe-core impact to verdict SEVERITY.
 * axe uses: critical, serious, moderate, minor — direct 1:1 match.
 */
function mapSeverity(impact) {
  switch (impact) {
    case 'critical': return SEVERITY.CRITICAL;
    case 'serious':  return SEVERITY.SERIOUS;
    case 'moderate': return SEVERITY.MODERATE;
    case 'minor':    return SEVERITY.MINOR;
    default:         return SEVERITY.MINOR;
  }
}

/**
 * Extract the most useful CSS selector from an axe node.
 * axe provides an array of selector arrays — take the first.
 */
function extractSelector(node) {
  if (node?.target?.[0]) return String(node.target[0]);
  if (node?.html) return node.html.slice(0, 80);
  return null;
}

// ── Suite Entry Point ───────────────────────────────────────────

module.exports = async function a11ySuite(context) {
  _logSink = context.logSink || null;
  const startTime = Date.now();
  const serve     = context.config?.serve || {};
  const a11yConf  = context.config?.a11y  || {};

  // Determine URL
  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const urlPath = a11yConf.path || DEFAULTS.path;
  const url  = `http://localhost:${port}${urlPath}`;

  const tags        = a11yConf.tags    || DEFAULTS.tags;
  const exclude     = a11yConf.exclude || DEFAULTS.exclude;
  const maxFindings = a11yConf.max_findings || DEFAULTS.max_findings;
  const thresholds  = a11yConf.thresholds || null; // null = informational, object = enforced
  const enforced    = thresholds !== null;

  log(`Scanning ${url} (tags: ${tags.join(',')}, mode: ${enforced ? 'enforced' : 'informational'})`);

  let browser;
  try {
    const { chromium }    = require('playwright');
    const { AxeBuilder }  = require('@axe-core/playwright');

    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context_pw = await browser.newContext();
    const page       = await context_pw.newPage();

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout:   a11yConf.timeout || DEFAULTS.timeout,
    });

    // Build axe scan
    let builder = new AxeBuilder({ page }).withTags(tags);
    for (const sel of exclude) {
      builder = builder.exclude(sel);
    }

    const results = await builder.analyze();

    await context_pw.close();

    // Map violations to findings
    const findings = [];

    for (const violation of results.violations) {
      // One finding per affected node (capped)
      for (const node of violation.nodes) {
        if (findings.length >= maxFindings) break;

        findings.push(createFinding(
          mapSeverity(violation.impact),
          violation.help,
          {
            rule:    violation.id,
            element: extractSelector(node),
          }
        ));
      }
      if (findings.length >= maxFindings) break;
    }

    const checksTotal  = results.passes.length + results.violations.length;
    const checksFailed = results.violations.length;
    const checksPassed = results.passes.length;

    // Determine status based on mode
    let status = STATUS.PASS;

    if (enforced && checksFailed > 0) {
      // Count violations per severity
      const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const v of results.violations) {
        const sev = v.impact || 'minor';
        if (counts[sev] !== undefined) counts[sev]++;
      }

      // Check each severity against its threshold (default: unlimited)
      for (const [sev, max] of Object.entries(thresholds)) {
        if (counts[sev] !== undefined && counts[sev] > max) {
          status = STATUS.FAIL;
          break;
        }
      }
    }

    const duration_ms = Date.now() - startTime;
    const icon = status === STATUS.PASS ? '✅' : '⚠️';

    log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${checksPassed}/${checksTotal} passed, ${checksFailed} violations (${findings.length} findings)`);

    return createSuiteVerdict('a11y', status, {
      critical: false,
      duration_ms,
      checks_total:  checksTotal,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
      findings,
      metadata: {
        tool:        `axe-core (${tags.join(',')})`,
        url_tested:  url,
        mode:        enforced ? 'enforced' : 'informational',
        violations:  checksFailed,
        passes:      checksPassed,
        incomplete:  results.incomplete?.length || 0,
        inapplicable: results.inapplicable?.length || 0,
        ...(enforced ? { thresholds } : {}),
      },
    });

  } catch (err) {
    const duration_ms = Date.now() - startTime;
    log(`ERROR: ${err.message}`);

    return createSuiteVerdict('a11y', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: err.message,
      findings: [],
    });

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
