// ═══════════════════════════════════════════════════════════════
// Suite: visual-reg — Visual Regression (Screenshot Diff)
// ═══════════════════════════════════════════════════════════════
//
// Multi-path visual regression: screenshots every page of the running
// app and compares each against its baseline PNG via pixelmatch.
//
// Three modes of operation (auto-detected):
//
//   1. MULTI-PATH (preferred):
//      baseline_dir contains paths.json → each entry gets its own
//      baseline, screenshot, and diff. paths.json is generated
//      automatically from an HTML preview with a data-routes manifest.
//
//   2. AUTO-GENERATE:
//      baseline_dir contains an .html file with data-routes but no
//      paths.json → generateBaselines() creates all PNGs + paths.json,
//      then falls through to multi-path mode.
//
//   3. SINGLE-PATH (backwards compat):
//      baseline_dir contains baseline.png (no paths.json, no HTML) →
//      single screenshot of the configured path, compared against
//      baseline.png. Identical to v1 behavior.
//
// Dual-Mode thresholds:
//   No thresholds configured → INFORMATIONAL: always PASS, diff reported.
//   Thresholds configured → ENFORCED: FAIL if any page exceeds max_diff_percent.
//
// Discord modes:
//   "summary" (default for >3 paths): one embed with all results +
//     only diff images for pages that exceed 2% diff.
//   "all": every page gets its own Discord message (legacy behavior).
//
// Always critical: false — never blocks subagent spawn.
//
// Config (from context.config['visual-reg']):
//   {
//     baseline_dir: '.swarm/modules/<module>/baselines',
//     baseline_file: 'baseline.png',          // single-path only
//     thresholds: { max_diff_percent: 1.0 },  // null = informational
//     pixelmatch: { threshold: 0.1 },          // per-pixel sensitivity
//     discord: 'summary' | 'all',             // auto if unset
//   }
//
// Dependencies: build + health (needs a running app to screenshot)
// Requires: pixelmatch, pngjs (Dockerfile.sandbox)

