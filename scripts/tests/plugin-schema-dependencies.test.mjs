import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dependencySchemaFacts } from '../plugin-schema-dependencies.mjs';

test('walks dictionaries and patterned keys with conditional Secret requirements and forbidden tokens', () => {
  const schema = { type: 'object', properties: { targets: { additionalProperties: { properties: {
    endpoint: { type: 'string', format: 'uri' }, authentication: { enum: ['hmac', 'spiffe-proxy'], default: 'hmac' }, tokenSecret: { type: 'string' },
  }, allOf: [{ if: { properties: { authentication: { const: 'spiffe-proxy' } }, required: ['authentication'] },
    then: { properties: { endpoint: { pattern: '^http://localhost:' } }, not: { required: ['tokenSecret'] } }, else: { required: ['tokenSecret'] } }] } },
  channels: { patternProperties: { '^operator:': { properties: { receiptEndpoint: { type: 'string' } } } } } } };
  const facts = dependencySchemaFacts(schema);
  assert.ok(facts.fields.some((item) => item.path === 'targets{key}.endpoint' && !item.conditions.length));
  assert.ok(facts.fields.some((item) => item.path === 'targets{key}.endpoint' && item.conditions.some((condition) => condition.includes('spiffe-proxy'))));
  assert.ok(facts.fields.some((item) => item.path === 'channels{key matches "^operator:"}.receiptEndpoint'));
  assert.ok(facts.predicates.some((item) => item.keyword === 'not' && item.value.required.includes('tokenSecret') && item.conditions.some((condition) => condition.startsWith('if '))));
  assert.ok(facts.predicates.some((item) => item.keyword === 'required' && item.value.includes('tokenSecret') && item.conditions.some((condition) => condition.startsWith('unless '))));
  assert.deepEqual(facts.diagnostics, []);
});

test('retains reference siblings and resolves escaped JSON pointers and external files', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-schema-dependency-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'target.json'), JSON.stringify({ $defs: { endpoint: { type: 'string', format: 'uri' } } }));
  const facts = dependencySchemaFacts({ $defs: { 'a/b': { properties: { tokenSecret: { type: 'string' } } } }, properties: {
    target: { $ref: '#/$defs/a~1b', properties: { endpoint: { $ref: 'target.json#/$defs/endpoint', maxLength: 128 } } },
  } }, path.join(directory, 'config.json'));
  assert.ok(facts.fields.some((item) => item.path === 'target.tokenSecret'));
  assert.ok(facts.fields.some((item) => item.path === 'target.endpoint' && item.constraints.format === 'uri'));
  assert.ok(facts.fields.some((item) => item.path === 'target.endpoint' && item.constraints.maxLength === 128));
  assert.deepEqual(facts.diagnostics, []);
});

test('retains tuple positions, dependent schemas, negation and paired endpoint/credential dependencies', () => {
  const facts = dependencySchemaFacts({ properties: {
    tuple: { prefixItems: [{ properties: { endpoint: { type: 'string' } } }, { properties: { tokenSecret: {} } }] },
    target: { properties: { resultEndpoint: {}, resultTokenSecret: {} }, dependentRequired: { resultEndpoint: ['resultTokenSecret'], resultTokenSecret: ['resultEndpoint'] },
      dependentSchemas: { resultEndpoint: { properties: { endpoint: { type: 'string' } }, required: ['endpoint'] } }, not: { properties: { password: { const: '' } }, required: ['password'] } },
  } });
  assert.ok(facts.fields.some((item) => item.path === 'tuple[0].endpoint'));
  assert.ok(facts.fields.some((item) => item.path === 'tuple[1].tokenSecret'));
  assert.ok(facts.fields.some((item) => item.path === 'target.endpoint' && item.conditions.includes('when target.resultEndpoint is present')));
  assert.ok(facts.fields.some((item) => item.path === 'target.password' && item.conditions[0].startsWith('forbidden matching schema')));
  assert.deepEqual(facts.predicates.find((item) => item.keyword === 'dependentRequired').value, { resultEndpoint: ['resultTokenSecret'], resultTokenSecret: ['resultEndpoint'] });
});

test('unresolved local, external and dynamic references remain fail-closed diagnostics', () => {
  const facts = dependencySchemaFacts({ properties: {
    local: { $ref: '#/$defs/absent' }, external: { $ref: 'https://unknown.example/schema.json' }, dynamic: { $dynamicRef: '#dynamic' },
  } });
  assert.equal(facts.diagnostics.length, 3);
  assert.match(facts.diagnostics.join(' '), /Unresolved schema reference #\/\$defs\/absent/u);
  assert.match(facts.diagnostics.join(' '), /Dynamic schema reference requires scope resolution/u);
});

test('recursive references terminate without dropping their finite dependency fields', () => {
  const facts = dependencySchemaFacts({ $defs: { target: { properties: { endpoint: { type: 'string' }, next: { $ref: '#/$defs/target' } } } }, properties: { target: { $ref: '#/$defs/target' } } });
  assert.ok(facts.fields.some((item) => item.path === 'target.endpoint'));
  assert.ok(facts.predicates.some((item) => item.keyword === 'recursive schema boundary'));
  assert.deepEqual(facts.diagnostics, []);
});

test('the shipped dispatch and messaging dictionaries preserve all endpoint and Secret selectors', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  for (const [relative, expected] of [
    ['skills/common/plugins/runtime-dispatch/schemas/config.schema.json', ['targets{key}.endpoint', 'targets{key}.tokenSecret']],
    ['skills/common/plugins/runtime-dispatch/schemas/openclaw-config.schema.json', ['targets{key}.resultEndpoint', 'targets{key}.resultTokenSecret']],
    ['skills/common/plugins/transport-publisher/schemas/config.schema.json', ['targets{key}.endpoint', 'targets{key}.signingSecret']],
  ]) {
    const file = path.join(root, relative);
    const facts = dependencySchemaFacts(JSON.parse(fs.readFileSync(file, 'utf8')), file);
    for (const field of expected) assert.ok(facts.fields.some((item) => item.path === field), field);
    assert.deepEqual(facts.diagnostics, []);
  }
  const file = path.join(root, 'skills/common/plugins/operator-messaging/schemas/config.schema.json');
  const facts = dependencySchemaFacts(JSON.parse(fs.readFileSync(file, 'utf8')), file);
  for (const name of ['endpoint', 'endpointOrigin', 'endpointSecret', 'tokenSecret', 'receiptEndpoint']) assert.ok(facts.fields.some((item) => item.path.startsWith('targets{key matches ') && item.path.endsWith(`.${name}`)));
});
