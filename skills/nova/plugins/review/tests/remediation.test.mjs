import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { get_encoding } from 'tiktoken';
import { getEncoding } from 'js-tiktoken';
import { sha256Text } from '@kubeclaw/plugin-sdk';
import { countReviewTextTokens } from '../src/review-prompt-budget.ts';
import { reusableReviewResult, selectedReviewIncomplete } from '../src/review-completion.ts';
import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import { preflightScalableReviewResults } from '../src/scalable-review-verification.ts';
import { ReviewPhaseAdmission, ReviewPhaseAdmissionError } from '../src/review-phase-admission.ts';
import { resolveRepositoryReviewProfile } from '../src/repository-review-profile.ts';
import { produceSimplificationFacts } from '../src/simplification-fact-producer.ts';
import { parseSimplificationFacts } from '../src/simplification-parser.ts';
import { simplificationFactsSchema } from '../src/simplification-contract.ts';
import { mineSimplificationCandidates } from '../src/simplification-miner.ts';
import { resolveReviewPolicy } from '../src/review-policy-resolver.ts';
import { getReviewPolicyProfile } from '../src/review-policy-profiles.ts';
import { REVIEW_HARD_LIMITS } from '../src/review-hard-limits.ts';

// Compare actual BPE token sequences to the existing native runtime tokenizer.
for (const encoding of ['cl100k_base', 'o200k_base']) {
  const native = get_encoding(encoding); const javascript = getEncoding(encoding);
  try {
    for (const text of ['', 'hello world', '日本語 العربية 👩🏽‍💻', '\ud800',
      'function $wrap(x) { return target(x); }', JSON.stringify({ nested: [1, 'é'] }, null, 2)]) {
      assert.deepEqual(javascript.encode(text), [...native.encode(text)]);
      assert.equal(countReviewTextTokens(text, encoding), native.encode(text).length);
    }
    assert.throws(() => countReviewTextTokens('<|endoftext|>', encoding));
  } finally { native.free(); }
}
const source = { path: 'src/a.ts', content: 'export const a = 1;', digest: sha256Text('export const a = 1;'),
  complete: true, ranges: [{ startLine: 1, endLine: 1 }] };
const evidence = { kind: 'reviewed-source', digest: source.digest };
const job = { schemaVersion: 'scalable-review-job.v1', id: 'component:a', kind: 'component', source: [source],
  relationKeys: [], relatedIds: ['a'], requirements: [{ id: 'correctness', text: 'Correct.' }],
  task: 'Review.', digest: sha256Text('job') };
const good = { schemaVersion: 'echo-review-output.v1', summary: 'Reviewed.', inspectedEvidence: [evidence],
  requirementAssessments: { correctness: { assessment: 'satisfied', explanation: 'The source meets the requirement.', evidence: [evidence] } },
  proposedFindings: [] };
const requested = { ...good, requirementAssessments: { correctness: { assessment: 'unverified',
  explanation: 'More context is required.', evidence: [] } }, contextRequest: {
  paths: ['src/context.ts'], requirementIds: ['correctness'], reason: 'Need caller context.',
} };
const foreignEvidence = { ...evidence, digest: sha256Text('foreign') };
const foreign = { ...good, inspectedEvidence: [foreignEvidence], requirementAssessments: {
  correctness: { ...good.requirementAssessments.correctness, evidence: [foreignEvidence] },
} };
assert.equal(parseEchoReviewOutput(foreign).ok, true, 'the evidence mismatch reaches preflight as structurally valid output');
for (const raw of [{ garbage: true }, foreign, requested]) {
  const result = { jobId: job.id, jobDigest: job.digest, parsed: parseEchoReviewOutput(raw) };
  const preflight = preflightScalableReviewResults([job], [result]);
  assert.equal(selectedReviewIncomplete(preflight, new Set()), true);
  assert.equal(reusableReviewResult(job, result, false), false, 'invalid terminal responses cannot be checkpointed/reused');
}
const valid = { jobId: job.id, jobDigest: job.digest, parsed: parseEchoReviewOutput(good) };
assert.equal(valid.parsed.ok, true);
assert.equal(reusableReviewResult(job, valid, false), true);
assert.equal(selectedReviewIncomplete(preflightScalableReviewResults([job], [valid]), new Set()), false);
const request = { jobId: job.id, jobDigest: job.digest, parsed: parseEchoReviewOutput(requested) };
assert.equal(request.parsed.ok, true);
assert.equal(reusableReviewResult(job, request, true), true, 'initial context requests remain resumable');
assert.equal(selectedReviewIncomplete(preflightScalableReviewResults([job], [request]), new Set([job.id])), false,
  'policy-deferred expansion is explicitly distinct from incomplete selected work');

