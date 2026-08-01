import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { buildRequest, parseCompletion, type ImplementationInput } from './protocol.js';
export async function execute(input: ImplementationInput, context: PluginInvocationContext): Promise<StageResult> {
  const agent = context.contract.config.agent;
  if (typeof agent !== 'string' || !agent.trim()) throw new Error('implementation agent is not configured');
  let completion;
  let workspaceCreated = false;
  let workspaceFailure: Error | undefined;
  try {
    if (input.workspace) {
      await context.invoke('git.workspace.create', {
        operation: 'create',
        resource: { type: 'git.repository', canonicalId: input.workspace.repositoryRoot },
        payload: {
          repositoryRoot: input.workspace.repositoryRoot,
          workspacePath: input.workspace.workspacePath,
          branch: input.workspace.branch,
          baseRef: input.workspace.baseRef,
        },
      });
      workspaceCreated = true;
    }
    const response = await context.invoke('runtime.dispatch', {
      operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
      payload: buildRequest(agent, input, context.contract.guidance?.helperPrompt),
    });
    completion = parseCompletion(response.result, input);
    if (input.workspace && completion.status === 'ready_for_testing') {
      await context.invoke('git.commit', {
        operation: 'commit',
        resource: { type: 'git.workspace', canonicalId: input.workspace.workspacePath },
        payload: { paths: completion.changedPaths, message: input.workspace.commitMessage },
      });
      await context.invoke('git.merge', {
        operation: 'merge',
        resource: { type: 'git.repository', canonicalId: input.workspace.mergeTarget },
        payload: { sourceRef: input.workspace.branch },
      });
    }
  } catch (error) {
    workspaceFailure = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (input.workspace && workspaceCreated) {
      try {
        await context.invoke('git.workspace.remove', {
          operation: 'remove',
          resource: { type: 'git.repository', canonicalId: input.workspace.repositoryRoot },
          payload: {
            repositoryRoot: input.workspace.repositoryRoot,
            workspacePath: input.workspace.workspacePath,
            branch: input.workspace.branch,
          },
        });
      } catch (error) {
        workspaceFailure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
  }
  if (workspaceFailure || !completion) return { schemaVersion: 'stage-result.v2', outcome: 'blocked',
    reason: { code: 'implementation.invalid_completion', message: workspaceFailure?.message ?? 'implementation completion missing' }, artifacts: [] };
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `implementation:${input.moduleId}:${input.attempt}` },
    payload: { namespace: 'kubeclaw.implementation-agent', mediaType: 'application/json', value: completion },
  });
  const artifacts = [stored.artifact as ArtifactRef];
  return completion.status === 'ready_for_testing'
    ? { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts }
    : { schemaVersion: 'stage-result.v2', outcome: 'blocked',
        reason: { code: 'implementation.blocked', message: completion.summary }, artifacts };
}
