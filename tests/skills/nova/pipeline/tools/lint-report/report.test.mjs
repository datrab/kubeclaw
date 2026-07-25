import assert from 'node:assert/strict';
import test from 'node:test';

import { runAllTools } from '../../../../../../skills/nova/pipeline/tools/lint-report/report.ts';
import { LINT_REPORT_SCHEMA_VERSION, validateLintReport } from '../../../../../../skills/nova/pipeline/tools/lint-report/report-contract.ts';
import { findingFingerprint } from '../../../../../../skills/nova/pipeline/tools/lint-report/finding-fingerprints.ts';

function context() {
  return {
    repoRoot: '/tmp/lint-report-contract',
    modulePath: null,
    project: 'fixture',
    tier: 'full',
    changedFiles: [],
    projectTypes: new Set(['fixture']),
    diagnostics: [],
    includeDebt: false,
    includeExperimental: false,
    policy: { schema_version: 'pipeline_lint_policy.v6', global_exclusions: [], config_digests: {}, baseline: { digest: 'fixture-baseline', entries_by_key: new Map() } },
    policyDigest: 'fixture-policy',
    policyProject: { id: 'fixture', root: '.' },
  };
}

test('required missing binary is an execution failure', async () => {
  const report = await runAllTools(context(), [{
    id: 'missing-tool',
    name: 'Missing Tool',
    binary: 'kubeclaw-definitely-missing-lint-binary',
    tier: 'full',
    required: true,
    category: 'lint',
    scope: 'repository',
    blocking_severity: 'error',
    mode: 'blocking',
    detect: () => true,
    run: () => ({ errors: 0, warnings: 0, findings: [] }),
  }]);

  assert.equal(report.tools['missing-tool'].status, 'error');
  assert.equal(report.tools['missing-tool'].code, 'lint-tool-binary-missing');
  assert.equal(report.summary.tools_failed, 1);
  assert.equal(report.summary.tools_not_applicable, 0);
  validateLintReport(report);
});

test('explicit not-applicable result is distinct from success and failure', async () => {
  const report = await runAllTools(context(), [{
    id: 'optional-tool',
    name: 'Optional Tool',
    binary: 'node',
    tier: 'full',
    required: true,
    category: 'lint',
    scope: 'repository',
    blocking_severity: 'error',
    mode: 'blocking',
    detect: () => true,
    run: () => ({ status: 'not_applicable', reason: 'no configured package graph' }),
  }]);

  assert.equal(report.tools['optional-tool'].status, 'not_applicable');
  assert.equal(report.summary.tools_not_applicable, 1);
  assert.equal(report.summary.tools_ok, 0);
  assert.equal(report.summary.tools_failed, 0);
  validateLintReport(report);
});

test('adapter parser failure remains an execution failure', async () => {
  const report = await runAllTools(context(), [{
    id: 'parser-tool',
    name: 'Parser Tool',
    binary: 'node',
    tier: 'full',
    required: true,
    category: 'lint',
    scope: 'repository',
    blocking_severity: 'error',
    mode: 'blocking',
    detect: () => true,
    run: () => {
      const error = new Error('output was not valid JSON');
      error.code = 'parser-tool-parse-failed';
      throw error;
    },
  }]);

  assert.equal(report.tools['parser-tool'].status, 'error');
  assert.equal(report.tools['parser-tool'].code, 'parser-tool-parse-failed');
  assert.equal(report.summary.tools_failed, 1);
  validateLintReport(report);
});

test('policy blocking severity controls findings without changing tool output severity', async () => {
  const report = await runAllTools(context(), [{
    id: 'warning-tool', name: 'Warning Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'repository', blocking_severity: 'warning', mode: 'blocking', detect: () => true,
    run: () => ({ errors: 0, warnings: 1, findings: [{ file: 'x.ts', line: 1, column: 1, severity: 'warning', code: 'warning-rule', message: 'configured blocker' }] }),
  }]);

  assert.equal(report.summary.total_errors, 0);
  assert.equal(report.summary.total_warnings, 1);
  assert.equal(report.summary.total_blocking, 1);
  assert.equal(report.tools['warning-tool'].blocking_findings, 1);
  validateLintReport(report);
  assert.throws(() => validateLintReport(report, { toolPolicies: { 'warning-tool': { category: 'lint', scope: 'repository', blocking_severity: 'error', mode: 'blocking' } } }), /does not match configured tool policy/);
});

