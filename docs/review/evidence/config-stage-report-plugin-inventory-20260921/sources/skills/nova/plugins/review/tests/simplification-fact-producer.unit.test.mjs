import assert from 'node:assert/strict';
import { sha256Text } from '@kubeclaw/plugin-sdk';
import { produceSimplificationFacts } from '../src/simplification-fact-producer.ts';

const content = 'export function load(id: string) { return repository.load(id); }\n';
const evidence = produceSimplificationFacts({ base: '1'.repeat(40), head: '2'.repeat(40),
  changedManifestDigest: sha256Text('manifest') }, [
  { path: 'src/service.ts', content, digest: sha256Text(content), reasons: [{ kind: 'changed' }] },
]);
const facts = JSON.parse(evidence.content);
assert.equal(evidence.kind, 'simplification-facts'); assert.equal(facts.facts.length, 1);
assert.equal(facts.facts[0].ruleId, 'SIM002'); assert.equal(facts.facts[0].confidence, 'high');
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'simplification-fact-producer' }));
