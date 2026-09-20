import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { executePreCheck, resultForReport } = await import(pathToFileURL(path.resolve('src/stage.ts')).href);
const artifact = {
  artifactId: 'lint:test',
  namespace: 'kubeclaw.lint',
  mediaType: 'application/json',
  digest: `sha256:${'0'.repeat(64)}`,
  sizeBytes: 2,
  producer: {
    runId: 'run:test',
    stageId: 'lint',
    attemptId: 'attempt:test',
  },
};

// Partial summaries used to become passing gates. Only complete validated reports
// may be judged; actual passing/failing tool execution is covered by live-function.
for (const report of [{}, { summary: {} }, { summary: { tools_failed: 0, total_blocking: 0 } },
  { summary: { tools_failed: -1, total_blocking: NaN } }]) {
  assert.throws(() => resultForReport(report, artifact), /report.schema_version/);
}

const wrongTierReport = {
  schema_version: 'pipeline_lint_report.v7',
  policy: {
    schema_version: 'pipeline_lint_policy.v7', digest: '1'.repeat(64), project: 'fixture',
    config_digests: {}, policy_pack_digests: {}, effective_targets: {}, baseline_digest: '2'.repeat(64),
  },
  project: 'fixture', scope: 'full', timestamp: '2026-09-20T00:00:00.000Z', tier: 'full',
  visibility: { debt: false, experimental: false }, changed_files: [], detected_types: [], diagnostics: [], tools: {},
  summary: { total_errors: 0, total_warnings: 0, total_blocking: 0, total_baselined: 0, total_experimental: 0, tools_ok: 0, tools_not_applicable: 0, tools_failed: 0 },
};
await assert.rejects(() => executePreCheck({ workingDirectory: '/tmp/lint-stage-fixture' }, {
  contract: { config: { policyPath: '/tmp/lint-policy.json', policyProject: 'fixture' } },
  async invoke(capability) {
    if (capability === 'lint.execute') return { report: wrongTierReport };
    throw new Error(`unexpected capability: ${capability}`);
  },
}), /report.tier: expected requested tier pre-check/u);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.lint', suite: 'invalid-report-rejection' }));