import fs from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../verdict-schema.js';
import { takeScreenshotBatch, takeScreenshot, generateBaselines } from '../screenshot.js';
import { emitEvent } from '../services/telemetry.js';

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  static_port:     9999,
  server_port:     3000,
  path:            '/',
  baseline_file:   'baseline.png',
  pixelmatch_threshold: 0.1, // pixelmatch per-pixel color distance (0 = exact, 1 = anything)
  repo_dir:        '/home/node/.openclaw/workspace/git-repo',
  discord_diff_threshold: 2, // only send individual screenshots above this % diff
};

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK || '';

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [VISUAL-REG] ${msg}`);
  if (_logSink) _logSink({ suite: 'visual-reg', msg });
}

/**
 * Compare two PNGs using pixelmatch.
 * Returns { diffCount, diffPercent, diffImagePath, width, height, baselineWidth, baselineHeight }
 */
async function compareImages(baselinePath, actualPath, diffPath, pmThreshold) {
  const { PNG } = await import('pngjs');
  const { default: pixelmatch } = await import('pixelmatch');

  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const actualPng   = PNG.sync.read(fs.readFileSync(actualPath));

  // Handle size mismatch: resize canvas to larger dimensions
  const width  = Math.max(baselinePng.width, actualPng.width);
  const height = Math.max(baselinePng.height, actualPng.height);

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

  return {
    diffCount,
    diffPercent: Math.round(diffPercent * 100) / 100,
    width, height,
    baselineWidth: baselinePng.width,
    baselineHeight: baselinePng.height,
  };
}

/**
 * Resize PNG data buffer to target dimensions, padding with transparent pixels.
 */
function resizeBuffer(png, targetWidth, targetHeight) {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png.data;
  }

  const data = new Uint8Array(targetWidth * targetHeight * 4);
  data.fill(0);

  const rowBytes = png.width * 4;
  for (let y = 0; y < png.height; y++) {
    const srcOffset  = y * rowBytes;
    const destOffset = y * targetWidth * 4;
    data.set(png.data.subarray(srcOffset, srcOffset + rowBytes), destOffset);
  }

  return data;
}

// ── Discord: Summary Mode ───────────────────────────────────────

/**
 * Send a single summary embed with all page results.
 * Only attaches diff images for pages above the diff threshold.
 */
async function discordSummary(moduleId, pageResults, overallStatus, enforced) {
  if (!WEBHOOK_URL) return;
  try {
    const icon = overallStatus === STATUS.PASS ? '✅' : '⚠️';
    const passCount = pageResults.filter(p => p.status === STATUS.PASS).length;
    const failCount = pageResults.filter(p => p.status === STATUS.FAIL).length;
    const skipCount = pageResults.filter(p => p.status === STATUS.SKIP || p.status === STATUS.ERROR).length;

    // Build results table
    const lines = pageResults.map(p => {
      const si = p.status === STATUS.PASS ? '✅' :
                 p.status === STATUS.FAIL ? '❌' :
                 p.status === STATUS.SKIP ? '⏭️' : '⚠️';
      const diff = p.diffPercent != null ? `${p.diffPercent}%` : '—';
      return `${si} **${p.name}** — ${diff}`;
    });

    const embed = {
      title: `${icon} Visual Regression: Module ${moduleId}`,
      color: overallStatus === STATUS.PASS ? 5763719 : 16776960,
      description: [
        `**${passCount}** pass · **${failCount}** fail · **${skipCount}** skip`,
        `Mode: ${enforced ? 'enforced' : 'informational'}`,
        '',
        lines.join('\n'),
      ].join('\n'),
      footer: { text: `Buster Visual-Reg • ${pageResults.length} pages • ${new Date().toISOString()}` },
    };

    // Collect diff images for pages above threshold
    const attachments = [];
    pageResults.forEach((p) => {
      if (p.diffPercent > DEFAULTS.discord_diff_threshold && p.diffPath && fs.existsSync(p.diffPath)) {
        attachments.push({ path: p.diffPath, filename: `diff-${p.name}.png` });
      }
    });

    if (attachments.length > 0 && attachments.length <= 4) {
      // Attach first diff as embed image
      embed.image = { url: `attachment://${attachments[0].filename}` };
    }

    // Build multipart body
    const boundary = `----VisRegSummary${Date.now()}`;
    const parts = [];

    const embedJson = JSON.stringify({ embeds: [embed] });
    parts.push(
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="payload_json"\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      embedJson
    );

    const bodyParts = [Buffer.from(parts[0], 'utf8')];

    // Attach diff images (max 10 to stay within Discord limits)
    const maxAttach = Math.min(attachments.length, 10);
    for (let i = 0; i < maxAttach; i++) {
      const att = attachments[i];
      const header = `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files[${i}]"; filename="${att.filename}"\r\n` +
        'Content-Type: image/png\r\n\r\n';
      bodyParts.push(Buffer.from(header, 'utf8'));
      bodyParts.push(fs.readFileSync(att.path));
    }

    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(bodyParts),
    });

    log(`Discord: summary sent (${pageResults.length} pages, ${maxAttach} diff images attached)`);
  } catch (e) {
    log(`Discord summary failed (non-critical): ${e.message}`);
  }
}

/**
 * Send individual screenshot to Discord (legacy "all" mode).
 */
