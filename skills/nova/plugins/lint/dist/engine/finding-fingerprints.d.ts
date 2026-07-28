declare function findingFingerprint(toolId: string, repoRoot: string, finding: Record<string, any>): string;
declare function normalizeFindings(ctx: Record<string, any>, toolId: string, findings: unknown[]): Record<string, any>[];
export { findingFingerprint, normalizeFindings, };
