import fs from 'fs';
import path from 'path';

import { VERSION } from './constants.ts';

let lintLogPath = null; // Set via --log-path CLI arg — dual-write execution trace

function setLintLogPath(logPath) {
  if (!logPath) return;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  lintLogPath = logPath;
}

function log(level, msg, data = null) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component: 'lint-report',
    msg,
    ...(data !== null && { data }),
  };
  console.error(JSON.stringify(entry));
  if (lintLogPath) {
    try { fs.appendFileSync(lintLogPath, `${JSON.stringify(entry)}\n`); } catch (_error) { /* non-critical */ }
  }
}

function printHelp() {
  console.error(`
lint-report.ts v${VERSION} — Deterministic Static Analysis Aggregator

Usage: node lint-report.ts [options]

Required:
  --repo <path>           Git repo root
  --policy <path>         Absolute path to canonical lint-policy.json
  --policy-project <id>   Exact project id declared by the policy

Optional:
  --tier <tier>           Tool tier: 'pre-check' or 'full' (default: full)
  --module-path <path>    Relative module path to narrow scope (e.g. Projects/kubecommand/src/modules/06)
  --project <name>        Project name for report metadata
  --output <path>         Write JSON report to file (default: stdout)
  --changed-files <list>  Comma-separated list of changed files (repo-relative)
  --help                  Show this help

Tiers:
  pre-check   Fast checks only: tsc + ruff + shellcheck (<10s)
  full        All policy-configured tools applicable to declared language evidence

Examples:
  node lint-report.ts --repo /workspace/forgestack --policy /config/lint-policy.json --policy-project workspace --tier full
  `);
}

function writeReport(report, outputPath = null) {
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    fs.writeFileSync(outputPath, json);
    log('OK', `Report written to ${outputPath}`);
    log('OK', `Summary: ${report.summary.total_errors} errors, ${report.summary.total_warnings} warnings, ${report.summary.total_blocking} blocking, ${report.summary.total_baselined} baselined `
      + `(${report.summary.tools_ok} ok, ${report.summary.tools_not_applicable} not applicable, ${report.summary.tools_failed} failed)`);
  } else {
    process.stdout.write(json);
  }
}

export { log, printHelp, setLintLogPath, writeReport };
