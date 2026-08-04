import fs from 'node:fs';
import path from 'node:path';
import type { AdapterInvocation } from '@kubeclaw/plugin-sdk';
import type { GitRunner } from './runner.ts';
import { authorizedDirectory, canonicalExistingDirectory, commitMessage, gitRef, gitToken, pathInside, scopedPaths, workspaceDestination } from './values.ts';

interface GitContext { readonly roots: readonly string[]; readonly workspaceRoot: string; readonly runner: GitRunner; }
type Result = Readonly<Record<string, unknown>>;

async function createWorkspace(ctx: GitContext, invocation: AdapterInvocation): Promise<Result> {
  const { request, signal } = invocation;
  const repository = authorizedDirectory(request.payload.repositoryRoot ?? request.resource.canonicalId, ctx.roots, 'repositoryRoot');
  if (request.resource.canonicalId !== repository) throw new Error('GIT_RESOURCE_MISMATCH');
  const workspace = workspaceDestination(request.payload.workspacePath, ctx.workspaceRoot);
  const branch = gitToken(request.payload.branch, 'branch');
  await ctx.runner.run(repository, ['worktree', 'add', '-b', branch, '--', workspace, gitToken(request.payload.baseRef, 'baseRef')], signal);
  const canonical = canonicalExistingDirectory(workspace, 'workspacePath');
  if (!pathInside(canonical, ctx.workspaceRoot)) throw new Error(`GIT_PATH_DENIED:${canonical}`);
  return { workspace: canonical };
}

async function removeWorkspace(ctx: GitContext, invocation: AdapterInvocation): Promise<Result> {
  const { request, signal } = invocation;
  const repository = authorizedDirectory(request.payload.repositoryRoot ?? request.resource.canonicalId, ctx.roots, 'repositoryRoot');
  if (request.resource.canonicalId !== repository) throw new Error('GIT_RESOURCE_MISMATCH');
  const workspace = request.payload.workspacePath;
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace) || path.resolve(workspace) !== workspace || !pathInside(workspace, ctx.workspaceRoot) || workspace === ctx.workspaceRoot) throw new Error(`GIT_PATH_DENIED:${String(workspace)}`);
  const branch = request.payload.branch === undefined ? undefined : gitToken(request.payload.branch, 'branch');
  const existed = fs.existsSync(workspace);
  if (existed) await ctx.runner.run(repository, ['worktree', 'remove', '--force', '--', authorizedDirectory(workspace, [ctx.workspaceRoot], 'workspacePath')], signal);
  if (branch) await ctx.runner.run(repository, ['branch', '-D', '--', branch], signal);
  return { removed: existed, branchRemoved: branch !== undefined };
}

async function syncPaths(ctx: GitContext, workspace: string, invocation: AdapterInvocation): Promise<Result> {
  const { request, signal } = invocation;
  const ref = gitRef(request.payload.ref, 'ref');
  const synced: Array<{ path: string; action: 'created' | 'updated' }> = [];
  const missing: string[] = [];
  for (const file of scopedPaths(request.payload.paths, workspace)) {
    let remote: Result;
    try { remote = await ctx.runner.run(workspace, ['show', `${ref}:${file}`], signal); } catch { missing.push(file); continue; }
    const destination = path.join(workspace, file);
    const local = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : undefined;
    if (local !== undefined && local.trim() === String(remote.stdout).trim()) continue;
    await ctx.runner.run(workspace, ['checkout', ref, '--', file], signal);
    synced.push({ path: file, action: local === undefined ? 'created' : 'updated' });
  }
  return { synced, missing };
}

async function workspaceOperation(ctx: GitContext, workspace: string, invocation: AdapterInvocation): Promise<Result> {
  const { request, signal } = invocation;
  if (request.capability === 'git.commit' && request.operation === 'commit') {
    const paths = scopedPaths(request.payload.paths, workspace);
    await ctx.runner.run(workspace, ['add', '--', ...paths], signal);
    return ctx.runner.run(workspace, ['commit', '-m', commitMessage(request.payload.message), '--', ...paths], signal);
  }
  if (request.capability === 'git.merge' && request.operation === 'merge') return ctx.runner.run(workspace, ['merge', '--no-edit', '--no-ff', gitToken(request.payload.sourceRef, 'sourceRef')], signal);
  if (request.capability === 'git.sync' && request.operation === 'sync_paths') return syncPaths(ctx, workspace, invocation);
  if (request.capability === 'git.sync' && request.operation === 'fetch') return ctx.runner.run(workspace, ['fetch', '--prune', '--', gitToken(request.payload.remote ?? 'origin', 'remote')], signal);
  if (request.capability === 'git.sync' && request.operation === 'rebase') return ctx.runner.run(workspace, ['rebase', '--', gitRef(request.payload.upstreamRef, 'upstreamRef')], signal);
  if (request.capability === 'git.sync' && request.operation === 'push') {
    const remote = gitToken(request.payload.remote ?? 'origin', 'remote');
    return ctx.runner.run(workspace, ['push', '--porcelain', '--', remote, `${gitRef(request.payload.localRef, 'localRef')}:${gitRef(request.payload.remoteRef, 'remoteRef')}`], signal);
  }
  throw new Error(`GIT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
}

export async function invokeGit(ctx: GitContext, invocation: AdapterInvocation): Promise<Result> {
  const { request } = invocation;
  if (request.capability === 'git.workspace.create' && request.operation === 'create') return createWorkspace(ctx, invocation);
  if (request.capability === 'git.workspace.remove' && request.operation === 'remove') return removeWorkspace(ctx, invocation);
  const workspace = authorizedDirectory(request.resource.canonicalId, [ctx.workspaceRoot, ...ctx.roots], 'workspace');
  return workspaceOperation(ctx, workspace, invocation);
}
