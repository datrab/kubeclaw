import { sourcePreflight, captureReviewSubject, verifyReviewSubject, type ArtifactRef, type PluginInvocationContext, type ReviewSubject, type StageResult } from '@kubeclaw/plugin-sdk';
import { buildArchitectureRequest, type ArchitectureInput } from './protocol.ts';
import { parseArchitectureOutput } from './output.ts';
async function reviewedInput(input: ArchitectureInput, context: PluginInvocationContext): Promise<ArchitectureInput> {
  if (input.sourceBinding) {
    const bound = await sourcePreflight(input.sourceBinding, context);
    return {...input,subject:bound.subject,architecture:bound.contract};
  }
  const subject = input.source ? await captureReviewSubject(input.source, {task:input.task,architecture:input.architecture ?? {}}, context) : undefined;
  return {...input,...(subject ? {subject}:{})};
}
export async function execute(input: ArchitectureInput, context: PluginInvocationContext): Promise<StageResult> {
  const agent = context.contract.config.agent;
  if (typeof agent !== 'string' || !agent.trim()) throw new Error('architecture validator agent is not configured');
  let output: ReturnType<typeof parseArchitectureOutput>;
  let subject: ReviewSubject | undefined;
  try {
    input = await reviewedInput(input, context);
    subject = input.subject;
    if (subject) await verifyReviewSubject(subject, context);
    output = parseArchitectureOutput(await context.invoke('runtime.dispatch', {
      operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
      payload: withRuntimeDispatchProfile(buildArchitectureRequest(agent, { ...input, ...(subject ? { subject } : {}) }, context.contract.guidance?.helperPrompt), context.contract.runtimeDispatchProfile),
    }));
    if (subject) {
      if (subject.paths.some(file => !output.checkedFiles.includes(file))) throw new Error('REVIEW_SUBJECT_COVERAGE_MISSING');
      await verifyReviewSubject(subject, context);
    }
  } catch (error) {
    return {
      schemaVersion: 'stage-result.v2', outcome: 'blocked',
      reason: { code: 'architecture.invalid_output', message: error instanceof Error ? error.message : String(error) },
      artifacts: [],
    };
  }
  const report = await context.invoke('artifacts.write', {
    operation: 'put_json', resource: { type: 'artifact.object', canonicalId: 'architecture-validation' },
    payload: { ...(subject?.identityEncoding ? {encoding:subject.identityEncoding} : {}), namespace: 'kubeclaw.architecture-validator', mediaType: 'application/json', value: { ...output, ...(subject ? { subject } : {}) } },
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
import { withRuntimeDispatchProfile } from '@kubeclaw/plugin-sdk';
