import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectProvisioningTaskReferences as inspect } from '../../../skills/common/plugin-runtime/foundation/config/provisioning-task-reference.ts';
const schemaFile = new URL('../../../skills/common/plugin-runtime/foundation/config/provisioning-task-reference.schema.json', import.meta.url);
const original = new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/secret-provisioning-source-contracts-01/original-task-reference.bootstrap.schema.json', import.meta.url);
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
function fixture() {
  // Synthetic metadata exercises identity/schema only; no grant/native proof.
  const store = new Map<string, Buffer>();
  const artifact = (value: unknown) => {
    const raw = bytes(value), artifactSha256 = createHash('sha256').update(raw).digest('hex');
    store.set(artifactSha256, raw); return { artifactSha256, memberPointer: '' };
  };
  const opaque = artifact({ 'a/b': { '~': 'opaque-metadata-not-a-grant' } });
  const source: any = { taskId: 'task-unit', entries: [] };
  const association: any = { state: 'pending-original-actions', taskId: 'task-unit', applicationIdentityRef: opaque,
    originalActionGraphRef: opaque, originalRecoveryClosureRef: opaque };
  const targets: any = { taskId: 'task-unit', entries: [{ familyId: 'redis', namespace: 'unit', objectName: 'redis',
    observation: 'absent', observedUid: null, observedResourceVersion: null, confidentialRevisionSetRef: artifact(source) }] };
  const mutations: any = { taskId: 'task-unit', issuerAuthorizationRef: opaque, actions: [] };
  const envelope: any = { schemaVersion: 'secret-provisioning-task.v1', taskId: 'task-unit', mode: 'new',
    originalBindingRef: opaque, originalGrantRef: opaque, originalClockAndDeadlineRef: opaque, selectedPolicyRef: opaque,
    selectedSourceCodeRef: opaque, confidentialInputSetRef: opaque };
  const prepare = () => {
    envelope.sourceRevisionSetRef = artifact(source); envelope.targetObservationSetRef = artifact(targets);
    envelope.replacementAuthorizationRef = artifact(mutations); envelope.retainedApplicationRecoveryRef = artifact(association);
    return bytes(envelope);
  };
  const read = (sha: string) => { const raw = store.get(sha); if (!raw) throw Error('sensitive provider detail'); return raw; };
  return { store, artifact, opaque, source, targets, mutations, association, envelope, prepare, read,
    run: () => inspect(prepare(), read) };
}

