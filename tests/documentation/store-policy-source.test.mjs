import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { extractStorePolicySource } from '../../scripts/lib/docs-store-policy-source.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('real RAM cache declarations preserve count versus byte authority', () => {
  const source = 'skills/prism/engine/execution-cache.ts';
  const facts = ['maximumInFlight', 'maximumCompletedEntries', 'maximumCompletedBytes'].map(property =>
    extractStorePolicySource(source, read(source), {
      kind: 'typescript', variable: 'DEFAULT_ENGINE_CACHE_LIMITS', property: [property],
    }));
  assert.deepEqual(facts.map(fact => fact.value), [4, 32, 16777216]);
  assert.equal(facts[2].expression, '16 * 1024 * 1024');
  const defaults = extractStorePolicySource(source, read(source), {
    kind: 'typescript', variable: 'DEFAULT_ENGINE_CACHE_LIMITS',
  });
  assert.deepEqual(defaults.value, {
    maximumInFlight: 4, maximumCompletedEntries: 32, maximumCompletedBytes: 16777216,
  });
  const eviction = extractStorePolicySource(source, read(source), {
    kind: 'typescript', class: 'EngineExecutionCache', member: '#retain',
  });
  assert(eviction.expression.includes('this.#completed.delete(oldest)'));
  assert(!Object.hasOwn(eviction, 'value'));
  assert.equal(read(source).split('\n').slice(eviction.startLine - 1, eviction.endLine).join('\n').trim(),
    eviction.expression.trim());
});

test('literal fallback is not confused with the caller-selected effective limit', () => {
  const fact = extractStorePolicySource('owner.ts',
    'const maximum = Number(config.maximum ?? 256 * 1024 * 1024);',
    { kind: 'typescript', variable: 'maximum' });
  assert.equal(fact.fallbackValue, 268435456);
  assert.equal(fact.fallbackExpression, '256 * 1024 * 1024');
  assert(!Object.hasOwn(fact, 'value'));
  assert.equal(fact.representation, 'configuration-nullish-fallback-expression');
  const unqualified = extractStorePolicySource('owner.ts',
    'const defaults = Object.freeze({count:1,...override});',
    { kind: 'typescript', variable: 'defaults' });
  assert(!Object.hasOwn(unqualified, 'value'));
});

test('runtime calls remain declarations and cannot execute during extraction', () => {
  const text = 'const LIMIT = (() => { throw new Error("MUST_NOT_EXECUTE"); })();';
  const fact = extractStorePolicySource('policy.ts', text, { kind: 'typescript', variable: 'LIMIT' });
  assert(fact.expression.includes('MUST_NOT_EXECUTE'));
  assert(!Object.hasOwn(fact, 'value'));
  const large = extractStorePolicySource('policy.ts', 'const LIMIT = 9007199254740993;',
    { kind: 'typescript', variable: 'LIMIT' });
  assert(!Object.hasOwn(large, 'value'), 'unsafe rounded integers must not become effective limits');
});

test('missing, ambiguous and unsupported authorities stop instead of inventing policy', () => {
  const variable = { kind: 'typescript', variable: 'LIMIT' };
  assert.throws(() => extractStorePolicySource('x.ts', 'const OTHER = 1;', variable), /found 0/u);
  assert.throws(() => extractStorePolicySource('x.ts',
    'function a(){ const LIMIT=1; } function b(){ const LIMIT=2; }', variable), /found 2/u);
  assert.throws(() => extractStorePolicySource('x.ts', 'const LIMIT = {', variable), /unparseable/u);
  assert.throws(() => extractStorePolicySource('x.ts', 'const LIMIT = foreign({count:1});',
    { ...variable, property: ['count'] }), /unsupported policy object/u);
  for (const expression of ['{count:1,...override}', '{get count(){return 1;}}',
    '{count:1,[key]:2}', '{count:1,"count":2}', '{count:1,count:2}',
    '{nested:{count:1,...override}}']) {
    assert.throws(() => extractStorePolicySource('x.ts', `const LIMIT = ${expression};`,
      { ...variable, property: expression.includes('nested') ? ['nested', 'count'] : ['count'] }),
    /(?:unsupported|ambiguous) policy object/u);
  }
});

test('selected YAML retains declared units without claiming receiver enforcement', () => {
  const source = 'gitops/platform/values/prometheus.yaml';
  const fact = extractStorePolicySource(source, read(source), {
    kind: 'yaml', path: ['prometheus', 'prometheusSpec', 'retention'],
  });
  assert.equal(fact.value, '15d');
  assert.equal(fact.representation, 'declared-yaml-value');
  assert.throws(() => extractStorePolicySource('x.yaml', 'retention: 1\nretention: 2\n',
    { kind: 'yaml', path: ['retention'] }), /valid YAML/u);
  assert.throws(() => extractStorePolicySource('x.yaml', 'defaults: &a 2\nretention: *a\n',
    { kind: 'yaml', path: ['retention'] }), /alias authority/u);
  assert.throws(() => extractStorePolicySource(source, read(source),
    { kind: 'yaml', path: ['unimplementedCleanup'] }), /missing YAML authority/u);
});

