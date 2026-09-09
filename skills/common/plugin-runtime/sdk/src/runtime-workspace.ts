import type { AttemptIdentity } from './generated/contracts.ts';
import { canonicalJson, sha256Text } from './values.ts';

/** Issued by the Git adapter; the runtime verifies the protected owner record. */
export interface RuntimeWorkspaceReference {
  readonly schemaVersion: 'runtime-workspace.v1';
  readonly repositoryRoot: string;
  readonly workspaceRoot: string;
  readonly workspacePath: string;
  readonly branch: string;
  readonly sourceRevision: string;
  readonly owner: AttemptIdentity;
}

export function runtimeWorkspaceGeneration(owner: AttemptIdentity, scope: Readonly<{ repositoryRoot: string; branch: string }>): string {
  return sha256Text(canonicalJson({ owner, repositoryRoot: scope.repositoryRoot, branch: scope.branch })).slice(7);
}

export function runtimeWorkspaceOwnerFile(workspacePath: string): string {
  return `.kubeclaw-workspace-owners/${sha256Text(workspacePath).slice(7)}.json`;
}

export function parseRuntimeWorkspace(value: unknown, owner: AttemptIdentity): RuntimeWorkspaceReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RUNTIME_WORKSPACE_REFERENCE_INVALID');
  const ref = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'repositoryRoot', 'workspaceRoot', 'workspacePath', 'branch', 'sourceRevision', 'owner'];
  if (Object.keys(ref).length !== keys.length || Object.keys(ref).some((key) => !keys.includes(key))) throw new Error('RUNTIME_WORKSPACE_REFERENCE_INVALID');
  if (ref.schemaVersion !== 'runtime-workspace.v1' || typeof ref.sourceRevision !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(ref.sourceRevision)) throw new Error('RUNTIME_WORKSPACE_REFERENCE_INVALID');
  for (const key of ['repositoryRoot', 'workspaceRoot', 'workspacePath', 'branch']) {
    if (typeof ref[key] !== 'string' || !ref[key] || ref[key].length > 4096 || /[\u0000-\u001f\u007f]/u.test(ref[key])) throw new Error('RUNTIME_WORKSPACE_REFERENCE_INVALID');
  }
  if (canonicalJson(ref.owner) !== canonicalJson(owner)) throw new Error('RUNTIME_WORKSPACE_OWNER_MISMATCH');
  return value as RuntimeWorkspaceReference;
}
