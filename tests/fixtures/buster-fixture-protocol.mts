import { randomUUID } from 'node:crypto';
import { validateFixtureAdmission, type BusterFixtureAdmission, type BusterFixtureReadiness } from '../../skills/buster/engine/test-gates/native-fixture-state.ts';
import { prismNativeAttempt } from '../../skills/prism/engine/worker-envelope.ts';
import { sha256Digest, workerProfileDigest, workerAttemptSpecDigest } from '@kubeclaw/worker-core';

// Protocol vectors feed real stores; they do not impersonate a running kernel scope.
export function admission(): BusterFixtureAdmission {
  const envelope = prismNativeAttempt('render', { artifactId: 'fixture-input', type: 'input', mediaType: 'application/json',
    contentDigest: sha256Digest('{}'), sizeBytes: 2, storageUrl: 'file:///fixture-input' }, `fixture-${randomUUID()}`);
  envelope.profile = { ...envelope.profile, workerType: 'buster', profileId: 'buster-fixture-lifetime-v1' };
  envelope.moduleId = 'fixture-module'; envelope.gateId = 'fixture-gate';
  envelope.profile.profileDigest = workerProfileDigest(envelope.profile);
  const invocation: BusterFixtureAdmission['invocation'] = { schemaVersion: 'provider-invocation.v1', planId: envelope.planId,
    runId: envelope.pipelineRunId, moduleId: envelope.moduleId, gateId: envelope.gateId, suiteInstanceId: null,
    nodeId: envelope.nodeId, executionId: envelope.executionId, testIdentity: `test:${sha256Digest('fixture-test').slice(7)}`, nodeKind: 'fixture',
    attemptId: envelope.attemptId, attemptNumber: envelope.attemptNumber,
    provider: { registrationId: 'fixture', contractId: 'fixture@1', packageId: 'fixture', packageVersion: '1.0.0', contentDigest: sha256Digest('fixture') },
    configuration: { schemaVersion: 'provider-configuration.v1', contractId: 'fixture@1', schemaDigest: sha256Digest('config'), values: {} },
    inputs: [], evidence: { onPass: [], onFail: [], onError: [] }, grantedCapabilities: [], timeoutMs: 60000,
    limits: { cpuMillis: 4000, memoryBytes: 8589934592, processes: 256, logBytes: 1048576, artifactBytes: 134217728, artifactFiles: 64 },
    workspace: { repository: 'repository', scratch: 'scratch', evidence: 'evidence' } };
  envelope.operation.values = { phase: 'fixture-lifetime', invocationDigest: sha256Digest(invocation) };
  envelope.attemptSpecDigest = workerAttemptSpecDigest(envelope);
  const value: BusterFixtureAdmission = { schemaVersion: 'buster-fixture-admission.v1', envelope, invocation };
  validateFixtureAdmission(value); return value;
}

export function readiness(value: BusterFixtureAdmission): BusterFixtureReadiness {
  return { schemaVersion: 'buster-fixture-readiness.v1', admissionDigest: sha256Digest(value), readyAt: new Date().toISOString(),
    scope: { scopeName: `worker-${randomUUID()}`, bootId: randomUUID(), device: 1, inode: 1 },
    providerResult: { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: 'Protocol readiness vector',
      counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [], evidenceFiles: [], reports: [],
      outputs: [], exitCode: 0, signal: null, providerDetails: null } };
}

