// ═══════════════════════════════════════════════════════════════
// Screenshot — Shared Playwright Screenshot Utility
// ═══════════════════════════════════════════════════════════════
//
// Consumed by:
//   - suites/visual-reg.js  (deterministic baseline comparison)
//   - visual-audit.js       (subagent Discord upload)
//   - CLI                   (baseline creation from HTML previews)
//
// Accepts URLs (http://...) and local HTML files (/path/to/file.html).
// Local files are opened via file:// protocol — no server needed.
//
// Three main interfaces:
//   takeScreenshot()      — single screenshot (backwards compat)
//   takeScreenshotBatch() — multiple URLs, one browser, reused page
//   generateBaselines()   — reads data-routes from HTML preview,
//                           clicks through pages, creates baselines + paths.json
//
// CLI usage:
//   node screenshot.cjs <target> <output.png> [--width N] [--height N] [--no-fullpage]
//   node screenshot.cjs --generate-baselines <preview.html> <output-dir/>

const fs   = require('fs');
const path = require('path');

// Playwright browser binaries location — depends on how they were installed:
//   Docker image with pre-installed browsers: /ms-playwright
//   npx playwright install (runtime):         ~/.cache/ms-playwright/
// Only override if the expected path exists. Otherwise let Playwright use its default.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  if (fs.existsSync('/ms-playwright')) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
  }
  // else: Playwright uses default ~/.cache/ms-playwright/ — no override needed
}

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  viewport:  { width: 1280, height: 720 },
  fullPage:  true,
  waitUntil: 'networkidle',
  timeout:   15000, // ms — navigation timeout
  settleMs:  400,   // ms — wait after nav click for render to settle
};

// ── Helpers ─────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SCREENSHOT] ${msg}`);
}

/**
 * Resolve input to a navigable URL.
 * - http(s):// → pass through
 * - absolute path → file:// URL
 * - relative path → resolve to absolute, then file://
 */
