import { randomUUID } from "node:crypto";
import type { WorkerArtifactRefV1, WorkerAttemptEnvelopeV1, WorkerProfileV1 } from "@kubeclaw/pipeline-worker-core-contract";
import { sha256Digest, workerAttemptSpecDigest, workerProfileDigest } from "@kubeclaw/worker-core";
import { engineRequestSchema } from "@kubeclaw/prism-contracts-v1/digest";
import type { EngineOperation } from "./index.ts";
import type { WorkerAttemptEnvelopeV3, WorkerProfileV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { prismNativePolicy, prismEngineContentDigest, prismWorkerExecutionMode } from '../config/native-worker.ts';

const engineContentDigest = prismEngineContentDigest()
  || sha256Digest({ engineId: "prism-design-engine", engineVersion: "1.0.0", development: true });
if (prismWorkerExecutionMode() === 'native' && !/^sha256:[a-f0-9]{64}$/u.test(prismEngineContentDigest() ?? '')) {
  throw new Error('PRISM_NATIVE_ENGINE_CONTENT_IDENTITY_REQUIRED');
}
const unsignedProfile = {
  schemaVersion: "worker-profile.v1" as const,
  profileId: "prism-design-engine-v1",
  workerType: "prism",
  coreContractId: "kubeclaw.pipeline-worker-core@1",
  engine: { engineId: "prism-design-engine", contractId: "kubeclaw.prism-design-engine@1", engineVersion: "1.0.0", contentDigest: engineContentDigest },
  capabilities: ["artifacts.read", "artifacts.write", "network.http", "secrets.read", "telemetry.emit"],
};
export const prismWorkerProfile: WorkerProfileV1 = { ...unsignedProfile, profileDigest: workerProfileDigest(unsignedProfile) };
export const prismRequestDigest=(operation:WorkerAttemptEnvelopeV1["operation"],inputDigest:string)=>sha256Digest(JSON.stringify({operation,inputDigest}));

export function prismAttempt(operation: EngineOperation, inputArtifact: WorkerArtifactRefV1, idempotencyKey: string): WorkerAttemptEnvelopeV1 {
  const now = new Date(); const expires = new Date(now.getTime() + 10 * 60_000); const attemptId = `attempt-${randomUUID()}`;
  const request = engineRequestSchema(operation);
  const unsigned = {
    schemaVersion: "worker-attempt-envelope.v1" as const, protocolVersion: "worker-protocol.v1" as const,
    pipelineRunId: `prism-${idempotencyKey}`.slice(0, 128), moduleId: null, gateId: null, planId: `plan-${idempotencyKey}`.slice(0, 128),
    nodeId: `node-${operation}`, executionId: `execution-${randomUUID()}`, attemptId, attemptNumber: 1,
    claim: { schemaVersion: "attempt-claim.v1" as const, claimId: `claim-${randomUUID()}`, attemptId, generation: 1, workerId: "prism-worker", claimedAt: now.toISOString(), expiresAt: expires.toISOString() },
    profile: prismWorkerProfile, packages: [], grantedCapabilities: prismWorkerProfile.capabilities,
    limits: { timeoutMs: 300_000, cleanupTimeoutMs: 10_000, cpuMillis: 4000, memoryBytes: 8_589_934_592, processes: 256, logBytes: 1_048_576, resultBytes: 16_777_216, evidenceBytes: 134_217_728, evidenceFiles: 64 },
    inputs: [{name:"prism-input",kind:"artifact" as const,artifact:inputArtifact}], operation: { contractId: "kubeclaw.prism-design-engine@1", inputSchemaId: request.schemaId, inputSchemaDigest: request.schemaDigest, values: { operation, inputName:"prism-input" } },
    cancellationId: `cancel-${randomUUID()}`, issuedAt: now.toISOString(), queueDeadline: expires.toISOString(),
  };
  return { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(unsigned) };
}

export const prismNativeWorkerProfile: WorkerProfileV3 = (() => {
  const profile: WorkerProfileV3 = { ...prismWorkerProfile, schemaVersion: 'worker-profile.v3', profileId: 'prism-design-engine-v3',
    resourceCapabilities: { schemaVersion: 'worker-resource-capabilities.v2',
      cpuTimeMs: { scope: 'native-attempt-tree', unit: 'milliseconds', measurement: 'measured' },
      maximumMemoryBytes: { scope: 'native-attempt-tree', unit: 'bytes', measurement: 'measured' },
      maximumTasks: { scope: 'native-attempt-tree', unit: 'linux-tasks', measurement: 'measured' },
    } };
  profile.profileDigest = workerProfileDigest(profile);
  return profile;
})();

export function prismNativeAttempt(operation: EngineOperation, inputArtifact: WorkerArtifactRefV1,
  idempotencyKey: string): WorkerAttemptEnvelopeV3 {
  const common = prismAttempt(operation, inputArtifact, idempotencyKey);
  const { cpuMillis: _cpuMillis, memoryBytes: _memoryBytes, processes: _processes, ...limits } = common.limits;
  const policy = prismNativePolicy();
  const envelope: WorkerAttemptEnvelopeV3 = { ...common, schemaVersion: 'worker-attempt-envelope.v3',
    profile: prismNativeWorkerProfile, limits,
    resourceBudgets: { schemaVersion: 'worker-resource-budgets.v2',
      cpuTimeMs: { state: 'requested', limit: policy.cpuTimeMs }, maximumMemoryBytes: { state: 'requested', limit: policy.memoryBytes },
      maximumTasks: { state: 'requested', limit: policy.tasks },
    } };
  envelope.attemptSpecDigest = workerAttemptSpecDigest(envelope);
  return envelope;
}
