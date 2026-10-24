import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { admitProjectProfile } from '../../../skills/buster/contracts/project-profile/admission.mts';
const corpus = JSON.parse(readFileSync(new URL('../../../skills/buster/contracts/project-profile/admission-vectors.json', import.meta.url), 'utf8'));
assert.equal(corpus.version, 1);
assert.equal(new Set(corpus.vectors.map(v => v.name)).size, corpus.vectors.length);
for (const vector of corpus.vectors) test(`shared admission vector: ${vector.name}`, () => {
  if (vector.expected.error) {
    assert.throws(() => admitProjectProfile(vector.raw, vector.policy), { message: vector.expected.error });
  } else {
    const result = admitProjectProfile(vector.raw, vector.policy);
    assert.equal(result.generatedBytes, vector.expected.generatedBytes);
    assert.equal(result.outputBytes, vector.expected.outputBytes);
  }
});
