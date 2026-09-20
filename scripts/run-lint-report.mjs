#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { executeLintReport } from '../skills/nova/plugins/lint/src/engine/index.ts';

const usage = `Usage:
  npm run lint:report -- --policy PATH --policy-project ID --output PATH [options]

Required:
  --policy PATH             Lint policy file
  --policy-project ID       Project ID in the policy
  --output PATH             Destination for the validated JSON report

Options:
  --working-directory PATH  Repository to inspect (default: current directory)
  --project NAME            Project name recorded in the report
  --tier pre-check|full     Lint tier (default: full)
  --changed-file PATH       Restrict the request; repeat for more files
  --raw-manifest PATH       Override a Kubernetes raw input; repeat as needed
  --helm-chart PATH         Override a Kubernetes chart input; repeat as needed
  --include-debt            Disclose baselined findings
  --include-experimental    Run and disclose experimental tools
  --help                    Show this help
`;

function fail(message) {
  process.stderr.write(`${message}\n\n${usage}`);
  process.exitCode = 2;
}

function parseArguments(values) {
  const options = {
    workingDirectory: process.cwd(),
    tier: 'full',
    changedFiles: [],
    rawManifests: [],
    helmCharts: [],
    includeDebt: false,
    includeExperimental: false,
  };
  const valueOptions = new Map([
    ['--policy', 'policyPath'],
    ['--policy-project', 'policyProject'],
    ['--output', 'output'],
    ['--working-directory', 'workingDirectory'],
    ['--project', 'project'],
    ['--tier', 'tier'],
  ]);
  const listOptions = new Map([
    ['--changed-file', 'changedFiles'],
    ['--raw-manifest', 'rawManifests'],
    ['--helm-chart', 'helmCharts'],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === '--help') return { help: true };
    if (argument === '--include-debt') {
      options.includeDebt = true;
      continue;
    }
    if (argument === '--include-experimental') {
      options.includeExperimental = true;
      continue;
    }
    const field = valueOptions.get(argument) ?? listOptions.get(argument);
    if (!field) throw new Error(`Unknown option: ${argument}`);
    const value = values[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    index += 1;
    if (listOptions.has(argument)) options[field].push(value);
    else options[field] = value;
  }
  for (const field of ['policyPath', 'policyProject', 'output']) {
    if (!options[field]) throw new Error(`Missing required option: ${field}`);
  }
  if (!['pre-check', 'full'].includes(options.tier)) throw new Error('--tier must be pre-check or full');
  return options;
}

function atomicWrite(file, value) {
  const destination = path.resolve(file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return destination;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const kubernetes = options.rawManifests.length > 0 || options.helmCharts.length > 0
    ? { rawManifests: options.rawManifests, helmCharts: options.helmCharts }
    : undefined;
  try {
    const report = await executeLintReport({
      workingDirectory: path.resolve(options.workingDirectory),
      policyPath: path.resolve(options.policyPath),
      policyProject: options.policyProject,
      tier: options.tier,
      project: options.project,
      changedFiles: options.changedFiles,
      includeDebt: options.includeDebt,
      includeExperimental: options.includeExperimental,
      kubernetes,
    });
    const destination = atomicWrite(options.output, report);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output: destination,
      tier: report.tier,
      tools: Object.keys(report.tools ?? {}).length,
      tools_failed: report.summary?.tools_failed,
      total_blocking: report.summary?.total_blocking,
    })}\n`);
    if ((report.summary?.tools_failed ?? 0) > 0) process.exitCode = 1;
    else if ((report.summary?.total_blocking ?? 0) > 0) process.exitCode = 3;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: typeof error?.code === 'string' ? error.code : 'LINT_REPORT_RUN_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}

await main();
