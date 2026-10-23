import assert from 'node:assert/strict';
import {
  type WorkerAttemptEnvelopeV1,
  type WorkerEvidenceRefV1,
  type WorkerProfileV1,
} from '../../../contracts/pipeline-worker-core/v1/src/types.ts';
import {
  WorkerAttemptExecutor,
  type WorkerAttemptContext,
  type WorkerAttemptEvidenceResult,
  type WorkerAttemptOperation,
  type WorkerAttemptOperationResources,
  type WorkerAttemptOperationResult,
} from '../../../skills/worker/core/worker/attempt-executor.ts';
import {
  sha256Digest,
  sha256Text,
  workerAttemptSpecDigest,
  workerProfileDigest,
} from '../../../skills/worker/core/worker/digest.ts';

const schemaDigest = `sha256:${'b'.repeat(64)}`;
const packageDigest = `sha256:${'c'.repeat(64)}`;
let identity = 0;
const id = (): string => `id-${++identity}`;

function profile(): WorkerProfileV1 {
  const unsigned = {
    schemaVersion: 'worker-profile.v1' as const,
    profileId: 'buster.standard',
    workerType: 'buster',
    coreContractId: 'kubeclaw.worker-core@1',
    engine: {
      engineId: 'buster-test-engine',
      contractId: 'kubeclaw.buster-engine@1',
      engineVersion: '1.0.0',
      contentDigest: packageDigest,
    },
    capabilities: ['provider.execute'],
  };
  return { ...unsigned, profileDigest: workerProfileDigest(unsigned) };
}

function envelope(overrides: Partial<WorkerAttemptEnvelopeV1> = {}): WorkerAttemptEnvelopeV1 {
  const attemptId = overrides.attemptId ?? `attempt:unit:${id()}`;
  const workerProfile = profile();
  const unsigned = {
    schemaVersion: 'worker-attempt-envelope.v1' as const,
    protocolVersion: 'worker-protocol.v1' as const,
    pipelineRunId: 'run:unit',
    moduleId: 'api',
    gateId: 'test',
    planId: 'plan:unit',
    nodeId: 'unit',
    executionId: 'execution:unit',
    attemptId,
    attemptNumber: 1,
    claim: {
      schemaVersion: 'attempt-claim.v1' as const,
      claimId: `claim:${attemptId}`,
      attemptId,
      generation: 1,
      workerId: 'worker:buster:one',
      claimedAt: '2026-08-05T12:00:00Z',
      expiresAt: '2026-08-05T13:00:00Z',
    },
    profile: workerProfile,
    packages: [{ packageId: 'kubeclaw.unit-provider', packageVersion: '1.0.0', contentDigest: packageDigest }],
    grantedCapabilities: ['provider.execute'],
    limits: {
      timeoutMs: 1_000,
      cleanupTimeoutMs: 1_000,
      cpuMillis: 1_000,
      memoryBytes: 1_000_000,
      processes: 10,
      logBytes: 1_000,
      resultBytes: 1_000,
      evidenceBytes: 1_000,
      evidenceFiles: 10,
    },
    inputs: [],
    operation: {
      contractId: 'kubeclaw.test-attempt@1',
      inputSchemaId: 'kubeclaw.test-attempt-input.v1',
      inputSchemaDigest: schemaDigest,
      values: { providerContractId: 'kubeclaw.command-test@1' },
    },
    cancellationId: `cancel:${attemptId}`,
    issuedAt: '2026-08-05T12:00:00Z',
    queueDeadline: '2026-08-05T14:00:00Z',
    ...overrides,
  };
  const withoutDigest = { ...unsigned, attemptSpecDigest: '' };
  return { ...unsigned, attemptSpecDigest: workerAttemptSpecDigest(withoutDigest) };
}

const evidence = {
  evidenceId: 'report',
  type: 'report',
  artifact: {
    artifactId: 'artifact:report',
    type: 'report',
    mediaType: 'application/json',
    contentDigest: sha256Digest({ report: true }),
    sizeBytes: 10,
    storageUrl: 'artifact://report',
  },
} satisfies WorkerEvidenceRefV1;

function successResult(overrides: Partial<WorkerAttemptOperationResult> = {}): WorkerAttemptOperationResult {
  return {
    summary: 'Attempt passed.',
    specialistResult: { schemaId: 'kubeclaw.test-result.v1', schemaDigest, values: { outcome: 'passed' } },
    evidence: [evidence],
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

class Operation implements WorkerAttemptOperation {
  terminated = 0;
  cleaned = 0;
  readonly #run: WorkerAttemptOperation['execute'];
  readonly #useCleanup: boolean;
  readonly #resources: WorkerAttemptOperationResources;
  collectEvidence?: () => Promise<WorkerAttemptEvidenceResult>;
  prepared = 0;

  constructor(run: WorkerAttemptOperation['execute'], options: {
    cleanup?: boolean;
    resources?: WorkerAttemptOperationResources;
  } = {}) {
    this.#run = run;
    this.#useCleanup = options.cleanup ?? false;
    this.#resources = options.resources ?? { cpuTimeMs: 10, maximumMemoryBytes: 100, maximumProcesses: 1 };
  }

  async execute(context: Parameters<WorkerAttemptOperation['execute']>[0]) {
    return this.#run(context);
  }
  prepare(_limits: Parameters<WorkerAttemptOperation['prepare']>[0]) { this.prepared += 1; return undefined; }
  async terminate() { this.terminated += 1; }
  async measure() { return this.#resources; }
  async cleanup(_context: WorkerAttemptContext) { if (this.#useCleanup) this.cleaned += 1; }
}


export {envelope, Operation, successResult};
