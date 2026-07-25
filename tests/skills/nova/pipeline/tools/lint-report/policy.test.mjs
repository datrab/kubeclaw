import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildToolRegistry, TOOL_ADAPTERS } from '../../../../../../skills/nova/pipeline/tools/lint-report/tool-registry.ts';
import { applicablePolicyToolIds, LintPolicyError, loadLintPolicy, matchesPolicyPattern, validateLintPolicy } from '../../../../../../skills/nova/pipeline/tools/lint-report/policy.ts';

const baselineRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-policy-baseline-test-'));
const baselinePath = path.join(baselineRoot, 'lint-baseline.json');
fs.writeFileSync(baselinePath, '{"schema_version":"pipeline_lint_baseline.v2","groups":[]}\n');

function policy(toolOverrides = {}) {
  return {
    schema_version: 'pipeline_lint_policy.v6',
    baseline_path: baselinePath,
    experimental_tools: [],
    projects: [{ id: 'workspace', root: '.', discovery_max_depth: 3, languages: ['shell'], language_evidence: { shell: ['**/*.sh'] } }],
    global_exclusions: ['**/generated/**'],
    architecture: { layers: [{ id: 'workspace', roots: ['.'], may_depend_on: ['workspace'] }] },
    rule_admission: {
      historical_commits: ['ad77341f3d85de501d1fd5fdbad6ced613ccee16'],
      rules: [{ tool: toolOverrides.id || 'shellcheck', code: 'fixture-rule', principle: 'Keep fixture behavior explicit.', remediation: 'Fix the fixture finding.', historical_changed_sets: 1, false_positives: 0, approved_by: 'platform', approved_on: '2026-07-20' }],
    },
    tools: [{
      id: 'shellcheck', required: true, category: 'lint', scope: 'changed-files', tier: 'pre-check',
      timeout_ms: 1000, blocking_severity: 'error', languages: ['shell'], config_path: null,
      targets: ['.'], include: ['**/*.sh'], exclude: [], ...toolOverrides,
    }],
  };
}

test('canonical policy validates typed tool and architecture authority', () => {
  const validated = validateLintPolicy(policy(), '/tmp/lint-policy.json');
  assert.equal(validated.tools[0].timeout_ms, 1000);
  assert.equal(validated.tools[0].scope, 'changed-files');
  assert.deepEqual(validated.tools[0].targets, ['.']);
  assert.deepEqual(validated.architecture.layers[0].may_depend_on, ['workspace']);
});

test('tool targets are required explicit project-relative authority', () => {
  assert.throws(() => validateLintPolicy(policy({ targets: [] }), '/tmp/lint-policy.json'), /required non-empty array/);
  assert.throws(() => validateLintPolicy(policy({ targets: ['../outside'] }), '/tmp/lint-policy.json'), /repository-relative/);
});

test('inactive language adapters declare no fake project root', () => {
  const configured = policy({ id: 'terraform-fmt', languages: ['terraform'], targets: [], include: ['**/*.tf'] });
  const validated = validateLintPolicy(configured, '/tmp/lint-policy.json');
  assert.deepEqual(validated.tools[0].targets, []);
});

test('enabled Terraform requires an absolute provider mirror', () => {
  const configured = policy({ id: 'terraform-fmt', languages: ['terraform'], targets: ['infra'], include: ['**/*.tf'] });
  configured.projects[0] = {
    ...configured.projects[0],
    languages: ['terraform'],
    language_evidence: { terraform: ['infra/**/*.tf'] },
    terraform: { roots: ['infra'] },
  };
  assert.throws(() => validateLintPolicy(configured, '/tmp/lint-policy.json'), /provider_mirror: required when Terraform is enabled/);
  configured.projects[0].terraform.provider_mirror = 'relative/mirror';
  assert.throws(() => validateLintPolicy(configured, '/tmp/lint-policy.json'), /provider_mirror: required absolute path/);
});