test('packaged exact approved bootstrap ABI matches original bytes and hash', () => {
  assert.deepEqual(fs.readFileSync(schemaFile), fs.readFileSync(original));
  assert.equal(createHash('sha256').update(fs.readFileSync(schemaFile)).digest('hex'), 'c638387dcfe53452a88300de0a43e91271ec360a510a5817bf340ff072bed82e');
});
test('effect-free inspection accepts explicit empty actions but never grants activation', () => {
  const f = fixture(), result = f.run();
  assert.equal(result.activationAllowed, false); assert.equal(result.associationState, 'pending-original-actions');
  assert.equal(result.actionCount, 0); assert.equal(Object.isFrozen(result), true);
  const raw = f.prepare(); delete f.envelope.originalGrantRef;
  assert.throws(() => inspect(bytes(f.envelope), f.read), /INVALID:ENVELOPE/);
  assert.equal(inspect(raw, f.read).activationAllowed, false);
});
test('artifact raw SHA, exact JSON pointers, inherited fields and array indices are enforced', () => {
  const f = fixture(); f.envelope.originalBindingRef = { ...f.opaque, memberPointer: '/a~1b/~0' }; f.run();
  f.envelope.originalBindingRef.memberPointer = '/toString'; assert.throws(f.run, /MEMBER_REQUIRED/);
  f.envelope.originalBindingRef = { ...f.artifact(['metadata']), memberPointer: '/01' }; assert.throws(f.run, /MEMBER_REQUIRED|ARRAY_MEMBER/);
  f.envelope.originalBindingRef = f.opaque; const raw = f.prepare(); f.store.set(f.opaque.artifactSha256, bytes({ substituted: true }));
  assert.throws(() => inspect(raw, f.read), /ARTIFACT_SHA/);
});
test('cross-task source/target/action/application records reject despite matching artifact hashes', () => {
  for (const key of ['source','targets','mutations','association'] as const) {
    const f = fixture(); f[key].taskId = 'other-original-task'; assert.throws(f.run, /CROSS_TASK_RECORD/);
  }
});
test('duplicates and same-shaped target alias cannot stand in for exact original target member', () => {
  const f = fixture(); f.targets.entries.push(structuredClone(f.targets.entries[0])); assert.throws(f.run, /DUPLICATE_TARGET_FAMILY/);
  f.targets.entries.pop();
  const action: any = { familyId: 'redis', targetObservationRef: f.artifact(f.targets.entries[0]), action: 'create-absent',
    exactKeyNames: ['password'], originalIssuerOrSourceRef: f.opaque, retainedConsumerRecoveryRef: f.opaque };
  f.mutations.actions = [action]; assert.throws(f.run, /EXACT_TARGET_REFERENCE/);
  const targetsRef = f.artifact(f.targets); action.targetObservationRef = { ...targetsRef, memberPointer: '/entries/0' };
  assert.equal(f.run().actionCount, 1); f.mutations.actions.push(structuredClone(action)); assert.throws(f.run, /DUPLICATE_ACTION/);
});
test('captured-awaiting-consumer preserves bootstrap refs, no placeholder acceptance and exact salt presence', () => {
  const f = fixture();
  Object.keys(f.association).forEach(key => delete f.association[key]);
  Object.assign(f.association, { taskId: 'task-unit', state: 'captured-awaiting-consumer', applicationIdentityRef: f.opaque,
    masterRevisionRef: f.opaque, saltPresence: 'absent-use-original-master', saltRevisionRef: null,
    databaseAuthorityRef: f.opaque, databaseCredentialRevisionRef: f.opaque, databaseUrlRevisionRef: f.opaque,
    originalRecoveryClosureRef: f.opaque, bootstrapAuthorizationRef: f.opaque, pendingConsumerActionRef: f.opaque });
  assert.equal(f.run().associationState, 'captured-awaiting-consumer'); assert.equal(f.run().activationAllowed, false);
  f.association.consumerAcceptanceRef = f.opaque; assert.throws(f.run, /INVALID:applicationAssociation/); delete f.association.consumerAcceptanceRef;
  f.association.saltPresence = 'present'; assert.throws(f.run, /SALT_PRESENCE/);
  f.association.saltRevisionRef = f.opaque; f.run(); delete f.association.bootstrapAuthorizationRef;
  assert.throws(f.run, /INVALID:applicationAssociation/);
});
test('duplicate JSON keys and unavailable provider/parser detail never leak in errors', () => {
  const f = fixture(); assert.throws(() => inspect(Buffer.from('{"taskId":"sensitive","taskId":"duplicate"}'), f.read), /INVALID:JSON$/);
  const raw = f.prepare(); assert.throws(() => inspect(raw, () => { throw Error('DO-NOT-LOG-SECRET'); }), error =>
    error instanceof Error && error.message === 'PROVISIONING_TASK_REFERENCE_INVALID:ORIGINAL_ARTIFACT_UNAVAILABLE');
});

test('target-specific revision sets cannot bypass nested reference or duplicate source inspection', () => {
  const f = fixture();
  const entry: any = { providerIdentity: 'unit-provider', providerSchemaRef: f.opaque, originalAccessGrantRef: f.opaque,
    namespace: 'unit', objectName: 'redis', key: 'password', opaqueRetainedRevision: 'metadata-only-unit-revision',
    originalRetentionRef: f.opaque, receiverRole: 'secret-provisioning' };
  const targetRevisions: any = { taskId: 'task-unit', entries: [entry] };
  const assign = () => { f.targets.entries[0].confidentialRevisionSetRef = f.artifact(targetRevisions); };
  assign(); assert.equal(f.run().activationAllowed, false);
  targetRevisions.entries.push(structuredClone(entry)); assign(); assert.throws(f.run, /DUPLICATE_SOURCE/);
  targetRevisions.entries.pop(); entry.originalRetentionRef = { ...f.opaque, memberPointer: '/missing-original-member' };
  assign(); assert.throws(f.run, /MEMBER_REQUIRED/);
  entry.originalRetentionRef = f.opaque; assign(); assert.equal(f.run().activationAllowed, false);
});
