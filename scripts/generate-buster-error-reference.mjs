#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'docs/site/reference/buster-error-codes.md');
const revision = '3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f';
const processFailures = (prefix) => ['CANCELLED', 'TIMEOUT', 'STDIN_FAILED', 'STDOUT_FAILED',
  'STDERR_FAILED', 'OUTPUT_LIMIT', 'CLEANUP_FAILED'].map((suffix) => `${prefix}_${suffix}`);

const groups = [
  ['Unit Command And JUnit Report', ['DIRECT_COMMAND_', 'JUNIT_'], [
    'skills/buster/plugins/direct-command/src/provider.js',
    'skills/buster/plugins/junit-report-adapter/src/adapter.js'], []],
  ['Coverage Budget', ['COVERAGE_'], ['skills/buster/plugins/coverage-budget/src/provider.js'], []],
  ['Container Build', ['CONTAINER_BUILD_', 'BUSTER_CONTAINER_BUILD_'], [
    'skills/buster/plugins/container-build/src/provider.js',
    'skills/buster/engine/test-gates/container-build-runtime.ts',
    'skills/buster/engine/test-gates/production.ts'], [
      'CONTAINER_BUILD_LOG_LIMIT_INVALID', 'CONTAINER_BUILD_TIME_LIMIT_INVALID',
      'CONTAINER_BUILD_MANIFEST_LIMIT_INVALID']],
  ['Kubernetes Fixture', ['KUBERNETES_FIXTURE_'], [
    'skills/buster/plugins/kubernetes-fixture/src/provider.js',
    'skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts'], [
      'KUBERNETES_FIXTURE_LEASE_FAILED', 'KUBERNETES_FIXTURE_LEASE_REJECTED',
      'KUBERNETES_FIXTURE_MANIFEST_SIZE_LIMIT_INVALID',
      'KUBERNETES_FIXTURE_RESOURCE_COUNT_LIMIT_INVALID',
      'KUBERNETES_FIXTURE_PVC_SIZE_LIMIT_INVALID',
      'KUBERNETES_FIXTURE_PVC_TOTAL_SIZE_LIMIT_INVALID',
      'KUBERNETES_FIXTURE_RETENTION_LIMIT_INVALID',
      'KUBERNETES_FIXTURE_EXECUTION_LIMIT_INVALID',
      ...processFailures('KUBERNETES_FIXTURE_KUBECTL')]],
  ['HTTP', ['HTTP_'], [
    'skills/buster/plugins/http/src/provider.js',
    'skills/buster/engine/test-gates/network-http-runtime.ts'], []],
  ['Tailscale Exposure', ['TAILSCALE_EXPOSURE_'], [
    'skills/buster/plugins/tailscale-exposure/src/provider.js',
    'skills/buster/engine/test-gates/tailscale-exposure-runtime.ts'], [
      ...processFailures('TAILSCALE_EXPOSURE_KUBECTL')]],
  ['API', ['API_FLOW_', 'OPENAPI_'], [
    'skills/buster/plugins/api-flow/src/provider.js',
    'skills/buster/plugins/openapi/src/provider.js'], []],
  ['Accessibility', ['AXE_', 'BROWSER_AXE_'], [
    'skills/buster/plugins/axe/src/provider.js',
    'skills/buster/engine/test-gates/browser-axe-runtime.ts',
    'skills/buster/engine/test-gates/production.ts'], []],
  ['Lighthouse Performance', ['LIGHTHOUSE_', 'BROWSER_LIGHTHOUSE_'], [
    'skills/buster/plugins/lighthouse/src/provider.js',
    'skills/buster/engine/test-gates/browser-lighthouse-runtime.ts',
    'skills/buster/engine/test-gates/production.ts'], []],
  ['Visual', ['VISUAL_', 'BROWSER_VISUAL_'], [
    'skills/buster/plugins/visual/src/provider.js',
    'skills/buster/engine/test-gates/browser-visual-runtime.ts',
    'skills/buster/engine/test-gates/production.ts'], [
      'VISUAL_PROFILE_FILE_INVALID_TOO_LARGE', 'VISUAL_MANIFEST_INVALID_TOO_LARGE']],
  ['End-To-End', ['PLAYWRIGHT_', 'BROWSER_PLAYWRIGHT_'], [
    'skills/buster/plugins/playwright/src/provider.js',
    'skills/buster/engine/test-gates/browser-playwright-runtime.ts',
    'skills/buster/engine/test-gates/production.ts'], []],
  ['Security', ['SECURITY_', 'DEPENDENCY_SCAN_', 'IMAGE_SCAN_', 'KUBERNETES_POLICY_',
    'KUBERNETES_RUNTIME_SECURITY_'], [
    'skills/buster/plugins/security-providers/src/common.js',
    'skills/buster/engine/test-gates/security-scan-runtime.ts',
    'skills/buster/engine/test-gates/kubernetes-runtime-security.ts'], []],
  ['Size Budget', ['SIZE_BUDGET_'], ['skills/buster/plugins/size-budget/src/provider.js'], []],
  ['Authenticated Demo Smoke Test', ['DEMO_AUTH_'], [
    'skills/buster/plugins/demo-auth-smoke/src/protocol.js',
    'skills/buster/plugins/demo-auth-smoke/src/provider.js'], []],
  ['Provider And Report Runtime', ['REPORT_ADAPTER_', 'TEST_PROVIDER_', 'TEST_REPORT_', 'TEST_RUNNER_'], [
    'skills/buster/engine/test-gates/process-input.ts',
    'skills/buster/engine/test-gates/report-adapter-runtime.ts',
    'skills/buster/engine/test-gates/runner.ts'], [...processFailures('REPORT_ADAPTER'),
      'TEST_RUNNER_OBSERVABILITY_ROOT_SYMLINK', 'TEST_RUNNER_OBSERVABILITY_ROOT_NOT_DIRECTORY',
      'TEST_RUNNER_ATTEMPT_STORE_ROOT_SYMLINK', 'TEST_RUNNER_ATTEMPT_STORE_ROOT_NOT_DIRECTORY',
      'TEST_RUNNER_ADMISSION_STORE_ROOT_SYMLINK', 'TEST_RUNNER_ADMISSION_STORE_ROOT_NOT_DIRECTORY',
      'TEST_RUNNER_REPOSITORY_OUTSIDE_WORKSPACE',
      'TEST_RUNNER_ATTEMPT_REPOSITORY_OUTSIDE_WORKSPACE']],
];