test('invalid policy fails before adapter execution', () => {
  assert.throws(
    () => validateLintPolicy(policy({ scope: 'guessed' }), '/tmp/lint-policy.json'),
    error => error instanceof LintPolicyError && /unknown scope/.test(error.message),
  );
});

test('policy v6 rejects ambiguous global tools across multiple projects', () => {
  const configured = policy();
  configured.projects.push({ ...configured.projects[0], id: 'other', root: 'other' });
  assert.throws(() => validateLintPolicy(configured, '/tmp/lint-policy.json'), /exactly one project/);
});

test('required native config must exist when policy loads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-policy-test-'));
  const policyPath = path.join(root, 'lint-policy.json');
  fs.copyFileSync(baselinePath, path.join(root, 'lint-baseline.json'));
  const configured = policy({ config_path: 'missing.config' });
  configured.baseline_path = 'lint-baseline.json';
  fs.writeFileSync(policyPath, JSON.stringify(configured));
  assert.throws(() => loadLintPolicy(policyPath), /config_path: does not exist/);
});

test('policy registry rejects adapters without canonical settings', () => {
  const configured = policy();
  assert.throws(() => buildToolRegistry(configured, new Set(['shell'])), /missing canonical policy/);
  assert.ok(TOOL_ADAPTERS.length > configured.tools.length);
});

test('policy globs include root and nested files without implicit fallback paths', () => {
  assert.equal(matchesPolicyPattern('script.sh', '**/*.sh'), true);
  assert.equal(matchesPolicyPattern('scripts/check.sh', '**/*.sh'), true);
  assert.equal(matchesPolicyPattern('scripts/check.ts', '**/*.sh'), false);
});

test('applicable tool inventory is derived from exact tier and active languages', () => {
  const validated = validateLintPolicy(policy(), '/tmp/lint-policy.json');
  assert.deepEqual(applicablePolicyToolIds(validated, new Set(['shell']), 'pre-check'), ['shellcheck']);
  assert.deepEqual(applicablePolicyToolIds(validated, new Set(), 'full'), []);
});

test('experimental tools run only when explicitly requested', () => {
  const configured = policy();
  configured.experimental_tools = ['shellcheck'];
  const validated = validateLintPolicy(configured, '/tmp/lint-policy.json');
  assert.deepEqual(applicablePolicyToolIds(validated, new Set(['shell']), 'pre-check'), []);
  assert.deepEqual(applicablePolicyToolIds(validated, new Set(['shell']), 'pre-check', { includeExperimental: true }), ['shellcheck']);
});

test('suppression groups require explicit approval and cannot remain expired', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-suppression-policy-'));
  const configured = policy();
  configured.baseline_path = path.join(root, 'lint-baseline.json');
  const group = { tool: 'shellcheck', owner: 'platform', reason: 'migration', created: '2026-07-20', expires: '2026-08-20', tracking: 'DEBT-1', approved_by: 'maintainer', approved_on: '2026-07-20', fingerprints: ['a'.repeat(64)] };
  fs.writeFileSync(configured.baseline_path, JSON.stringify({ schema_version: 'pipeline_lint_baseline.v2', groups: [group] }));
  assert.doesNotThrow(() => validateLintPolicy(configured, '/tmp/lint-policy.json', { today: '2026-07-21' }));
  delete group.approved_by;
  fs.writeFileSync(configured.baseline_path, JSON.stringify({ schema_version: 'pipeline_lint_baseline.v2', groups: [group] }));
  assert.throws(() => validateLintPolicy(configured, '/tmp/lint-policy.json', { today: '2026-07-21' }), /approved_by/);
  group.approved_by = 'maintainer';
  fs.writeFileSync(configured.baseline_path, JSON.stringify({ schema_version: 'pipeline_lint_baseline.v2', groups: [group] }));
  assert.throws(() => validateLintPolicy(configured, '/tmp/lint-policy.json', { today: '2026-08-21' }), /expired on 2026-08-20/);
});

