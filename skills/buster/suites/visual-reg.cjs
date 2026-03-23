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

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK || '';

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SUITE] [VISUAL-REG] ${msg}`);
}

/**
 * Send screenshot(s) to Discord webhook as image attachments.
 * Non-critical — failure is logged but never affects the suite result.
 */
async function discordScreenshot(moduleId, actualPath, diffPath, diffPercent, status) {
  if (!WEBHOOK_URL) return;
  try {
    const boundary = `----VisRegBoundary${Date.now()}`;
    const parts = [];

    // Embed with context
    const icon = status === 'APP_SCREENSHOT' ? '📸'
               : status === 'NEW_BASELINE' ? '🆕'
               : status === STATUS.PASS ? '✅'
               : status === STATUS.FAIL ? '❌' : '📸';
    const isAppShot = status === 'APP_SCREENSHOT';
    const isBaseline = status === 'NEW_BASELINE';
    const embedJson = JSON.stringify({
      embeds: [{
        title: `${icon} ${isAppShot ? 'Live App' : 'Visual Regression'}: Module ${moduleId}`,
        color: isAppShot ? 5793266 : isBaseline ? 3447003 : (diffPercent === 0 ? 5763719 : (diffPercent > 5 ? 15548997 : 16776960)),
        description: isAppShot
          ? 'Current state of the running application.'
          : isBaseline
            ? 'New baseline generated from HTML design reference.'
            : diffPercent === 0
              ? 'Pixel-perfect match with baseline.'
              : `**${diffPercent}%** pixel difference detected.`,
        fields: [
          { name: 'Status', value: isAppShot ? 'Live Screenshot' : isBaseline ? 'New Baseline' : status, inline: true },
          ...(!isAppShot && !isBaseline ? [{ name: 'Diff', value: `${diffPercent}%`, inline: true }] : []),
        ],
        image: { url: 'attachment://screenshot.png' },
        footer: { text: `Buster Visual-Reg • ${new Date().toISOString()}` },
      }],
    });

    // Part 1: payload_json
    parts.push(
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="payload_json"\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      embedJson
    );

    // Part 2: actual screenshot
    const actualData = fs.readFileSync(actualPath);
    parts.push(
      `\r\n--${boundary}\r\n` +
      'Content-Disposition: form-data; name="files[0]"; filename="screenshot.png"\r\n' +
      'Content-Type: image/png\r\n\r\n'
    );

    // Part 3: diff image (if exists and has differences)
    let diffData = null;
    if (diffPath && diffPercent > 0 && fs.existsSync(diffPath)) {
      diffData = fs.readFileSync(diffPath);
    }

    // Build binary body
    const bodyParts = [
      Buffer.from(parts[0], 'utf8'),
      Buffer.from(parts[1], 'utf8'),
      actualData,
    ];

    if (diffData) {
      bodyParts.push(Buffer.from(
        `\r\n--${boundary}\r\n` +
        'Content-Disposition: form-data; name="files[1]"; filename="diff.png"\r\n' +
        'Content-Type: image/png\r\n\r\n',
        'utf8'
      ));
      bodyParts.push(diffData);
    }

    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    const body = Buffer.concat(bodyParts);

    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    log(`Discord: screenshot sent (${(actualData.length / 1024).toFixed(0)} KB${diffData ? ` + diff ${(diffData.length / 1024).toFixed(0)} KB` : ''})`);
  } catch (e) {
    log(`Discord screenshot failed (non-critical): ${e.message}`);
  }
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

  // Baseline location — resolve against project_dir (not repo_dir)
  // so relative paths like '.swarm/modules/<dir>/baselines' work correctly
  const repoDir      = DEFAULTS.repo_dir;
  const rawProjectDir = serve.project_dir || '';
  const projectDir   = rawProjectDir
    ? (path.isAbsolute(rawProjectDir) ? rawProjectDir : path.join(repoDir, rawProjectDir))
    : repoDir;
  const baselineDir  = vrConf.baseline_dir
    ? path.resolve(projectDir, vrConf.baseline_dir)
    : path.join(projectDir, '.swarm/baselines');
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
        // Send newly generated baseline to Discord
        await discordScreenshot(context.module, baselinePath, null, 0, 'NEW_BASELINE');
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

  // Send app screenshot to Discord immediately — regardless of whether comparison succeeds.
  // This is the most valuable signal: what does the app actually look like right now?
  await discordScreenshot(context.module, actualPath, null, -1, 'APP_SCREENSHOT');

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

  // 6. Send screenshot(s) to Discord
  await discordScreenshot(context.module, actualPath, diffPath, diffPercent, status);

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
