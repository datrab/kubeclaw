import { parseDeclaration, validateDeliveryPaths, type Input, type Failure } from './declarations.ts';
import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';

function safePath(value: string, label: string): string {
  if (
    value.length === 0
    || value.includes('\0')
    || /[\r\n]/.test(value)
    || value.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.split(/[\\/]+/).includes('..')
  ) throw new Error(`${label} must be a non-empty repository-relative path without traversal`);
  return value.replaceAll('\\', '/').replace(/\/+$/, '');
}

async function readText(context: PluginInvocationContext, file: string): Promise<string> {
  const response = await context.invoke('git.repository.read', {
    operation: 'read_text',
    resource: { type: 'git.repository.path', canonicalId: file },
    payload: {},
  });
  if (typeof response.content !== 'string') throw new Error('repository adapter returned non-text content');
  return response.content;
}

async function readBlueprint(input: Input, context: PluginInvocationContext): Promise<readonly string[]> {
  const moduleRoot = safePath(input.modulePath, 'modulePath');
  if (input.substeps !== undefined) {
    if (input.substeps.length === 0) throw new Error('FORGE_SUBSTEP_INVALID:at least one substep is required');
    const parts: string[] = [];
    for (const raw of input.substeps) {
      const substep = safePath(raw, 'substep');
      try {
        parts.push(...parseDeclaration(input.moduleId, substep, await readText(context, `${moduleRoot}/${substep}/FORGE.md`)));
      } catch (error) {
        throw new Error(`FORGE_BLUEPRINT_MISSING:${substep}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return parts;
  }
  try {
    return parseDeclaration(input.moduleId, null, await readText(context, `${moduleRoot}/FORGE.md`));
  } catch (error) {
    throw new Error(`FORGE_BLUEPRINT_MISSING:${error instanceof Error ? error.message : String(error)}`);
  }
}

async function report(
  context: PluginInvocationContext,
  input: Input,
  failures: readonly Failure[],
): Promise<ArtifactRef> {
  const stored = await context.invoke('artifacts.write', {
    operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: `preflight-contract:${input.moduleId}` },
    payload: {
      namespace: 'kubeclaw.preflight-contract',
      mediaType: 'application/json',
      value: { moduleId: input.moduleId, passed: failures.length === 0, failures },
    },
  });
  return stored.artifact as ArtifactRef;
}

export async function execute(input: Input, context: PluginInvocationContext): Promise<StageResult> {
  let failures: readonly Failure[];
  try {
    failures = validateDeliveryPaths(input, await readBlueprint(input, context));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('FORGE_DECLARATION_INVALID') ? 'preflight_contract.declaration_invalid'
      : message.startsWith('FORGE_SUBSTEP_INVALID')
      ? 'preflight_contract.substep_invalid'
      : message.includes('must be a non-empty repository-relative')
        ? 'preflight_contract.path_invalid'
        : 'preflight_contract.blueprint_missing';
    const failure = { code, message, nextStep: 'Provide readable, repository-local Forge blueprint files.' };
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'blocked',
      reason: { code, message },
      artifacts: [await report(context, input, [failure])],
    };
  }
  const artifact = await report(context, input, failures);
  if (failures.length > 0) return {
    schemaVersion: 'stage-result.v2',
    outcome: 'request_fix',
    reason: { code: failures[0]!.code, message: failures[0]!.message },
    artifacts: [artifact],
  };
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] };
}
