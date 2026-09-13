import { randomUUID } from "node:crypto";
import type { WorkerArtifactRefV1, WorkerAttemptEnvelopeV1 } from "@kubeclaw/pipeline-worker-core-contract";
import { canonicalJson, sha256Digest, workerAttemptSpecDigest, workerProfileDigest } from "@kubeclaw/worker-core";
import { engineRequestSchema } from "@kubeclaw/prism-contracts-v1/digest";
import type { EngineOperation } from "./index.ts";
import type { WorkerAttemptEnvelopeV3, WorkerProfileV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { prismNativePolicy, prismEngineContentDigest } from '../config/native-worker.ts';

const engineContentDigest = prismEngineContentDigest()
  || sha256Digest({ engineId: "prism-design-engine", engineVersion: "1.0.0", development: true });
const unsignedProfile = {
  schemaVersion: "worker-profile.v3" as const,
  profileId: "prism-design-engine-v3",
  workerType: "prism",
  coreContractId: "kubeclaw.pipeline-worker-core@1",
  engine: { engineId: "prism-design-engine", contractId: "kubeclaw.prism-design-engine@1", engineVersion: "1.0.0", contentDigest: engineContentDigest },
  resourceCapabilities: { schemaVersion: 'worker-resource-capabilities.v2' as const,
    cpuTimeMs: { scope: 'native-attempt-tree' as const, unit: 'milliseconds' as const, measurement: 'measured' as const },
    maximumMemoryBytes: { scope: 'native-attempt-tree' as const, unit: 'bytes' as const, measurement: 'measured' as const },
    maximumTasks: { scope: 'native-attempt-tree' as const, unit: 'linux-tasks' as const, measurement: 'measured' as const },
  },
  capabilities: ["artifacts.read", "artifacts.write", "network.http", "secrets.read", "telemetry.emit"],
};
export const prismNativeWorkerProfile: WorkerProfileV3 = { ...unsignedProfile, profileDigest: workerProfileDigest(unsignedProfile) };
/** Reconstruct the original producer order so PostgreSQL jsonb reordering preserves historical digests. */
export function prismRequestDigest(operation: WorkerAttemptEnvelopeV1['operation'], inputDigest: string): string {
  const values = JSON.parse(canonicalJson(operation.values)) as typeof operation.values;
  const ordered = { contractId: operation.contractId, inputSchemaId: operation.inputSchemaId, inputSchemaDigest: operation.inputSchemaDigest,
    values: { operation: values.operation, inputName: values.inputName, ...values } };
  return sha256Digest(JSON.stringify({ operation: ordered, inputDigest }));
}

export function prismNativeAttempt(operation: EngineOperation, inputArtifact: WorkerArtifactRefV1, idempotencyKey: string): WorkerAttemptEnvelopeV3 {
  const now = new Date(); const expires = new Date(now.getTime() + 10 * 60_000); const attemptId = `attempt-${randomUUID()}`;
  const request = engineRequestSchema(operation);
  const policy = prismNativePolicy();
  const unsigned = {
    schemaVersion: "worker-attempt-envelope.v3" as const, protocolVersion: "worker-protocol.v1" as const,
    pipelineRunId: `prism-${idempotencyKey}`.slice(0, 128), moduleId: null, gateId: null, planId: `plan-${idempotencyKey}`.slice(0, 128),
    nodeId: `node-${operation}`, executionId: `execution-${randomUUID()}`, attemptId, attemptNumber: 1,
    claim: { schemaVersion: "attempt-claim.v1" as const, claimId: `claim-${randomUUID()}`, attemptId, generation: 1, workerId: "prism-worker", claimedAt: now.toISOString(), expiresAt: expires.toISOString() },
    profile: prismNativeWorkerProfile, packages: [], grantedCapabilities: prismNativeWorkerProfile.capabilities,
    limits: { timeoutMs: 300_000, cleanupTimeoutMs: 10_000, logBytes: 1_048_576, resultBytes: 16_777_216, evidenceBytes: 134_217_728, evidenceFiles: 64 },
    resourceBudgets: { schemaVersion: 'worker-resource-budgets.v2' as const,
      cpuTimeMs: { state: 'requested' as const, limit: policy.cpuTimeMs },
      maximumMemoryBytes: { state: 'requested' as const, limit: policy.memoryBytes },
      maximumTasks: { state: 'requested' as const, limit: policy.tasks },
    },
    inputs: [{name:"prism-input",kind:"artifact" as const,artifact:inputArtifact}], operation: { contractId: "kubeclaw.prism-design-engine@1", inputSchemaId: request.schemaId, inputSchemaDigest: request.schemaDigest, values: { operation, inputName:"prism-input" } },
    cancellationId: `cancel-${randomUUID()}`, issuedAt: now.toISOString(), queueDeadline: expires.toISOString(),
  };
  return { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(unsigned) };
}

