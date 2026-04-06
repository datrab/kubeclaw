// ═══════════════════════════════════════════════════════════════
// Suite Runner — Deterministic Test Suite Orchestrator
// ═══════════════════════════════════════════════════════════════
//
// Loads suites dynamically via import() from ./suites/<name>.js,
// executes them sequentially with dependency ordering, emits
// telemetry, and writes verdicts to disk.
//
// Interface:
//   export async function runSuites(suites, opts)
//   opts: { payload, moduleId, attempt, telemetryContext, logDir }
//   returns: { results, suiteSummary, criticalFailed }
//
// Each suite must export: export default async function(context) → SuiteVerdict
//
// Does NOT: build/serve, Redis, prompt injection — that's the orchestrator's job.

import path from 'path';
import fs   from 'fs';
import { fileURLToPath } from 'url';

import {
  STATUS,
  createSuiteVerdict,
  createRunnerVerdict,
} from './verdict-schema.js';

import { emitEvent } from './services/telemetry.js';

// ── Constants ────────────────────────────────────────────────────

const RESULTS_DIR = '/sandbox/results';

// Per-suite safety timeout (ms) — last-resort guard against hung suites.
// Individual suites have their own internal timeouts (typically 15–120s),
// this only catches cases where those fail to trigger.
const SUITE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── Suite Icon ────────────────────────────────────────────────────

function suiteIcon(status) {
  switch (status) {
    case 'PASS': return '✅';
    case 'FAIL': return '❌';
    case 'SKIP': return '⏭';
    default:     return '❓';
  }
}

// ── Suite Loader ─────────────────────────────────────────────────
//
// Dynamically imports ./suites/<name>.js. Returns null if not found.

async function loadSuite(name) {
  try {
    const suiteUrl = new URL(`./suites/${name}.js`, import.meta.url).href;
    const mod = await import(suiteUrl);
    return mod.default ?? null;
  } catch {
    return null;
  }
}

// ── Dependency Check ─────────────────────────────────────────────
//
// Returns null if all dependencies passed, or a reason string if
// a dependency failed critically.

function checkDependencies(suiteName, completedResults) {
  const deps = DEPENDENCIES[suiteName] || ['build', 'health'];

  for (const dep of deps) {
    const depResult = completedResults[dep];
    if (!depResult) continue; // dependency wasn't requested — no gate

    if (depResult.status === STATUS.FAIL && depResult.critical) {
      return `${dep} failed`;
    }
    if (depResult.status === STATUS.ERROR) {
      return `${dep} errored`;
    }
  }

  return null; // all good
}

// ── Sort Suites ──────────────────────────────────────────────────

function sortSuites(suiteNames) {
  return [...suiteNames].sort((a, b) => {
    const posA = EXECUTION_ORDER.indexOf(a);
    const posB = EXECUTION_ORDER.indexOf(b);
    return (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB);
  });
}

// ── Write Results to Disk ────────────────────────────────────────

