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
// CLI usage (baseline creation):
//   node screenshot.js /path/to/preview.html /path/to/baseline.png
//   node screenshot.js http://localhost:9999 /tmp/screenshot.png --width 1920 --height 1080

const fs   = require('fs');
const path = require('path');

// Playwright browser binaries are installed at /ms-playwright in the sandbox image.
// Set this BEFORE requiring playwright so it finds the correct browser executable.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
}

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  viewport:  { width: 1280, height: 720 },
  fullPage:  true,
  waitUntil: 'networkidle',
  timeout:   15000, // ms — navigation timeout
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

// ── Main Function ───────────────────────────────────────────────

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

    const { chromium } = require('playwright');
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({ viewport });
    const page    = await context.newPage();

    await page.goto(url, { waitUntil, timeout });
    await page.screenshot({ path: outputPath, fullPage });

    // Get actual dimensions
    const dimensions = await page.evaluate(() => ({
      width:  document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

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

// ═══════════════════════════════════════════════════════════════
// CLI — for baseline creation and manual testing
// ═══════════════════════════════════════════════════════════════
//
//   node screenshot.js <target> <output.png> [--width N] [--height N] [--no-fullpage]
//
// Examples:
//   node screenshot.js .swarm/15/baselines/baseline.html .swarm/15/baselines/baseline.png
//   node screenshot.js http://localhost:9999 /tmp/app-screenshot.png --width 1920 --height 1080

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

  // Positional args: first two non-flag args
  const positional = args.filter(a => !a.startsWith('--'));
  const target     = positional[0];
  const outputPath = positional[1];

  if (!target || !outputPath) {
    console.error('Usage: node screenshot.js <target> <output.png> [--width N] [--height N] [--no-fullpage]');
    console.error('  target: URL (http://...) or local HTML file path');
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

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = { takeScreenshot };
