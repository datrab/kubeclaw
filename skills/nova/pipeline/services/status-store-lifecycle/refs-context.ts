import { getActiveContext } from "../../core/logger.ts";
import { selectTruthyValue } from "../../optional-absence.ts";

function firstText(...values: any[]): string | null {
  for (const value of values)
    if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}
export function getActiveProgress(config: any): any {
  const context = getActiveContext() as any;
  return selectTruthyValue(
    () => context?.progress,
    () => config?._progress ?? null,
  );
}
export function resolveModuleConfig(
  progress: any,
  moduleId: any,
  dir: any,
): any {
  if (!progress?.modules) return null;
  if (moduleId && progress.modules[moduleId]) return progress.modules[moduleId];
  return (
    Object.values(progress.modules).find((mod: any) => mod?.dir === dir) ?? null
  );
}
export function resolveModuleCommit(status: any): string | null {
  return firstText(
    status?.commit_hash,
    status?.forge_commit_hash,
    status?.buster_commit_hash,
    status?.forge_commit,
    status?.buster_commit,
  );
}
