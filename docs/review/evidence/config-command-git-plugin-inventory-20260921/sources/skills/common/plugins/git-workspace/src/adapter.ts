import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';
import { invokeGit } from './operations.ts';
import { GitRunner } from './runner.ts';
import { canonicalExistingDirectory, canonicalExecutable, canonicalWorkspaceRoot, identityValue, positiveInteger } from './values.ts';

export function activate(context: AdapterActivationContext): AdapterInstance {
  const configuredRoots = context.config.allowedRepositoryRoots;
  if (!Array.isArray(configuredRoots) || configuredRoots.length === 0) throw new Error('GIT_CONFIG_INVALID:allowedRepositoryRoots');
  const roots = Object.freeze(configuredRoots.map((root, index) => canonicalExistingDirectory(root, `allowedRepositoryRoots[${index}]`)));
  const workspaceRoot = canonicalWorkspaceRoot(context.config.workspaceRoot);
  const runner = new GitRunner({
    executable: canonicalExecutable(context.config.gitExecutable),
    authorName: identityValue(context.config.authorName, 'authorName'),
    authorEmail: identityValue(context.config.authorEmail, 'authorEmail'),
    maxExecutionMs: positiveInteger(context.config.maxExecutionMs, 'maxExecutionMs'),
    maxOutputBytes: positiveInteger(context.config.maxOutputBytes, 'maxOutputBytes'),
    terminationGraceMs: positiveInteger(context.config.terminationGraceMs, 'terminationGraceMs'),
  });
  return {
    async ready() {},
    async invoke(invocation) {
      if (!invocation.confidential) invocation.fence.assertCurrent();
      return invokeGit({ roots, workspaceRoot, runner }, invocation);
    },
    async shutdown() { await runner.shutdown(); },
  };
}
