import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
const schema = JSON.parse(readFileSync(new URL('../../../skills/buster/contracts/project-profile/schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ strict: true }).compile(schema);
const base = () => ({ version: 'project-profile.v1', project: 'fixture', sourceRevision: 'a'.repeat(40), ttlSeconds: 60,
  values: [{ id: 'token', kind: 'random', bytes: 32, encoding: 'hex' }],
  secrets: [{ name: 'runtime', keys: [{ key: 'TOKEN', value: 'token', consumers: [{ workload: 'core', container: 'core' }] }] }] });
test('closed generic shape accepts generated values and explicit consumer bindings', () => {
  const p = base();
  assert.equal(validate(p), true, JSON.stringify(validate.errors));
  p.values.push({ id: 'joined', kind: 'concat', parts: [{ literal: 'prefix:' }, { ref: 'token' }] });
  assert.equal(validate(p), true, JSON.stringify(validate.errors));
});
const cases = [
  ['unknown field', p => { p.exec = 'shell'; }],
  ['executable primitive', p => { p.values[0].kind = 'exec'; }],
  ['foreign secret read', p => { p.values[0].secretKeyRef = 'foreign'; }],
  ['mutable revision', p => { p.sourceRevision = 'main'; }],
  ['excess TTL', p => { p.ttlSeconds = 3601; }],
  ['fractional size', p => { p.values[0].bytes = 32.5; }],
  ['excess size', p => { p.values[0].bytes = 4097; }],
  ['foreign namespace', p => { p.secrets[0].namespace = 'other'; }],
  ['implicit consumers', p => { p.secrets[0].keys[0].consumers = []; }],
  ['consumer escape', p => { p.secrets[0].keys[0].consumers[0].namespace = 'other'; }],
  ['unknown encoding', p => { p.values[0].encoding = 'shell'; }],
  ['excess count', p => { p.values = Array(17).fill(p.values[0]); }],
];
for (const [label, mutate] of cases) test('rejects ' + label, () => { const p = base(); mutate(p); assert.equal(validate(p), false); });
