import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Give lint an isolated checkout of the selected commit, never ambient HEAD. */
export async function withLintCandidate<T>(repository: string, revision: string, execute: (root: string) => Promise<T>): Promise<T> {
  if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error('LINT_SOURCE_REVISION_INVALID');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-lint-candidate-'));
  const checkout = path.join(temporary, 'repository');
  const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  try {
    git(['clone', '--shared', '--no-checkout', '--quiet', '--', repository, checkout]);
    git(['-C', checkout, 'checkout', '--quiet', '--detach', revision, '--']);
    if (git(['-C', checkout, 'rev-parse', 'HEAD']) !== revision) throw new Error('LINT_SOURCE_REVISION_MISMATCH');
    return await execute(checkout);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
