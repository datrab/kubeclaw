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

Optional:
  --tier <tier>           Tool tier: 'pre-check' or 'full' (default: full)
  --module-path <path>    Relative module path to narrow scope (e.g. Projects/kubecommand/src/modules/06)
  --project <name>        Project name for report metadata
  --output <path>         Write JSON report to file (default: stdout)
  --changed-files <list>  Comma-separated list of changed files (repo-relative)
  --semgrep-config <path> Path to .semgrep.yml (default: auto-detect)
  --eslint-config <path>  Path to eslint.config.* (default: auto-detect)
  --help                  Show this help

Tiers:
  pre-check   Fast checks only: tsc + ruff + shellcheck (<10s)
  full        All applicable tools based on project type detection

Examples:
  node lint-report.ts --repo /workspace/forgestack --tier full
  node lint-report.ts --repo /workspace/forgestack --tier pre-check --project kubecommand
  node lint-report.ts --repo /workspace/forgestack --changed-files "src/handler.ts,src/auth.ts"
  `);
}

function writeReport(report, outputPath = null) {
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) {
    fs.writeFileSync(outputPath, json);
    log('OK', `Report written to ${outputPath}`);
    log('OK', `Summary: ${report.summary.total_errors} errors, ${report.summary.total_warnings} warnings `
      + `(${report.summary.tools_ok} ok, ${report.summary.tools_skipped} skipped, ${report.summary.tools_failed} failed)`);
  } else {
    process.stdout.write(json);
  }
}

export { log, printHelp, setLintLogPath, writeReport };