test('reported error counts block even when a tool truncates detailed findings', async () => {
  const report = await runAllTools(context(), [{
    id: 'count-tool', name: 'Count Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'repository', blocking_severity: 'error', mode: 'blocking', detect: () => true,
    run: () => ({ errors: 2, warnings: 0, findings: [] }),
  }]);

  assert.equal(report.summary.total_blocking, 2);
  validateLintReport(report);
});

test('unexpired fingerprint baseline removes only the matching finding from the blocking count', async () => {
  const finding = { file: 'src/debt.ts', line: 7, column: 1, severity: 'error', code: 'debt-rule', message: 'existing debt' };
  const fingerprint = findingFingerprint('debt-tool', context().repoRoot, finding);
  const ctx = context();
  ctx.includeDebt = true;
  ctx.policy.baseline.entries_by_key.set(`debt-tool:${fingerprint}`, {
    tool: 'debt-tool', fingerprint, owner: 'platform', reason: 'migration debt', created: '2026-07-20', expires: '2099-01-01', tracking: 'DEBT-1', approved_by: 'maintainer', approved_on: '2026-07-20',
  });
  const report = await runAllTools(ctx, [{
    id: 'debt-tool', name: 'Debt Tool', binary: 'node', tier: 'full', required: true,
    category: 'architecture', scope: 'repository', blocking_severity: 'error', mode: 'blocking', detect: () => true,
    run: () => ({ errors: 1, warnings: 0, findings: [finding] }),
  }]);

  assert.equal(report.summary.total_blocking, 0);
  assert.equal(report.summary.total_baselined, 1);
  assert.equal(report.tools['debt-tool'].findings[0].baseline.tracking, 'DEBT-1');
  validateLintReport(report);
});

test('expired fingerprint baseline no longer suppresses a finding', async () => {
  const finding = { file: 'src/debt.ts', line: 7, column: 1, severity: 'error', code: 'debt-rule', message: 'expired debt' };
  const fingerprint = findingFingerprint('debt-tool', context().repoRoot, finding);
  const ctx = context();
  ctx.policy.baseline.entries_by_key.set(`debt-tool:${fingerprint}`, {
    tool: 'debt-tool', fingerprint, owner: 'platform', reason: 'migration debt', created: '1999-01-01', expires: '2000-01-01', tracking: 'DEBT-OLD', approved_by: 'maintainer', approved_on: '1999-01-01',
  });
  const report = await runAllTools(ctx, [{
    id: 'debt-tool', name: 'Debt Tool', binary: 'node', tier: 'full', required: true,
    category: 'architecture', scope: 'repository', blocking_severity: 'error', mode: 'blocking', detect: () => true,
    run: () => ({ errors: 1, warnings: 0, findings: [finding] }),
  }]);

  assert.equal(report.summary.total_blocking, 1);
  assert.equal(report.summary.total_baselined, 0);
  assert.equal(report.tools['debt-tool'].findings[0].baseline, undefined);
  validateLintReport(report);
});

test('normal output hides approved debt while preserving the ratchet count', async () => {
  const finding = { file: 'src/debt.ts', line: 7, column: 1, severity: 'error', code: 'debt-rule', message: 'existing debt' };
  const fingerprint = findingFingerprint('debt-tool', context().repoRoot, finding);
  const ctx = context();
  ctx.policy.baseline.entries_by_key.set(`debt-tool:${fingerprint}`, {
    tool: 'debt-tool', fingerprint, owner: 'platform', reason: 'migration debt', created: '2026-07-20', expires: '2099-01-01', tracking: 'DEBT-1', approved_by: 'maintainer', approved_on: '2026-07-20',
  });
  const report = await runAllTools(ctx, [{
    id: 'debt-tool', name: 'Debt Tool', binary: 'node', tier: 'full', required: true,
    category: 'architecture', scope: 'repository', blocking_severity: 'error', mode: 'blocking', detect: () => true,
    run: () => ({ errors: 1, warnings: 0, findings: [finding] }),
  }]);
  assert.equal(report.summary.total_baselined, 1);
  assert.deepEqual(report.tools['debt-tool'].findings, []);
  validateLintReport(report);
});

