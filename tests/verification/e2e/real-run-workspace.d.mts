export interface RealE2ERunWorkspace {
  readonly runId: string;
  readonly projectName: string;
  readonly worktreePath: string;
  readonly artifactRoot: string;
  readonly swarmDir: string;
  readonly [key: string]: unknown;
}

export interface RealE2EProgress {
  readonly real_e2e: {
    coverage_base_revision?: string;
    readonly [key: string]: unknown;
  };
  readonly modules: Record<string, Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export function buildProgress(options?: {
  readonly projectName?: string;
  readonly runId?: string;
  readonly moduleIds?: readonly string[];
}): RealE2EProgress;

export function writeRealE2ESwarmFiles(swarmDir: string, progress: RealE2EProgress): void;

export function createRealE2ERunWorkspace(options?: {
  readonly mode?: string;
  readonly scenarioId?: string;
}): Promise<RealE2ERunWorkspace>;

export function cleanupRealE2ERunWorkspace(
  workspace: RealE2ERunWorkspace,
  options?: { readonly keepArtifacts?: boolean },
): Promise<unknown>;
