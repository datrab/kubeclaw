import { runtimeWorkspaceGeneration, type AttemptIdentity } from '@kubeclaw/plugin-sdk';
import type { ImplementationInput } from './protocol.ts';

export function attemptWorkspace(input: ImplementationInput, owner: AttemptIdentity): ImplementationInput {
  if (!input.workspace) return input;
  const generation = runtimeWorkspaceGeneration(owner, input.workspace);
  return { ...input, workspace: { ...input.workspace,
    workspacePath: `${input.workspace.workspacePath}-g-${generation}`,
    branch: `${input.workspace.branch}-g-${generation}`,
  } };
}
