import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { buildArchitectureRequest, type ArchitectureInput } from './protocol.ts';
import { parseArchitectureOutput } from './output.ts';
export async function execute(input: ArchitectureInput, context: PluginInvocationContext): Promise<StageResult> {
  const agent = context.contract.config.agent;
  if (typeof agent !== 'string' || !agent.trim()) throw new Error('architecture validator agent is not configured');
  let output;
  try {
    output = parseArchitectureOutput(await context.invoke('runtime.dispatch', {
      operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
      payload: buildArchitectureRequest(agent, input, context.contract.guidance?.helperPrompt),
    }));
  } catch (error) {
    return {
      schemaVersion: 'stage-result.v2', outcome: 'blocked',
      reason: { code: 'architecture.invalid_output', message: error instanceof Error ? error.message : String(error) },
      artifacts: [],
    };
  }
  const report = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'architecture-validation' },
    payload: { namespace: 'kubeclaw.architecture-validator', mediaType: 'application/json', value: output },
  });
  const artifacts = [report.artifact as ArtifactRef];
  if (output.verdict === 'passed') {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'passed',
      artifacts,
      facts: {
        'architecture.review': output.findings.length > 0 ? 'approval_required' : 'clean',
      },
    };
  }
  return {
    schemaVersion: 'stage-result.v2', outcome: 'blocked',
    reason: {
      code: 'architecture.blocked',
      message: output.summary, details: { findings: output.findings, checkedFiles: output.checkedFiles },
    },
    artifacts,
  };
}
