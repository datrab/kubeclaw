import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { buildRequest, parseVerdict, type SuiteEvidence, type TestInput } from './protocol.ts';

function providerEvidence(response: Readonly<Record<string, unknown>>): readonly SuiteEvidence[] {
  if (response.schemaVersion !== 'test-plan-receipt.v1' || response.provider !== 'buster-plan-v1'
    || typeof response.resultDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(response.resultDigest)) {
    throw new Error('TEST_PLAN_RECEIPT_INVALID');
  }
  const decision = response.decision as Readonly<Record<string, unknown>> | undefined;
  if (!decision || !Array.isArray(decision.nodes) || !['passed', 'failed', 'blocked'].includes(String(decision.state))) {
    throw new Error('TEST_PLAN_RECEIPT_INVALID');
  }
  const effects = new Set(['passed', 'failed', 'advisory_failure', 'execution_error', 'review_required', 'skipped']);
  const nodes = decision.nodes.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TEST_PLAN_RECEIPT_INVALID');
    const node = value as Readonly<Record<string, unknown>>;
    if (typeof node.nodeId !== 'string' || typeof node.effect !== 'string' || !effects.has(node.effect)) {
      throw new Error('TEST_PLAN_RECEIPT_INVALID');
    }
    return Object.freeze({ suite: node.nodeId, passed: ['passed', 'advisory_failure'].includes(node.effect),
      summary: `provider effect=${node.effect}` });
  });
  return Object.freeze([
    Object.freeze({ suite: 'provider-plan', passed: decision.state === 'passed',
      summary: `provider decision=${String(decision.state)}` }),
    ...nodes,
  ]);
}

async function executeProviderPlan(input: TestInput, context: PluginInvocationContext) {
  if (!input.providerPlan) return { evidence: [] as readonly SuiteEvidence[], execution: null };
  const response = await context.invoke('test.plan.execute', {
    operation: 'run', resource: { type: 'test.resolved-plan', canonicalId: input.providerPlan.repositoryRoot },
    payload: { ...input.providerPlan },
  });
  return { evidence: providerEvidence(response), execution: response };
}

async function executeCommandSuites(
  input: TestInput,
  context: PluginInvocationContext,
): Promise<Readonly<{
  evidence: readonly SuiteEvidence[];
  suiteExecution: unknown | null;
}>> {
  if (input.suitePlan.suites.length > 0) throw new Error('LEGACY_TEST_SUITE_RETIRED');
  const provider = await executeProviderPlan(input, context);
  const evidence: SuiteEvidence[] = [
    ...input.suiteEvidence,
    ...provider.evidence,
  ];
  for (const suite of input.commandSuites ?? []) {
    const result = await context.invoke('command.execute', {
      operation: 'run',
      resource: { type: 'command.executable', canonicalId: suite.executable },
      payload: { args: suite.args, workingDirectory: suite.workingDirectory },
    });
    const exitCode = result.exitCode;
    const signal = result.signal;
    if (!(exitCode === null || Number.isSafeInteger(exitCode))) throw new Error(`TEST_SUITE_RESULT_INVALID:${suite.suite}`);
    if (!(signal === null || typeof signal === 'string')) throw new Error(`TEST_SUITE_RESULT_INVALID:${suite.suite}`);
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    evidence.push({
      suite: suite.suite,
      passed: exitCode === 0 && signal === null,
      summary: [stdout, stderr, signal ? `signal=${signal}` : `exit=${String(exitCode)}`].filter(Boolean).join('\n').slice(0, 2_048),
    });
  }
  if (evidence.length === 0) throw new Error('TEST_SUITES_REQUIRED');
  return { evidence, suiteExecution: { provider: provider.execution } };
}

export async function execute(input:TestInput,context:PluginInvocationContext):Promise<StageResult>{
  const agent=context.contract.config.agent;
  if(typeof agent!=='string'||!agent.trim())throw new Error('test agent is not configured');
  let verdict;
  let executionEvidence: unknown | null = null;
  let finalSuiteEvidence: readonly SuiteEvidence[] = input.suiteEvidence;
  try {
    const executed = await executeCommandSuites(input, context);
    const suiteEvidence = executed.evidence;
    finalSuiteEvidence = suiteEvidence;
    executionEvidence = executed.suiteExecution;
    const judgedInput = { ...input, suiteEvidence };
    const response=await context.invoke('runtime.dispatch',{
      operation:'dispatch',
      resource:{type:'runtime.agent',canonicalId:agent},
      payload:buildRequest(agent,judgedInput),
    });
    verdict=parseVerdict(response.result,judgedInput);
  } catch(error) {
    return {
      schemaVersion:'stage-result.v2',
      outcome:'blocked',
      reason:{code:'test_agent.invalid_verdict',message:error instanceof Error?error.message:String(error)},
      artifacts:[],
    };
  }
  const stored=await context.invoke('artifacts.write',{
    operation:'put_json',
    resource:{type:'artifact.object',canonicalId:`test-verdict:${input.taskId}:${input.attempt}`},
    payload:{namespace:'kubeclaw.test-agent',mediaType:'application/json',value:{
      verdict,
      suiteEvidence: finalSuiteEvidence,
      suiteExecution: executionEvidence,
    }},
  });
  const artifacts=[stored.artifact as ArtifactRef];
  return verdict.verdict==='PASS'
    ? {schemaVersion:'stage-result.v2',outcome:'passed',artifacts}
    : {schemaVersion:'stage-result.v2',outcome:'request_fix',reason:{code:'test_agent.findings',message:verdict.summary,details:{findings:verdict.findings}},artifacts};
}
