import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { generateLintReport, runPreCheck } from '../../../../../skills/nova/pipeline/services/lint.ts';

function writeLintPolicy(dir) {
  const policyPath = path.join(dir, 'lint-policy.json');
  fs.writeFileSync(path.join(dir, 'lint-baseline.json'), '{"schema_version":"pipeline_lint_baseline.v2","groups":[]}\n');
  fs.writeFileSync(policyPath, JSON.stringify({
    schema_version: 'pipeline_lint_policy.v6',
    baseline_path: 'lint-baseline.json',
    experimental_tools: [],
    projects: [{ id: 'workspace', root: '.', discovery_max_depth: 3, languages: ['shell'], language_evidence: { shell: ['**/*.sh'] } }],
    global_exclusions: [],
    architecture: { layers: [{ id: 'workspace', roots: ['.'], may_depend_on: ['workspace'] }] },
    rule_admission: { historical_commits: ['ad77341f3d85de501d1fd5fdbad6ced613ccee16'], rules: [{ tool: 'shellcheck', code: 'fixture-rule', principle: 'Explicit shell behavior.', remediation: 'Fix the shell finding.', historical_changed_sets: 1, false_positives: 0, approved_by: 'platform', approved_on: '2026-07-20' }] },
    tools: [{ id: 'shellcheck', required: true, category: 'lint', scope: 'changed-files', tier: 'pre-check', timeout_ms: 1000, blocking_severity: 'error', languages: ['shell'], config_path: null, targets: ['.'], include: ['**/*.sh'], exclude: [] }],
  }));
  return policyPath;
}

test('generateLintReport maps service buster tier to lint-report full tier', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-test-'));
  const lintPolicyPath = writeLintPolicy(dir);
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';
import crypto from 'node:crypto';

const tier = process.argv[process.argv.indexOf('--tier') + 1];
const output = process.argv[process.argv.indexOf('--output') + 1];
const policyPath = process.argv[process.argv.indexOf('--policy') + 1];
const policyDigest = crypto.createHash('sha256').update(fs.readFileSync(policyPath)).digest('hex');
const moduleIndex = process.argv.indexOf('--module-path');
const modulePath = moduleIndex >= 0 ? process.argv[moduleIndex + 1] : 'full';

fs.writeFileSync(output, JSON.stringify({
  schema_version: 'pipeline_lint_report.v6',
  policy: { schema_version: 'pipeline_lint_policy.v6', digest: policyDigest, project: 'workspace', config_digests: {}, baseline_digest: 'c2fd9d8282ac7f3fd16ae1ba91a4919755edf28deee23919bc4239a319c48ea6' },
  project: 'fixture',
  scope: modulePath,
  tier,
  visibility: { debt: false, experimental: false },
  timestamp: '2026-06-02T00:00:00.000Z',
  changed_files: [],
  detected_types: [],
  diagnostics: [],
  tools: {},
  summary: {
    total_errors: 0,
    total_warnings: 0,
    total_blocking: 0,
    total_baselined: 0,
    total_experimental: 0,
    tools_ok: 0,
    tools_not_applicable: 0,
    tools_failed: 0
  }
}));
`);

  const result = generateLintReport({
    repo_root: dir,
    project: 'fixture',
    pre_check: {
      lint_report_path: lintReportPath,
      lint_policy_path: lintPolicyPath,
      lint_policy_project: 'workspace',
      timeout_seconds: 1,
    },
  }, 'buster', { moduleId: 'fixture' });

  assert.equal(result.error, null);
  assert.equal(result.report.tier, 'full');
});

test('generateLintReport does not fall back from configured runtime path to repo checkout', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-runtime-alias-test-'));
  const lintPolicyPath = writeLintPolicy(dir);
  const lintReportPath = path.join(dir, 'skills', 'nova', 'pipeline', 'tools', 'lint-report.ts');
  fs.mkdirSync(path.dirname(lintReportPath), { recursive: true });

  fs.writeFileSync(lintReportPath, 'throw new Error("repo fallback must not execute");\n');

  const result = generateLintReport({
    repo_root: dir,
    project: 'fixture',
    pre_check: {
      lint_report_path: '/app/skills/pipeline/tools/lint-report.ts',
      lint_policy_path: lintPolicyPath,
      lint_policy_project: 'workspace',
      timeout_seconds: 1,
    },
  }, 'pre-check', { moduleId: 'fixture' });

  assert.equal(result.report, null);
  assert.equal(result.setup_failed, true);
  assert.equal(result.error_code, 'LINT_REPORT_TOOL_MISSING');
});

test('runPreCheck fails closed when lint report has failed tools without lint errors', async () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-test-'));
  const lintPolicyPath = writeLintPolicy(dir);
  const modulesDir = path.join(dir, 'modules');
  const moduleDir = path.join(modulesDir, 'module-a');
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'check.sh'), '#!/bin/sh\n');

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';
import crypto from 'node:crypto';

const output = process.argv[process.argv.indexOf('--output') + 1];
const policyPath = process.argv[process.argv.indexOf('--policy') + 1];
const policyDigest = crypto.createHash('sha256').update(fs.readFileSync(policyPath)).digest('hex');
const moduleIndex = process.argv.indexOf('--module-path');
const modulePath = moduleIndex >= 0 ? process.argv[moduleIndex + 1] : 'full';

fs.writeFileSync(output, JSON.stringify({
  schema_version: 'pipeline_lint_report.v6',
  policy: { schema_version: 'pipeline_lint_policy.v6', digest: policyDigest, project: 'workspace', config_digests: {}, baseline_digest: 'c2fd9d8282ac7f3fd16ae1ba91a4919755edf28deee23919bc4239a319c48ea6' },
  project: 'fixture',
  scope: modulePath,
  tier: 'pre-check',
  visibility: { debt: false, experimental: false },
  timestamp: '2026-06-02T00:00:00.000Z',
  changed_files: [],
  detected_types: ['shell'],
  diagnostics: [],
  tools: {
    shellcheck: {
      status: 'error',
      code: 'shellcheck-parse-failed',
      error: 'parser exception',
      duration_ms: 12
    }
  },
  summary: {
    total_errors: 0,
    total_warnings: 0,
    total_blocking: 0,
    total_baselined: 0,
    total_experimental: 0,
    tools_ok: 0,
    tools_not_applicable: 0,
    tools_failed: 1
  }
}));

process.exit(1);
`);

  const result = await runPreCheck({
    repo_root: dir,
    project: 'fixture',
    paths: {
      swarm_dir: path.join(dir, '.swarm'),
      modules_dir: modulesDir,
    },
    pre_check: {
      enabled: true,
      lint_report_path: lintReportPath,
      lint_policy_path: lintPolicyPath,
      lint_policy_project: 'workspace',
      timeout_seconds: 1,
    },
  }, 'module-a', { forge_diff_stat: '', fail_count: 0 }, 'module-a');

  assert.equal(result.passed, false);
  assert.equal(result.report.summary.total_errors, 0);
  assert.equal(result.report.summary.tools_failed, 1);
  assert.match(result.error, /1 tool failure/);
  assert.match(result.error, /shellcheck/);
  assert.match(result.error, /parser exception/);
});