test('experimental findings are opt-in evidence and never block', async () => {
  const ctx = { ...context(), includeExperimental: true };
  const report = await runAllTools(ctx, [{
    id: 'candidate-tool', name: 'Candidate Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'repository', blocking_severity: 'warning', mode: 'experimental', detect: () => true,
    run: () => ({ errors: 0, warnings: 1, findings: [{ file: 'src/app.ts', line: 1, column: 1, severity: 'warning', code: 'candidate', message: 'candidate signal' }] }),
  }]);
  assert.equal(report.summary.total_blocking, 0);
  assert.equal(report.summary.total_experimental, 1);
  assert.equal(report.tools['candidate-tool'].mode, 'experimental');
  validateLintReport(report);
});

test('normal execution omits experimental tools completely', async () => {
  let executions = 0;
  const report = await runAllTools(context(), [{
    id: 'candidate-tool', name: 'Candidate Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'repository', blocking_severity: 'warning', mode: 'experimental', detect: () => true,
    run: () => { executions++; return { errors: 0, warnings: 0, findings: [] }; },
  }]);
  assert.equal(executions, 0);
  assert.deepEqual(report.tools, {});
  validateLintReport(report);
});

test('excluded-only changed-file scope is not applicable without adapter execution', async () => {
  let executions = 0;
  const ctx = {
    ...context(),
    changedFiles: ['generated/client.ts'],
    changedFilesRequested: true,
    policy: { ...context().policy, global_exclusions: ['generated/**'] },
  };
  const report = await runAllTools(ctx, [{
    id: 'scoped-tool', name: 'Scoped Tool', binary: 'kubeclaw-definitely-missing-scoped-binary', tier: 'full', required: true,
    category: 'lint', scope: 'changed-files', blocking_severity: 'error', mode: 'blocking', targets: ['.'], include: ['**/*.ts'], exclude: [], detect: () => true,
    run: () => { executions++; return { errors: 0, warnings: 0, findings: [] }; },
  }]);

  assert.equal(executions, 0);
  assert.equal(report.tools['scoped-tool'].status, 'not_applicable');
  validateLintReport(report);
});

test('changed-file tools stay inside the selected policy project root', async () => {
  let received;
  const ctx = {
    ...context(),
    changedFiles: ['apps/api/src/app.ts', 'apps/web/src/app.ts'],
    changedFilesRequested: true,
    policyProject: { id: 'api', root: 'apps/api' },
  };
  await runAllTools(ctx, [{
    id: 'project-tool', name: 'Project Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'changed-files', blocking_severity: 'error', mode: 'blocking', targets: ['.'], include: ['**/*.ts'], exclude: [], detect: () => true,
    run: (toolContext) => { received = toolContext; return { errors: 0, warnings: 0, findings: [] }; },
  }]);

  assert.equal(received.modulePath, 'apps/api');
  assert.deepEqual(received.changedFiles, ['apps/api/src/app.ts']);
});

test('affected-project tools receive only policy-included changed files', async () => {
  let received;
  const ctx = {
    ...context(),
    changedFiles: ['cmd/controller/main.go', 'go.mod', 'docs/guide.md', 'generated/client.go'],
    changedFilesRequested: true,
    policy: { ...context().policy, global_exclusions: ['generated/**'] },
  };
  await runAllTools(ctx, [{
    id: 'affected-tool', name: 'Affected Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'affected-projects', blocking_severity: 'error', mode: 'blocking', targets: ['go.mod'], include: ['**/*.go'], exclude: [], detect: () => true,
    run: (toolContext) => { received = toolContext; return { errors: 0, warnings: 0, findings: [] }; },
  }]);

  assert.deepEqual(received.changedFiles, ['cmd/controller/main.go', 'go.mod']);
});

