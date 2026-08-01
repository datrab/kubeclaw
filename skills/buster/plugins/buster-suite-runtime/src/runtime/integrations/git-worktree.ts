// integrations/git-worktree.ts — Buster facade for shared pipeline Git worktree policy.
//
// Runtime image packaging overlays the shared canonical implementation on this
// path so package-local imports stay under /app/skills/pipeline.

export * from '../../../common/pipeline/integrations/git-worktree.js';
