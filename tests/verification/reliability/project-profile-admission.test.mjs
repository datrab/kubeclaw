import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { admitProjectProfile } from '../../../skills/buster/contracts/project-profile/admission.mts';
const base = () => ({ version: 'project-profile.v1', project: 'fixture', sourceRevision: 'a'.repeat(40), ttlSeconds: 60,
  values: [{ id: 'token', kind: 'random', bytes: 32, encoding: 'hex' }],
  secrets: [{ name: 'runtime', keys: [{ key: 'TOKEN', value: 'token', consumers: [{ workload: 'core', container: 'core' }] }] }] });
function check(p, overrides = {}) {
  const raw = typeof p === 'string' ? p : JSON.stringify(p);
  return admitProjectProfile(raw, { authenticatedProject: 'fixture', authorizedDigest: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
    sourceRevision: 'a'.repeat(40), maxOutputBytes: 65536, maxTtlSeconds: 3600, ...overrides });
}
test('accounts encoded random, concat and repeated output bytes without generating credentials', () => {
  const p = base();
  p.values.push({ id: 'joined', kind: 'concat', parts: [{ literal: 'key:' }, { ref: 'token' }] });
  p.secrets[0].keys.push({ ...p.secrets[0].keys[0], key: 'JOINED', value: 'joined' });
  const result = check(p);
  assert.equal(result.generatedBytes, 132);
  assert.equal(result.outputBytes, 132);
  assert.equal(check(base(), { maxOutputBytes: 64 }).outputBytes, 64);
});
const cases = [
  ['duplicate value', p => p.values.push(p.values[0]), 'DUPLICATE_VALUE'],
  ['self reference', p => p.values.push({ id: 'cycle', kind: 'concat', parts: [{ ref: 'cycle' }] }), 'REFERENCE'],
  ['forward reference', p => p.values.unshift({ id: 'early', kind: 'concat', parts: [{ ref: 'token' }] }), 'REFERENCE'],
  ['missing output reference', p => { p.secrets[0].keys[0].value = 'missing'; }, 'REFERENCE'],
  ['duplicate secret', p => p.secrets.push(p.secrets[0]), 'DUPLICATE_SECRET'],
  ['duplicate key', p => p.secrets[0].keys.push(p.secrets[0].keys[0]), 'DUPLICATE_KEY'],
  ['duplicate consumer', p => p.secrets[0].keys[0].consumers.push(p.secrets[0].keys[0].consumers[0]), 'DUPLICATE_CONSUMER'],
  ['journal output', p => { p.secrets[0].name = 'buster-private-journal'; }, 'RESERVED_NAME'],
  ['project mismatch', p => { p.project = 'foreign'; }, 'IDENTITY'],
  ['revision mismatch', p => { p.sourceRevision = 'b'.repeat(40); }, 'IDENTITY'],
  ['closed shape', p => { p.command = 'private-canary'; }, 'SHAPE'],
];
for (const [label, mutate, code] of cases) test(`rejects ${label} with sanitized error`, () => {
  const p = base(); mutate(p);
  assert.throws(() => check(p), { message: `PROJECT_PROFILE_${code}` });
});
test('enforces independent policy and byte-exact digest, not parsed object equivalence', () => {
  assert.throws(() => check(base(), { authorizedDigest: 'sha256:' + '0'.repeat(64) }), /PROJECT_PROFILE_DIGEST/);
  assert.throws(() => check(base(), { maxOutputBytes: 0 }), /PROJECT_PROFILE_POLICY/);
  assert.throws(() => check(base(), { maxOutputBytes: 63 }), /PROJECT_PROFILE_GENERATED_BYTES/);
  const p = base(); p.ttlSeconds = 61;
  assert.throws(() => check(p, { maxTtlSeconds: 60 }), /PROJECT_PROFILE_TTL/);
  assert.throws(() => check(' '.repeat(65537)), /PROJECT_PROFILE_DOCUMENT_SIZE/);
  assert.throws(() => check('{'), /PROJECT_PROFILE_JSON/);
});
test('output duplication cannot bypass aggregate ceiling', () => {
  const p = base(); p.secrets.push({ ...p.secrets[0], name: 'second' });
  assert.throws(() => check(p, { maxOutputBytes: 64 }), /PROJECT_PROFILE_OUTPUT_BYTES/);
});
