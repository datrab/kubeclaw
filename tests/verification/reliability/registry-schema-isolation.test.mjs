import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateReferencedSchema } from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';

test('meta-validation rejects invalid documents before isolated strict compilation', () => {
  const invalid = [
    { type: 'not-a-json-type' },
    { type: 'object', required: 'field' },
    { type: 'object', properties: { field: { minLength: -1 } } },
    { type: 'string', pattern: '[' },
    { type: 'object', unknownKeyword: true },
    { $ref: 'https://example.test/not-registered' },
  ];
  const failures = invalid.map((schema, index) => {
    let failure;
    assert.throws(() => validateReferencedSchema(JSON.stringify(schema), `invalid:${index}`), (error) => {
      failure = error;
      return error.code === 'REGISTRY_MANIFEST_INVALID';
    });
    return { failure, details: JSON.stringify(failure.details) };
  });
  validateReferencedSchema('{"type":"object"}', 'valid');
  for (const { failure, details } of failures) assert.equal(JSON.stringify(failure.details), details);
});

test('real changed schema files retain independent ids, defaults and old snapshots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-meta-isolation-'));
  try {
    const file = path.join(root, 'config.json');
    const load = (revision) => {
      fs.writeFileSync(file, JSON.stringify({
        $id: 'https://example.test/same-id', type: 'object',
        properties: { revision: { type: 'string', const: revision, default: revision } },
        required: ['revision'], additionalProperties: false,
      }));
      return validateReferencedSchema(fs.readFileSync(file, 'utf8'), file);
    };
    const first = load('first');
    const second = load('second');
    const repeated = load('second');
    const input = {};
    assert.deepEqual(first.resolve(input), { revision: 'first' });
    assert.deepEqual(second.resolve(input), { revision: 'second' });
    assert.deepEqual(repeated.resolve(input), { revision: 'second' });
    assert.deepEqual(input, {});
    first.validate({ revision: 'first' });
    assert.throws(() => first.validate({ revision: 'second' }));
    assert.throws(() => second.validate({ revision: 'first' }));
    assert.throws(() => validateReferencedSchema(JSON.stringify({
      $ref: 'https://example.test/same-id',
    }), 'unregistered-id'), (error) => error.code === 'REGISTRY_MANIFEST_INVALID');
    assert.throws(() => validateReferencedSchema(JSON.stringify({
      $id: 'https://example.test/same-id', type: 'invalid',
    }), 'same-id-invalid'), (error) => error.code === 'REGISTRY_MANIFEST_INVALID');
    const accepts = validateReferencedSchema('true', 'boolean-true');
    accepts.validate({ arbitrary: true });
    const rejects = validateReferencedSchema('false', 'boolean-false');
    assert.throws(() => rejects.validate({}));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
