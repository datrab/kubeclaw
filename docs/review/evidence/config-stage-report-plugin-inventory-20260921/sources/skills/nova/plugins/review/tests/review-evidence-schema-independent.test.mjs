import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

test('strict changed-path schema preserves original accepted domain across conditional branches', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../schemas/review-bundle.v1.schema.json', import.meta.url), 'utf8'));
  const original = JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-changed-path-schema.json', import.meta.url), 'utf8'));
  const current = new Ajv2020({ strict: true }).compile(schema.properties.scope.properties.changedPaths.items);
  // Historical comparator only: original generated schema could not compile in
  // strict mode. Current acceptance is compiled strictly, with no relaxed rule.
  const legacy = new Ajv2020({ strict: false }).compile(original.changedPathSchema);
  const paths = ['src/index.ts', '../escape.ts', '/absolute.ts', '', 'src//x.ts', 'src\\x.ts', null, 42];
  const previousPaths = [undefined, 'src/old.ts', '../old.ts', '', null, 42];
  const statuses = ['added', 'modified', 'deleted', 'renamed', 'copied', 'type_changed', 'unknown', null];
  let compared = 0;
  for (const status of statuses) for (const path of paths) for (const previousPath of previousPaths) {
    const value = { path, status, ...(previousPath === undefined ? {} : { previousPath }) };
    const expected = legacy(value);
    assert.equal(current(value), expected, JSON.stringify({ value, errors: current.errors }));
    assert.equal(current({ ...value, extra: true }), false, 'outer closed schema remains closed'); compared += 1;
  }
  for (const status of ['renamed', 'copied']) {
    assert.equal(current({ path: 'src/new.ts', previousPath: 'src/old.ts', status }), true);
    assert.equal(current({ path: 'src/new.ts', status }), false);
  }
  for (const status of ['added', 'modified', 'deleted', 'type_changed']) {
    assert.equal(current({ path: 'src/new.ts', status }), true);
    assert.equal(current({ path: 'src/new.ts', previousPath: 'src/old.ts', status }), false);
  }
  assert.equal(current({ status: 'modified' }), false); assert.equal(current({ path: 'src/index.ts' }), false);
  assert.equal(compared, 384);
  console.log(JSON.stringify({ strictCurrentSchema: true, comparedOriginalDomainVectors: compared, extraFieldNegatives: compared }));
});
