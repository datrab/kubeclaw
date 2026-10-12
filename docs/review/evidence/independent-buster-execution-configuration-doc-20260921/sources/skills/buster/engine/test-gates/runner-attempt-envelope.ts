import type { ProviderInvocationV1, ResolvedPlanNodeV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { WorkerAttemptEnvelopeV1 } from '@kubeclaw/pipeline-worker-core-contract';
import { sha256Digest, workerAttemptSpecDigest, type WorkerAttemptOperation } from '@kubeclaw/worker-core';
import { createBusterWorkerProfile } from './runner-worker-profile.ts';
import type { TestPlanRunnerOptions } from './runner-types.ts';
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
function envelopeLimits(node: ResolvedPlanNodeV1, cleanupTimeoutMs: number, providerResultLimit: number, reportResultLimit: number, workerResultWrapperBytes: number) {
 return {
        timeoutMs: node.timeoutMs,
        cleanupTimeoutMs,
        cpuMillis: node.limits.cpuMillis,
        memoryBytes: node.limits.memoryBytes,
        processes: node.limits.processes,
        logBytes: node.limits.logBytes,
        resultBytes: providerResultLimit + reportResultLimit + workerResultWrapperBytes,
        evidenceBytes: node.limits.artifactBytes,
        evidenceFiles: node.limits.artifactFiles,
      };
}
function envelopeOperation(invocation: ProviderInvocationV1) {
 return {
        contractId: "kubeclaw.buster-provider-attempt@1",
        inputSchemaId: "kubeclaw.buster-provider-attempt.v1",
        inputSchemaDigest: sha256Digest({
          schemaId: "kubeclaw.buster-provider-attempt.v1",
        }),
        values: { invocation: structuredClone(invocation) } as never,
      };
}
export function createRunnerEnvelope(input: EnvelopeInput): WorkerAttemptEnvelopeV1 {
 const { options, node, attemptId, attemptNumber, granted, cleanupTimeoutMs, providerResultLimit,
   invocation, operation, issuedAt } = input;
    const profile = createBusterWorkerProfile(options.registry, granted);
    const completionPhases = 3 + Number(Boolean(operation.cleanup)) + Number(Boolean(operation.collectEvidence)) + Number(Boolean(operation.finalizeResult));
    const claimWindowMs = node.timeoutMs + completionPhases * cleanupTimeoutMs + options.executionPolicy.provider.claimGraceMs;
    const envelopeBase = {
      schemaVersion: "worker-attempt-envelope.v1" as const,
      protocolVersion: "worker-protocol.v1" as const,
      pipelineRunId: options.plan.runId,
      moduleId: options.plan.scope.moduleId,
      gateId: options.plan.scope.gateId,
      planId: options.plan.planId,
      nodeId: node.id,
      executionId: node.executionId,
      attemptId,
      attemptNumber,
      claim: {
        schemaVersion: "attempt-claim.v1" as const,
        claimId: `claim:${attemptId}`,
        attemptId,
        generation: 1,
        workerId: "worker:buster:local",
        claimedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + claimWindowMs).toISOString(),
      },
      profile,
      packages: [
        {
          packageId: node.provider.packageId,
          packageVersion: node.provider.packageVersion,
          contentDigest: node.provider.contentDigest,
        },
      ],
      grantedCapabilities: [...granted],
      limits: envelopeLimits(node, cleanupTimeoutMs, providerResultLimit, options.executionPolicy.reports.maximumAggregateResultBytes, options.executionPolicy.provider.workerResultWrapperBytes),
      inputs: [],
      operation: envelopeOperation(invocation),
      cancellationId: `cancel:${attemptId}`,
      issuedAt: issuedAt.toISOString(),
      queueDeadline: new Date(issuedAt.getTime() + options.executionPolicy.provider.queueTimeoutMs).toISOString(),
    };
    const workerEnvelope: WorkerAttemptEnvelopeV1 = {
      ...envelopeBase,
      attemptSpecDigest: workerAttemptSpecDigest({
        ...envelopeBase,
        attemptSpecDigest: "",
      }),
    };
 return workerEnvelope;
}
