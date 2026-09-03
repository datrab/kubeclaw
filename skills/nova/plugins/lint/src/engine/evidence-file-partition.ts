import path from 'node:path';

import { requireToolExecution, safeExec } from './execution.ts';

export interface EvidenceFilePartition {
  readonly production: readonly string[];
  readonly tests: readonly string[];
  readonly generatedOrUntracked: readonly string[];
}

function repositoryRelative(repositoryRoot: string, file: string): string {
  return path.relative(repositoryRoot, file).split(path.sep).join('/');
}

function isGenerated(file: string): boolean {
  return /(^|\/)generated(\/|$)/u.test(file);
}

function isTestOrFixture(file: string): boolean {
  return /(^|\/)(?:test|tests|__tests__|fixtures)(\/|$)/u.test(file)
    || /\.(?:test|spec)\.[^/]+$/u.test(file);
}

function trackedFiles(repositoryRoot: string): ReadonlySet<string> {
  const result = requireToolExecution(safeExec(
    'git', ['ls-files', '--cached', '-z'], { cwd: repositoryRoot },
  ), 'eslint-type-evidence-source-classification');
  if (result.exitCode !== 0) {
    throw Object.assign(new Error('Git could not enumerate tracked files for the type-evidence partition.'), {
      code: 'eslint-type-evidence-source-classification-failed',
    });
  }
  return new Set(result.stdout.split('\0').filter(Boolean));
}

export function partitionEvidenceFiles(
  repositoryRoot: string,
  files: readonly string[],
): EvidenceFilePartition {
  const tracked = trackedFiles(repositoryRoot);
  const production: string[] = [];
  const tests: string[] = [];
  const generatedOrUntracked: string[] = [];

  for (const file of files) {
    const relative = repositoryRelative(repositoryRoot, file);
    if (!tracked.has(relative) || isGenerated(relative)) generatedOrUntracked.push(file);
    else if (isTestOrFixture(relative)) tests.push(file);
    else production.push(file);
  }

  return Object.freeze({
    production: Object.freeze(production),
    tests: Object.freeze(tests),
    generatedOrUntracked: Object.freeze(generatedOrUntracked),
  });
}