async function discordSingle(moduleId, pageName, actualPath, diffPath, diffPercent, status) {
  if (!WEBHOOK_URL) return;
  try {
    const boundary = `----VisRegBoundary${Date.now()}`;
    const icon = status === 'APP_SCREENSHOT' ? '📸'
               : status === 'NEW_BASELINE' ? '🆕'
               : status === STATUS.PASS ? '✅'
               : status === STATUS.FAIL ? '❌' : '📸';
    const isAppShot = status === 'APP_SCREENSHOT';
    const isBaseline = status === 'NEW_BASELINE';

    const embedJson = JSON.stringify({
      embeds: [{
        title: `${icon} ${isAppShot ? 'Live App' : 'Visual Regression'}: ${pageName} (${moduleId})`,
        color: isAppShot ? 5793266 : isBaseline ? 3447003 : (diffPercent === 0 ? 5763719 : (diffPercent > 5 ? 15548997 : 16776960)),
        description: isAppShot
          ? 'Current state of the running application.'
          : isBaseline
            ? 'New baseline generated from HTML design reference.'
            : diffPercent === 0
              ? 'Pixel-perfect match with baseline.'
              : `**${diffPercent}%** pixel difference detected.`,
        fields: [
          { name: 'Page', value: pageName, inline: true },
          { name: 'Status', value: isAppShot ? 'Live' : isBaseline ? 'Baseline' : status, inline: true },
          ...(!isAppShot && !isBaseline ? [{ name: 'Diff', value: `${diffPercent}%`, inline: true }] : []),
        ],
        image: { url: 'attachment://screenshot.png' },
        footer: { text: `Buster Visual-Reg • ${new Date().toISOString()}` },
      }],
    });

    const parts = [
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="payload_json"\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      embedJson
    ];

    const actualData = fs.readFileSync(actualPath);
    const bodyParts = [
      Buffer.from(parts[0], 'utf8'),
      Buffer.from(
        `\r\n--${boundary}\r\n` +
        'Content-Disposition: form-data; name="files[0]"; filename="screenshot.png"\r\n' +
        'Content-Type: image/png\r\n\r\n', 'utf8'),
      actualData,
    ];

    if (diffPath && diffPercent > 0 && fs.existsSync(diffPath)) {
      const diffData = fs.readFileSync(diffPath);
      bodyParts.push(Buffer.from(
        `\r\n--${boundary}\r\n` +
        'Content-Disposition: form-data; name="files[1]"; filename="diff.png"\r\n' +
        'Content-Type: image/png\r\n\r\n', 'utf8'));
      bodyParts.push(diffData);
    }

    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));

    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(bodyParts),
    });

    log(`Discord: ${pageName} sent`);
  } catch (e) {
    log(`Discord screenshot failed (non-critical): ${e.message}`);
  }
}

// ── Baseline Resolution ─────────────────────────────────────────

function resolveBaselineDir(serve, vrConf) {
  const repoDir      = DEFAULTS.repo_dir;
  const rawProjectDir = serve.project_dir || '';
  const projectDir   = rawProjectDir
    ? (path.isAbsolute(rawProjectDir) ? rawProjectDir : path.join(repoDir, rawProjectDir))
    : repoDir;
  return vrConf.baseline_dir
    ? path.resolve(projectDir, vrConf.baseline_dir)
    : path.join(projectDir, '.swarm/baselines');
}

// ── Multi-Path: Compare all pages ───────────────────────────────

