from pathlib import Path
root=Path(__file__).resolve().parent/'files/skills/buster/engine/test-gates';p=root/'runner.ts';s=p.read_text();a=s.index('    let workerResult:',s.index('  async #executeAttempt('));b=s.index('    const completedProviderResult =',a);body=s[a:b]
body=body.replace('this.#workerRuntime','owner.workerRuntime').replace('this.#options','owner.options').replace('this.#now','owner.now').replace('this.#id','owner.id').replace('this.#authorityId','owner.authorityId').replace('this.#completionOwner()','owner.completion')
header='''import fs from 'node:fs';
import { WorkerAttemptExecutor, type WorkerAttemptOperation } from '@kubeclaw/worker-core';
import type { WorkerAttemptEnvelopeV1, WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { TestPlanRunnerOptions, WorkerAttemptRuntime } from './runner-types.ts';
import { canonical } from './canonical-value.ts';
import { detail } from './runner-values.ts';
import { persistRunnerCompletion, type CompletionOwner } from './runner-completion.ts';
interface ExecutionOwner {
 readonly options: TestPlanRunnerOptions;
 readonly workerRuntime: WorkerAttemptRuntime;
 readonly now: () => Date;
 readonly id: () => string;
 readonly authorityId: string;
 readonly completion: CompletionOwner;
}
export async function executeRunnerAttempt(owner: ExecutionOwner, workerEnvelope: WorkerAttemptEnvelopeV1,
  operation: WorkerAttemptOperation, stagingBase: string) {
'''
(root/'runner-attempt-execution.ts').write_text(header+body+'''    return { workerResult, workerRuntimeFault };
}
''')
s=s[:a]+'''    const { workerResult, workerRuntimeFault } = await executeRunnerAttempt({
      options: this.#options, workerRuntime: this.#workerRuntime, now: this.#now,
      id: this.#id, authorityId: this.#authorityId, completion: this.#completionOwner(),
    }, workerEnvelope, operation, stagingBase);
'''+s[b:]
p.write_text("import { executeRunnerAttempt } from './runner-attempt-execution.ts';\n"+s)
