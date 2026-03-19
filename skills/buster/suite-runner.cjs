// ═══════════════════════════════════════════════════════════════
// Suite Runner — Deterministic Test Suite Orchestrator
// ═══════════════════════════════════════════════════════════════
//
// Loads suites dynamically from ./suites/<name>.js, executes them
// sequentially with dependency ordering, aggregates results via
// verdict-schema.js.
//
// Two interfaces:
//   1. Module: const { runSuites } = require('./suite-runner.cjs');
//      const result = await runSuites({ module, project, suites, config });
//   2. CLI:    node suite-runner.js --module 06 --project kubecommand
//              --suites build,health --config '{"serve":{"type":"static"}}'
//
// Each suite must export: module.exports = async function(context) → SuiteVerdict
//
// Does NOT: build/serve, Redis, prompt injection — that's the orchestrator's job.

const path = require('path');
const fs   = require('fs');
const {
  STATUS,
  createSuiteVerdict,
  createRunnerVerdict,
  truncateForPrompt,
} = require('./verdict-schema.cjs');

// ── Constants ───────────────────────────────────────────────────

const SUITES_DIR   = path.join(__dirname, 'suites');
const RESULTS_DIR  = '/sandbox/results';

const DEFAULT_SUITES = ['build', 'health'];
const DEFAULT_CONFIG = { serve: { type: 'static' } };

// Per-suite safety timeout (ms) — last-resort guard against hung suites.
// Individual suites have their own internal timeouts (typically 15–120s),
// this only catches cases where those fail to trigger.
const SUITE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Suite execution order — position determines priority.
// Suites not in this list run after all listed ones.
const EXECUTION_ORDER = [
  'build', 'health',
  'a11y', 'perf', 'bundle', 'security', 'visual-reg',
  'api', 'e2e', 'unit',
];

// Dependency chain — if a suite in the key fails (critical),
// all suites in the value array are skipped.
const DEPENDENCIES = {
  build:  [], // no dependencies
  health: ['build'],
  // All other suites depend on both build + health
  a11y:       ['build', 'health'],
  perf:       ['build', 'health'],
  bundle:     ['build'],
  security:   ['build', 'health'],
  'visual-reg': ['build', 'health'],
  api:        ['build', 'health'],
  e2e:        ['build', 'health'],
  unit:       ['build'],
};

// ── Logging ─────────────────────────────────────────────────────

function log(label, msg) {
  console.log(`[SUITE] [${label.toUpperCase()}] ${msg}`);
}

// ── Suite Loader ────────────────────────────────────────────────

function loadSuite(name) {
  const suitePath = path.join(SUITES_DIR, `${name}.cjs`);
  if (!fs.existsSync(suitePath)) {
    return null;
  }
  return require(suitePath);
}

// ── Dependency Check ────────────────────────────────────────────
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

// ── Sort Suites ─────────────────────────────────────────────────

function sortSuites(suiteNames) {
  return [...suiteNames].sort((a, b) => {
    const idxA = EXECUTION_ORDER.indexOf(a);
    const idxB = EXECUTION_ORDER.indexOf(b);
    // Unknown suites go to the end
    const posA = idxA === -1 ? 999 : idxA;
    const posB = idxB === -1 ? 999 : idxB;
    return posA - posB;
  });
}

// ── Write Results ───────────────────────────────────────────────

function writeResults(runnerVerdict, swarmResultsDir) {
  // 1. /sandbox/results/ — for subagent access during task
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  // Write individual suite verdicts
  for (const [name, suite] of Object.entries(runnerVerdict.suites)) {
    const suitePath = path.join(RESULTS_DIR, `${name}-verdict.json`);
    fs.writeFileSync(suitePath, JSON.stringify(suite, null, 2));
  }

  // Write aggregated runner verdict
  const runnerPath = path.join(RESULTS_DIR, 'runner-verdict.json');
  fs.writeFileSync(runnerPath, JSON.stringify(runnerVerdict, null, 2));

  log('results', `Written to ${RESULTS_DIR}/ (${Object.keys(runnerVerdict.suites).length} suites + runner)`);

  // 2. .swarm/<module>/test-results/ — for git persistence (if dir provided)
  if (swarmResultsDir) {
    if (!fs.existsSync(swarmResultsDir)) {
      fs.mkdirSync(swarmResultsDir, { recursive: true });
    }
    const swarmPath = path.join(swarmResultsDir, 'runner-verdict.json');
    fs.writeFileSync(swarmPath, JSON.stringify(runnerVerdict, null, 2));
    log('results', `Written to ${swarmResultsDir}/`);
  }
}

// ── Main Runner ─────────────────────────────────────────────────

/**
 * Run test suites sequentially with dependency ordering.
 *
 * @param {object} opts
 * @param {string}   opts.module   - Module ID (e.g. '06')
 * @param {string}   opts.project  - Project name (e.g. 'kubecommand')
 * @param {string[]} [opts.suites] - Suite names to run (default: ['build','health'])
 * @param {object}   [opts.config] - Test config from progress.json (serve, thresholds, etc.)
 * @param {string}   [opts.swarmResultsDir] - Optional .swarm/<module>/test-results/ path
 * @returns {object} Runner verdict (from createRunnerVerdict)
 */
