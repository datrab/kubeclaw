import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProcess, assertNotAborted } from './engine/process.ts';

/** Give lint an isolated checkout of the selected commit, never ambient HEAD. */
export async function withLintCandidate<T>(repository: string, revision: string, execute: (root: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
  assertNotAborted(signal);
  if (!/^[a-f0-9]{40}$/u.test(revision)) throw new Error('LINT_SOURCE_REVISION_INVALID');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-lint-candidate-'));
  const checkout = path.join(temporary, 'repository');
  const git = async (args: string[]) => {
    const result = await runProcess('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      timeout: 60000, maxBuffer: 16 * 1024 * 1024, signal,
    });
    if (!result.ok) throw Object.assign(new Error(`LINT_CANDIDATE_GIT_FAILED:${result.error ?? result.stderr}`), {
      code: result.timedOut ? 'LINT_CANDIDATE_TIMEOUT' : 'LINT_CANDIDATE_GIT_FAILED',
    });
    return result.stdout.trim();
  };
  try {
    await git(['clone', '--shared', '--no-checkout', '--quiet', '--', repository, checkout]);
    await git(['-C', checkout, 'checkout', '--quiet', '--detach', revision, '--']);
    if (await git(['-C', checkout, 'rev-parse', 'HEAD']) !== revision) throw new Error('LINT_SOURCE_REVISION_MISMATCH');
    return await execute(checkout);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
