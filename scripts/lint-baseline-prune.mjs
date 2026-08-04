#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`--${name} is required`);
  return process.argv[index + 1];
}

const reportPath = path.resolve(argument('report'));
const baselinePath = path.resolve(argument('baseline'));
const write = process.argv.includes('--write');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const baselineSource = fs.readFileSync(baselinePath, 'utf8');
const baseline = JSON.parse(baselineSource);
const digest = crypto.createHash('sha256').update(baselineSource).digest('hex');
if (report.policy?.baseline_digest !== digest) throw new Error('report was not produced from the current baseline');
if (report.tier !== 'full' || report.scope !== 'full' || report.changed_files?.length !== 0) {
  throw new Error('baseline pruning requires a complete full-repository report');
}
if (report.visibility?.debt !== true) throw new Error('baseline pruning requires debt-visible report output');
const baselineTools = new Set(baseline.groups.map((group) => group.tool));
for (const tool of baselineTools) {
  if (report.tools?.[tool]?.status !== 'ok') throw new Error(`baseline pruning requires a successful '${tool}' result`);
  if (!Array.isArray(report.tools[tool].findings)) throw new Error(`baseline pruning requires complete '${tool}' findings`);
}

const observed = new Set(Object.entries(report.tools ?? {}).flatMap(([tool, result]) => (
  Array.isArray(result.findings)
    ? result.findings.filter((finding) => finding.baseline).map((finding) => `${tool}:${finding.fingerprint}`)
    : []
)));
const groups = baseline.groups
  .map((group) => ({
    ...group,
    fingerprints: group.fingerprints.filter((fingerprint) => observed.has(`${group.tool}:${fingerprint}`)),
  }))
  .filter((group) => group.fingerprints.length > 0);
const removed = baseline.groups.reduce((total, group) => total + group.fingerprints.length, 0)
  - groups.reduce((total, group) => total + group.fingerprints.length, 0);

if (removed === 0) {
  process.stdout.write('lint baseline is fresh\n');
} else if (!write) {
  throw new Error(`lint baseline contains ${removed} stale fingerprint(s); rerun with --write to prune them`);
} else {
  fs.writeFileSync(baselinePath, `${JSON.stringify({ ...baseline, groups }, null, 2)}\n`);
  process.stdout.write(`pruned ${removed} stale lint baseline fingerprint(s)\n`);
}
