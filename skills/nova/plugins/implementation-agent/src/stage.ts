import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import { repairEvidence } from './repair-evidence.ts';
import { approvedSource, parseRuntimeWorkspace, type RuntimeWorkspaceReference } from '@kubeclaw/plugin-sdk';
import { attemptWorkspace } from './workspace.ts';
import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import {
  buildRequest,
  parseCompletion,
  type ImplementationCompletion,
  type ImplementationInput,
} from './protocol.ts';

async function createWorkspace(input: ImplementationInput, context: PluginInvocationContext, approval: Awaited<ReturnType<typeof approvedSource>>): Promise<RuntimeWorkspaceReference | undefined> {
  if (!input.workspace) {
    if (approval) throw new Error('SOURCE_APPROVAL_WORKSPACE_REQUIRED');
    return undefined;
  }
  const created = await context.invoke('git.workspace.create', {
    operation: 'create', resource: { type: 'git.repository', canonicalId: input.workspace.repositoryRoot },
    payload: {
      repositoryRoot: input.workspace.repositoryRoot, workspacePath: input.workspace.workspacePath,
      branch: input.workspace.branch, baseRef: context.contract.guidance?.repairRequest ? 'HEAD' : input.workspace.baseRef,
      ...(approval ? { approvedSource: approval } : {}),
    },
  });
  if (typeof created.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/u.test(created.sourceRevision)) throw new Error('IMPLEMENTATION_SOURCE_REVISION_INVALID');
  const ref = parseRuntimeWorkspace(created.workspaceReference, context.contract.lease.attempt);
  if (ref.repositoryRoot !== input.workspace.repositoryRoot || ref.workspacePath !== input.workspace.workspacePath
    || ref.branch !== input.workspace.branch || ref.sourceRevision !== created.sourceRevision) throw new Error('IMPLEMENTATION_WORKSPACE_REFERENCE_MISMATCH');
  return ref;
}

async function dispatchImplementation(
  agent: string, input: ImplementationInput, context: PluginInvocationContext, evidence: string | undefined,
): Promise<ImplementationCompletion> {
  const response = await context.invoke('runtime.dispatch', {
    operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
    payload: buildRequest(agent, input, [context.contract.guidance?.helperPrompt, evidence].filter(Boolean).join('\n\n')),
  });
  return parseCompletion(response.result, input);
}

async function integrateWorkspace(
  input: ImplementationInput, completion: ImplementationCompletion, context: PluginInvocationContext,
  approval: Awaited<ReturnType<typeof approvedSource>>,
): Promise<string | undefined> {
  if (!input.workspace || completion.status !== 'ready_for_testing') return undefined;
  const committed = await context.invoke('git.commit', {
    operation: 'commit', resource: { type: 'git.workspace', canonicalId: input.workspace.workspacePath },
    payload: { paths: completion.changedPaths, message: input.workspace.commitMessage, workspaceReference: input.workspaceReference,
      expectedParent: input.workspaceReference?.sourceRevision },
  });
  if (typeof committed.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/u.test(committed.sourceRevision)) throw new Error('IMPLEMENTATION_SOURCE_REVISION_INVALID');
  const merged = await context.invoke('git.merge', {
    operation: 'merge', resource: { type: 'git.repository', canonicalId: input.workspace.mergeTarget },
    payload: { sourceRef: input.workspace.branch, sourceRevision: committed.sourceRevision, workspaceReference: input.workspaceReference, ...(approval ? { approvedSource: approval } : {}) },
  });
  if (typeof merged.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/u.test(merged.sourceRevision)) throw new Error('IMPLEMENTATION_SOURCE_REVISION_INVALID');
  return merged.sourceRevision;
}

async function removeWorkspace(input: ImplementationInput, context: PluginInvocationContext): Promise<void> {
  if (!input.workspace) return;
  await context.invoke('git.workspace.remove', {
    operation: 'remove', resource: { type: 'git.repository', canonicalId: input.workspace.repositoryRoot },
    payload: {
      repositoryRoot: input.workspace.repositoryRoot, workspacePath: input.workspace.workspacePath,
      branch: input.workspace.branch,
      workspaceReference: input.workspaceReference,
    },
  });
}

