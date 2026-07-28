import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
interface Input {
  readonly blueprintId: string;
  readonly repositoryRoot: string;
  readonly branchRef: string;
  readonly controlPaths: readonly string[];
}
export function validateInput(input: Input): void {
  if (!input.blueprintId || !input.repositoryRoot || !input.branchRef) throw new Error('BLUEPRINT_SYNC_INPUT_INVALID');
  if (!Array.isArray(input.controlPaths) || input.controlPaths.length === 0) throw new Error('BLUEPRINT_SYNC_PATHS_REQUIRED');
  if (new Set(input.controlPaths).size !== input.controlPaths.length) throw new Error('BLUEPRINT_SYNC_PATHS_DUPLICATE');
}
export async function execute(input: Input, context: PluginInvocationContext): Promise<StageResult> {
  validateInput(input);
  const sync = await context.invoke('git.sync', {
    operation: 'sync_paths',
    resource: { type: 'git.repository', canonicalId: input.repositoryRoot },
    payload: { ref: input.branchRef, paths: input.controlPaths },
  });
  const synced = Array.isArray(sync.synced) ? sync.synced : [];
  const missing = Array.isArray(sync.missing) ? sync.missing : [];
  if (synced.length > 0) {
    await context.invoke('git.commit', {
      operation: 'commit', resource: { type: 'git.repository', canonicalId: input.repositoryRoot },
      payload: {
        paths: synced.map((entry) => (entry as Record<string, unknown>).path),
        message: `[blueprint-sync] Sync ${synced.length} control file(s) from architecture`,
      },
    });
  }
  const summary = { blueprintId: input.blueprintId, branchRef: input.branchRef, synced, missing };
  await context.invoke('state.append', {
    operation: 'append', resource: { type: 'state.namespace', canonicalId: 'kubeclaw.blueprint-sync' },
    payload: { type: 'blueprint.controls.synced', ...summary },
  });
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `blueprint-sync:${input.blueprintId}` },
    payload: { namespace: 'kubeclaw.blueprint-sync', mediaType: 'application/json', value: summary },
  });
  const artifacts = [stored.artifact as ArtifactRef];
  if (missing.length > 0) {
    return {
      schemaVersion: 'stage-result.v2', outcome: 'request_fix',
      reason: { code: 'blueprint.control_files_missing', message: `${missing.length} declared control file(s) are absent`, details: { missing } },
      artifacts,
    };
  }
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts };
}