const excluded = new Set(['PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_JSON_OUTPUT_NAME',
  'PLAYWRIGHT_TEST_BASE_URL']);
const dynamicSentinels = new Map([
  ['skills/buster/engine/test-gates/process-input.ts', ['${options.prefix}_CANCELLED',
    '${options.prefix}_TIMEOUT', '${options.prefix}_STDIN_FAILED', '${options.prefix}_STDOUT_FAILED',
    '${options.prefix}_STDERR_FAILED', '${options.prefix}_OUTPUT_LIMIT', '${prefix}_CLEANUP_FAILED']],
  ['skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', ['${label}_LIMIT_INVALID']],
  ['skills/buster/engine/test-gates/container-build-runtime.ts', ['${label}_LIMIT_INVALID']],
  ['skills/buster/plugins/visual/src/provider.js', ['${code}_TOO_LARGE']],
  ['skills/buster/engine/test-gates/runner.ts', ['${label}_OUTSIDE_WORKSPACE',
    '${label}_SYMLINK', '${label}_NOT_DIRECTORY']],
]);

function sourceText(files) {
  return files.map((file) => {
    const absolute = path.join(root, file);
    assert(fs.existsSync(absolute), `Buster error source is missing: ${file}`);
    const source = fs.readFileSync(absolute, 'utf8');
    for (const sentinel of dynamicSentinels.get(file) ?? []) {
      assert(source.includes(sentinel), `dynamic error construction changed in ${file}: ${sentinel}`);
    }
    return source;
  }).join('\n');
}

function codesFor(prefixes, files, additions) {
  const discovered = sourceText(files).match(/[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}/gu) ?? [];
  return [...new Set([...discovered.filter((code) => prefixes.some((prefix) => code.startsWith(prefix))),
    ...additions])].filter((code) => !excluded.has(code) && !code.startsWith('LEGACY_')).sort();
}

function diagnosis(code) {
  if (/_CANCELLED$/u.test(code)) return ['The attempt received cancellation.', 'Execution stopped before complete evidence existed.', 'Confirm the cancellation owner and inspect cleanup state.', 'Start a new attempt only when the requested cancellation is no longer active.'];
  if (/_TIMEOUT$/u.test(code)) return ['A bounded operation exceeded its time limit.', 'The boundary did not produce complete trusted facts.', 'Check dependency health and whether the configured limit is realistic.', 'Retry only when the provider is retry-safe or the prior side effects are known.'];
  if (/(?:_CLEANUP_|_RELEASE_).*(?:FAILED|INVALID)|_CLEANUP_FAILED$/u.test(code)) return ['Cleanup or ownership release did not complete.', 'Resources or leases can still exist after the attempt.', 'Inspect the recorded resource identity and finish cleanup before reuse.', 'Do not retry the workload until ownership and retained state are known.'];
  if (/(?:INVALID|REQUIRED|MISSING|UNSUPPORTED|DENIED|FORBIDDEN|DUPLICATE|MISMATCH|TOO_LARGE|LIMIT_INVALID)$/u.test(code)) return ['Input, policy, or returned evidence violates a contract.', 'Execution cannot safely continue with the supplied value.', 'Correct the named contract value or policy; do not weaken validation.', 'Retry after correction. An unchanged retry has no value.'];
  if (/(?:NOT_FOUND|UNAVAILABLE|NOT_READY|UNREACHABLE)$/u.test(code)) return ['A required authority, dependency, or input is not available.', 'The provider cannot establish the required evidence.', 'Restore or select the required dependency and verify its identity.', 'Retry after readiness is independently confirmed.'];
  if (/(?:FAILED|ERROR|EXITED|BROKEN_PIPE)$/u.test(code)) return ['An operation or evidence transfer failed.', 'The provider cannot return a trusted complete result.', 'Read the preserved cause and logs, then check the named boundary.', 'Use the provider retry contract and inspect possible side effects first.'];
  if (/(?:EXPIRED|STALE)$/u.test(code)) return ['Time-bound authority or evidence is no longer valid.', 'The old value cannot authorize the current attempt.', 'Issue fresh authority or evidence through its owner.', 'Retry only with the fresh value.'];
  return ['A provider-specific invariant was not satisfied.', 'The boundary refused to claim a trusted result.', 'Use the code name, preserved cause, and linked source to inspect that invariant.', 'Confirm retry safety and attempt state before a new attempt.'];
}

