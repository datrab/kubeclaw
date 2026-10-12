from pathlib import Path
root=Path(__file__).resolve().parent/'files/skills/buster/engine/test-gates';p=root/'runner.ts';s=p.read_text();a=s.index('    const completedProviderResult =',s.index('  async #executeAttempt('));b=s.index('  #completionOwner()',a);body=s[a:b];assert body.endswith('  }\n\n');body=body[:-5]
body=body.replace('this.#options','owner.options').replace('this.#cleanupProvider','owner.cleanupProvider').replace('this.#cleanupErrors','owner.cleanupErrors').replace('this.#now()','owner.now()').replace('this.#id()','owner.id()').replace('this.#authorityId','owner.authorityId')
# Separate the retained-fixture decision from the result mapping without changing their order.
x=body.index('    let retainedFaultCleanupFailed');y=body.index('    const workerExecutionState:',x);retained=body[x:y];body=body[:x]+'''    const retainedFaultCleanupFailed = await cleanupFaultedFixture(owner, input);
'''+body[y:]
x=body.index('    if (workerExecutionState === "completed" && completedProviderResult)');y=body.index('    const executionState:',x);validate=body[x:y];body=body[:x]+'''    mapCompletedOutputs(input, workerExecutionState, completedProviderResult, evidence);
'''+body[y:]
x=body.index('    const fallbackCompletedAt =');y=body.index('    const resultDigest =',x);mapped=body[x:y];body=body[:x]+'''    const unsigned = unsignedAttemptResult(owner, input, { executionState, outcome, completedProviderResult, evidence });
'''+body[y:]
# isolate resources to keep the result mapper under its function size limit.
x=mapped.index('    const resources:');y=mapped.index('    const faulted =',x);resources=mapped[x:y];mapped=mapped[:x]+'''    const resources = attemptResources(workerResult, busterLog, evidence);
'''+mapped[y:]
# Helper functions share only a typed snapshot, not a second execution implementation.
header='''import fs from 'node:fs';
import { validatePipelineTestGateContract, type AttemptResultV1, type EvidenceRefV1,
  type ExecutionState, type ProviderInvocationV1, type ProviderResultV1, type ReportAdapterResultV1,
  type ResolvedPlanNodeV1, type ResourceUseV1, type TestOutcome } from '@kubeclaw/pipeline-test-gate-contract';
import type { WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { LoadedTestProvider } from './provider-loader.ts';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
import { validateAndMapOutputs } from './provider-result-validation.ts';
import { detail, digest, freeze, receipt, resultIdentity } from './runner-values.ts';
import type { TestPlanRunnerOptions } from './runner-types.ts';
import type { RunnerProviderState } from './runner-provider-state.ts';
import type { prepareRunnerAttempt } from './runner-attempt-preparation.ts';
import type { createLogCapture } from './runner-log-capture.ts';
interface ResultOwner {
 readonly options: TestPlanRunnerOptions;
 readonly now: () => Date;
 readonly id: () => string;
 readonly authorityId: string;
 readonly cleanupErrors: { nodeId: string; message: string }[];
 cleanupProvider(node: ResolvedPlanNodeV1, instance: LoadedTestProvider,
   invocation: ProviderInvocationV1, log: TestProviderExecutionContext['log']): Promise<boolean>;
}
interface ResultInput {
 readonly prepared: ReturnType<typeof prepareRunnerAttempt>;
 readonly state: RunnerProviderState;
 readonly node: ResolvedPlanNodeV1;
 readonly attemptNumber: number;
 readonly issuedAt: Date;
 readonly busterLog: ReturnType<typeof createLogCapture>;
 readonly workerResult: WorkerAttemptResultV1 | null;
 readonly workerRuntimeFault: string | null;
}
const EMPTY_COUNTS = Object.freeze({ total: 0, passed: 0, failed: 0, skipped: 0 });
'''
start=s.index('function attemptSummary(');end=s.index('export class TestPlanRunner',start);summary=s[start:end];s=s[:start]+s[end:]
decl=''' const { state, node, attemptNumber, issuedAt, busterLog, workerResult, workerRuntimeFault } = input;
 const { attemptId, attemptRepository, entry, invocation } = input.prepared;
'''
text=header+summary+'''async function cleanupFaultedFixture(owner: ResultOwner, input: ResultInput): Promise<boolean> {
 const { state, node, busterLog, workerResult, workerRuntimeFault } = input;
 const { invocation } = input.prepared;
'''+retained+''' return retainedFaultCleanupFailed;
}

function mapCompletedOutputs(input: ResultInput, workerExecutionState: ExecutionState,
  completedProviderResult: ProviderResultV1 | null, evidence: EvidenceRefV1[]): void {
 const { state } = input;
 const { entry } = input.prepared;
'''+validate+'''}

function attemptResources(workerResult: WorkerAttemptResultV1 | null,
  busterLog: ResultInput['busterLog'], evidence: EvidenceRefV1[]): ResourceUseV1 {
'''+resources+''' return resources;
}

function unsignedAttemptResult(owner: ResultOwner, input: ResultInput,
  facts: { executionState: ExecutionState; outcome: TestOutcome; completedProviderResult: ProviderResultV1 | null; evidence: EvidenceRefV1[] }) {
 const { state, node, attemptNumber, issuedAt, busterLog, workerResult, workerRuntimeFault } = input;
 const { attemptId } = input.prepared;
 const { executionState, outcome, completedProviderResult, evidence } = facts;
'''+mapped+''' return unsigned;
}

export async function finalizeRunnerAttempt(owner: ResultOwner, input: ResultInput) {
'''+decl+body+'''}
'''
(root/'runner-attempt-result.ts').write_text(text)
a=s.index('    const completedProviderResult =',s.index('  async #executeAttempt('));b=s.index('  #completionOwner()',a)
s=s[:a]+'''    return finalizeRunnerAttempt({ options: this.#options, now: this.#now, id: this.#id,
      authorityId: this.#authorityId, cleanupErrors: this.#cleanupErrors,
      cleanupProvider: (next, instance, value, log) => this.#cleanupProvider(next, instance, value, log),
    }, { prepared, state, node, attemptNumber, issuedAt, busterLog, workerResult, workerRuntimeFault });
  }

'''+s[b:];p.write_text("import { finalizeRunnerAttempt } from './runner-attempt-result.ts';\n"+s)
print({'resultLines':len(text.splitlines()),'runnerLines':len(s.splitlines())})
