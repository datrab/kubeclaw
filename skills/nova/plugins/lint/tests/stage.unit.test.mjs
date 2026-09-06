import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { resultForReport } = await import(pathToFileURL(path.resolve('src/stage.ts')).href);
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

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.lint', suite: 'invalid-report-rejection' }));
