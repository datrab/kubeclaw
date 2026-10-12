import { validatePipelineTestGateContract, type ProviderInvocationV1, type ProviderResultV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { canonicalJson, sha256Digest, type WorkerScopeBinding } from '@kubeclaw/worker-core';

export interface BusterFixtureAdmission {
  readonly schemaVersion: 'buster-fixture-admission.v1';
  readonly envelope: WorkerAttemptEnvelopeV3;
  readonly invocation: ProviderInvocationV1;
}

/** Readiness permits dependent work; it is never a terminal Worker receipt. */
export interface BusterFixtureReadiness {
  readonly schemaVersion: 'buster-fixture-readiness.v1';
  readonly admissionDigest: string;
  readonly scope: WorkerScopeBinding;
  readonly readyAt: string;
  readonly providerResult: ProviderResultV1;
}

export interface FixtureBlob { readonly digest: string; readonly sizeBytes: number }
export interface BusterFixtureState {
  readonly schemaVersion: 'buster-fixture-state.v1';
  readonly admission: FixtureBlob;
  readonly acceptedAt: string;
  readonly readiness: FixtureBlob | null;
  readonly teardown: { readonly requestedAt: string; readonly reason: 'dependencies-finished' | 'cancelled' | 'recovery' } | null;
  readonly terminal: FixtureBlob | null;
  readonly reservedBytes: number;
}

export function fixtureKey(admission: BusterFixtureAdmission): string {
  const envelope = admission.envelope;
  return sha256Digest([envelope.claim.workerId, envelope.attemptId, envelope.claim.generation]);
}

export function validateFixtureAdmission(input: unknown): asserts input is BusterFixtureAdmission {
  exact(input, ['schemaVersion', 'envelope', 'invocation']);
  if (input.schemaVersion !== 'buster-fixture-admission.v1') throw new Error('BUSTER_FIXTURE_ADMISSION_INVALID');
  validateWorkerResourceContractV3('workerAttemptEnvelope', input.envelope);
  validatePipelineTestGateContract('providerInvocation', input.invocation);
  const { envelope, invocation } = input as unknown as BusterFixtureAdmission;
  if (envelope.profile.workerType !== 'buster' || invocation.nodeKind !== 'fixture'
    || invocation.attemptId !== envelope.attemptId || invocation.executionId !== envelope.executionId
    || invocation.planId !== envelope.planId || invocation.runId !== envelope.pipelineRunId
    || invocation.nodeId !== envelope.nodeId || invocation.attemptNumber !== envelope.attemptNumber
    || invocation.moduleId !== envelope.moduleId || invocation.gateId !== envelope.gateId
    || envelope.operation.values.phase !== 'fixture-lifetime'
    || envelope.operation.values.invocationDigest !== sha256Digest(invocation)) throw new Error('BUSTER_FIXTURE_ADMISSION_BINDING_INVALID');
}

export function validateFixtureReadiness(input: unknown, admission: BusterFixtureAdmission): asserts input is BusterFixtureReadiness {
  exact(input, ['schemaVersion', 'admissionDigest', 'scope', 'readyAt', 'providerResult']);
  if (input.schemaVersion !== 'buster-fixture-readiness.v1' || input.admissionDigest !== sha256Digest(admission)) {
    throw new Error('BUSTER_FIXTURE_READINESS_BINDING_INVALID');
  }
  timestamp(input.readyAt);
  const readyAt = Date.parse(String(input.readyAt));
  if (readyAt < Date.parse(admission.envelope.claim.claimedAt) || readyAt >= Date.parse(admission.envelope.claim.expiresAt)) {
    throw new Error('BUSTER_FIXTURE_READINESS_CLAIM_INVALID');
  }
  exact(input.scope, ['scopeName', 'bootId', 'device', 'inode']);
  const scope = input.scope;
  if (typeof scope.scopeName !== 'string' || !/^worker-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(scope.scopeName)
    || typeof scope.bootId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(scope.bootId)
    || !Number.isSafeInteger(scope.device) || Number(scope.device) < 0
    || !Number.isSafeInteger(scope.inode) || Number(scope.inode) < 1) throw new Error('BUSTER_FIXTURE_SCOPE_INVALID');
  validatePipelineTestGateContract('providerResult', input.providerResult);
  const result = input.providerResult as ProviderResultV1;
  if (result.outcome !== 'passed' || result.counts.total !== result.counts.passed + result.counts.failed + result.counts.skipped) {
    throw new Error('BUSTER_FIXTURE_NOT_READY');
  }
}

export function validateFixtureState(input: unknown): asserts input is BusterFixtureState {
  exact(input, ['schemaVersion', 'admission', 'acceptedAt', 'readiness', 'teardown', 'terminal', 'reservedBytes']);
  if (input.schemaVersion !== 'buster-fixture-state.v1' || !Number.isSafeInteger(input.reservedBytes) || Number(input.reservedBytes) < 1) {
    throw new Error('BUSTER_FIXTURE_STATE_INVALID');
  }
  blob(input.admission); timestamp(input.acceptedAt);
  if (input.readiness !== null) blob(input.readiness);
  if (input.terminal !== null) blob(input.terminal);
  if (input.teardown !== null) {
    exact(input.teardown, ['requestedAt', 'reason']); timestamp(input.teardown.requestedAt);
    if (!['dependencies-finished', 'cancelled', 'recovery'].includes(String(input.teardown.reason))) throw new Error('BUSTER_FIXTURE_TEARDOWN_INVALID');
  }
}

export function sameFixtureValue(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }

function blob(input: unknown): void {
  exact(input, ['digest', 'sizeBytes']);
  if (typeof input.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(input.digest)
    || !Number.isSafeInteger(input.sizeBytes) || Number(input.sizeBytes) < 1) throw new Error('BUSTER_FIXTURE_BLOB_INVALID');
}

function timestamp(input: unknown): void {
  if (typeof input !== 'string' || !Number.isFinite(Date.parse(input)) || new Date(input).toISOString() !== input) {
    throw new Error('BUSTER_FIXTURE_TIMESTAMP_INVALID');
  }
}

function exact(input: unknown, keys: readonly string[]): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) throw new Error('BUSTER_FIXTURE_SHAPE_INVALID');
}
