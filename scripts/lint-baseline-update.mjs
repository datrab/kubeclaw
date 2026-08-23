#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  throw new Error(message);
}

const REQUIRED = ['report', 'baseline', 'tool', 'owner', 'reason', 'created', 'expires', 'tracking', 'approved-by', 'approved-on'];
const DATES = ['created', 'expires', 'approved-on'];

function parsePairs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof flag !== 'string') fail(`Expected --name value pair at '${String(flag)}'.`);
    if (!flag.startsWith('--') || value === undefined) fail(`Expected --name value pair at '${flag}'.`);
    values[flag.slice(2)] = value;
  }
  return values;
}

function parseArgs(argv) {
  const values = parsePairs(argv);
  for (const field of REQUIRED) if (typeof values[field] !== 'string' || !values[field].trim()) fail(`--${field} is required.`);
  for (const field of DATES) if (!/^\d{4}-\d{2}-\d{2}$/.test(values[field])) fail(`--${field} must be an ISO date.`);
  if (values.expires <= values.created) fail('--expires must be later than --created.');
  if (values['approved-on'] < values.created) fail('--approved-on cannot precede --created.');
  return values;
}

function loadAuthority(args) {
  const baselinePath = path.resolve(args.baseline);
  const report = readJson(path.resolve(args.report), 'report');
  const baselineSource = fs.readFileSync(baselinePath, 'utf8');
  const baseline = JSON.parse(baselineSource);
  if (report.schema_version !== 'pipeline_lint_report.v7') fail('Report must use pipeline_lint_report.v7.');
  if (baseline.schema_version !== 'pipeline_lint_baseline.v2') fail('Baseline must use pipeline_lint_baseline.v2.');
  const digest = crypto.createHash('sha256').update(baselineSource).digest('hex');
  if (report.policy?.baseline_digest !== digest) fail('Report was not produced from the current baseline.');
  return { baseline, baselinePath, report };
}

function fingerprintAdditions(args, baseline, report) {
  const tool = report.tools?.[args.tool];
  if (!tool || tool.status !== 'ok') fail(`Tool '${args.tool}' did not complete successfully in the report.`);
  if (tool.mode !== 'blocking') fail('Experimental findings cannot be suppressed.');
  const fingerprints = [...new Set((tool.findings || []).map(finding => finding?.fingerprint))].sort();
  if (fingerprints.length === 0) fail(`Tool '${args.tool}' has no active findings to suppress.`);
  if (fingerprints.some(fingerprint => !/^[a-f0-9]{64}$/.test(fingerprint))) fail('Tool findings contain an invalid fingerprint.');
  const existing = new Set(baseline.groups.flatMap(group => group.fingerprints.map(fingerprint => `${group.tool}:${fingerprint}`)));
  const additions = fingerprints.filter(fingerprint => !existing.has(`${args.tool}:${fingerprint}`));
  if (additions.length === 0) fail('Every finding is already present in the baseline.');
  return additions;
}

function suppression(args, fingerprints) {
  return { tool: args.tool, owner: args.owner, reason: args.reason, created: args.created, expires: args.expires, tracking: args.tracking, approved_by: args['approved-by'], approved_on: args['approved-on'], fingerprints };
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error.message}`); }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { baseline, baselinePath, report } = loadAuthority(args);
  const additions = fingerprintAdditions(args, baseline, report);
  baseline.groups.push(suppression(args, additions));
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  process.stdout.write(`${args.tool}: added ${additions.length} approved fingerprints\n`);
}

main();
