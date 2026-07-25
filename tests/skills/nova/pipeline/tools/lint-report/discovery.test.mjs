import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildContext } from '../../../../../../skills/nova/pipeline/tools/lint-report.ts';
import { registerContainerYamlTools } from '../../../../../../skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts';
import { detectProjectTypes, listPolicySourceFiles } from '../../../../../../skills/nova/pipeline/tools/lint-report/discovery.ts';

function writePolicy(repoRoot, languages = ['javascript']) {
  const policyPath = path.join(repoRoot, 'lint-policy.json');
  fs.writeFileSync(path.join(repoRoot, 'lint-baseline.json'), '{"schema_version":"pipeline_lint_baseline.v2","groups":[]}\n');
  fs.writeFileSync(policyPath, JSON.stringify({
    schema_version: 'pipeline_lint_policy.v6',
    baseline_path: 'lint-baseline.json',
    experimental_tools: [],
    projects: [{ id: 'workspace', root: '.', discovery_max_depth: 5, languages, language_evidence: Object.fromEntries(languages.map(language => [language, language === 'helm' ? ['**/Chart.yaml'] : ['package.json']])) }],
    global_exclusions: [],
    architecture: { layers: [{ id: 'workspace', roots: ['.'], may_depend_on: ['workspace'] }] },
    rule_admission: { historical_commits: ['ad77341f3d85de501d1fd5fdbad6ced613ccee16'], rules: [{ tool: 'shellcheck', code: 'fixture-rule', principle: 'Explicit shell behavior.', remediation: 'Fix the shell finding.', historical_changed_sets: 1, false_positives: 0, approved_by: 'platform', approved_on: '2026-07-20' }] },
    tools: [{ id: 'shellcheck', required: true, category: 'lint', scope: 'changed-files', tier: 'pre-check', timeout_ms: 1000, blocking_severity: 'error', languages: [], config_path: null, targets: ['.'], include: [], exclude: [] }],
  }));
  return policyPath;
}

test('detectProjectTypes detects nested Helm charts for helm tools', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-discovery-test-'));
  const chartDir = path.join(tempRoot, 'charts', 'app');
  fs.mkdirSync(chartDir, { recursive: true });
  fs.writeFileSync(path.join(chartDir, 'Chart.yaml'), 'apiVersion: v2\nname: app\nversion: 0.1.0\n');

  const project = { root: '.', discovery_max_depth: 5, languages: ['helm'], language_evidence: { helm: ['**/Chart.yaml'] } };
  const { types, markers } = detectProjectTypes(tempRoot, project);

  assert.equal(types.has('helm'), true);
  assert.equal(markers.helm, '**/Chart.yaml');

  const tools = [];
  registerContainerYamlTools(tool => tools.push(tool));
  const helmLint = tools.find(tool => tool.id === 'helm-lint');

  assert.equal(helmLint.detect({
    repoRoot: tempRoot,
    modulePath: null,
    projectTypes: types,
    changedFiles: [],
  }), true);
});

test('buildContext rejects module paths outside the repo root', () => {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-report-context-test-'));
  const repoRoot = path.join(tempParent, 'repo');
  fs.mkdirSync(repoRoot);
  const policy = writePolicy(repoRoot);

  assert.throws(
    () => buildContext({ repo: repoRoot, policy, 'policy-project': 'workspace', 'module-path': '../outside' }),
    /--module-path escapes --repo/
  );

  assert.throws(
    () => buildContext({ repo: repoRoot, policy, 'policy-project': 'workspace', 'module-path': path.join(tempParent, 'outside') }),
    /--module-path must be relative/
  );
});

test('buildContext normalizes valid nested module paths before discovery', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-report-context-test-'));
  const moduleDir = path.join(repoRoot, 'modules', 'app');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(repoRoot, 'package.json'), '{}\n');
  const policy = writePolicy(repoRoot);

  const ctx = buildContext({
    repo: repoRoot,
    policy,
    'policy-project': 'workspace',
    'module-path': 'modules/./app',
    tier: 'full',
  });

  assert.equal(ctx.modulePath, path.join('modules', 'app'));
  assert.equal(ctx.projectTypes.has('javascript'), true);
});

test('listPolicySourceFiles applies the modeled lint ignore policy', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-report-policy-test-'));
  const sourcePath = path.join(repoRoot, 'src', 'app.ts');
  const ignoredPaths = [
    path.join(repoRoot, 'src', 'app.test.ts'),
    path.join(repoRoot, 'dist', 'bundle.js'),
    path.join(repoRoot, 'plugins', 'adapter.ts'),
    path.join(repoRoot, 'tests', 'app.ts'),
    path.join(repoRoot, 'src', 'vendor.min.js'),
  ];

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, 'export const app = true;\n');
  for (const ignoredPath of ignoredPaths) {
    fs.mkdirSync(path.dirname(ignoredPath), { recursive: true });
    fs.writeFileSync(ignoredPath, 'export const ignored = true;\n');
  }

  assert.deepEqual(listPolicySourceFiles(repoRoot), [sourcePath]);
});
