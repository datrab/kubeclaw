import path from 'path';

import { getRepoRoot } from './git-workflows.ts';
import { CLEANUP_POLICY, cleanupRuntimeResources } from './resource-cleanup.ts';
export {
  buildPreTestVerdict,
  buildSessionCompleteEmbed,
  buildSessionSpawnEmbed,
  buildSuiteArtifactData,
  buildSuiteResultsEmbed,
  buildTaskFailureEmbed,
  buildTimeoutEmbed,
} from './pipeline-embeds.ts';

const ACTIVE_SESSION_STATE_FILE = path.join('.swarm', 'logs', 'buster', 'active-session.json');
type AnyRecord = Record<string, any>;
export {
  buildCompletionIdentityFields,
  clearBusterOutputFile,
  ensureBusterOutputFile,
  resolveBusterAgentResult,
  resolveBusterOutputFilePath,
  resolveBusterRateLimitMaxPauses,
  writeBusterOutputFile,
} from './buster-output.ts';
export function resolveBusterActiveSessionPath(cwd: string = getRepoRoot()): string {
  return path.join(path.resolve(cwd), ACTIVE_SESSION_STATE_FILE);
}

export async function doResourceCleanup(stage: string, payload: Record<string, any> = {}): Promise<any> {
  const hasScopedIdentity = payload && ['run_id', 'module_id', 'gate_id', 'dispatch_id'].some((field) => payload[field]);
  const scopedPayload = hasScopedIdentity ? payload : null;
  const cleanupPolicy = scopedPayload
    ? CLEANUP_POLICY.TASK_SCOPED
    : stage === 'startup'
      ? CLEANUP_POLICY.STARTUP_SWEEP
      : stage === 'shutdown'
        ? CLEANUP_POLICY.SHUTDOWN_SWEEP
        : CLEANUP_POLICY.DISABLED;
  return cleanupRuntimeResources(stage, scopedPayload, { cleanupPolicy });
}
