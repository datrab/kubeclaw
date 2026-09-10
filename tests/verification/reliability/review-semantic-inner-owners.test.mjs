import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING, sha256Text } from '@kubeclaw/plugin-sdk';
import { getReviewPolicyProfile } from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import { resolveReviewPolicy, digestReviewPolicy, isVerifiedReviewPolicy, assertReviewPolicyBundle } from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import { REVIEW_SEMANTIC_ENCODING as mode } from '../../../skills/nova/plugins/review/src/review-semantics.ts';
import { produceSimplificationFacts } from '../../../skills/nova/plugins/review/src/simplification-fact-producer.ts';
import { buildSimplificationCandidateManifest, isCertifiedSimplificationManifest } from '../../../skills/nova/plugins/review/src/simplification-manifest.ts';
import { certifyReviewReductionInput, isCertifiedReductionPolicy } from '../../../skills/nova/plugins/review/src/review-reduction-state.ts';
import { reduceReviewDecision } from '../../../skills/nova/plugins/review/src/review-reducer.ts';
import { snapshotReviewBundle } from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import { verifyEchoReviewForReduction } from '../../../skills/nova/plugins/review/src/review-stage-verification.ts';
import { preflightEchoReviewProposals } from '../../../skills/nova/plugins/review/src/review-proposal-preflight.ts';

const changedPaths = [{ path: 'src/service.ts', status: 'modified' }];
const revision = { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text(canonicalJson(changedPaths)) };
const content = 'export function load(id: string) { return repository.load(id); }\n';
const context = [{ path: 'src/service.ts', content, digest: sha256Text(content), reasons: [{ kind: 'changed' }] }];
const resolve = encoding => resolveReviewPolicy({ builtIn: getReviewPolicyProfile('lean') }, encoding);

test('explicit policy provenance verifies every source, rejects cloned and mismatched authority, and retains omitted API bytes', () => {
  const builtIn = getReviewPolicyProfile('gate');
  const settingsFile = getReviewPolicyProfile('lean');
  const override = getReviewPolicyProfile('audit');
  const input = { builtIn, settingsFile, runOverride: { authorized: true, policy: override } };
  const legacy = resolveReviewPolicy(input);
  const portable = resolveReviewPolicy(input, mode);
  assert.equal(legacy.digest, sha256Text(canonicalJson(legacy.policy)));
  assert.equal(portable.digest, sha256Text(portableJson(portable.policy)));
  for (const [index, source] of [builtIn, settingsFile, override].entries()) {
    assert.equal(legacy.sources[index].digest, digestReviewPolicy(source));
    assert.equal(portable.sources[index].digest, digestReviewPolicy(source, mode));
  }
  assert.deepEqual(Object.keys(portable), Object.keys(legacy));
  assert.equal(isVerifiedReviewPolicy(portable, mode), true);
  assert.equal(isVerifiedReviewPolicy(legacy), true);
  assert.equal(isVerifiedReviewPolicy(portable), false);
  assert.equal(isVerifiedReviewPolicy(legacy, mode), false);
  for (const forged of [structuredClone(portable), Object.freeze({ ...portable }),
    Object.freeze({ ...portable, sources: legacy.sources }), Object.freeze({ ...legacy, encoding: mode })]) {
    assert.equal(isVerifiedReviewPolicy(forged, mode), false);
  }
  assert.throws(() => resolveReviewPolicy(input, 'review-semantics.future'));
  assert.throws(() => resolveReviewPolicy({ ...input, runOverride: { authorized: false, policy: override } }, mode));
  assert.throws(() => assertReviewPolicyBundle(portable, { schemaVersion: 'review-bundle.v1', policyDigest: portable.digest }));
  assert.throws(() => assertReviewPolicyBundle(legacy, { schemaVersion: 'review-bundle.v2', policyDigest: legacy.digest }));
  assert.throws(() => assertReviewPolicyBundle(portable, { schemaVersion: 'review-bundle.v2', policyDigest: sha256Text('wrong') }));
  assert.doesNotThrow(() => assertReviewPolicyBundle(legacy, { schemaVersion: 'review-bundle.v1', policyDigest: sha256Text('opaque legacy helper fixture') }));
});

