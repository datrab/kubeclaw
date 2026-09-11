import assert from 'node:assert/strict';
import { run } from 'node:test';
import { fileURLToPath } from 'node:url';
import { requireNativeReadinessPass } from '../../../../skills/prism/tests/native/worker-readiness-gate.mts';
assert(!process.env.KUBECLAW_PRISM_READINESS_TEST_DATABASE, 'do not exercise SQL in this proof');
const file = fileURLToPath(new URL('../../../../skills/prism/tests/worker-readiness.test.mts', import.meta.url));
for (const [scenario, pattern] of [
  ['original native case skipped for its actual missing prerequisite', '^native PostgreSQL query cancellation settles and releases its actual pool client$'],
  ['zero selected tests despite Node file-level pass', '^NO_SUCH_NATIVE_READINESS_TEST$'],
]) {
  await assert.rejects(requireNativeReadinessPass(run({ files: [file], concurrency: 1, testNamePatterns: [pattern] })),
    /PRISM_NATIVE_READINESS_NOT_VERIFIED/);
  process.stdout.write(JSON.stringify({ scenario, rejectedAsUnverified: true, nativeDatabaseExecution: false }) + '\n');
}
