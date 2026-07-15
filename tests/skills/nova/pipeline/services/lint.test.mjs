import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { generateLintReport, runPreCheck } from '../../../../../skills/nova/pipeline/services/lint.ts';

test('generateLintReport maps service buster tier to lint-report full tier', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-test-'));
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';

const tier = process.argv[process.argv.indexOf('--tier') + 1];
const output = process.argv[process.argv.indexOf('--output') + 1];

fs.writeFileSync(output, JSON.stringify({
  tier,
  timestamp: '2026-06-02T00:00:00.000Z',
  tools: {},
  summary: {
    total_errors: 0,
    total_warnings: 0,
    tools_ok: 0,
    tools_failed: 0
  }
}));
`);

  const result = generateLintReport({
    repo_root: dir,
    project: 'fixture',
    pre_check: {
      lint_report_path: lintReportPath,
      timeout_seconds: 1,
    },
  }, 'buster', { moduleId: 'fixture' });

  assert.equal(result.error, null);
  assert.equal(result.report.tier, 'full');
});

test('generateLintReport resolves canonical runtime lint-report path to repo checkout tool', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-runtime-alias-test-'));
  const lintReportPath = path.join(dir, 'skills', 'nova', 'pipeline', 'tools', 'lint-report.ts');
  fs.mkdirSync(path.dirname(lintReportPath), { recursive: true });

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';

const tier = process.argv[process.argv.indexOf('--tier') + 1];
const output = process.argv[process.argv.indexOf('--output') + 1];

fs.writeFileSync(output, JSON.stringify({
  tier,
  timestamp: '2026-06-02T00:00:00.000Z',
  tools: {},
  summary: {
    total_errors: 0,
    total_warnings: 0,
    tools_ok: 0,
    tools_skipped: 0,
    tools_failed: 0
  }
}));
`);

  const result = generateLintReport({
    repo_root: dir,
    project: 'fixture',
    pre_check: {
      lint_report_path: '/app/skills/pipeline/tools/lint-report.ts',
      timeout_seconds: 1,
    },
  }, 'pre-check', { moduleId: 'fixture' });

  assert.equal(result.error, null);
  assert.equal(result.report.tier, 'pre-check');
});

test('runPreCheck fails closed when lint report has failed tools without lint errors', async () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-test-'));
  const modulesDir = path.join(dir, 'modules');
  const moduleDir = path.join(modulesDir, 'module-a');
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');
  fs.mkdirSync(moduleDir, { recursive: true });

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';

const output = process.argv[process.argv.indexOf('--output') + 1];

fs.writeFileSync(output, JSON.stringify({
  tier: 'pre-check',
  timestamp: '2026-06-02T00:00:00.000Z',
  tools: {
    shellcheck: {
      status: 'error',
      error: 'parser exception',
      duration_ms: 12
    }
  },
  summary: {
    total_errors: 0,
    total_warnings: 0,
    tools_ok: 0,
    tools_skipped: 0,
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
  const modulesDir = path.join(dir, '.swarm', 'modules');
  const moduleDir = 'Projects/app/src/modules/01-foundation';
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');
  const moduleRoot = path.join(modulesDir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'index.ts'), 'export const ok = true;\n');

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
};

const output = valueAfter('--output');
const modulePath = valueAfter('--module-path');
const changedFiles = valueAfter('--changed-files');

fs.writeFileSync(output, JSON.stringify({
  tier: valueAfter('--tier') || 'full',
  timestamp: '2026-06-20T00:00:00.000Z',
  scope: modulePath,
  changed_files: changedFiles ? changedFiles.split(',') : [],
  tools: {},
  summary: {
    total_errors: 0,
    total_warnings: 0,
    tools_ok: 0,
    tools_skipped: 0,
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

test('generateLintReport reuses canonical lint cache for identical scoped inputs', () => {
  const dir = fs.mkdtempSync(path.join('/home', 'lint-report-cache-test-'));
  const swarmDir = path.join(dir, '.swarm');
  const lintReportPath = path.join(dir, 'lint-report-fixture.mjs');
  const counterPath = path.join(dir, 'counter.txt');

  fs.writeFileSync(lintReportPath, `
import fs from 'node:fs';

const output = process.argv[process.argv.indexOf('--output') + 1];
const counterPath = ${JSON.stringify(counterPath)};
const current = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, 'utf8')) : 0;
fs.writeFileSync(counterPath, String(current + 1));

fs.writeFileSync(output, JSON.stringify({
  tier: 'full',
  timestamp: '2026-07-08T00:00:00.000Z',
  tools: {},
  summary: {
    total_errors: 0,
    total_warnings: 600,
    tools_ok: 1,
    tools_skipped: 0,
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
  assert.equal(second.cached, true);
  assert.equal(fs.readFileSync(counterPath, 'utf8'), '1');
  assert.equal(second.report.summary.total_warnings, 600);
});
