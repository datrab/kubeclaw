// ═══════════════════════════════════════════════════════════════
// Suite Runner — Deterministic Test Suite Orchestrator
// ═══════════════════════════════════════════════════════════════

import path from 'path';
import fs from 'fs';

import {
  STATUS,
  createSuiteVerdict,
  createRunnerVerdict,
} from './verdict-schema.js';

import { emitEvent } from './pipeline/services/telemetry.js';

const RESULTS_DIR = '/sandbox/results';
const SUITE_TIMEOUT_MS = 5 * 60 * 1000;

function suiteIcon(status) {
  switch (status) {
    case 'PASS': return '✅';
    case 'FAIL': return '❌';
    case 'SKIP': return '⏭';
    case 'ERROR': return '💥';
    default: return '❓';
  }
}

async function loadSuite(name) {
  try {
    const suiteUrl = new URL(`./suites/${name}.js`, import.meta.url).href;
    const mod = await import(suiteUrl);
    return mod.default ?? null;
  } catch {
    return null;
  }
}

function checkDependencies(suiteName, completedResults) {
  const deps = DEPENDENCIES[suiteName] || ['build', 'health'];

  for (const dep of deps) {
    const depResult = completedResults[dep];
    if (!depResult) continue;
    if (depResult.status === STATUS.FAIL && depResult.critical) return `${dep} failed`;
    if (depResult.status === STATUS.ERROR) return `${dep} errored`;
  }

  return null;
}

function sortSuites(suiteNames) {
  return [...suiteNames].sort((a, b) => {
    const posA = EXECUTION_ORDER.indexOf(a);
    const posB = EXECUTION_ORDER.indexOf(b);
    return (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB);
  });
}

function writeResults(suiteMap, moduleId, project, swarmResultsDir, attempt) {
  const runnerVerdict = createRunnerVerdict(moduleId, project, suiteMap);

  try {
    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
    for (const [name, suite] of Object.entries(suiteMap)) {
      fs.writeFileSync(path.join(RESULTS_DIR, `${name}-verdict.json`), JSON.stringify(suite, null, 2));
    }
    fs.writeFileSync(path.join(RESULTS_DIR, 'runner-verdict.json'), JSON.stringify(runnerVerdict, null, 2));
  } catch {}

  if (swarmResultsDir) {
    try {
      if (!fs.existsSync(swarmResultsDir)) fs.mkdirSync(swarmResultsDir, { recursive: true });
      const suffix = attempt ? `-attempt-${attempt}` : '';
      fs.writeFileSync(path.join(swarmResultsDir, `verdict${suffix}.json`), JSON.stringify(runnerVerdict, null, 2));
      for (const [name, suite] of Object.entries(suiteMap)) {
        fs.writeFileSync(path.join(swarmResultsDir, `${name}-verdict${suffix}.json`), JSON.stringify(suite, null, 2));
      }
    } catch {}
  }
}

async function emitSuiteCompleted(tctx, moduleId, suiteName, result, attempt, startMs) {
  await emitEvent(tctx, 'buster.suite_completed', {
    module_id: moduleId,
    suite: suiteName,
    attempt,
    status: result.status,
    duration_seconds: Math.round((Date.now() - startMs) / 1000),
    checks_passed: result.checks_passed ?? 0,
    checks_failed: result.checks_failed ?? 0,
    critical: result.critical ?? false,
    reason: result.reason ?? null,
    error: result.error ?? null,
    top_finding: result.top_finding ?? result.findings?.[0]?.message ?? result.reason ?? result.error ?? null,
  });
}

export async function runSuites(suites, opts = {}) {
  const { payload, moduleId, attempt, telemetryContext: tctx, logDir } = opts;

  const config = payload?.test_config || payload?.config || {};
  const project = payload?.project || 'unknown';
  const ordered = sortSuites(suites);
  const swarmResultsDir = logDir ? path.join(logDir, 'tests') : null;
  const logPath = swarmResultsDir ? path.join(swarmResultsDir, 'suites.jsonl') : null;
  const logSink = logPath ? (entry) => {
    try {
      fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    } catch {}
  } : null;

  const context = {
    payload,
    moduleId,
    config,
    resultsDir: RESULTS_DIR,
    logSink,
    attempt,
    telemetryContext: tctx,
  };

  const results = [];
  const suiteMap = {};
  let criticalFailed = false;

  for (const suiteName of ordered) {
    const suiteFn = await loadSuite(suiteName);
    if (!suiteFn) {
      const verdict = createSuiteVerdict(suiteName, STATUS.SKIP, {
        reason: `Suite file not found: suites/${suiteName}.js`,
      });
      suiteMap[suiteName] = verdict;
      results.push({ suite: suiteName, ...verdict });
      await emitSuiteCompleted(tctx, moduleId, suiteName, verdict, attempt, Date.now());
      continue;
    }

    const skipReason = checkDependencies(suiteName, suiteMap);
    if (skipReason) {
      const verdict = createSuiteVerdict(suiteName, STATUS.SKIP, { reason: skipReason });
      suiteMap[suiteName] = verdict;
      results.push({ suite: suiteName, ...verdict });
      await emitSuiteCompleted(tctx, moduleId, suiteName, verdict, attempt, Date.now());
      continue;
    }

    const startMs = Date.now();
    await emitEvent(tctx, 'buster.suite_started', {
      module_id: moduleId,
      suite: suiteName,
      attempt,
    });

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
      if (!result.duration_ms) result.duration_ms = Date.now() - startMs;
    } catch (err) {
      const duration_ms = Date.now() - startMs;
      result = createSuiteVerdict(suiteName, STATUS.ERROR, {
        critical: suiteName === 'build' || suiteName === 'health',
        duration_ms,
        error: err?.message || 'Suite threw an unexpected error',
        findings: [],
      });
    }

    await emitSuiteCompleted(tctx, moduleId, suiteName, result, attempt, startMs);

    if ((result.status === STATUS.FAIL || result.status === STATUS.ERROR) && result.critical) {
      criticalFailed = true;
    }

    suiteMap[suiteName] = result;
    results.push({ suite: suiteName, ...result, duration_seconds: Math.round((Date.now() - startMs) / 1000) });
  }

  writeResults(suiteMap, moduleId, project, swarmResultsDir, attempt);

  const suiteSummary = results
    .map((r) => `${suiteIcon(r.status)} ${r.suite}`)
    .join(' ');

  return { results, suiteSummary, criticalFailed };
}

export const EXECUTION_ORDER = [
  'manifest',
  'build', 'health',
  'k8s',
  'a11y', 'perf', 'bundle', 'security', 'visual-reg',
  'api', 'e2e', 'unit',
];

export const DEPENDENCIES = {
  manifest: [],
  build: ['manifest'],
  health: ['build'],
  k8s: [],
  a11y: ['health'],
  perf: ['health'],
  bundle: ['build'],
  security: ['build'],
  'visual-reg': ['health'],
  api: ['health'],
  e2e: ['health'],
  unit: [],
};