test('canonical repository policy has no advisory warning tier and owns calibrated debt', () => {
  const policyPath = path.resolve('charts/kubeclaw/files/config/lint-policy.json');
  const configured = loadLintPolicy(policyPath);
  assert.ok(configured.tools.every(tool => tool.blocking_severity === 'warning'));
  const counts = Object.fromEntries(configured.baseline.entries.reduce((groups, entry) => {
    groups.set(entry.tool, (groups.get(entry.tool) || 0) + 1);
    return groups;
  }, new Map()));
  assert.equal(counts.eslint, 1464);
  assert.equal(counts.hadolint, 11);
  assert.equal(counts.gocyclo, 4);
  assert.equal(counts.semgrep, 1);
  assert.equal(counts['trivy-kubernetes'], 3);
  assert.equal(counts.tsc, 4220);
  assert.equal(configured.baseline.entries.length, 6572);
  assert.ok(configured.tools.every(tool => tool.mode === 'blocking'));
  assert.equal(configured.rule_admission.rules.length, 14);
  assert.deepEqual(configured.tools.find(tool => tool.id === 'gocyclo').arguments, [
    '-over',
    '10',
    '-ignore',
    '(^|/)(node_modules|vendor|generated)/',
  ]);
  const knip = JSON.parse(fs.readFileSync(path.resolve('charts/kubeclaw/files/config/knip.json'), 'utf8'));
  assert.ok(knip.entry.includes('skills/buster/buster-pipeline.ts'));
  assert.ok(knip.entry.includes('skills/nova/pipeline.ts'));
  assert.ok(knip.entry.filter(entry => !entry.includes('*')).every(entry => fs.existsSync(path.resolve(entry))));
  const runtimeToolPackage = JSON.parse(fs.readFileSync(path.resolve('docker/general-tools/package.json'), 'utf8'));
  const virtualRuntimeDependencies = new Set(['@types/node', 'file', 'openclaw']);
  for (const dependency of knip.ignoreDependencies) {
    assert.ok(
      virtualRuntimeDependencies.has(dependency) || runtimeToolPackage.dependencies[dependency],
      `Knip dependency exclusion '${dependency}' must be runtime-provided or an approved virtual module`,
    );
  }
  const jscpd = JSON.parse(fs.readFileSync(path.resolve('charts/kubeclaw/files/config/jscpd.json'), 'utf8'));
  const jscpdTests = JSON.parse(fs.readFileSync(path.resolve('charts/kubeclaw/files/config/jscpd-tests.json'), 'utf8'));
  assert.ok(jscpd.ignore.includes('tests/**'));
  assert.equal(jscpd.minLines, 10);
  assert.equal(jscpdTests.minLines, 18);
  assert.equal(jscpdTests.minTokens, 100);
  assert.ok(jscpd.ignore.includes('contracts/telemetry/v1/telemetry-types.ts'));
  assert.ok(jscpd.ignore.includes('contracts/telemetry/v1/telemetry_types.go'));
  assert.ok(jscpd.ignore.includes('contracts/telemetry/v1/bundle-types.ts'));
  assert.ok(jscpd.ignore.includes('contracts/telemetry/v1/bundle_types.go'));
  for (const commit of configured.rule_admission.historical_commits) {
    assert.doesNotThrow(() => execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`]));
  }
  for (const rule of configured.rule_admission.rules) {
    assert.equal(rule.historical_changed_sets, configured.rule_admission.historical_commits.length);
  }
});

test('canonical Semgrep roots cover every tracked production source file', () => {
  const configured = loadLintPolicy(path.resolve('charts/kubeclaw/files/config/lint-policy.json'));
  const semgrep = configured.tools.find(tool => tool.id === 'semgrep');
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
  const supported = tracked.filter(file => /\.(?:[cm]?[jt]sx?|py)$/.test(file));
  const production = supported.filter(file => !file.startsWith('tests/') && file !== 'charts/kubeclaw/files/config/eslint.config.mjs');
  const uncovered = production.filter(file => !semgrep.targets.some(target => file === target || file.startsWith(`${target}/`)));
  assert.deepEqual(uncovered, []);
});
