import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson, portableJson, sha256Text, PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';
import { activate } from '../../../../common/plugins/artifact-store/src/adapter.ts';
import { parseReviewInput } from '../src/review-stage-input.ts';
import { parseReviewBundle } from '../src/review-bundle-parser.ts';
import { snapshotReviewBundle } from '../src/review-bundle-snapshot.ts';
import { storeReviewBundle } from '../src/review-report-storage.ts';

const file = fileURLToPath(import.meta.url);
const unicode = { ä: 1, z: 2, nested: { ä: 3, z: 4 } };
function input(evidence) {
  return { task: { id: 'task:encoding', statement: 'Inspect the exact offered evidence.' },
    revisions: { base: '1'.repeat(40) }, scope: { allowedPrefixes: ['src'] },
    requirements: [{ id: 'req:encoding', statement: 'Evidence identity is preserved.' }], evidence, contextCandidates: [] };
}
function bundle(parsed) {
  const changedPaths = [{ path: 'src/index.ts', status: 'modified' }];
  return { schemaVersion: 'review-bundle.v1', task: parsed.task,
    revisions: { base: '1'.repeat(40), head: '2'.repeat(40), changedManifestDigest: sha256Text(canonicalJson(changedPaths)) },
    scope: { changedPaths, allowedPrefixes: ['src'] }, requirements: parsed.requirements, evidence: parsed.evidence,
    context: [], selection: { version: 'focused-context.v1', candidateManifestDigest: sha256Text('candidate'), expansionRound: 0 },
    policyDigest: sha256Text('policy') };
}
function store(root) {
  const adapter = activate({ config: { artifactRoot: path.join(root, 'artifacts') } });
  const attempt = { runId: 'run:encoding', stageId: 'review', attemptId: 'attempt:encoding', attemptNumber: 1 };
  let sequence = 0;
  const context = { contract: { lease: { attempt } }, async invoke(capability, request) {
    return adapter.invoke({ confidential: true, signal: new AbortController().signal,
      request: { ...request, capability, idempotencyKey: `encoding:${++sequence}`, attempt } });
  } };
  return { adapter, context };
}
if (process.argv[2] === '--produce') {
  const root = process.argv[3];
  const evidence = [
    { kind: 'tagged', digest: sha256Text(portableJson(unicode)), content: unicode, encoding: PORTABLE_JSON_ENCODING },
    { kind: 'legacy', digest: sha256Text(canonicalJson({ ok: true })), content: { ok: true } },
  ];
  const value = input(evidence); const parsed = parseReviewInput(value); assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const ajv = new Ajv2020({ strict: true });
  const validateInput = ajv.compile(JSON.parse(fs.readFileSync(new URL('../schemas/input.schema.json', import.meta.url), 'utf8')));
  assert.equal(validateInput(value), true, JSON.stringify(validateInput.errors));
  const snapshot = snapshotReviewBundle(bundle(parsed.value));
  const validateBundle = ajv.compile(JSON.parse(fs.readFileSync(new URL('../schemas/review-bundle.v1.schema.json', import.meta.url), 'utf8')));
  assert.equal(validateBundle(snapshot.bundle), true, JSON.stringify(validateBundle.errors));
  const { adapter, context } = store(root); await adapter.ready();
  try {
    const artifact = await storeReviewBundle(snapshot, context);
    assert.equal(artifact.digest, snapshot.digest);
    fs.writeFileSync(path.join(root, 'stored.json'), JSON.stringify({ artifact, digest: snapshot.digest, bundle: snapshot.bundle,
      legacyInput: input([{ kind: 'old-unicode', digest: sha256Text(canonicalJson(unicode)), content: unicode }]) }));
    process.stdout.write(JSON.stringify({ locale: Intl.DateTimeFormat().resolvedOptions().locale, digest: snapshot.digest }));
  } finally { await adapter.shutdown(new AbortController().signal); }
} else if (process.argv[2] === '--read') {
  const root = process.argv[3]; const expected = JSON.parse(fs.readFileSync(path.join(root, 'stored.json'), 'utf8'));
  const { adapter, context } = store(root); await adapter.ready();
  try {
    const { artifact } = expected;
    const stored = await context.invoke('artifacts.read', { operation: 'get_json', resource: { type: 'artifact.object', canonicalId: artifact.artifactId },
      payload: { namespace: artifact.namespace, digest: artifact.digest } });
    const snapshot = snapshotReviewBundle(stored.value);
    assert.equal(snapshot.digest, expected.digest); assert.deepEqual(snapshot.bundle, expected.bundle);
    const tagged = snapshot.bundle.evidence.find(item => item.kind === 'tagged');
    assert.equal(tagged.encoding, PORTABLE_JSON_ENCODING); assert.equal(tagged.content, portableJson(unicode));
    const stripped = structuredClone(snapshot.bundle); delete stripped.evidence.find(item => item.kind === 'tagged').encoding;
    const strippedParsed = parseReviewBundle(stripped);
    if (strippedParsed.ok) assert.notEqual(snapshotReviewBundle(stripped).digest, expected.digest, 'even byte-compatible marker stripping changes the bound outer bundle');
    const wrong = structuredClone(snapshot.bundle); wrong.evidence.find(item => item.kind === 'tagged').encoding = 'unknown.v99';
    assert.equal(parseReviewBundle(wrong).ok, false);
    const mismatched = structuredClone(snapshot.bundle); const item = mismatched.evidence.find(entry => entry.kind === 'tagged');
    item.content = '{"ä":1,"nested":{"ä":3,"z":4},"z":2}'; item.digest = sha256Text(item.content);
    assert.equal(parseReviewBundle(mismatched).ok, false, 'declared portable evidence cannot contain legacy-ordered bytes, even with a matching supplied digest');
    const noncanonical = structuredClone(snapshot.bundle); const legacy = noncanonical.evidence.find(entry => entry.kind === 'legacy');
    legacy.content = '{ "ok": true }'; legacy.digest = sha256Text(legacy.content);
    assert.equal(parseReviewBundle(noncanonical).ok, false, 'legacy canonical-only acceptance is not weakened');
    const historical = JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-evidence-encoding.json', import.meta.url), 'utf8')).original;
    const historicalParsed = parseReviewBundle(historical.snapshot.bundle);
    const sameLocale = Intl.DateTimeFormat().resolvedOptions().locale === historical.locale;
    assert.equal(historicalParsed.ok, sameLocale, 'actual archived legacy bytes retain the original strict boundary');
    if (sameLocale) assert.equal(snapshotReviewBundle(historical.snapshot.bundle).digest, historical.snapshot.digest);
    process.stdout.write(JSON.stringify({ locale: Intl.DateTimeFormat().resolvedOptions().locale, digest: snapshot.digest,
      legacyUnicodeAccepted: parseReviewInput(expected.legacyInput).ok, strippedAcceptedWithDifferentDigest: strippedParsed.ok }));
  } finally { await adapter.shutdown(new AbortController().signal); }
} else {
  test('independent original parser/bundle/schema/snapshot/ArtifactStore roundtrip across locales', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-evidence-encoding-'));
    const invoke = (mode, locale) => {
      const env = { ...process.env, LANG: locale, LC_ALL: locale }; delete env.NODE_TEST_CONTEXT;
      return JSON.parse(execFileSync(process.execPath, [file, mode, root], { env, encoding: 'utf8', timeout: 120000 }));
    };
    try {
      const produced = invoke('--produce', 'en_US.UTF-8');
      const english = invoke('--read', 'en_US.UTF-8'); const swedish = invoke('--read', 'sv_SE.UTF-8');
      assert.equal(produced.locale, 'en-US'); assert.equal(swedish.locale, 'sv-SE');
      assert.equal(english.legacyUnicodeAccepted, true); assert.equal(swedish.legacyUnicodeAccepted, false);
      console.log(JSON.stringify({ produced, english, swedish, boundary: 'original parser, closed schemas, snapshot and disk ArtifactStore; no LLM/gateway completion' }));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
