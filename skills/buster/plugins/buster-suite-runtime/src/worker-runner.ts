import fs from 'node:fs';
import path from 'node:path';
import { materializeRepositoryValues, parseJob, RESULT_SCHEMA } from './protocol.ts';
import { runSuites } from './runtime/runners/suite-runner.ts';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`BUSTER_WORKER_RUNNER_ENV_REQUIRED:${name}`);
  return value;
}

async function main(): Promise<void> {
  const [jobFile, repositoryRoot] = process.argv.slice(2);
  if (!jobFile || !repositoryRoot) throw new Error('BUSTER_WORKER_RUNNER_ARGS_INVALID');
  const maxArchiveBytes = Number(requiredEnvironment('BUSTER_V2_MAX_ARCHIVE_BYTES'));
  const job = parseJob(JSON.parse(fs.readFileSync(jobFile, 'utf8')), maxArchiveBytes);
  const testConfig = materializeRepositoryValues(job.testConfig, repositoryRoot) as Record<string, unknown>;
  const task = materializeRepositoryValues(job.task, repositoryRoot) as Record<string, unknown>;
  const result = await runSuites(job.suites, {
    repoRoot: path.resolve(repositoryRoot),
    payload: {
      ...task,
      test_config: testConfig,
      capabilities: job.capabilities,
    },
    ...(job.moduleId === undefined ? {} : { moduleId: job.moduleId }),
    ...(job.attempt === undefined ? {} : { attempt: job.attempt }),
    capabilities: job.capabilities,
  });
  fs.writeFileSync(3, `${JSON.stringify({
    schemaVersion: RESULT_SCHEMA,
    jobId: job.jobId,
    results: result.results,
    suiteSummary: result.suiteSummary,
    suiteDetailSummary: result.suiteDetailSummary,
    criticalFailed: result.criticalFailed,
    completedAt: new Date().toISOString(),
  })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