const allCodes = new Set();
const renderedGroups = groups.map(([title, prefixes, files, additions]) => {
  const codes = codesFor(prefixes, files, additions);
  assert(codes.length, `Buster error group has no codes: ${title}`);
  for (const code of codes) {
    assert(!allCodes.has(code), `Buster error code appears in more than one group: ${code}`);
    allCodes.add(code);
  }
  return { title, files: [...new Set(files)].sort(), codes };
});
for (const required of ['KUBERNETES_FIXTURE_MANIFEST_SIZE_LIMIT_INVALID',
  'KUBERNETES_FIXTURE_KUBECTL_STDERR_FAILED', 'VISUAL_MANIFEST_INVALID_TOO_LARGE',
  'REPORT_ADAPTER_TIMEOUT']) assert(allCodes.has(required), `dynamic error is absent: ${required}`);
for (const forbidden of [...excluded, 'LEGACY_A11Y_THRESHOLDS_RETIRED']) {
  assert(!allCodes.has(forbidden), `non-error or retired code entered the reference: ${forbidden}`);
}

const evidenceFiles = [...new Set(groups.flatMap(([, , files]) => files))].sort();
const lines = [
  '# Buster Error Code Reference', '',
  'Status: generated reference',
  'Audience: pipeline author, operator, test maintainer',
  'Owner: buster',
  `Evidence: scripts/generate-buster-error-reference.mjs; ${evidenceFiles.join('; ')}`,
  `Evidence revision: \`${revision}\``,
  'Applies to: exact errors emitted by shipped Buster providers and their execution adapters',
  'Last verified: generated from current error sources on 2026-09-19', '',
  '## How To Use This Reference', '',
  'Find the complete code before you retry. The table separates the likely cause,',
  'effect, corrective action, and retry rule. Always keep the preserved cause and',
  'attempt state with the code. They contain details that the stable code cannot.', '',
  'A failed test assertion is a normal provider result with findings. These codes',
  'identify invalid input, unavailable authority, interrupted execution, invalid',
  'output, or failed evidence handling. Do not translate such an error into a test',
  'failure.', '',
  'Literal codes come from the listed implementation files. Explicit expansions',
  'cover code families that the implementation builds from a checked prefix or',
  'limit name. The generator rejects retired codes and configuration variable names.', '',
];
for (const group of renderedGroups) {
  lines.push(`## ${group.title}`, '', '| Exact code | Likely cause | Effect | Safe action | Retry rule |',
    '| --- | --- | --- | --- | --- |');
  for (const code of group.codes) lines.push(`| \`${code}\` | ${diagnosis(code).join(' | ')} |`);
  lines.push('', '**Source evidence:**', '');
  for (const file of group.files) lines.push(`- [${file}](https://github.com/datrab/kubeclaw/blob/${revision}/${file})`);
  lines.push('');
}
lines.push('## Errors Outside A Provider', '',
  'Plan resolution, remote admission, Worker Core, evidence import, and namespace',
  'reconciliation have separate authorities. Use the family table in the',
  '[suite reference](buster-suites.md#error-codes-and-safe-actions), then continue',
  'with the linked subsystem guide. Do not translate an integrity or admission',
  'error into a failed test assertion.', '', '## Maintenance Rule', '',
  'Change the implementation first. Then run',
  '`node scripts/generate-buster-error-reference.mjs --write`. Review added or',
  'removed codes and their diagnosis class. If code is built dynamically, add an',
  'explicit expansion and a source sentinel in this generator.', '');

const output = `${lines.join('\n')}\n`;
if (process.argv.includes('--write')) {
  fs.writeFileSync(target, output);
  console.log(`wrote ${path.relative(root, target)} (${allCodes.size} codes)`);
} else {
  assert(fs.existsSync(target), 'generated Buster error reference is missing');
  assert.equal(fs.readFileSync(target, 'utf8'), output,
    'generated Buster error reference is stale; run node scripts/generate-buster-error-reference.mjs --write');
  console.log(`Buster error reference verified: ${renderedGroups.length} groups, ${allCodes.size} codes`);
}