test('policy owner rejects Proxy/getter/exotic JSON before invoking traps or accessors', () => {
  let calls = 0;
  const traps = { get() { calls++; }, ownKeys() { calls++; return []; }, getOwnPropertyDescriptor() { calls++; } };
  for (const value of [new Proxy({}, traps), { get builtIn() { calls++; return getReviewPolicyProfile('gate'); } },
    { builtIn: new Proxy({}, traps) }, { builtIn: { get schemaVersion() { calls++; return 'review-policy.v2'; } } }]) {
    assert.throws(() => resolveReviewPolicy(value, mode));
    assert.equal(calls, 0);
  }
  for (const value of [Array(2), { a: undefined }, { a: Infinity }, new Date(), { a: new Map() }]) {
    assert.throws(() => digestReviewPolicy(value, mode));
  }
});

test('generated evidence keeps v1 values and candidate IDs, with separately verified byte codec and mode-bound private certificate', () => {
  const legacyPolicy = resolve();
  const newPolicy = resolve(mode);
  const oldFacts = produceSimplificationFacts(revision, context);
  const newFacts = produceSimplificationFacts(revision, context, mode);
  assert.deepEqual(JSON.parse(newFacts.content), JSON.parse(oldFacts.content));
  assert.equal(Object.hasOwn(oldFacts, 'encoding'), false);
  assert.equal(newFacts.encoding, PORTABLE_JSON_ENCODING);
  assert.equal(newFacts.content, portableJson(JSON.parse(newFacts.content)));
  const build = (policy, evidence, encoding) => buildSimplificationCandidateManifest({ revision, evidence: [evidence], reviewedPaths: ['src/service.ts'], policy }, encoding);
  const oldManifest = build(legacyPolicy, oldFacts);
  const newManifest = build(newPolicy, newFacts, mode);
  assert.ok(oldManifest && newManifest);
  assert.equal(newManifest.manifest.schemaVersion, 'simplification-candidate-manifest.v1');
  assert.deepEqual(newManifest.manifest.candidates.map(x => x.candidateId), oldManifest.manifest.candidates.map(x => x.candidateId));
  assert.equal(newManifest.manifest.candidates[0].source.digest, newFacts.digest);
  assert.equal(newManifest.evidence.encoding, PORTABLE_JSON_ENCODING);
  assert.equal(newManifest.evidence.digest, sha256Text(portableJson(newManifest.manifest)));
  assert.equal(isCertifiedSimplificationManifest(newManifest.manifest, revision, newPolicy, mode), true);
  assert.equal(isCertifiedSimplificationManifest(newManifest.manifest, revision, newPolicy), false);
  assert.equal(isCertifiedSimplificationManifest(oldManifest.manifest, revision, legacyPolicy, mode), false);
  assert.equal(isCertifiedSimplificationManifest(structuredClone(newManifest.manifest), revision, newPolicy, mode), false);
  assert.throws(() => build(newPolicy, newFacts));
  assert.throws(() => build(legacyPolicy, oldFacts, mode));
});

test('reduction certifier keeps old public shape and binds the expected policy mode privately', () => {
  const input = policy => ({ resolvedPolicy: policy, integrityIssues: [], unverifiedRequirements: [], limitViolations: [], findings: [] });
  const old = certifyReviewReductionInput(input(resolve()));
  const current = certifyReviewReductionInput(input(resolve(mode)), mode);
  assert.deepEqual(Object.keys(current), Object.keys(old));
  assert.equal(isCertifiedReductionPolicy(current), true);
  assert.equal(isCertifiedReductionPolicy({ ...current }), false);
  assert.equal(reduceReviewDecision(current).outcome, reduceReviewDecision(old).outcome);
  assert.throws(() => certifyReviewReductionInput(input(resolve(mode))));
  assert.throws(() => certifyReviewReductionInput(input(resolve()), mode));
});

