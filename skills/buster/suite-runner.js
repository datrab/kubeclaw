// ═══════════════════════════════════════════════════════════════
// Suite Runner — Execute test suites with telemetry
// ═══════════════════════════════════════════════════════════════
//
// Runs a list of suites sequentially. Emits buster.suite.started
// before each suite and buster.suite.completed after. Individual
// suites that need additional telemetry (e.g. visual-reg) receive
// the telemetryContext through their suite context object.
//
// Suite result contract:
//   { status: 'PASS'|'FAIL'|'SKIP', checks_passed, checks_failed,
//     critical, top_finding }

import { emitEvent } from './services/telemetry.js';
import { runVisualReg } from './suites/visual-reg.js';
import manifestSuite   from './suites/manifest.js';
import buildSuite      from './suites/build.js';
import healthSuite     from './suites/health.js';
import k8sSuite        from './suites/k8s.js';

// ── Suite icon helpers ────────────────────────────────────────────

function suiteIcon(status) {
  switch (status) {
    case 'PASS': return '✅';
    case 'FAIL': return '❌';
    case 'SKIP': return '⏭';
    default:     return '❓';
  }
}

// ── Suite dispatch ────────────────────────────────────────────────

/**
 * Dispatch to the appropriate suite implementation.
 *
 * @param {string} suiteName
 * @param {object} ctx  - Suite context passed to the implementation
 * @returns {Promise<object>} Suite result
 */
async function dispatchSuite(suiteName, ctx) {
  switch (suiteName) {
    case 'manifest':
      return manifestSuite(ctx);
    case 'build':
      return buildSuite(ctx);
    case 'health':
      return healthSuite(ctx);
    case 'visual-reg':
      return runVisualReg(ctx);
    case 'k8s':
      return k8sSuite(ctx);

    // ── Stubs — implementations added by future modules ──────────
    case 'unit':
    case 'api':
    case 'e2e':
    case 'a11y':
    case 'perf':
    case 'bundle':
    case 'security':
      return {
        status:         'SKIP',
        checks_passed:  0,
        checks_failed:  0,
        critical:       false,
        top_finding:    `Suite '${suiteName}' not yet implemented`,
      };

    default:
      return {
        status:         'SKIP',
        checks_passed:  0,
        checks_failed:  0,
        critical:       false,
        top_finding:    `Unknown suite '${suiteName}'`,
      };
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Run all configured suites with telemetry emission.
 *
 * Emits buster.suite.started before each suite and buster.suite.completed
 * after. Emits buster.suite.skipped for SKIP results and buster.suite.error
 * on thrown exceptions. Passes telemetryContext into individual suite implementations
 * that need to emit their own rich events (e.g. visual-reg).
 *
 * @param {string[]} suites               - Ordered list of suite names
 * @param {object}   opts
 * @param {object}   opts.payload         - Full task payload
 * @param {string}   opts.moduleId        - Module ID (e.g. "06")
 * @param {number}   opts.attempt         - Attempt number (1-based)
 * @param {Function} [opts.logSink]       - Optional log callback (label, msg) => void
 * @param {object}   [opts.telemetryContext] - TelemetryContext from createTelemetryContext()
 * @returns {Promise<{ results: object[], suiteSummary: string, criticalFailed: boolean }>}
 */
export async function runSuites(suites, opts = {}) {
  const { payload, moduleId, attempt, logSink, telemetryContext: tctx } = opts;
  const results      = [];
  let criticalFailed = false;

  for (const suiteName of suites) {
    const startMs = Date.now();

    await emitEvent(tctx, 'buster.suite.started', {
      module_id: moduleId,
      suite:     suiteName,
      attempt,
    });

    let result;
    try {
      result = await dispatchSuite(suiteName, {
        payload,
        moduleId,
        attempt,
        logSink,
        telemetryContext: tctx,
        config: payload?.test_config || payload?.config || {},
      });
    } catch (err) {
      const durationSecondsErr = Math.round((Date.now() - startMs) / 1000);
      await emitEvent(tctx, 'buster.suite.error', {
        module_id:        moduleId,
        suite:            suiteName,
        error:            err?.message || 'Suite threw an unexpected error',
        duration_seconds: durationSecondsErr,
      });
      result = {
        status:        'FAIL',
        checks_passed: 0,
        checks_failed: 1,
        critical:      true,
        top_finding:   err?.message || 'Suite threw an unexpected error',
      };
    }

    const durationSeconds = Math.round((Date.now() - startMs) / 1000);

    if (result.status === 'SKIP') {
      await emitEvent(tctx, 'buster.suite.skipped', {
        module_id:   moduleId,
        suite:       suiteName,
        top_finding: result.top_finding ?? null,
      });
    }

    await emitEvent(tctx, 'buster.suite.completed', {
      module_id:      moduleId,
      suite:          suiteName,
      status:         result.status,
      duration_seconds: durationSeconds,
      checks_passed:  result.checks_passed  ?? 0,
      checks_failed:  result.checks_failed  ?? 0,
      critical:       result.critical       ?? false,
      top_finding:    result.top_finding    ?? null,
    });

    if (result.status === 'FAIL' && result.critical) criticalFailed = true;

    results.push({
      suite:            suiteName,
      ...result,
      duration_seconds: durationSeconds,
    });
  }

  const suiteSummary = results
    .map(r => `${suiteIcon(r.status)} ${r.suite}`)
    .join(' ');

  return { results, suiteSummary, criticalFailed };
}

// ── Execution Order & Dependencies ───────────────────────────────
//
// Callers (e.g. buster-orchestrator.js) can use these to build the
// ordered suite list and skip downstream suites when a critical
// dependency fails.

export const EXECUTION_ORDER = [
  'manifest',        // static analysis — no running app needed
  'build', 'health',
  'k8s',             // production Dockerfile build + K8s deploy (independent of sandbox build)
  'a11y', 'perf', 'bundle', 'security', 'visual-reg',
  'api', 'e2e', 'unit',
];

export const DEPENDENCIES = {
  manifest:     [],
  build:        ['manifest'],  // manifest must pass before build
  health:       ['build'],
  k8s:          [],            // builds its own Docker image — no dependency on sandbox build/health
  a11y:         ['health'],
  perf:         ['health'],
  bundle:       ['build'],
  security:     ['build'],
  'visual-reg': ['health'],
  api:          ['health'],
  e2e:          ['health'],
  unit:         [],
};
