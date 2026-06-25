// core/git-context.ts — Nova facade for shared repo-scoped Git primitives.

export {
  getRepoRoot,
  gitExec,
  getCurrentBranch,
  headHash,
  invalidateHeadHash,
  setGitRuntimePolicy,
  setRepoRoot,
} from '../git-primitives.ts';
