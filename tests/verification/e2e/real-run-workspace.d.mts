export interface RealE2ERunWorkspace {
  readonly projectName: string;
  readonly worktreePath: string;
  readonly [key: string]: unknown;
}

export function createRealE2ERunWorkspace(options?: {
  readonly mode?: string;
  readonly scenarioId?: string;
}): Promise<RealE2ERunWorkspace>;

export function cleanupRealE2ERunWorkspace(
  workspace: RealE2ERunWorkspace,
  options?: { readonly keepArtifacts?: boolean },
): Promise<unknown>;