test('generateLintReport limits changed-files scope to the target module', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-scope-test-'));
  const lintPolicyPath = writeLintPolicy(dir);
  const modulesDir = path.join(dir, '.swarm', 'modules');
  const moduleDir = 'Projects/app/src/modules/01-foundation';
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');
  const moduleRoot = path.join(modulesDir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'index.ts'), 'export const ok = true;\n');

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';
import crypto from 'node:crypto';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

const output = valueAfter('--output');
const modulePath = valueAfter('--module-path');
const changedFiles = valueAfter('--changed-files');
const policyPath = valueAfter('--policy');
const policyDigest = crypto.createHash('sha256').update(fs.readFileSync(policyPath)).digest('hex');

fs.writeFileSync(output, JSON.stringify({
  schema_version: 'pipeline_lint_report.v6',
  policy: { schema_version: 'pipeline_lint_policy.v6', digest: policyDigest, project: 'workspace', config_digests: {}, baseline_digest: 'c2fd9d8282ac7f3fd16ae1ba91a4919755edf28deee23919bc4239a319c48ea6' },
  project: 'fixture',
  tier: valueAfter('--tier') || 'full',
  visibility: { debt: false, experimental: false },
  timestamp: '2026-06-20T00:00:00.000Z',
  scope: modulePath,
  changed_files: changedFiles ? changedFiles.split(',') : [],
  detected_types: [],
  diagnostics: [],
  tools: {},
  summary: {
    total_errors: 0,
    total_warnings: 0,
    total_blocking: 0,
    total_baselined: 0,
    total_experimental: 0,
    tools_ok: 0,
    tools_not_applicable: 0,
    tools_failed: 0
  }
}));
`);

  const result = generateLintReport({
    repo_root: dir,
    project: 'fixture',
    paths: {
      modules_dir: modulesDir,
      swarm_dir: path.join(dir, '.swarm'),
    },
    pre_check: {
      lint_report_path: lintReportPath,
      lint_policy_path: lintPolicyPath,
      lint_policy_project: 'workspace',
      timeout_seconds: 1,
    },
  }, 'full', {
    moduleDir,
    moduleId: '01-foundation',
    changedFiles: [
      'Projects/app/src/modules/01-foundation/index.ts',
      'Projects/other/src/unrelated.ts',
    ],
  });

  assert.equal(result.error, null);
  assert.equal(result.report.scope, '.swarm/modules/Projects/app/src/modules/01-foundation');
  assert.deepEqual(result.report.changed_files, ['Projects/app/src/modules/01-foundation/index.ts']);
});

test('generateLintReport executes identical scoped inputs without an unsafe cache', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-cache-test-'));
  const lintPolicyPath = writeLintPolicy(dir);
  const swarmDir = path.join(dir, '.swarm');
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');
  const counterPath = path.join(dir, 'counter.txt');

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';
import crypto from 'node:crypto';

const output = process.argv[process.argv.indexOf('--output') + 1];
const counterPath = ${JSON.stringify(counterPath)};
const policyPath = process.argv[process.argv.indexOf('--policy') + 1];
const policyDigest = crypto.createHash('sha256').update(fs.readFileSync(policyPath)).digest('hex');
const moduleIndex = process.argv.indexOf('--module-path');
const modulePath = moduleIndex >= 0 ? process.argv[moduleIndex + 1] : 'full';
const changedFilesIndex = process.argv.indexOf('--changed-files');
const changedFiles = changedFilesIndex >= 0 ? process.argv[changedFilesIndex + 1].split(',') : [];
const current = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, 'utf8')) : 0;
fs.writeFileSync(counterPath, String(current + 1));

fs.writeFileSync(output, JSON.stringify({
  schema_version: 'pipeline_lint_report.v6',
  policy: { schema_version: 'pipeline_lint_policy.v6', digest: policyDigest, project: 'workspace', config_digests: {}, baseline_digest: 'c2fd9d8282ac7f3fd16ae1ba91a4919755edf28deee23919bc4239a319c48ea6' },
  project: 'fixture',
  scope: modulePath,
  tier: 'full',
  visibility: { debt: false, experimental: false },
  timestamp: '2026-07-08T00:00:00.000Z',
  changed_files: changedFiles,
  detected_types: [],
  diagnostics: [],
  tools: {},
  summary: {
    total_errors: 0,
    total_warnings: 0,
    total_blocking: 0,
    total_baselined: 0,
    total_experimental: 0,
    tools_ok: 0,
    tools_not_applicable: 0,
    tools_failed: 0
  }
}));
`);

  const config = {
    repo_root: dir,
    project: 'fixture',
    paths: {
      modules_dir: path.join(swarmDir, 'modules'),
      swarm_dir: swarmDir,
    },
    pre_check: {
      lint_report_path: lintReportPath,
      lint_policy_path: lintPolicyPath,
      lint_policy_project: 'workspace',
      timeout_seconds: 1,
    },
  };
  const opts = {
    moduleDir: 'Projects/app/src/modules/01-foundation',
    moduleId: '01-foundation',
    changedFiles: ['Projects/app/src/modules/01-foundation/index.ts'],
  };

  const first = generateLintReport(config, 'full', opts);
  const second = generateLintReport(config, 'full', opts);

  assert.equal(first.error, null);
  assert.equal(second.error, null);
  assert.equal(first.cached, undefined);
  assert.equal(second.cached, undefined);
  assert.equal(fs.readFileSync(counterPath, 'utf8'), '2');
  assert.equal(second.report.summary.total_warnings, 0);
});

test('generateLintReport rejects malformed report evidence', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-contract-test-'));
  const lintPolicyPath = writeLintPolicy(dir);
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');
  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';
const output = process.argv[process.argv.indexOf('--output') + 1];
fs.writeFileSync(output, JSON.stringify({ summary: { total_errors: 0 } }));
`);

  const result = generateLintReport({
    repo_root: dir,
    project: 'fixture',
    pre_check: { lint_report_path: lintReportPath, lint_policy_path: lintPolicyPath, lint_policy_project: 'workspace', timeout_seconds: 1 },
  }, 'full');

  assert.equal(result.report, null);
  assert.equal(result.setup_failed, true);
  assert.equal(result.error_code, 'LINT_REPORT_CONTRACT_INVALID');
  assert.match(result.error, /schema_version/);
});
