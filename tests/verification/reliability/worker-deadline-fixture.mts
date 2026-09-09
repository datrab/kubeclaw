import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { workerAttemptSpecDigest, workerProfileDigest, sha256Text } from '../../../skills/worker/core/worker/digest.ts';
import type { WorkerAttemptEnvelopeV1, WorkerEvidenceRefV1 } from '@kubeclaw/pipeline-worker-core-contract';
import type { WorkerAttemptContext, WorkerAttemptOperation } from '../../../skills/worker/core/worker/attempt-executor.ts';

export function envelope(windowMs = 2000, cleanupTimeoutMs = 50): WorkerAttemptEnvelopeV1 {
  const digest = `sha256:${'a'.repeat(64)}`, now = Date.now(), attemptId = `attempt:${crypto.randomUUID()}`;
  const profileBase = { schemaVersion: 'worker-profile.v1' as const, profileId: 'file.local', workerType: 'file', coreContractId: 'kubeclaw.worker-core@1',
    engine: { engineId: 'file', contractId: 'kubeclaw.file@1', engineVersion: '1.0.0', contentDigest: digest }, capabilities: [] };
  const base = { schemaVersion: 'worker-attempt-envelope.v1' as const, protocolVersion: 'worker-protocol.v1' as const,
    pipelineRunId: 'run:file', moduleId: 'app', gateId: null, planId: 'plan:file', nodeId: 'file', executionId: 'execution:file', attemptId, attemptNumber: 1,
    claim: { schemaVersion: 'attempt-claim.v1' as const, claimId: `claim:${attemptId}`, attemptId, generation: 1, workerId: 'worker:file',
      claimedAt: new Date(now - 10).toISOString(), expiresAt: new Date(now + windowMs).toISOString() },
    profile: { ...profileBase, profileDigest: workerProfileDigest(profileBase) }, packages: [], grantedCapabilities: [],
    limits: { timeoutMs: 100, cleanupTimeoutMs, cpuMillis: 100000, memoryBytes: 1024 * 1024 * 1024, processes: 100,
      logBytes: 65536, resultBytes: 65536, evidenceBytes: 65536, evidenceFiles: 10 }, inputs: [],
    operation: { contractId: 'kubeclaw.file@1', inputSchemaId: 'kubeclaw.file.v1', inputSchemaDigest: digest, values: {} },
    cancellationId: `cancel:${attemptId}`, issuedAt: new Date(now - 10).toISOString(), queueDeadline: new Date(now + 5000).toISOString() };
  return { ...base, attemptSpecDigest: workerAttemptSpecDigest(base) };
}
export async function writeEvidence(root: string, id: string, text: string, signal: AbortSignal): Promise<WorkerEvidenceRefV1> {
  signal.throwIfAborted(); const file = path.join(root, id);
  await fs.writeFile(file, text, { signal }); signal.throwIfAborted();
  return { evidenceId: id, type: 'log', artifact: { artifactId: `artifact:${id}`, type: 'log', mediaType: 'text/plain',
    contentDigest: sha256Text(text), sizeBytes: Buffer.byteLength(text), storageUrl: pathToFileURL(file).href } };
}
export function fileOperation(root: string, chunks: Uint8Array[] = [Buffer.from('actual operation')], phaseDelay = 0): WorkerAttemptOperation {
  const phase = async (name: string, signal: AbortSignal) => {
    await delay(phaseDelay, undefined, { signal }); await fs.writeFile(path.join(root, 'phases'), `${name}\n`, { flag: 'a', signal });
  };
  return {
    prepare() { return undefined; },
    async execute(context: WorkerAttemptContext) {
      await fs.writeFile(path.join(root, 'operation'), 'completed', { signal: context.signal });
      for (const bytes of chunks) context.log('stdout', bytes);
      return { summary: 'File written', specialistResult: { schemaId: 'kubeclaw.file.v1', schemaDigest: `sha256:${'a'.repeat(64)}`, values: { completed: true } }, evidence: [], exitCode: 0, signal: null };
    },
    async terminate() { await fs.writeFile(path.join(root, 'terminated'), 'settled'); },
    async measure({ signal }) { await phase('measure', signal); return { cpuTimeMs: 1, maximumMemoryBytes: 1, maximumProcesses: 1 }; },
    async cleanup({ signal }) { await phase('cleanup', signal); },
    async collectEvidence({ signal }) { await phase('evidence', signal); return { evidence: [await writeEvidence(root, 'evidence', 'actual evidence', signal)] }; },
    async finalizeResult({ signal, specialistResult }) { await phase('finalize', signal); return specialistResult; },
  };
}