test('shell owners stay complete literal source even with heredoc false boundaries', () => {
  const text = 'before=1\nbackup_group() {\n  cat <<EOF\n}\nEOF\n  exit 71\n}\nafter=2\n';
  const fact = extractStorePolicySource('owner.sh', text, { kind: 'complete-source' });
  assert.equal(fact.expression, text);
  assert.deepEqual([fact.startLine, fact.endLine], [1, 8]);
  assert(!Object.hasOwn(fact, 'value'));
  assert.throws(() => extractStorePolicySource('owner.sh', text,
    { kind: 'shell-function', name: 'backup_group' }), /unsupported source selector/u);
});

test('actual constructor defaults are static declarations only on their selected injected-store branch', () => {
  const source = 'skills/buster/engine/test-gates/runner.ts';
  const fact = extractStorePolicySource(source, read(source), { kind: 'typescript',
    class: 'TestPlanRunner', member: 'constructor', construct: 'FileDurableAttemptStore',
    argument: 1, literalRequired: true });
  assert.equal(fact.value.maximumEvidenceObjects, 10000);
  assert.equal(fact.value.maximumMetadataBytes, 268435456);
  assert.equal(fact.value.maximumPendingEvidenceAgeMs, 3600000);
  assert.equal(fact.representation, 'literal-call-argument');
  const nova = 'skills/nova/core/observability/reconciler.ts';
  const asserted = extractStorePolicySource(nova, read(nova), { kind: 'typescript',
    variable: 'EMBEDDED_ATTEMPT_LIMITS', literalRequired: true });
  assert.equal(asserted.value.maximumPendingEvidenceAgeMs, 3600000);
  assert(asserted.expression.endsWith('as const'));
});

test('actual native caller fallbacks select the named environment field, never an arbitrary read call', () => {
  const source = 'skills/prism/config/native-worker.ts';
  const selector = { kind: 'typescript', function: 'nativePrismSupervisorConfig',
    call: 'read', argument: 1, literalRequired: true };
  const record = extractStorePolicySource(source, read(source), {
    ...selector, firstArgument: 'PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS',
  });
  assert.equal(record.value, 65536);
  const bytes = extractStorePolicySource(source, read(source), {
    ...selector, firstArgument: 'PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES',
  });
  assert.equal(bytes.value, 68719476736);
  assert.throws(() => extractStorePolicySource(source, read(source), selector), /expected one selected invocation/u);
  const result = extractStorePolicySource(source, read(source), { kind: 'typescript',
    function: 'prismNativeMaximumResultBytes', call: 'Number', argument: 0, literalRequired: true });
  assert.equal(result.fallbackValue, 67108864);
  assert(!Object.hasOwn(result, 'value'));
});

test('fixed per-record metadata envelopes stay separate from required whole-store limits', () => {
  for (const [source, owner, expected] of [
    ['skills/worker/core/worker/native-attempt-journal.ts', 'NativeAttemptJournal', 65536],
    ['skills/buster/engine/test-gates/native-fixture-journal.ts', 'FileBusterFixtureJournal', 4096],
  ]) {
    const fact = extractStorePolicySource(source, read(source), { kind: 'typescript', class: owner,
      member: 'constructor', construct: 'FileDurableRecordStore', argument: 1,
      property: ['maximumRecordBytes'], literalRequired: true });
    assert.equal(fact.value, expected);
    assert(!Object.hasOwn(fact, 'maximumBytes'));
  }
});

test('unsupported or uncertain invocation shapes refuse a guessed positional default', () => {
  const selector = { kind: 'typescript', function: 'owner', construct: 'Store', argument: 1,
    literalRequired: true };
  assert.throws(() => extractStorePolicySource('x.ts', 'function owner(){new Store(...inputs,123);}', selector),
    /spread arguments/u);
  assert.throws(() => extractStorePolicySource('x.ts', 'function owner(){new Store(root,{...defaults});}', selector),
    /not a supported literal/u);
  assert.throws(() => extractStorePolicySource('x.ts', 'function owner(){new Store(root,{count:lookup()});}', selector),
    /not a supported literal/u);
  assert.throws(() => extractStorePolicySource('x.ts', 'function owner(){new Store(root,1);}',
    { ...selector, argument: -1 }), /invalid invocation/u);
  assert.throws(() => extractStorePolicySource('x.ts', 'const LIMIT=1;',
    { kind: 'typescript', variable: 'LIMIT', unsupportedSelection: 'body' }), /unsupported source selector/u);
});
