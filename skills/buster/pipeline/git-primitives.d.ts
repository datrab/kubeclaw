export function getRepoRoot(startDir?: string): string;
export function gitExec(repoRoot: string, args: string[], opts?: Record<string, unknown>): string;
export function getCurrentBranch(repoRoot?: string): string;