async function runSuites(opts = {}) {
  const module_id = opts.module;
  const project   = opts.project;
  const suiteList = opts.suites || DEFAULT_SUITES;
  const config    = opts.config || DEFAULT_CONFIG;
  const swarmDir  = opts.swarmResultsDir || null;

  log('runner', `Starting: module=${module_id} project=${project} suites=[${suiteList.join(',')}]`);

  // Sort by execution order
  const ordered = sortSuites(suiteList);

  // Build context object passed to every suite
  const context = {
    module: module_id,
    project,
    config,
    resultsDir: RESULTS_DIR,
  };

  // Execute suites sequentially
  const completedResults = {};

  for (const suiteName of ordered) {
    // 1. Check if suite file exists
    const suiteFn = loadSuite(suiteName);
    if (!suiteFn) {
      log(suiteName, `Suite file not found: suites/${suiteName}.js — SKIP`);
      completedResults[suiteName] = createSuiteVerdict(suiteName, STATUS.SKIP, {
        reason: `Suite file not found: suites/${suiteName}.js`,
      });
      continue;
    }

    // 2. Check dependencies
    const skipReason = checkDependencies(suiteName, completedResults);
    if (skipReason) {
      log(suiteName, `SKIP — ${skipReason}`);
      completedResults[suiteName] = createSuiteVerdict(suiteName, STATUS.SKIP, {
        reason: skipReason,
      });
      continue;
    }

    // 3. Execute suite with error boundary + safety timeout
    log(suiteName, 'Running...');
    const startTime = Date.now();
    const suiteTimeout = config.suite_timeout_ms || SUITE_TIMEOUT_MS;

    try {
      const verdict = await Promise.race([
        suiteFn(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Suite "${suiteName}" timed out after ${suiteTimeout / 1000}s (safety limit)`)), suiteTimeout)
        ),
      ]);

      // Ensure duration is set (suite may not track it)
      if (!verdict.duration_ms) {
        verdict.duration_ms = Date.now() - startTime;
      }

      const icon = verdict.status === STATUS.PASS ? '✅' :
                   verdict.status === STATUS.FAIL ? '❌' : '⚠️';
      log(suiteName, `${icon} ${verdict.status} (${verdict.duration_ms}ms)`);

      completedResults[suiteName] = verdict;

    } catch (err) {
      const duration_ms = Date.now() - startTime;
      log(suiteName, `💥 ERROR: ${err.message}`);

      completedResults[suiteName] = createSuiteVerdict(suiteName, STATUS.ERROR, {
        critical: suiteName === 'build' || suiteName === 'health',
        duration_ms,
        error: err.message,
        findings: [],
      });
    }
  }

  // Aggregate
  const runnerVerdict = createRunnerVerdict(module_id, project, completedResults);

  // Write results to disk
  writeResults(runnerVerdict, swarmDir);

  const icon = runnerVerdict.overall_status === STATUS.PASS ? '✅' : '❌';
  log('runner', `${icon} Done: ${runnerVerdict.overall_status} → ${runnerVerdict.recommendation} (${runnerVerdict.duration_ms}ms)`);
  log('runner', `Summary: ${runnerVerdict.summary}`);

  return runnerVerdict;
}

// ═══════════════════════════════════════════════════════════════
// CLI INTERFACE — for manual testing on the Buster pod
// ═══════════════════════════════════════════════════════════════
//
// node suite-runner.js --module 06 --project kubecommand \
//   --suites build,health --config '{"serve":{"type":"static"}}'

if (require.main === module) {
  const args = process.argv.slice(2);

  function getArg(name, fallback = null) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
  }

  const module_id = getArg('module');
  const project   = getArg('project', 'kubecommand');
  const suitesRaw = getArg('suites', 'build,health');
  const configRaw = getArg('config', '{}');

  if (!module_id) {
    console.error('Usage: node suite-runner.js --module <ID> [--project <P>] [--suites build,health] [--config \'{"serve":{...}}\']');
    process.exit(2);
  }

  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (e) {
    console.error(`Invalid --config JSON: ${e.message}`);
    process.exit(2);
  }

  runSuites({
    module: module_id,
    project,
    suites: suitesRaw.split(',').map(s => s.trim()),
    config: { ...DEFAULT_CONFIG, ...config },
  }).then((verdict) => {
    // Exit code: 0 = PASS/SPAWN, 1 = CRITICAL FAIL, 2 = ERROR
    if (verdict.critical_failure) process.exit(1);
    if (verdict.overall_status === STATUS.ERROR) process.exit(2);
    process.exit(0);
  }).catch((err) => {
    console.error(`[SUITE] Fatal: ${err.message}`);
    process.exit(2);
  });
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = { runSuites };
