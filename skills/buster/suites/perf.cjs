// ═══════════════════════════════════════════════════════════════
// Suite: perf — Lighthouse Performance Audit
// ═══════════════════════════════════════════════════════════════
//
// Runs Lighthouse CLI against the running app, parses JSON output.
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, scores
//     reported as findings for awareness. Typical for module tests.
//   Thresholds configured → ENFORCED: FAIL if any score below
//     threshold. Typical for gate tests (final validation).
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config.perf):
//   Informational: {} or absent
//   Enforced: { thresholds: { performance: 80, accessibility: 90 } }
//
// Dependencies: build + health (needs a running app to audit)
// Requires: lighthouse (already in Dockerfile.sandbox)

const { execFileSync } = require('child_process');
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
  static_port: 9999,
  server_port: 3000,
  path:        '/',
  timeout:     60, // seconds — lighthouse can be slow
  output_path: '/sandbox/results/lighthouse-report.json',
};

// Lighthouse category keys → human-readable names
const CATEGORY_NAMES = {
  performance:      'Performance',
  accessibility:    'Accessibility',
  'best-practices': 'Best Practices',
  seo:              'SEO',
};

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SUITE] [PERF] ${msg}`);
}

/**
 * Determine severity based on how far below threshold the score is.
 */
function scoreSeverity(score, threshold) {
  const gap = threshold - score;
  if (gap >= 30) return SEVERITY.CRITICAL;
  if (gap >= 15) return SEVERITY.SERIOUS;
  if (gap >= 5)  return SEVERITY.MODERATE;
  return SEVERITY.MINOR;
}

// ── Suite Entry Point ───────────────────────────────────────────

module.exports = async function perfSuite(context) {
  const startTime = Date.now();
  const serve    = context.config?.serve || {};
  const perfConf = context.config?.perf  || {};

  // Determine URL
  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const urlPath = perfConf.path || DEFAULTS.path;
  const url  = `http://localhost:${port}${urlPath}`;

  const thresholds = perfConf.thresholds || null; // null = informational, object = enforced
  const enforced   = thresholds !== null;
  const timeout    = (perfConf.timeout || DEFAULTS.timeout) * 1000;
  const outputPath = perfConf.output_path || DEFAULTS.output_path;

  log(`Auditing ${url} (mode: ${enforced ? 'enforced' : 'informational'}${enforced ? ', thresholds: ' + JSON.stringify(thresholds) : ''})`);

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Run Lighthouse CLI
  let report;
  try {
    const args = [
      url,
      '--output', 'json',
      '--output-path', outputPath,
      '--chrome-flags=--headless --no-sandbox --disable-setuid-sandbox --disable-gpu',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--quiet',
    ];

    execFileSync('lighthouse', args, { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Lighthouse report not found at ${outputPath}`);
    }

    const raw = fs.readFileSync(outputPath, 'utf8');
    report = JSON.parse(raw);

  } catch (err) {
    const duration_ms = Date.now() - startTime;
    const message = err.stderr ? err.stderr.slice(0, 500) : err.message;
    log(`ERROR: ${message}`);

    return createSuiteVerdict('perf', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: message,
      findings: [],
    });
  }

  // Parse scores from report
  const categories = report.categories || {};
  const scores = {};
  for (const [key, cat] of Object.entries(categories)) {
    scores[key] = Math.round((cat.score || 0) * 100);
  }

  log(`Scores: ${Object.entries(scores).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  // Check scores
  const findings    = [];
  let checksFailed  = 0;
  let checksTotal   = 0;

  if (enforced) {
    // ENFORCED MODE: check against thresholds, can FAIL
    for (const [category, threshold] of Object.entries(thresholds)) {
      const score = scores[category];
      const name  = CATEGORY_NAMES[category] || category;

      if (score === undefined) continue;
      checksTotal++;

      if (score < threshold) {
        checksFailed++;
        findings.push(createFinding(
          scoreSeverity(score, threshold),
          `${name}: score ${score} below threshold ${threshold}`,
          { rule: `lighthouse-${category}` }
        ));
      }
    }
  } else {
    // INFORMATIONAL MODE: report all scores, always PASS
    for (const [category, score] of Object.entries(scores)) {
      checksTotal++;
      const name = CATEGORY_NAMES[category] || category;

      if (score < 50) {
        findings.push(createFinding(SEVERITY.MODERATE,
          `${name}: score ${score} (low)`,
          { rule: `lighthouse-${category}` }
        ));
      } else if (score < 70) {
        findings.push(createFinding(SEVERITY.MINOR,
          `${name}: score ${score} (could improve)`,
          { rule: `lighthouse-${category}` }
        ));
      }
    }
  }

  const checksPassed = checksTotal - checksFailed;
  const duration_ms  = Date.now() - startTime;
  const status       = (enforced && checksFailed > 0) ? STATUS.FAIL : STATUS.PASS;
  const icon         = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${checksPassed}/${checksTotal} (${duration_ms}ms)`);

  return createSuiteVerdict('perf', status, {
    critical: false,
    duration_ms,
    checks_total:  checksTotal,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
    findings,
    metadata: {
      tool:       'Lighthouse CLI',
      url_tested: url,
      scores,
      mode:       enforced ? 'enforced' : 'informational',
      ...(enforced ? { thresholds } : {}),
      report_path: outputPath,
    },
  });
};