async function runMultiPath(context, pathsJson, baselineDir, baseUrl, pmThreshold, thresholds, enforced, vrConf) {
  const resultsDir = context.resultsDir || '/sandbox/results';
  const findings = [];
  const pageResults = [];
  let checksTotal = 0, checksPassed = 0, checksFailed = 0;

  // Take all screenshots in one batch
  const targets = pathsJson.map(entry => ({
    name:       entry.name,
    url:        `${baseUrl}${entry.path}`,
    outputPath: path.join(resultsDir, `visual-reg-${entry.name}-actual.png`),
  }));

  log(`Taking ${targets.length} screenshots via batch...`);
  const screenshots = await takeScreenshotBatch(targets, {
    viewport: vrConf.viewport || { width: 1280, height: 720 },
    fullPage: vrConf.fullPage ?? true,
  });

  // Compare each against its baseline
  for (const entry of pathsJson) {
    const shot = screenshots.find(s => s.name === entry.name);
    const baselinePath = path.join(baselineDir, `${entry.name}-baseline.png`);
    const actualPath   = path.join(resultsDir, `visual-reg-${entry.name}-actual.png`);
    const diffPath     = path.join(resultsDir, `visual-reg-${entry.name}-diff.png`);

    checksTotal++;

    // Screenshot failed?
    if (!shot || !shot.ok) {
      const errMsg = shot?.error || 'Screenshot not taken';
      log(`SKIP: ${entry.name} — screenshot failed: ${errMsg}`);
      pageResults.push({ name: entry.name, status: STATUS.ERROR, diffPercent: null, diffPath: null, error: errMsg });
      findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: screenshot failed — ${errMsg}`, { rule: 'screenshot-error' }));
      checksFailed++;
      continue;
    }

    // No baseline for this page?
    if (!fs.existsSync(baselinePath)) {
      log(`SKIP: ${entry.name} — no baseline at ${baselinePath}`);
      pageResults.push({ name: entry.name, status: STATUS.SKIP, diffPercent: null, diffPath: null });
      continue;
    }

    // Compare
    let comparison;
    try {
      comparison = await compareImages(baselinePath, actualPath, diffPath, pmThreshold);
    } catch (err) {
      log(`ERROR: ${entry.name} — comparison failed: ${err.message}`);
      pageResults.push({ name: entry.name, status: STATUS.ERROR, diffPercent: null, diffPath: null, error: err.message });
      findings.push(createFinding(SEVERITY.MODERATE, `${entry.name}: comparison failed — ${err.message}`, { rule: 'compare-error' }));
      checksFailed++;
      continue;
    }

    const { diffPercent, diffCount, width, height, baselineWidth, baselineHeight } = comparison;
    log(`${entry.name}: ${diffPercent}% diff (${diffCount} px of ${width}x${height})`);

    // Determine per-page status
    let pageStatus = STATUS.PASS;
    if (enforced && diffPercent > (thresholds.max_diff_percent || 0)) {
      pageStatus = STATUS.FAIL;
      checksFailed++;
    } else {
      checksPassed++;
    }

    pageResults.push({
      name: entry.name,
      status: pageStatus,
      diffPercent,
      diffCount,
      diffPath: diffPercent > 0 ? diffPath : null,
      actualPath,
      baselinePath,
      canvasSize: `${width}x${height}`,
    });

    // Build findings for pages with differences
    if (diffPercent > 0) {
      const severity = diffPercent > 10 ? SEVERITY.SERIOUS
                     : diffPercent > 2  ? SEVERITY.MODERATE
                     : SEVERITY.MINOR;
      findings.push(createFinding(severity,
        `${entry.name}: ${diffPercent}% diff (${diffCount} pixels)`,
        { rule: 'pixel-diff', file: diffPath }
      ));

      if (baselineWidth !== shot.width || baselineHeight !== shot.height) {
        findings.push(createFinding(SEVERITY.MODERATE,
          `${entry.name}: size mismatch — baseline ${baselineWidth}x${baselineHeight}, actual ${shot.width}x${shot.height}`,
          { rule: 'size-mismatch' }
        ));
      }
    }

    // Copy actual + diff PNGs to centralized screenshots directory
    if (context.screenshotsDir) {
      try {
        fs.mkdirSync(context.screenshotsDir, { recursive: true });
        const att = context.attempt || 1;
        if (fs.existsSync(actualPath)) fs.copyFileSync(actualPath, path.join(context.screenshotsDir, `${entry.name}-actual-attempt-${att}.png`));
        if (diffPath && fs.existsSync(diffPath)) fs.copyFileSync(diffPath, path.join(context.screenshotsDir, `${entry.name}-diff-attempt-${att}.png`));
      } catch { /* non-critical */ }
    }
  }

  return { findings, pageResults, checksTotal, checksPassed, checksFailed };
}

// ── Suite Entry Point ───────────────────────────────────────────

export async function runVisualReg(context) {
  _logSink = context.logSink || null;
  const tctx      = context.telemetryContext || null;
  const moduleId  = context.moduleId || context.module || 'unknown';
  const startTime = Date.now();
  const serve     = context.config?.serve || {};
  const vrConf    = context.config?.['visual-reg'] || {};

  // Determine base URL
  const type = serve.type || 'static';
  const port = serve.port || (type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port);
  const baseUrl = `http://localhost:${port}`;

  // Baseline location
  const baselineDir  = resolveBaselineDir(serve, vrConf);

  // Thresholds
  const thresholds    = vrConf.thresholds || null;
  const enforced      = thresholds !== null;
  const pmThreshold   = vrConf.pixelmatch?.threshold ?? DEFAULTS.pixelmatch_threshold;

  log(`Baseline dir: ${baselineDir} (mode: ${enforced ? 'enforced' : 'informational'})`);

  // ── Detect mode ──

  const pathsJsonPath = path.join(baselineDir, 'paths.json');
  let pathsJson = null;
  let isMultiPath = false;

  // Mode 1: paths.json exists → multi-path
  if (fs.existsSync(pathsJsonPath)) {
    try {
      pathsJson = JSON.parse(fs.readFileSync(pathsJsonPath, 'utf8'));
      if (Array.isArray(pathsJson) && pathsJson.length > 0) {
        isMultiPath = true;
        log(`Multi-path mode: ${pathsJson.length} routes from paths.json`);
      }
    } catch (err) {
      log(`paths.json parse error: ${err.message} — falling back`);
    }
  }

  // Mode 2: HTML preview exists but no paths.json → auto-generate
  if (!isMultiPath && fs.existsSync(baselineDir)) {
    const htmlFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.html'));
    if (htmlFiles.length > 0) {
      const htmlPath = path.join(baselineDir, htmlFiles[0]);

      // Check if regeneration needed: HTML newer than paths.json
      const needsRegen = !fs.existsSync(pathsJsonPath) ||
        fs.statSync(htmlPath).mtimeMs > fs.statSync(pathsJsonPath).mtimeMs;

      if (needsRegen) {
        log(`Auto-generating baselines from ${htmlFiles[0]}...`);
        const genResult = await generateBaselines(htmlPath, baselineDir, {
          viewport: vrConf.viewport || { width: 1280, height: 720 },
          fullPage: vrConf.fullPage ?? true,
        });

        if (!genResult.ok) {
          const duration_ms = Date.now() - startTime;
          const failedRoutes = (genResult.routes || []).filter(r => !r.ok);
          const errorDetail = genResult.error
            || (failedRoutes.length > 0
              ? `${failedRoutes.length} route(s) failed: ${failedRoutes.map(r => `${r.name} (${r.error || 'unknown'})`).slice(0, 3).join('; ')}${failedRoutes.length > 3 ? ` +${failedRoutes.length - 3} more` : ''}`
              : 'unknown error (no error message returned)');
          log(`Baseline generation failed: ${errorDetail}`);
          return createSuiteVerdict('visual-reg', STATUS.ERROR, {
            critical: false,
            duration_ms,
            error: `Baseline generation failed: ${errorDetail}`,
            findings: [],
          });
        }

        // Send generated baselines to Discord
        await discordSingle(context.module, 'Baselines Generated', genResult.pathsJsonPath, null, 0, 'NEW_BASELINE');
      }

      // Re-read generated paths.json
      if (fs.existsSync(pathsJsonPath)) {
        try {
          pathsJson = JSON.parse(fs.readFileSync(pathsJsonPath, 'utf8'));
          if (Array.isArray(pathsJson) && pathsJson.length > 0) {
            isMultiPath = true;
            log(`Auto-generated: ${pathsJson.length} routes`);
          }
        } catch { /* ignore */ }
      }
    }
  }

  // ── Multi-path mode ──

  if (isMultiPath && pathsJson) {
    const { findings, pageResults, checksTotal, checksPassed, checksFailed } =
      await runMultiPath(context, pathsJson, baselineDir, baseUrl, pmThreshold, thresholds, enforced, vrConf);

    // Overall status
    const hasFailures = pageResults.some(p => p.status === STATUS.FAIL);
    const overallStatus = (enforced && hasFailures) ? STATUS.FAIL : STATUS.PASS;

    // Discord: summary or all?
    const discordMode = vrConf.discord || (pathsJson.length > 3 ? 'summary' : 'all');

    if (discordMode === 'summary') {
      await discordSummary(context.module, pageResults, overallStatus, enforced);
    } else {
      for (const pr of pageResults) {
        if (pr.actualPath) {
          await discordSingle(context.module, pr.name, pr.actualPath, pr.diffPath, pr.diffPercent, pr.status);
        }
      }
    }

    const duration_ms = Date.now() - startTime;
    const icon = overallStatus === STATUS.PASS ? '✅' : '⚠️';
    log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${checksPassed}/${checksTotal} passed (${duration_ms}ms)`);

    await emitEvent(tctx, 'buster.visual_reg', {
      module_id:      moduleId,
      mode:           pathsJson.length > 1 ? 'multi_path' : 'single_path',
      pages_total:    pathsJson.length,
      pages_compared: pageResults.filter(p => p.diffPercent != null).length,
      pages_skipped:  pageResults.filter(p => p.status === STATUS.SKIP).length,
      page_results:   pageResults.map(p => ({ name: p.name, status: p.status, diff_percent: p.diffPercent })),
      overall:        overallStatus,
      discord_sent:   true,
    });

    return createSuiteVerdict('visual-reg', overallStatus, {
      critical: false,
      duration_ms,
      checks_total:  checksTotal,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
      findings,
      metadata: {
        tool:         'pixelmatch',
        mode:         enforced ? 'enforced' : 'informational',
        multi_path:   true,
        pages_total:  pathsJson.length,
        pages_compared: pageResults.filter(p => p.diffPercent != null).length,
        pages_skipped:  pageResults.filter(p => p.status === STATUS.SKIP).length,
        baseline_dir: baselineDir,
        discord_mode: discordMode,
        page_results: pageResults.map(p => ({
          name: p.name, status: p.status, diff_percent: p.diffPercent,
        })),
        ...(enforced ? { thresholds } : {}),
      },
    });
  }

  // ── Single-path mode (backwards compat) ──

  const urlPath = vrConf.path || DEFAULTS.path;
  const url  = `${baseUrl}${urlPath}`;
  const baselineFile = vrConf.baseline_file || DEFAULTS.baseline_file;
  const baselinePath = path.join(baselineDir, baselineFile);

  log(`Single-path mode: ${url} vs ${baselinePath}`);

  // Check if baseline exists — auto-generate from HTML if available
  if (!fs.existsSync(baselinePath)) {
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
        await discordSingle(context.module, 'Baseline', baselinePath, null, 0, 'NEW_BASELINE');
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

  // Take screenshot of running app
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

  await discordSingle(context.module, 'App', actualPath, null, -1, 'APP_SCREENSHOT');

  // Compare against baseline
  let comparison;
  try {
    comparison = await compareImages(baselinePath, actualPath, diffPath, pmThreshold);
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

  // Build findings
  const findings = [];
  if (diffPercent > 0) {
    const severity = diffPercent > 10 ? SEVERITY.SERIOUS
                   : diffPercent > 2  ? SEVERITY.MODERATE
                   : SEVERITY.MINOR;
    findings.push(createFinding(severity,
      `Visual diff: ${diffPercent}% (${diffCount} pixels differ)`,
      { rule: 'pixel-diff', file: diffPath }
    ));
    if (baselineWidth !== screenshot.width || baselineHeight !== screenshot.height) {
      findings.push(createFinding(SEVERITY.MODERATE,
        `Size mismatch: baseline ${baselineWidth}x${baselineHeight}, actual ${screenshot.width}x${screenshot.height}`,
        { rule: 'size-mismatch' }
      ));
    }
  }

  // Determine status
  let status = STATUS.PASS;
  if (enforced && diffPercent > (thresholds.max_diff_percent || 0)) {
    status = STATUS.FAIL;
  }

  const duration_ms = Date.now() - startTime;
  const icon = status === STATUS.PASS ? '✅' : '⚠️';
  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${diffPercent}% diff (${duration_ms}ms)`);

  await discordSingle(context.module, 'App', actualPath, diffPath, diffPercent, status);

  await emitEvent(tctx, 'buster.visual_reg', {
    module_id:      moduleId,
    mode:           'single_path',
    pages_total:    1,
    pages_compared: 1,
    pages_skipped:  0,
    page_results:   [{ name: vrConf.path || DEFAULTS.path, status, diff_percent: diffPercent }],
    overall:        status,
    discord_sent:   true,
  });

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
      multi_path:     false,
      diff_percent:   diffPercent,
      diff_pixels:    diffCount,
      canvas_size:    `${width}x${height}`,
      baseline_path:  baselinePath,
      actual_path:    actualPath,
      diff_path:      diffPercent > 0 ? diffPath : null,
      ...(enforced ? { thresholds } : {}),
    },
  });
}
