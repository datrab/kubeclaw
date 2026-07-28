import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
import { buildRequest, parseVerdict, type SuiteEvidence, type TestInput } from './protocol.js';

async function executeCommandSuites(
  input: TestInput,
  context: PluginInvocationContext,
): Promise<readonly SuiteEvidence[]> {
  const evidence: SuiteEvidence[] = [...input.suiteEvidence];
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
  return evidence;
}

export async function execute(input:TestInput,context:PluginInvocationContext):Promise<StageResult>{
  const agent=context.contract.config.agent;
  if(typeof agent!=='string'||!agent.trim())throw new Error('test agent is not configured');
  let verdict;
  try {
    const suiteEvidence = await executeCommandSuites(input, context);
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
    payload:{namespace:'kubeclaw.test-agent',mediaType:'application/json',value:verdict},
  });
  const artifacts=[stored.artifact as ArtifactRef];
  return verdict.verdict==='PASS'
    ? {schemaVersion:'stage-result.v2',outcome:'passed',artifacts}
    : {schemaVersion:'stage-result.v2',outcome:'request_fix',reason:{code:'test_agent.findings',message:verdict.summary,details:{findings:verdict.findings}},artifacts};
}
