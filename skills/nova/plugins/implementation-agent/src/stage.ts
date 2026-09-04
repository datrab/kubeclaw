import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import {
  buildRequest,
  parseCompletion,
  type ImplementationCompletion,
  type ImplementationInput,
} from './protocol.ts';

async function createWorkspace(input: ImplementationInput, context: PluginInvocationContext): Promise<boolean> {
  if (!input.workspace) return false;
  await context.invoke('git.workspace.create', {
    operation: 'create', resource: { type: 'git.repository', canonicalId: input.workspace.repositoryRoot },
    payload: {
      repositoryRoot: input.workspace.repositoryRoot, workspacePath: input.workspace.workspacePath,
      branch: input.workspace.branch, baseRef: input.workspace.baseRef,
    },
  });
  return true;
}

async function dispatchImplementation(
  agent: string, input: ImplementationInput, context: PluginInvocationContext,
): Promise<ImplementationCompletion> {
  const response = await context.invoke('runtime.dispatch', {
    operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
    payload: buildRequest(agent, input, context.contract.guidance?.helperPrompt),
  });
  return parseCompletion(response.result, input);
}

async function integrateWorkspace(
  input: ImplementationInput, completion: ImplementationCompletion, context: PluginInvocationContext,
): Promise<boolean> {
  if (!input.workspace || completion.status !== 'ready_for_testing') return false;
  await context.invoke('git.commit', {
    operation: 'commit', resource: { type: 'git.workspace', canonicalId: input.workspace.workspacePath },
    payload: { paths: completion.changedPaths, message: input.workspace.commitMessage },
  });
  await context.invoke('git.merge', {
    operation: 'merge', resource: { type: 'git.repository', canonicalId: input.workspace.mergeTarget },
    payload: { sourceRef: input.workspace.branch },
  });
  return true;
}

async function removeWorkspace(input: ImplementationInput, context: PluginInvocationContext): Promise<void> {
  if (!input.workspace) return;
  await context.invoke('git.workspace.remove', {
    operation: 'remove', resource: { type: 'git.repository', canonicalId: input.workspace.repositoryRoot },
    payload: {
      repositoryRoot: input.workspace.repositoryRoot, workspacePath: input.workspace.workspacePath,
      branch: input.workspace.branch,
    },
  });
}

function blockedFailure(error: Error | undefined): StageResult {
  return { schemaVersion: 'stage-result.v2', outcome: 'blocked',
    reason: { code: 'implementation.invalid_completion', message: error?.message ?? 'implementation completion missing' }, artifacts: [] };
}

export async function execute(input: ImplementationInput, context: PluginInvocationContext): Promise<StageResult> {
  const agent = context.contract.config.agent;
  if (typeof agent !== 'string' || !agent.trim()) throw new Error('implementation agent is not configured');
  let completion;
  let workspaceCreated = false;
  let workspaceIntegrated = false;
  let workspaceFailure: Error | undefined;
  let cleanupFailure: Error | undefined;
  try {
    workspaceCreated = await createWorkspace(input, context);
    completion = await dispatchImplementation(agent, input, context);
    workspaceIntegrated = await integrateWorkspace(input, completion, context);
  } catch (error) {
    workspaceFailure = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (input.workspace && workspaceCreated) {
      try {
        await removeWorkspace(input, context);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (workspaceIntegrated) cleanupFailure = failure;
        else workspaceFailure ??= failure;
      }
    }
  }
  if (workspaceFailure || !completion) return blockedFailure(workspaceFailure);
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `implementation:${input.moduleId}:${input.attempt}` },
    payload: { namespace: 'kubeclaw.implementation-agent', mediaType: 'application/json', value: completion },
  });
  const artifacts = [stored.artifact as ArtifactRef];
  if (cleanupFailure) {
    const cleanup = await context.invoke('artifacts.write', {
      operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: `implementation-cleanup:${input.moduleId}:${input.attempt}` },
      payload: {
        namespace: 'kubeclaw.implementation-agent',
        mediaType: 'application/json',
        value: {
          schemaVersion: 'implementation-cleanup.v1',
          status: 'failed',
          message: cleanupFailure.message,
        },
      },
    });
    artifacts.push(cleanup.artifact as ArtifactRef);
  }
  return completion.status === 'ready_for_testing'
    ? { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts }
    : { schemaVersion: 'stage-result.v2', outcome: 'blocked',
        reason: { code: 'implementation.blocked', message: completion.summary }, artifacts };
}
