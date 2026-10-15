import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseDocument } from 'yaml';

export interface ProvisioningArtifactReference { artifactSha256: string; memberPointer: string }
interface Validator { (value: unknown): boolean }
const schema = JSON.parse(fs.readFileSync(new URL('./provisioning-task-reference.schema.json', import.meta.url), 'utf8'));
const Constructor = Ajv2020 as unknown as new (options: object) => {
  addSchema(schema: object): void; compile(schema: object): Validator;
};
const ajv = new Constructor({ strict: true, allErrors: true, allowUnionTypes: true });
ajv.addSchema(schema);
const envelopeValidator = ajv.compile({ $ref: schema.$id });
const definitions = new Map<string, Validator>();
function requireIdentity(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`PROVISIONING_TASK_REFERENCE_INVALID:${reason}`);
}
function valid(name: string, value: unknown): void {
  let validator = definitions.get(name);
  if (!validator) { validator = ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` }); definitions.set(name, validator); }
  requireIdentity(validator(value), name);
}
function parse(bytes: Uint8Array): any {
  const raw = Buffer.from(bytes).toString('utf8');
  try {
    requireIdentity(parseDocument(raw, { version: '1.2', schema: 'json', uniqueKeys: true, strict: true }).errors.length === 0, 'JSON_KEYS');
    return JSON.parse(raw);
  } catch { throw new Error('PROVISIONING_TASK_REFERENCE_INVALID:JSON'); }
}
function member(document: any, pointer: string): any {
  if (pointer === '') return document;
  let value = document;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    requireIdentity(value !== null && typeof value === 'object' && Object.hasOwn(value, key), 'MEMBER_REQUIRED');
    if (Array.isArray(value)) requireIdentity(/^(0|[1-9][0-9]*)$/.test(key), 'ARRAY_MEMBER');
    value = value[key];
  }
  return value;
}
function unique(rows: any[], key: (row: any) => unknown[], reason: string) {
  const seen = new Set<string>();
  for (const row of rows) {
    const identity = JSON.stringify(key(row)); requireIdentity(!seen.has(identity), reason); seen.add(identity);
  }
}

/** Untrusted reference/record inspection, NOT an authenticated task receiver.
 * Caller must enforce actual original store/provider byte budgets BEFORE reading
 * bytes. This callback is transport only: no callback result, matching digest,
 * scope label, FD/file ownership or schema match authenticates an action.
 * Never consume confidential values here. No values/provider errors are returned.
 * Productive FD9/issuer/clock/grant/per-object phase checks remain mandatory.
 */
export function inspectProvisioningTaskReferences(envelopeBytes: Uint8Array,
  readOriginalArtifact: (artifactSha256: string) => Uint8Array) {
  const envelope = parse(envelopeBytes);
  requireIdentity(envelopeValidator(envelope), 'ENVELOPE');
  const cache = new Map<string, any>();
  const resolve = (ref: ProvisioningArtifactReference): any => {
    valid('artifactReference', ref);
    if (!cache.has(ref.artifactSha256)) {
      let bytes: Buffer;
      try { bytes = Buffer.from(readOriginalArtifact(ref.artifactSha256)); }
      catch { throw new Error('PROVISIONING_TASK_REFERENCE_INVALID:ORIGINAL_ARTIFACT_UNAVAILABLE'); }
      requireIdentity(createHash('sha256').update(bytes).digest('hex') === ref.artifactSha256, 'ARTIFACT_SHA');
      cache.set(ref.artifactSha256, parse(bytes));
    }
    return member(cache.get(ref.artifactSha256), ref.memberPointer);
  };
  // All envelope refs are required; even an empty authorization set must resolve
  // explicitly. No missing original grant/source ref becomes an empty default.
  for (const [key, ref] of Object.entries(envelope)) if (key.endsWith('Ref')) resolve(ref as ProvisioningArtifactReference);
  const source = resolve(envelope.sourceRevisionSetRef), targets = resolve(envelope.targetObservationSetRef);
  const mutations = resolve(envelope.replacementAuthorizationRef), association = resolve(envelope.retainedApplicationRecoveryRef);
  for (const [name, record] of [['sourceRevisionSet', source], ['targetObservationSet', targets],
    ['replacementAuthorizationSet', mutations], ['applicationAssociation', association]] as const) {
    valid(name, record); requireIdentity(record.taskId === envelope.taskId, 'CROSS_TASK_RECORD');
  }
  const inspectedRevisions = new Set<object>();
  const inspectRevisions = (record: any) => {
    valid('sourceRevisionSet', record); requireIdentity(record.taskId === envelope.taskId, 'CROSS_TASK_REVISIONS');
    if (inspectedRevisions.has(record)) return;
    inspectedRevisions.add(record);
    unique(record.entries, row => [row.providerIdentity, row.namespace, row.objectName, row.key], 'DUPLICATE_SOURCE');
    for (const entry of record.entries) {
      resolve(entry.providerSchemaRef); resolve(entry.originalAccessGrantRef); resolve(entry.originalRetentionRef);
    }
  };
  inspectRevisions(source);
  unique(targets.entries, row => [row.familyId], 'DUPLICATE_TARGET_FAMILY');
  unique(targets.entries, row => [row.namespace, row.objectName], 'DUPLICATE_TARGET_OBJECT');
  for (const target of targets.entries) {
    const revisions = resolve(target.confidentialRevisionSetRef);
    inspectRevisions(revisions);
  }
  resolve(mutations.issuerAuthorizationRef);
  unique(mutations.actions, row => [row.familyId, row.targetObservationRef.artifactSha256,
    row.targetObservationRef.memberPointer, row.action], 'DUPLICATE_ACTION');
  for (const action of mutations.actions) {
    const target = resolve(action.targetObservationRef);
    requireIdentity(targets.entries.includes(target) && target.familyId === action.familyId, 'EXACT_TARGET_REFERENCE');
    resolve(action.originalIssuerOrSourceRef); resolve(action.retainedConsumerRecoveryRef);
  }
  for (const [key, ref] of Object.entries(association)) if (key.endsWith('Ref') && ref !== null) resolve(ref as ProvisioningArtifactReference);
  if (association.state === 'captured' || association.state === 'captured-awaiting-consumer') {
    requireIdentity((association.saltPresence === 'present') === (association.saltRevisionRef !== null), 'SALT_PRESENCE');
  }
  // No record content or opaque credential revision is exposed by diagnostics.
  // Captured-awaiting-consumer is NOT promoted to usable/captured acceptance.
  return Object.freeze({ taskId: envelope.taskId as string, mode: envelope.mode as 'new' | 'resume' | 'reconcile',
    associationState: association.state as string, sourceCount: source.entries.length as number,
    targetCount: targets.entries.length as number, actionCount: mutations.actions.length as number,
    artifactCount: cache.size, activationAllowed: false as const });
}