function blockedFailure(error: Error | undefined, input: ImplementationInput, retained: boolean): StageResult {
  return { schemaVersion: 'stage-result.v2', outcome: 'blocked',
    reason: { code: error?.message.startsWith('EFFECT_') ? 'implementation.effect_reconciliation_required' : 'implementation.invalid_completion',
      message: error?.message ?? 'implementation completion missing',
      ...(retained && input.workspace ? { details: { retainedWorkspace: input.workspace.workspacePath, branch: input.workspace.branch, headBefore: input.headBefore, workspaceReference: input.workspaceReference } } : {}) }, artifacts: [] };
}

export async function execute(input: ImplementationInput, context: PluginInvocationContext): Promise<StageResult> {
  input = { ...input, runId: context.contract.lease.attempt.runId, attempt: context.contract.lease.attempt.attemptNumber };
  input = attemptWorkspace(input, context.contract.lease.attempt);

  const agent = context.contract.config.agent;
  if (typeof agent !== 'string' || !agent.trim()) throw new Error('implementation agent is not configured');
  let completion;
  let workspaceCreated = false;
  let workspaceIntegrated: string | undefined;
  let workspaceFailure: Error | undefined;
  let cleanupFailure: Error | undefined;
  let subjectDigest: string | undefined;
  try {
    const evidence = await repairEvidence(context);
    const approval = await approvedSource(context, input.sourceBinding);
    subjectDigest = approval?.subject.digest;
    const workspaceReference = await createWorkspace(input, context, approval);
    workspaceCreated = workspaceReference !== undefined;
    if (workspaceReference) input = { ...input, headBefore: workspaceReference.sourceRevision, workspaceReference };
    completion = await dispatchImplementation(agent, input, context, evidence);
    workspaceIntegrated = await integrateWorkspace(input, completion, context, approval);
  } catch (error) {
    workspaceFailure = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (input.workspace && workspaceIntegrated) {
      try {
        await removeWorkspace(input, context);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        cleanupFailure = failure;
      }
    }
  }
  if (workspaceFailure || !completion) return blockedFailure(workspaceFailure, input, workspaceCreated && !workspaceIntegrated);
  return storeCompletion(input, completion, context, workspaceCreated, workspaceIntegrated, cleanupFailure, subjectDigest);
}

async function storeCompletion(
  input: ImplementationInput, completion: ImplementationCompletion, context: PluginInvocationContext,
  workspaceCreated: boolean, workspaceIntegrated: string | undefined, cleanupFailure: Error | undefined,
  subjectDigest?: string,
): Promise<StageResult> {
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `implementation:${input.moduleId}:${input.attempt}` },
    payload: { namespace: 'kubeclaw.implementation-agent', encoding: PORTABLE_JSON_ENCODING, mediaType: 'application/json', value: { ...completion, sourceRevision: workspaceIntegrated ?? null, headBefore: input.headBefore, ...(subjectDigest ? { subjectDigest } : {}),
      ...(workspaceCreated && !workspaceIntegrated && input.workspace ? { retainedWorkspace: input.workspace.workspacePath, branch: input.workspace.branch, workspaceReference: input.workspaceReference } : {}) } },
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
          workspaceReference: input.workspaceReference,
          sourceRevision: workspaceIntegrated,
        },
      },
    });
    artifacts.push(cleanup.artifact as ArtifactRef);
  }
  return completion.status === 'ready_for_testing'
    ? { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts, ...(workspaceIntegrated ? { facts: { 'implementation.source_revision': workspaceIntegrated } } : {}) }
    : { schemaVersion: 'stage-result.v2', outcome: 'blocked',
        reason: { code: 'implementation.blocked', message: completion.summary }, artifacts };
}
