from pathlib import Path
root=Path(__file__).resolve().parent/'files/skills/buster/engine/test-gates';p=root/'runner.ts';s=p.read_text();a=s.index('    const profile = createBusterWorkerProfile(',s.index('  async #executeAttempt('));b=s.index('    let workerResult:',a);body=s[a:b]
body=body.replace('this.#options','options')
head='''import type { ProviderInvocationV1, ResolvedPlanNodeV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { WorkerAttemptEnvelopeV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { sha256Digest, workerAttemptSpecDigest, type WorkerAttemptOperation } from '@kubeclaw/worker-core';
import { MAX_REPORT_RESULTS_BYTES } from './specialist-report-finalization.ts';
import { createBusterWorkerProfile } from './runner-worker-profile.ts';
import type { TestPlanRunnerOptions } from './runner-types.ts';
const WORKER_RESULT_WRAPPER_BYTES = 4096;
interface EnvelopeInput {
 readonly options: TestPlanRunnerOptions;
 readonly node: ResolvedPlanNodeV1;
 readonly attemptId: string;
 readonly attemptNumber: number;
 readonly granted: readonly string[];
 readonly cleanupTimeoutMs: number;
 readonly providerResultLimit: number;
 readonly invocation: ProviderInvocationV1;
 readonly operation: WorkerAttemptOperation;
 readonly issuedAt: Date;
}
'''
ls=body.index('      limits: {');le=body.index('      inputs: [],',ls);limits=body[ls:le];body=body[:ls]+'      limits: envelopeLimits(node, cleanupTimeoutMs, providerResultLimit),\n'+body[le:]
os=body.index('      operation: {');oe=body.index('      cancellationId:',os);operation=body[os:oe];body=body[:os]+'      operation: envelopeOperation(invocation),\n'+body[oe:]
# Strip outer property key + trailing comma, preserving inner object exactly.
limits=limits.removeprefix('      limits: ').rstrip().removesuffix(',')
operation=operation.removeprefix('      operation: ').rstrip().removesuffix(',')
text=head+'''function envelopeLimits(node: ResolvedPlanNodeV1, cleanupTimeoutMs: number, providerResultLimit: number) {
 return '''+limits+''';
}
function envelopeOperation(invocation: ProviderInvocationV1) {
 return '''+operation+''';
}
export function createRunnerEnvelope(input: EnvelopeInput): WorkerAttemptEnvelopeV1 {
 const { options, node, attemptId, attemptNumber, granted, cleanupTimeoutMs, providerResultLimit,
   invocation, operation, issuedAt } = input;
'''+body+''' return workerEnvelope;
}
'''
(root/'runner-attempt-envelope.ts').write_text(text)
s=s[:a]+'''    const workerEnvelope = createRunnerEnvelope({ options: this.#options, node, attemptId, attemptNumber,
      granted, cleanupTimeoutMs, providerResultLimit, invocation, operation, issuedAt });
'''+s[b:];p.write_text("import { createRunnerEnvelope } from './runner-attempt-envelope.ts';\n"+s);print({'envelopeLines':len(text.splitlines()),'runnerLines':len(s.splitlines())})