function writeResults(suiteMap, moduleId, project, swarmResultsDir, attempt) {
  const runnerVerdict = createRunnerVerdict(moduleId, project, suiteMap);

  // 1. /sandbox/results/ — for subagent access during task
  try {
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
    for (const [name, suite] of Object.entries(suiteMap)) {
      fs.writeFileSync(path.join(RESULTS_DIR, `${name}-verdict.json`), JSON.stringify(suite, null, 2));
    }
    fs.writeFileSync(path.join(RESULTS_DIR, 'runner-verdict.json'), JSON.stringify(runnerVerdict, null, 2));
  } catch { /* non-critical */ }

  // 2. Centralized log dir
  if (swarmResultsDir) {
    try {
      if (!fs.existsSync(swarmResultsDir)) {
        fs.mkdirSync(swarmResultsDir, { recursive: true });
      }
      const suffix = attempt ? `-attempt-${attempt}` : '';
      fs.writeFileSync(
        path.join(swarmResultsDir, `verdict${suffix}.json`),
        JSON.stringify(runnerVerdict, null, 2),
      );
      for (const [name, suite] of Object.entries(suiteMap)) {
        fs.writeFileSync(
          path.join(swarmResultsDir, `${name}-verdict${suffix}.json`),
          JSON.stringify(suite, null, 2),
        );
      }
    } catch { /* non-critical */ }
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Run all configured suites with dependency ordering, safety timeouts,
 * telemetry emission, and result persistence.
 *
 * @param {string[]} suites               - Suite names to run
 * @param {object}   opts
 * @param {object}   opts.payload         - Full task payload
 * @param {string}   opts.moduleId        - Module ID (e.g. "06")
 * @param {number}   [opts.attempt]       - Attempt number (1-based)
 * @param {object}   [opts.telemetryContext] - TelemetryContext from createTelemetryContext()
 * @param {string}   [opts.logDir]        - Base log directory for writing results
 * @returns {Promise<{ results: object[], suiteSummary: string, criticalFailed: boolean }>}
 */
export async function runSuites(suites, opts = {}) {
  const { payload, moduleId, attempt, telemetryContext: tctx, logDir } = opts;

  const config  = payload?.test_config || payload?.config || {};
  const project = payload?.project || 'unknown';

  // Sort by execution order
  const ordered = sortSuites(suites);

  // Optional log sink + results dir derived from logDir
  const swarmResultsDir = logDir ? path.join(logDir, 'tests') : null;
  const logPath = swarmResultsDir ? path.join(swarmResultsDir, 'suites.jsonl') : null;
  const logSink = logPath ? (entry) => {
    try {
      fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    } catch { /* non-critical */ }
  } : null;

  // Context object passed to every suite
  const context = {
    payload,
    moduleId,
    config,
    resultsDir: RESULTS_DIR,
    logSink,
    attempt,
  };

  const results    = [];
  const suiteMap   = {}; // name → verdict (for dependency checks + disk write)
  let criticalFailed = false;

  for (const suiteName of ordered) {
    // 1. Load suite file — skip if not found
    const suiteFn = await loadSuite(suiteName);
    if (!suiteFn) {
      const skipReason = `Suite file not found: suites/${suiteName}.js`;
      await emitEvent(tctx, 'buster.suite.skipped', {
        module_id:   moduleId,
        suite:       suiteName,
        top_finding: skipReason,
      });
      const verdict = createSuiteVerdict(suiteName, STATUS.SKIP, { reason: skipReason });
      suiteMap[suiteName] = verdict;
      results.push({ suite: suiteName, ...verdict });
      continue;
    }

    // 2. Check dependencies — skip if a critical dependency failed/errored
    const skipReason = checkDependencies(suiteName, suiteMap);
    if (skipReason) {
      await emitEvent(tctx, 'buster.suite.skipped', {
        module_id:   moduleId,
        suite:       suiteName,
        top_finding: skipReason,
      });
      const verdict = createSuiteVerdict(suiteName, STATUS.SKIP, { reason: skipReason });
      suiteMap[suiteName] = verdict;
      results.push({ suite: suiteName, ...verdict });
      continue;
    }

    // 3. Emit suite started
    const startMs = Date.now();
    await emitEvent(tctx, 'buster.suite.started', {
      module_id: moduleId,
      suite:     suiteName,
      attempt,
    });

    // 4. Execute suite with error boundary + safety timeout
    let result;
    try {
      const suiteTimeout = config.suite_timeout_ms || SUITE_TIMEOUT_MS;
      result = await Promise.race([
        suiteFn({ ...context }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Suite "${suiteName}" timed out after ${suiteTimeout / 1000}s (safety limit)`)),
            suiteTimeout,
          )
        ),
      ]);
      if (!result.duration_ms) {
        result.duration_ms = Date.now() - startMs;
      }
    } catch (err) {
      const duration_ms = Date.now() - startMs;
      await emitEvent(tctx, 'buster.suite.error', {
        module_id:        moduleId,
        suite:            suiteName,
        error:            err?.message || 'Suite threw an unexpected error',
        duration_seconds: Math.round(duration_ms / 1000),
      });
      result = createSuiteVerdict(suiteName, STATUS.FAIL, {
        critical:  suiteName === 'build' || suiteName === 'health',
        duration_ms,
        error:     err?.message || 'Suite threw an unexpected error',
        findings:  [],
      });
    }

    // 5. Emit suite completed (+ skipped event if result came back SKIP)
    const durationSeconds = Math.round((Date.now() - startMs) / 1000);

    if (result.status === STATUS.SKIP) {
      await emitEvent(tctx, 'buster.suite.skipped', {
        module_id:   moduleId,
        suite:       suiteName,
        top_finding: result.top_finding ?? result.reason ?? null,
      });
    }

    await emitEvent(tctx, 'buster.suite.completed', {
      module_id:        moduleId,
      suite:            suiteName,
      status:           result.status,
      duration_seconds: durationSeconds,
      checks_passed:    result.checks_passed  ?? 0,
      checks_failed:    result.checks_failed  ?? 0,
      critical:         result.critical       ?? false,
      top_finding:      result.top_finding ?? result.findings?.[0]?.message ?? null,
    });

    if (result.status === STATUS.FAIL && result.critical) criticalFailed = true;

    suiteMap[suiteName] = result;
    results.push({ suite: suiteName, ...result, duration_seconds: durationSeconds });
  }

  // Write all results to disk
  writeResults(suiteMap, moduleId, project, swarmResultsDir, attempt);

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