test('actual stored-candidate parser consumers check evidence bytes and mode, not the private producer certificate', () => {
  const policy = resolve(mode);
  const facts = produceSimplificationFacts(revision, context, mode);
  const built = buildSimplificationCandidateManifest({ revision, evidence: [facts], reviewedPaths: ['src/service.ts'], policy }, mode);
  const snapshot = snapshotReviewBundle({ schemaVersion: 'review-bundle.v2', task: { id: 'TASK-1', statement: 'Review.' },
    revisions: revision, scope: { allowedPrefixes: ['src'], changedPaths }, requirements: [{ id: 'REQ-1', statement: 'Works.' }],
    evidence: [facts, built.evidence], context, policyDigest: policy.digest,
    selection: { version: 'focused-context.v1', candidateManifestDigest: sha256Text('selection'), expansionRound: 0 } });
  const loaded = JSON.parse(portableJson(snapshot));
  assert.equal(isCertifiedSimplificationManifest(JSON.parse(built.evidence.content), revision, policy, mode), false);
  const reduction = verifyEchoReviewForReduction({ snapshot: loaded, policy, parsed: { ok: false, error: 'direct reader probe' } });
  assert.equal(reduction.simplification.candidateCount, 1);
  assert.deepEqual(reduction.integrityIssues, ['invalid Echo output: direct reader probe']);
  const echo = { inspectedEvidence: [], proposedFindings: [], requirementAssessments: {} };
  assert.deepEqual(preflightEchoReviewProposals(loaded.bundle, echo, policy, new Map()).integrityIssues, []);
  for (const corrupt of [
    item => { delete item.encoding; },
    item => { item.encoding = 'json.future'; },
    item => { item.content += ' '; item.digest = sha256Text(item.content); },
    item => { item.digest = sha256Text('wrong'); },
  ]) {
    const bad = structuredClone(loaded);
    const candidateEvidence = bad.bundle.evidence.find(item => item.kind === 'simplification-candidates');
    assert.ok(candidateEvidence);
    corrupt(candidateEvidence);
    const result = verifyEchoReviewForReduction({ snapshot: bad, policy, parsed: { ok: false, error: 'direct reader probe' } });
    assert.match(result.integrityIssues.join('\n'), /manifest.*(?:digest|encoding)/i);
    assert.match(preflightEchoReviewProposals(bad.bundle, echo, policy, new Map()).integrityIssues.join('\n'), /manifest.*(?:digest|encoding)/i);
  }
});

test('direct original policy and evidence owners in genuine en/cs processes are portable only under explicit mode (not a Core lifecycle gate)', () => {
  const base = new URL('../../../skills/nova/plugins/review/src/', import.meta.url).href;
  const script = `import { resolveReviewPolicy } from ${JSON.stringify(base + 'review-policy-resolver.ts')};
    import { getReviewPolicyProfile } from ${JSON.stringify(base + 'review-policy-profiles.ts')};
    import { produceSimplificationFacts } from ${JSON.stringify(base + 'simplification-fact-producer.ts')};
    import { buildSimplificationCandidateManifest } from ${JSON.stringify(base + 'simplification-manifest.ts')};
    const mode = ${JSON.stringify(mode)}, revision = ${JSON.stringify(revision)}, context = ${JSON.stringify(context)};
    const result = {};
    for (const encoding of [undefined, mode]) {
      const policy = resolveReviewPolicy({ builtIn: getReviewPolicyProfile('lean'), settingsFile: getReviewPolicyProfile('audit') }, encoding);
      const facts = produceSimplificationFacts(revision, context, encoding);
      const manifest = buildSimplificationCandidateManifest({ revision, evidence: [facts], reviewedPaths: ['src/service.ts'], policy }, encoding);
      result[encoding ?? 'legacy'] = { policy: policy.digest, sources: policy.sources, facts, manifest: manifest.evidence,
        candidateIds: manifest.manifest.candidates.map(x => x.candidateId) };
    }
    console.log(JSON.stringify({locale: new Intl.Collator().resolvedOptions().locale, result}));`;
  const run = locale => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8',
      env: { ...process.env, LANG: locale, LC_ALL: locale }, timeout: 15000 });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const en = run('en_US.UTF-8'), cs = run('cs_CZ.UTF-8');
  assert.match(en.locale, /^en/); assert.match(cs.locale, /^cs/);
  assert.deepEqual(en.result[mode], cs.result[mode]);
  assert.notEqual(en.result.legacy.policy, cs.result.legacy.policy);
  assert.notEqual(en.result.legacy.facts.digest, cs.result.legacy.facts.digest);
  assert.deepEqual(en.result.legacy.candidateIds, cs.result.legacy.candidateIds);
  console.log(JSON.stringify({ boundary: 'direct owners only', en: en.locale, cs: cs.locale, portable: en.result[mode] }));
});
