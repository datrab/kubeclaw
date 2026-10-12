import assert from 'node:assert/strict';

import { parseSimplificationCandidateManifest, parseSimplificationFacts } from '../src/simplification-parser.ts';

const digest = (value) => `sha256:${value.repeat(64)}`;
const facts = {
  schemaVersion: 'simplification-facts.v1',
  revision: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: digest('3') },
  facts: [{
    factId: 'unused.helper', ruleId: 'SIM001', confidence: 'high', path: 'src/helper.ts',
    symbol: 'helper', basis: 'The deterministic analyzer found no references.',
    smallestReplacement: 'Delete the unused helper.', estimatedNetLocReduction: 8,
  }],
};
const parsedFacts = parseSimplificationFacts(facts);
assert.equal(parsedFacts.ok, true);
assert.equal(Object.isFrozen(parsedFacts.value.facts[0]), true);
assert.equal(parseSimplificationFacts({ ...facts, extra: true }).ok, false);
assert.equal(parseSimplificationFacts({ ...facts, facts: [...facts.facts, ...facts.facts] }).ok, false);
assert.equal(parseSimplificationFacts({ ...facts, facts: [{ ...facts.facts[0], path: '../escape.ts' }] }).ok, false);

const manifest = {
  schemaVersion: 'simplification-candidate-manifest.v1', registryVersion: 'simplification-rules.v1',
  revision: facts.revision,
  candidates: [{
    candidateId: digest('4'), ruleId: 'SIM001', category: 'delete', confidence: 'high',
    path: 'src/helper.ts', symbol: 'helper', basis: facts.facts[0].basis,
    smallestReplacement: facts.facts[0].smallestReplacement,
    source: { kind: 'simplification-facts', digest: digest('5'), factId: 'unused.helper' },
    estimatedNetLocReduction: 8,
  }],
  diagnostics: [{ sourceDigest: digest('6'), code: 'revision_mismatch', message: 'The source is stale.' }],
};
const parsedManifest = parseSimplificationCandidateManifest(manifest);
assert.equal(parsedManifest.ok, true);
assert.equal(Object.isFrozen(parsedManifest.value.candidates[0].source), true);
assert.equal(parseSimplificationCandidateManifest({ ...manifest, registryVersion: 'future' }).ok, false);
assert.equal(parseSimplificationCandidateManifest({
  ...manifest, candidates: [{ ...manifest.candidates[0], category: 'native' }],
}).ok, false, 'registry semantics are enforced at the parser boundary');
assert.equal(parseSimplificationCandidateManifest({
  ...manifest, diagnostics: [...manifest.diagnostics, ...manifest.diagnostics],
}).ok, false);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'simplification-contract' }));