test('native config changes expand their owning changed-file tool to configured targets', async () => {
  let received;
  const ctx = {
    ...context(),
    changedFiles: ['eslint.config.mjs'],
    changedFilesRequested: true,
  };
  await runAllTools(ctx, [{
    id: 'configured-tool', name: 'Configured Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'changed-files', blocking_severity: 'error', mode: 'blocking', config_path: '/tmp/lint-report-contract/eslint.config.mjs', targets: ['src'], include: ['**/*.ts'], exclude: [], detect: () => true,
    run: (toolContext) => { received = toolContext; return { errors: 0, warnings: 0, findings: [] }; },
  }]);

  assert.equal(received.changedFilesRequested, false);
  assert.deepEqual(received.changedFiles, []);
});

test('canonical policy changes expand every changed-file tool to configured targets', async () => {
  let received;
  const ctx = {
    ...context(),
    policyPath: '/tmp/lint-report-contract/lint-policy.json',
    changedFiles: ['lint-policy.json'],
    changedFilesRequested: true,
  };
  await runAllTools(ctx, [{
    id: 'policy-owned-tool', name: 'Policy Owned Tool', binary: 'node', tier: 'full', required: true,
    category: 'lint', scope: 'changed-files', blocking_severity: 'error', mode: 'blocking', targets: ['src'], include: ['**/*.ts'], exclude: [], detect: () => true,
    run: (toolContext) => { received = toolContext; return { errors: 0, warnings: 0, findings: [] }; },
  }]);
  assert.equal(received.changedFilesRequested, false);
  assert.deepEqual(received.changedFiles, []);
});

test('report contract rejects inconsistent summary evidence', () => {
  const report = {
    schema_version: LINT_REPORT_SCHEMA_VERSION,
    policy: { schema_version: 'pipeline_lint_policy.v6', digest: 'fixture', project: 'fixture', config_digests: {}, baseline_digest: 'fixture-baseline' },
    project: 'fixture',
    scope: 'full',
    timestamp: '2026-07-20T00:00:00.000Z',
    tier: 'full',
    visibility: { debt: false, experimental: false },
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
      tools_ok: 1,
      tools_not_applicable: 0,
      tools_failed: 0,
    },
  };

  assert.throws(() => validateLintReport(report), /tools_ok: expected 0/);
});

test('report contract rejects incompatible policy schema evidence', () => {
  const report = {
    schema_version: LINT_REPORT_SCHEMA_VERSION,
    policy: { schema_version: 'pipeline_lint_policy.v2', digest: 'fixture', project: 'fixture', config_digests: {}, baseline_digest: 'fixture-baseline' },
    project: 'fixture', scope: 'full', timestamp: '2026-07-20T00:00:00.000Z', tier: 'full',
    changed_files: [], detected_types: [], diagnostics: [], tools: {},
    visibility: { debt: false, experimental: false },
    summary: { total_errors: 0, total_warnings: 0, total_blocking: 0, total_baselined: 0, total_experimental: 0, tools_ok: 0, tools_not_applicable: 0, tools_failed: 0 },
  };
  assert.throws(() => validateLintReport(report), /policy\.schema_version: expected pipeline_lint_policy\.v6/);
});

test('report contract binds evidence to the requested tier and policy authority', () => {
  const report = {
    schema_version: LINT_REPORT_SCHEMA_VERSION,
    policy: { schema_version: 'pipeline_lint_policy.v6', digest: 'actual', project: 'workspace', config_digests: {}, baseline_digest: 'fixture-baseline' },
    project: 'fixture', scope: 'full', timestamp: '2026-07-20T00:00:00.000Z', tier: 'pre-check',
    visibility: { debt: false, experimental: false }, changed_files: [], detected_types: [], diagnostics: [], tools: {},
    summary: { total_errors: 0, total_warnings: 0, total_blocking: 0, total_baselined: 0, total_experimental: 0, tools_ok: 0, tools_not_applicable: 0, tools_failed: 0 },
  };

  assert.throws(() => validateLintReport(report, { tier: 'full' }), /expected requested tier full/);
  assert.throws(() => validateLintReport(report, { policyProject: 'other' }), /expected configured project other/);
  assert.throws(() => validateLintReport(report, { policyDigest: 'expected' }), /does not match configured policy/);
  assert.throws(() => validateLintReport(report, { configDigests: { eslint: 'expected' } }), /keys do not match configured native configs/);
  assert.throws(() => validateLintReport(report, { toolIds: ['eslint'] }), /expected exact tool inventory: eslint/);
  assert.throws(() => validateLintReport(report, { scope: 'modules/example' }), /expected requested scope modules\/example/);
  assert.throws(() => validateLintReport(report, { changedFiles: ['src/example.ts'] }), /does not match requested changed-file scope/);
});
