from pathlib import Path
out=Path(__file__).resolve().parent;root=out/'files/skills/buster/engine/test-gates';p=root/'runner.ts';s=p.read_text()
a=s.index('  async #readManagedEvidence(');b=s.index('  #executeNode(',a);read=s[a:b];s=s[:a]+s[b:]
read=read.replace('  async #readManagedEvidence(', 'export async function readManagedEvidence(\n    artifactRoot: string,').replace('const root = this.#options.artifactRoot;', 'const root = artifactRoot;')
(root/'runner-managed-evidence.ts').write_text("import fs from 'node:fs';\nimport path from 'node:path';\n"+read)
a=s.index('  async #resumePendingCompletions(');b=s.index('  #executeNode(',a);resume=s[a:b];s=s[:a]+s[b:]
resume=resume.replace('  async #resumePendingCompletions(): Promise<number> {','export async function resumeRunnerCompletions(owner: CompletionOwner): Promise<number> {').replace('this.#durableAttemptStore','owner.attemptStore').replace('this.#observabilityAdmissionStore','owner.admissionStore').replace('this.#options','owner.options')
a=s.index('  async #persistWorkerCompletion(');b=s.index('  #context(',a);body=s[a:b];s=s[:a]+s[b:]
# Partition existing contiguous blocks without moving any awaited operation across its dependencies.
start=body.index('    const bootHash =');evidence=body.index('    const durableEvidence:');durable=body.index('    const durableResult:');record=body.index('    const occurredAt =');persist=body.index('    await this.#durableAttemptStore.storeResult(')
identity=body[body.index('    if ('):start]
producer=body[start:evidence]
collect=body[evidence:durable]
make=body[durable:record]
intent=body[record:persist]
# map explicit dependency names only (no field/payload keys touched).
def mapped(text):
 return text.replace('this.#durableAttemptStore','owner.attemptStore').replace('this.#observabilityAdmissionStore','owner.admissionStore').replace('this.#authorityId','owner.authorityId').replace('this.#now()','owner.now()').replace('this.#readManagedEvidence(', 'readManagedEvidence(owner.options.artifactRoot,')
header='''import crypto from 'node:crypto';
import type { WorkerAttemptEnvelopeV1, WorkerAttemptResultV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { workerAttemptResultDigest } from '@kubeclaw/worker-core';
import { producerRecordDigest } from '@kubeclaw/pipeline-observability-contract';
import { createProducerClosure, scopedEvidenceId, type FileDurableAttemptStore } from '@kubeclaw/plugin-foundation/observability/durable-attempts';
import type { FileObservabilityAdmissionStore } from '@kubeclaw/plugin-foundation/observability/durable-delivery';
import type { TestPlanRunnerOptions } from './runner-types.ts';
import { receipt } from './runner-values.ts';
import { readManagedEvidence } from './runner-managed-evidence.ts';

export interface CompletionOwner {
  readonly options: TestPlanRunnerOptions;
  readonly attemptStore: FileDurableAttemptStore;
  readonly admissionStore: FileObservabilityAdmissionStore;
  readonly authorityId: string;
  readonly now: () => Date;
}

'''
text=header+resume
text+='''function completionProducer(envelope: WorkerAttemptEnvelopeV1, result: WorkerAttemptResultV1) {
'''+identity+producer+'''    return { bootHash, producer };
}

type CompletionProducer = ReturnType<typeof completionProducer>;

async function storeCompletionEvidence(owner: CompletionOwner, envelope: WorkerAttemptEnvelopeV1,
  result: WorkerAttemptResultV1, producer: CompletionProducer['producer']) {
'''+mapped(collect)+'''    return durableEvidence;
}

function completionResult(owner: CompletionOwner, result: WorkerAttemptResultV1,
  durableEvidence: WorkerAttemptResultV1['evidence'], bootHash: string): WorkerAttemptResultV1 {
'''+mapped(make)+'''    return durableResult;
}

function completionIntent(owner: CompletionOwner, envelope: WorkerAttemptEnvelopeV1,
  durableResult: WorkerAttemptResultV1, { bootHash, producer }: CompletionProducer) {
    const durableEvidence = durableResult.evidence;
'''+mapped(intent)+'''    return { record, closure };
}

/** An admission failure retains the already persisted result/intent for ordinary recovery. */
async function admitCompletion(owner: CompletionOwner, envelope: WorkerAttemptEnvelopeV1) {
  try {
    await owner.attemptStore.resumeCompletion(envelope.pipelineRunId,
      envelope.attemptId, envelope.claim.generation, owner.admissionStore);
    return { state: 'admitted' as const };
  } catch (cause) {
    return { state: 'durable-pending-admission' as const, cause };
  }
}

export async function persistRunnerCompletion(owner: CompletionOwner,
  envelope: WorkerAttemptEnvelopeV1, result: WorkerAttemptResultV1) {
  const identity = completionProducer(envelope, result);
  const evidence = await storeCompletionEvidence(owner, envelope, result, identity.producer);
  const durableResult = completionResult(owner, result, evidence, identity.bootHash);
  const intent = completionIntent(owner, envelope, durableResult, identity);
  await owner.attemptStore.storeResult(envelope.pipelineRunId, durableResult, intent,
    { planId: envelope.planId, nodeId: envelope.nodeId });
  const admission = await admitCompletion(owner, envelope);
  return { result: Object.freeze(durableResult), admission };
}
'''
(root/'runner-completion.ts').write_text(text)
s=s.replace('await this.#resumePendingCompletions()', 'await resumeRunnerCompletions(this.#completionOwner())')
s=s.replace('workerResult = await this.#persistWorkerCompletion(\n        workerEnvelope,\n        workerResult,\n      );', '''// The authoritative completion intent remains durable even if admission is pending.
      const completion = await persistRunnerCompletion(this.#completionOwner(), workerEnvelope, workerResult);
      workerResult = completion.result;''')
pos=s.index('  #context(')
s=s[:pos]+'''  #completionOwner(): CompletionOwner {
    return { options: this.#options, attemptStore: this.#durableAttemptStore,
      admissionStore: this.#observabilityAdmissionStore, authorityId: this.#authorityId, now: this.#now };
  }

'''+s[pos:]
p.write_text("import { persistRunnerCompletion, resumeRunnerCompletions, type CompletionOwner } from './runner-completion.ts';\n"+s)
print({'completionLines':len(text.splitlines()),'runnerLines':len(s.splitlines())})