const admission = new ReviewPhaseAdmission(3);
const concurrent = await Promise.allSettled(Array.from({ length: 12 }, async () => { await Promise.resolve(); admission.retry(); }));
assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 3);
assert.equal(concurrent.filter((result) => result.status === 'rejected' && result.reason instanceof ReviewPhaseAdmissionError).length, 9);
assert.throws(() => ReviewPhaseAdmission.requireJobs(2, 1), /job budget exceeded/u);
for (const prefix of ['../escape', 'src//nested', 'src/../escape', 'src/./file', '/src', 'src\\a', 'src:a', 'src\0a']) {
  assert.throws(() => resolveRepositoryReviewProfile({ scope: { kind: 'path', prefixes: [prefix] } }), /scope is invalid/u);
}

const revision = { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text('manifest') };
const content = [
  'export function good(x) { return target(x); }',
  'function $wrap(x) { return target(x); }', 'function _wrap(x) { return target(x); }',
  'function outerA() { function local(x) { return target(x); } }',
  'function outerB() { function local(x) { return target(x); } }',
  '// function ghost(x) { return target(x); }',
  'const decoy = "function ghost(x) { return target(x); }";',
  'const template = `function ghost(x) { return target(x); }`;',
  'function defaults(x = 1) { return target(x); }',
].join('\n');
const context = (text) => [{ path: 'src/a.ts', content: text, digest: sha256Text(text), reasons: [{ kind: 'changed' }] }];
const produced = produceSimplificationFacts(revision, context(content));
for (const source of [
  'function wrap() { return target("constant"); }',
  'function wrap(x) { return\n target(x); }',
  'function wrap(x) { return /* newline\n */ target(x); }',
  'function wrap(x) { return target(x, "constant"); }',
  'function wrap() { return target(/constant/); }',
  'function wrap(x) { return target(`${x}`); }',
  'function wrap(x) { "side effect directive"; return target(x); }',
]) assert.equal(JSON.parse(produceSimplificationFacts(revision, context(source)).content).facts.length, 0, source);
for (const newline of ['\n', '\r', '\u2028', '\u2029']) {
  for (const separator of [newline, `/*${newline}*/`]) {
    const source = `function wrap(x) { return${separator} target(x); }`;
    assert.equal(JSON.parse(produceSimplificationFacts(revision, context(source)).content).facts.length, 0, source);
  }
}
assert.equal(JSON.parse(produceSimplificationFacts(revision, context(
  'function commented(x /* parameter */) { /* body */ return target(/* argument */ x); }',
)).content).facts.length, 1);

const jsx = produceSimplificationFacts(revision, [{ ...context('<div>function ghost(x) { return target(x); }</div>')[0], path: 'src/decoy.tsx' }]);
assert.equal(JSON.parse(jsx.content).facts.length, 0);
assert.equal(JSON.parse(jsx.content).omittedSourceCount, 1);
const parsed = parseSimplificationFacts(JSON.parse(produced.content));
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.value.facts.map(({ symbol }) => symbol).sort(), ['$wrap', '_wrap', 'good', 'local', 'local'].sort());
assert.equal(new Set(parsed.value.facts.map(({ factId }) => factId)).size, 5);
const validateFacts = new Ajv2020({ strict: true }).compile(simplificationFactsSchema);
assert.equal(validateFacts(JSON.parse(produced.content)), true, JSON.stringify(validateFacts.errors));
const large = produceSimplificationFacts(revision, context(Array.from({ length: REVIEW_HARD_LIMITS.simplificationFacts + 2 },
  (_, index) => `function wrap${index}(x) { return target(x); }`).join('\n')));
const bounded = parseSimplificationFacts(JSON.parse(large.content));
assert.equal(bounded.ok, true); assert.equal(bounded.value.facts.length, REVIEW_HARD_LIMITS.simplificationFacts);
assert.equal(bounded.value.omittedFactCount, 2);
const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('audit') });
const mined = mineSimplificationCandidates({ revision, reviewedPaths: ['src/a.ts'], policy, evidence: [large] });
assert.ok(mined.diagnostics.some((item) => item.code === 'candidate_limit' && item.message.includes('2 source fact')));
assert.ok(mined.candidates.length > 0);
console.log(JSON.stringify({ ok: true, findings: ['AUDIT-001', 'AUDIT-003', 'POLICY-002'], tokenizerParity: true, mocks: 0 }));
