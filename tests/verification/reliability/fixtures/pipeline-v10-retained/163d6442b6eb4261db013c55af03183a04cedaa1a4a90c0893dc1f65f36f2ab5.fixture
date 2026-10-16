import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, parseRuntimeWorkspace, runtimeWorkspaceOwnerFile, type EffectRequest } from '@kubeclaw/plugin-sdk';
import type { OpenClawTarget } from './openclaw.ts';

function directory(value: string): string {
  if (!path.isAbsolute(value) || path.resolve(value) !== value || fs.realpathSync(value) !== value
    || !fs.lstatSync(value).isDirectory()) throw new Error('RUNTIME_WORKSPACE_PATH_INVALID');
  return value;
}

export function workspaceTarget(target: OpenClawTarget, request: EffectRequest): OpenClawTarget {
  if (request.payload.workspaceReference === undefined) return target;
  if (!target.workspaceRoot) throw new Error('RUNTIME_WORKSPACE_ROOT_NOT_CONFIGURED');
  const ref = parseRuntimeWorkspace(request.payload.workspaceReference, request.attempt);
  const root = directory(target.workspaceRoot);
  const repository = directory(target.repositoryRoot);
  const workspace = directory(ref.workspacePath);
  if (ref.workspaceRoot !== root || ref.repositoryRoot !== repository || !workspace.startsWith(`${root}${path.sep}`)
    || workspace === repository) throw new Error('RUNTIME_WORKSPACE_ROOT_MISMATCH');
  const ownerFile = path.join(root, runtimeWorkspaceOwnerFile(workspace));
  directory(path.dirname(ownerFile));
  const descriptor = fs.openSync(ownerFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 32_768) throw new Error('RUNTIME_WORKSPACE_OWNER_INVALID');
    if (canonicalJson(JSON.parse(fs.readFileSync(descriptor, 'utf8'))) !== canonicalJson(ref)) throw new Error('RUNTIME_WORKSPACE_OWNER_MISMATCH');
  } finally { fs.closeSync(descriptor); }
  return { ...target, cwd: workspace, workspaceReference: ref };
}
