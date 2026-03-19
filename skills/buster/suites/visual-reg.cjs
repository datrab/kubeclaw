// ═══════════════════════════════════════════════════════════════
// Suite: visual-reg — Visual Regression (Screenshot Diff)
// ═══════════════════════════════════════════════════════════════
//
// Takes a screenshot of the running app, compares it pixel-by-pixel
// against a baseline PNG using pixelmatch. Generates a diff image
// on mismatch.
//
// Baselines are created externally (Prism HTML preview → screenshot.js).
// They live in the configured baseline_dir (default: .swarm/baselines/)
// and must exist before this suite runs. No baseline → SKIP.
// Exception: if baseline_dir contains an .html file but no .png,
// the suite auto-generates baseline.png from the HTML via screenshot.js.
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, diff
//     percentage reported as finding. Typical for module tests.
//   Thresholds configured → ENFORCED: FAIL if diff exceeds
//     max_diff_percent. Typical for gate tests.
//     e.g. { max_diff_percent: 1.0 } = max 1% pixel difference
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config['visual-reg']):
//   {
//     baseline_dir: '.swarm/modules/<module>/baselines',
//     baseline_file: 'baseline.png',
//     thresholds: { max_diff_percent: 1.0 },
//     pixelmatch: { threshold: 0.1 }    // pixelmatch sensitivity (0-1)
//   }
//
// Dependencies: build + health (needs a running app to screenshot)
// Requires: pixelmatch, pngjs (Dockerfile.sandbox)

