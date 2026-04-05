// ═══════════════════════════════════════════════════════════════
// Visual Regression Suite
// ═══════════════════════════════════════════════════════════════
//
// Emits buster.visual_reg (rich per-page diff data) in addition to
// the generic buster.suite_completed emitted by suite-runner.
// ClawDeck uses buster.visual_reg to populate the Visual Audit panel.
//
// Note: visual-reg ALSO gets a buster.suite_completed event from
// suite-runner (generic tracking). buster.visual_reg is the rich
// supplement with per-page results.

import { emitEvent } from '../services/telemetry.js';

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Run actual visual comparison for a single page.
 * Stub — real implementation added by a future module.
 *
 * @param {object} page    - Page config from payload
 * @param {object} opts    - Run options
 * @returns {{ name: string, diff_percent: number, status: 'PASS'|'FAIL'|'SKIP' }}
 */
async function comparePage(page, opts) {
  // Stub: skip all pages until visual-reg implementation is added
  return {
    name:         page.name || 'unknown',
    diff_percent: 0,
    status:       'SKIP',
  };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Run the visual regression suite.
 *
 * If no tests_dir is configured the suite SKIPs immediately and
 * emits a minimal buster.visual_reg event. Otherwise runs per-page
 * comparisons and emits the full buster.visual_reg payload.
 *
 * @param {object} ctx
 * @param {object}  ctx.payload            - Task payload
 * @param {string}  ctx.moduleId           - Module ID
 * @param {number}  [ctx.attempt]          - Attempt number
 * @param {object}  [ctx.telemetryContext] - TelemetryContext from createTelemetryContext()
 * @returns {Promise<{ status, checks_passed, checks_failed, critical, top_finding }>}
 */
export async function runVisualReg(ctx) {
  const { payload, moduleId, telemetryContext: tctx } = ctx;

  const visualRegCfg = payload?.visual_reg || {};
  const testsDir     = visualRegCfg.tests_dir || null;
  const pages        = visualRegCfg.pages     || [];

  // ── No tests_dir configured → SKIP ───────────────────────────
  if (!testsDir) {
    await emitEvent(tctx, 'buster.visual_reg', {
      module_id:      moduleId,
      mode:           'none',
      pages_total:    0,
      pages_compared: 0,
      pages_skipped:  0,
      page_results:   [],
      overall:        'SKIP',
      discord_sent:   false,
    });

    return {
      status:        'SKIP',
      checks_passed: 0,
      checks_failed: 0,
      critical:      false,
      top_finding:   'No tests_dir configured',
    };
  }

  // ── Run per-page comparisons ──────────────────────────────────
  const mode        = pages.length > 1 ? 'multi_path' : 'single_path';
  const pageResults = [];
  let   skipped     = 0;

  for (const page of pages) {
    const result = await comparePage(page, { testsDir, payload });
    pageResults.push(result);
    if (result.status === 'SKIP') skipped++;
  }

  const failed   = pageResults.filter(p => p.status === 'FAIL');
  const overall  = failed.length > 0 ? 'FAIL' : (pageResults.length === skipped ? 'SKIP' : 'PASS');
  const compared = pageResults.length - skipped;

  await emitEvent(tctx, 'buster.visual_reg', {
    module_id:      moduleId,
    mode,
    pages_total:    pageResults.length,
    pages_compared: compared,
    pages_skipped:  skipped,
    page_results:   pageResults,
    overall,
    discord_sent:   false,
  });

  const topFinding = failed.length > 0
    ? `${failed.length} page(s) exceeded diff threshold: ${failed.map(p => p.name).join(', ')}`
    : null;

  return {
    status:        overall,
    checks_passed: compared - failed.length,
    checks_failed: failed.length,
    critical:      failed.length > 0,
    top_finding:   topFinding,
  };
}