function resolveUrl(input) {
  if (/^https?:\/\//.test(input)) return input;

  const abs = path.isAbsolute(input) ? input : path.resolve(input);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  return `file://${abs}`;
}

/**
 * Launch Chromium with sandbox-safe args.
 * Returns browser instance — caller must close.
 */
async function launchBrowser() {
  const { chromium } = require('playwright');
  return chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

/**
 * Get page dimensions.
 */
async function getPageDimensions(page) {
  return page.evaluate(() => ({
    width:  document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
}

// ── Single Screenshot (backwards compat) ─────────────────────

/**
 * Take a screenshot of a URL or local HTML file.
 *
 * @param {string} target     - URL (http://...) or local file path
 * @param {string} outputPath - Absolute path for the output PNG
 * @param {object} [opts]
 * @param {object}  [opts.viewport]  - { width, height } (default: 1280x720)
 * @param {boolean} [opts.fullPage]  - Full page screenshot (default: true)
 * @param {string}  [opts.waitUntil] - Playwright waitUntil (default: 'networkidle')
 * @param {number}  [opts.timeout]   - Navigation timeout ms (default: 15000)
 * @returns {Promise<{ok: boolean, path?: string, width?: number, height?: number, error?: string}>}
 */
async function takeScreenshot(target, outputPath, opts = {}) {
  const viewport  = opts.viewport  || DEFAULTS.viewport;
  const fullPage  = opts.fullPage  ?? DEFAULTS.fullPage;
  const waitUntil = opts.waitUntil || DEFAULTS.waitUntil;
  const timeout   = opts.timeout   || DEFAULTS.timeout;

  let browser;
  try {
    const url = resolveUrl(target);

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    browser = await launchBrowser();

    const context = await browser.newContext({ viewport });
    const page    = await context.newPage();

    await page.goto(url, { waitUntil, timeout });
    await page.screenshot({ path: outputPath, fullPage });

    const dimensions = await getPageDimensions(page);

    await context.close();

    log(`OK: ${target} → ${outputPath} (${dimensions.width}x${dimensions.height})`);
    return {
      ok:     true,
      path:   outputPath,
      width:  dimensions.width,
      height: dimensions.height,
    };

  } catch (err) {
    log(`FAIL: ${target} → ${err.message}`);
    return { ok: false, error: err.message };

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── Batch Screenshot (one browser, many URLs) ────────────────

/**
 * Take screenshots of multiple URLs using a single browser instance.
 * Used by visual-reg.cjs for multi-path comparison against running app.
 *
 * @param {Array<{name: string, url: string, outputPath: string}>} targets
 * @param {object} [opts]
 * @param {object}  [opts.viewport]  - { width, height }
 * @param {boolean} [opts.fullPage]  - Full page screenshot
 * @param {string}  [opts.waitUntil] - Playwright waitUntil
 * @param {number}  [opts.timeout]   - Per-navigation timeout ms
 * @returns {Promise<Array<{name, ok, path?, width?, height?, error?}>>}
 */
async function takeScreenshotBatch(targets, opts = {}) {
  const viewport  = opts.viewport  || DEFAULTS.viewport;
  const fullPage  = opts.fullPage  ?? DEFAULTS.fullPage;
  const waitUntil = opts.waitUntil || DEFAULTS.waitUntil;
  const timeout   = opts.timeout   || DEFAULTS.timeout;

  if (!targets || targets.length === 0) return [];

  const results = [];
  let browser;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport });
    const page    = await context.newPage();

    for (const target of targets) {
      try {
        // Ensure output directory exists
        const outDir = path.dirname(target.outputPath);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        await page.goto(target.url, { waitUntil, timeout });
        await page.screenshot({ path: target.outputPath, fullPage });

        const dimensions = await getPageDimensions(page);

        log(`OK: ${target.name} → ${target.outputPath} (${dimensions.width}x${dimensions.height})`);
        results.push({
          name:   target.name,
          ok:     true,
          path:   target.outputPath,
          width:  dimensions.width,
          height: dimensions.height,
        });
      } catch (err) {
        log(`FAIL: ${target.name} (${target.url}) → ${err.message}`);
        results.push({
          name:  target.name,
          ok:    false,
          error: err.message,
        });
      }
    }

    await context.close();
  } catch (err) {
    log(`Browser-level error: ${err.message}`);
    // Mark all remaining targets as failed
    for (const target of targets) {
      if (!results.find(r => r.name === target.name)) {
        results.push({ name: target.name, ok: false, error: `Browser error: ${err.message}` });
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return results;
}

// ── Baseline Generator (HTML preview → paths.json + PNGs) ────

/**
 * Generate baselines from a Prism HTML preview file.
 *
 * Reads the data-routes manifest from the HTML, opens the preview with
 * ?baselines=true (auth bypass), clicks through each route via its nav
 * label, and saves a screenshot per page.
 *
 * Prism Preview Contract:
 *   1. <script type="application/json" data-routes>[...]</script>
 *      Each entry: { name: "slug", nav: "Clickable Label" }
 *   2. ?baselines=true query param skips auth/setup
 *
 * @param {string} htmlPath   - Absolute path to the preview HTML file
 * @param {string} outputDir  - Directory to write PNGs + paths.json into
 * @param {object} [opts]
 * @param {object}  [opts.viewport]  - { width, height }
 * @param {boolean} [opts.fullPage]  - Full page screenshot
 * @param {number}  [opts.settleMs]  - Wait after click before screenshot
 * @returns {Promise<{ok: boolean, routes: Array, error?: string}>}
 */
async function generateBaselines(htmlPath, outputDir, opts = {}) {
  const viewport = opts.viewport || DEFAULTS.viewport;
  const fullPage = opts.fullPage ?? DEFAULTS.fullPage;
  const settleMs = opts.settleMs ?? DEFAULTS.settleMs;

  // 1. Parse data-routes from HTML (no browser needed for this)
  let routes;
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script\s+type="application\/json"\s+data-routes\s*>([\s\S]*?)<\/script>/);
    if (!match) {
      return { ok: false, routes: [], error: 'No <script data-routes> manifest found in HTML' };
    }
    routes = JSON.parse(match[1]);
    if (!Array.isArray(routes) || routes.length === 0) {
      return { ok: false, routes: [], error: 'data-routes manifest is empty or not an array' };
    }
  } catch (err) {
    return { ok: false, routes: [], error: `Failed to parse data-routes: ${err.message}` };
  }

  log(`Found ${routes.length} routes in data-routes manifest`);

  // Validate route entries
  for (const route of routes) {
    if (!route.name || !route.nav) {
      return { ok: false, routes: [], error: `Invalid route entry: name and nav are required. Got: ${JSON.stringify(route)}` };
    }
  }

  // Ensure output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let browser;
  const results = [];

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport });
    const page    = await context.newPage();

    // 2. Open preview with auth bypass
    const url = `file://${htmlPath}?baselines=true`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: DEFAULTS.timeout });

    log('Preview loaded with ?baselines=true');

    // 3. Handle setup/login page separately (screenshot without auth bypass)
    const setupRoute = routes.find(r => r.name === 'setup');
    const navRoutes  = routes.filter(r => r.name !== 'setup');

    if (setupRoute) {
      try {
        const setupPage = await context.newPage();
        await setupPage.goto(`file://${htmlPath}`, { waitUntil: 'networkidle', timeout: DEFAULTS.timeout });
        await setupPage.waitForTimeout(settleMs);

        const pngPath = path.join(outputDir, `${setupRoute.name}-baseline.png`);
        await setupPage.screenshot({ path: pngPath, fullPage });
        const dims = await getPageDimensions(setupPage);
        await setupPage.close();

        log(`OK: ${setupRoute.name} (setup page) → ${pngPath}`);
        results.push({ name: setupRoute.name, nav: setupRoute.nav, ok: true, width: dims.width, height: dims.height });
      } catch (err) {
        log(`FAIL: ${setupRoute.name} → ${err.message}`);
        results.push({ name: setupRoute.name, nav: setupRoute.nav, ok: false, error: err.message });
      }
    }

    // 4. Click through each nav route and screenshot
    for (const route of navRoutes) {
      try {
        const navSelector = `text="${route.nav}"`;

        await page.waitForSelector(navSelector, { state: 'visible', timeout: 5000 });
        await page.click(navSelector);
        await page.waitForTimeout(settleMs);

        const pngPath = path.join(outputDir, `${route.name}-baseline.png`);
        await page.screenshot({ path: pngPath, fullPage });
        const dims = await getPageDimensions(page);

        log(`OK: ${route.name} ("${route.nav}") → ${pngPath}`);
        results.push({ name: route.name, nav: route.nav, ok: true, width: dims.width, height: dims.height });
      } catch (err) {
        log(`FAIL: ${route.name} ("${route.nav}") → ${err.message}`);
        results.push({ name: route.name, nav: route.nav, ok: false, error: err.message });
      }
    }

    await context.close();
  } catch (err) {
    log(`Browser error during baseline generation: ${err.message}`);
    return { ok: false, routes: results, error: `Browser error: ${err.message}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // 5. Write paths.json
  const pathsJson = routes.map(r => ({
    name: r.name,
    nav:  r.nav,
    path: r.name === 'setup' ? '/' : `/${r.name}`,
  }));

  const pathsJsonPath = path.join(outputDir, 'paths.json');
  fs.writeFileSync(pathsJsonPath, JSON.stringify(pathsJson, null, 2));
  log(`paths.json written: ${pathsJsonPath} (${pathsJson.length} routes)`);

  const successCount = results.filter(r => r.ok).length;
  const failCount    = results.filter(r => !r.ok).length;
  log(`Baselines complete: ${successCount} OK, ${failCount} failed out of ${routes.length}`);

  return {
    ok:     failCount === 0,
    routes: results,
    pathsJsonPath,
    generated: successCount,
    failed:    failCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// CLI — for baseline creation, generation, and manual testing
// ═══════════════════════════════════════════════════════════════
//
//   Single screenshot:
//     node screenshot.cjs <target> <output.png> [--width N] [--height N] [--no-fullpage]
//
//   Generate baselines from preview:
//     node screenshot.cjs --generate-baselines <preview.html> <output-dir/>

if (require.main === module) {
  const args = process.argv.slice(2);

  function getFlag(name) {
    return args.includes(`--${name}`);
  }

  function getArg(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
  }

  // ── Generate baselines mode ──
  if (getFlag('generate-baselines')) {
    const positional = args.filter(a => !a.startsWith('--'));
    const htmlPath   = positional[0];
    const outputDir  = positional[1];

    if (!htmlPath || !outputDir) {
      console.error('Usage: node screenshot.cjs --generate-baselines <preview.html> <output-dir/>');
      process.exit(2);
    }

    const absHtml = path.isAbsolute(htmlPath) ? htmlPath : path.resolve(htmlPath);
    const absDir  = path.isAbsolute(outputDir) ? outputDir : path.resolve(outputDir);

    const width  = parseInt(getArg('width',  DEFAULTS.viewport.width));
    const height = parseInt(getArg('height', DEFAULTS.viewport.height));

    generateBaselines(absHtml, absDir, {
      viewport: { width, height },
      fullPage: !getFlag('no-fullpage'),
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }).catch((err) => {
      console.error(`Fatal: ${err.message}`);
      process.exit(2);
    });

  } else {
    // ── Single screenshot mode ──
    const positional = args.filter(a => !a.startsWith('--'));
    const target     = positional[0];
    const outputPath = positional[1];

    if (!target || !outputPath) {
      console.error('Usage: node screenshot.cjs <target> <output.png> [--width N] [--height N] [--no-fullpage]');
      console.error('       node screenshot.cjs --generate-baselines <preview.html> <output-dir/>');
      process.exit(2);
    }

    const width    = parseInt(getArg('width',  DEFAULTS.viewport.width));
    const height   = parseInt(getArg('height', DEFAULTS.viewport.height));
    const fullPage = !getFlag('no-fullpage');

    takeScreenshot(target, outputPath, {
      viewport: { width, height },
      fullPage,
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }).catch((err) => {
      console.error(`Fatal: ${err.message}`);
      process.exit(2);
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = { takeScreenshot, takeScreenshotBatch, generateBaselines };
