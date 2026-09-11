import { run } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const nativeName = 'native PostgreSQL query cancellation settles and releases its actual pool client';
const originalTest = fileURLToPath(new URL('../worker-readiness.test.mts', import.meta.url));

type Summary = { success: boolean; counts: { tests: number; passed: number; skipped: number; cancelled: number; todo: number } };
function fullyPassed(summary: Summary | undefined, nativePasses: number, failures: number): boolean {
  return Boolean(summary?.success && nativePasses === 1 && failures === 0 && summary.counts.tests === 1
    && summary.counts.passed === 1 && summary.counts.skipped === 0
    && summary.counts.cancelled === 0 && summary.counts.todo === 0);
}

/** Inspect actual Node runner events; a file-level pass or skipped test is insufficient. */
export async function requireNativeReadinessPass(events: ReturnType<typeof run>): Promise<void> {
  let nativePasses = 0, failures = 0;
  let summary: Summary | undefined;
  for await (const event of events) {
    if (event.type === 'test:pass' && event.data.name === nativeName
      && !event.data.skip && !event.data.todo) nativePasses++;
    if (event.type === 'test:fail') failures++;
    if (event.type === 'test:summary') summary = event.data;
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      process.stdout.write(JSON.stringify({ event: event.type, name: event.data.name,
        skip: event.data.skip ?? false, todo: event.data.todo ?? false }) + '\n');
    }
  }
  if (!fullyPassed(summary, nativePasses, failures)) {
    throw new Error(`PRISM_NATIVE_READINESS_NOT_VERIFIED:${JSON.stringify({ nativePasses, failures, summary })}`);
  }
  process.stdout.write(JSON.stringify({ nativeReadinessVerified: true, tests: 1, passed: 1, skipped: 0 }) + '\n');
}

async function main(): Promise<void> {
  if (!process.env.KUBECLAW_PRISM_READINESS_TEST_DATABASE?.trim()) {
    throw new Error('REAL_POSTGRES_DATABASE_REQUIRED: configure an isolated migrated native test database');
  }
  await requireNativeReadinessPass(run({ files: [originalTest], concurrency: 1,
    testNamePatterns: [`^${nativeName}$`] }));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