const fs   = require('fs');
const path = require('path');
const {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} = require('../verdict-schema.cjs');
const { takeScreenshot } = require('../screenshot.cjs');

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  static_port:     9999,
  server_port:     3000,
  path:            '/',
  baseline_file:   'baseline.png',
  pixelmatch_threshold: 0.1, // pixelmatch per-pixel color distance (0 = exact, 1 = anything)
  repo_dir:        '/home/node/.openclaw/workspace/git-repo',
};

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SUITE] [VISUAL-REG] ${msg}`);
}

/**
 * Compare two PNGs using pixelmatch.
 * Returns { diffCount, diffPercent, diffImagePath }
 */
function compareImages(baselinePath, actualPath, diffPath, pmThreshold) {
  const { PNG } = require('pngjs');
  const pixelmatch = require('pixelmatch');

  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const actualPng   = PNG.sync.read(fs.readFileSync(actualPath));

  // Handle size mismatch: resize canvas to larger dimensions
  const width  = Math.max(baselinePng.width, actualPng.width);
  const height = Math.max(baselinePng.height, actualPng.height);

  // If sizes differ, create new buffers padded with transparent pixels
  const baselineData = resizeBuffer(baselinePng, width, height);
  const actualData   = resizeBuffer(actualPng, width, height);

  const diff = new PNG({ width, height });

  const diffCount = pixelmatch(
    baselineData, actualData, diff.data,
    width, height,
    { threshold: pmThreshold, includeAA: true }
  );

  const totalPixels  = width * height;
  const diffPercent  = totalPixels > 0 ? (diffCount / totalPixels) * 100 : 0;

  // Write diff image
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  return { diffCount, diffPercent: Math.round(diffPercent * 100) / 100, width, height, baselineWidth: baselinePng.width, baselineHeight: baselinePng.height };
}

/**
 * Resize PNG data buffer to target dimensions, padding with transparent pixels.
 * Returns raw pixel data (Uint8Array).
 */
function resizeBuffer(png, targetWidth, targetHeight) {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png.data;
  }

  const data = new Uint8Array(targetWidth * targetHeight * 4);
  // Fill with transparent
  data.fill(0);

  const rowBytes = png.width * 4;
  for (let y = 0; y < png.height; y++) {
    const srcOffset  = y * rowBytes;
    const destOffset = y * targetWidth * 4;
    data.set(png.data.subarray(srcOffset, srcOffset + rowBytes), destOffset);
  }

  return data;
}

// ── Suite Entry Point ───────────────────────────────────────────

module.exports = async function visualRegSuite(context) {
  const startTime = Date.now();
  const serve     = context.config?.serve || {};
  const vrConf    = context.config?.['visual-reg'] || {};

  // Determine URL
  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const urlPath = vrConf.path || DEFAULTS.path;
  const url  = `http://localhost:${port}${urlPath}`;

  // Baseline location
  const repoDir      = vrConf.repo_dir || DEFAULTS.repo_dir;
  const baselineDir  = vrConf.baseline_dir
    ? path.resolve(repoDir, vrConf.baseline_dir)
    : path.join(repoDir, '.swarm/baselines');
  const baselineFile = vrConf.baseline_file || DEFAULTS.baseline_file;
  const baselinePath = path.join(baselineDir, baselineFile);

  // Thresholds
  const thresholds    = vrConf.thresholds || null;
  const enforced      = thresholds !== null;
  const pmThreshold   = vrConf.pixelmatch?.threshold ?? DEFAULTS.pixelmatch_threshold;

  log(`Comparing ${url} against ${baselinePath} (mode: ${enforced ? 'enforced' : 'informational'})`);

  // 1. Check if baseline exists — auto-generate from HTML if available
  if (!fs.existsSync(baselinePath)) {
    // Look for an HTML file in the baseline directory to generate from
    let htmlSource = null;
    if (fs.existsSync(baselineDir)) {
      const htmlFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.html'));
      if (htmlFiles.length > 0) {
        htmlSource = path.join(baselineDir, htmlFiles[0]);
      }
    }

    if (htmlSource) {
      log(`No baseline.png found, generating from ${htmlSource}...`);
      try {
        await takeScreenshot(htmlSource, baselinePath, {
          viewport: vrConf.viewport || { width: 1280, height: 720 },
          fullPage: vrConf.fullPage ?? true,
        });
        log(`Baseline generated: ${baselinePath}`);
      } catch (err) {
        const duration_ms = Date.now() - startTime;
        log(`Failed to generate baseline from HTML: ${err.message}`);
        return createSuiteVerdict('visual-reg', STATUS.SKIP, {
          duration_ms,
          reason: `Baseline HTML found but screenshot failed: ${err.message}`,
        });
      }
    } else {
      const duration_ms = Date.now() - startTime;
      log(`No baseline found at ${baselinePath} — SKIP`);
      return createSuiteVerdict('visual-reg', STATUS.SKIP, {
        duration_ms,
        reason: `No baseline found: ${baselinePath}`,
      });
    }
  }

  // 2. Take screenshot of running app
  const resultsDir = context.resultsDir || '/sandbox/results';
  const actualPath = path.join(resultsDir, 'visual-reg-actual.png');
  const diffPath   = path.join(resultsDir, 'visual-reg-diff.png');

  const screenshot = await takeScreenshot(url, actualPath, {
    viewport:  vrConf.viewport || { width: 1280, height: 720 },
    fullPage:  vrConf.fullPage ?? true,
  });

  if (!screenshot.ok) {
    const duration_ms = Date.now() - startTime;
    log(`Screenshot failed: ${screenshot.error}`);
    return createSuiteVerdict('visual-reg', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: `Screenshot failed: ${screenshot.error}`,
      findings: [],
    });
  }

  // 3. Compare against baseline
  let comparison;
  try {
    comparison = compareImages(baselinePath, actualPath, diffPath, pmThreshold);
  } catch (err) {
    const duration_ms = Date.now() - startTime;
    log(`Comparison failed: ${err.message}`);
    return createSuiteVerdict('visual-reg', STATUS.ERROR, {
      critical: false,
      duration_ms,
      error: `Pixel comparison failed: ${err.message}`,
      findings: [],
    });
  }

  const { diffPercent, diffCount, width, height, baselineWidth, baselineHeight } = comparison;

  log(`Diff: ${diffPercent}% (${diffCount} pixels of ${width}x${height})`);

  // 4. Build findings
  const findings = [];

  if (diffPercent > 0) {
    const severity = diffPercent > 10 ? SEVERITY.SERIOUS
                   : diffPercent > 2  ? SEVERITY.MODERATE
                   : SEVERITY.MINOR;

    findings.push(createFinding(severity,
      `Visual diff: ${diffPercent}% (${diffCount} pixels differ)`,
      {
        rule: 'pixel-diff',
        file: diffPath,
      }
    ));

    // Check for size mismatch between baseline and actual
    if (baselineWidth !== screenshot.width || baselineHeight !== screenshot.height) {
      findings.push(createFinding(SEVERITY.MODERATE,
        `Size mismatch: baseline ${baselineWidth}x${baselineHeight}, actual ${screenshot.width}x${screenshot.height}`,
        { rule: 'size-mismatch' }
      ));
    }
  }

  // 5. Determine status
  // Note: if enforced but max_diff_percent is not set, default is 0% (any diff = FAIL)
  let status = STATUS.PASS;

  if (enforced && diffPercent > (thresholds.max_diff_percent || 0)) {
    status = STATUS.FAIL;
  }

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${diffPercent}% diff (${duration_ms}ms)`);

  return createSuiteVerdict('visual-reg', status, {
    critical: false,
    duration_ms,
    checks_total:  1,
    checks_passed: status === STATUS.PASS ? 1 : 0,
    checks_failed: status === STATUS.FAIL ? 1 : 0,
    findings,
    metadata: {
      tool:           'pixelmatch',
      url_tested:     url,
      mode:           enforced ? 'enforced' : 'informational',
      diff_percent:   diffPercent,
      diff_pixels:    diffCount,
      canvas_size:    `${width}x${height}`,
      baseline_path:  baselinePath,
      actual_path:    actualPath,
      diff_path:      diffPercent > 0 ? diffPath : null,
      ...(enforced ? { thresholds } : {}),
    },
  });
};
