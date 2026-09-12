import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {portableJson} from '@kubeclaw/plugin-sdk';

const child = fileURLToPath(new URL('./run11-semantic-producer-child.mjs', import.meta.url));
const mode = process.env.KUBECLAW_SEMANTIC_PRODUCER_MODE ?? 'legacy';
function repository(root) {
  const repository = path.join(root, 'repository'); fs.mkdirSync(path.join(repository, 'src'), {recursive: true});
  const git = args => execFileSync('git', args, {cwd: repository, encoding: 'utf8'}).trim();
  git(['init', '-q']); git(['config', 'user.email', 'semantic@example.invalid']); git(['config', 'user.name', 'Semantic Producer']);
  fs.writeFileSync(path.join(repository, 'src/index.mjs'), 'export function implementation(value) { return value; }\n');
  git(['add', '.']); git(['commit', '-qm', 'base']); const base = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repository, 'src/index.mjs'), 'export function implementation(value) { return value + 1; }\nexport function forwarded(value) { return implementation(value); }\n');
  git(['add', '.']); git(['commit', '-qm', 'head']); const head = git(['rev-parse', 'HEAD']);
  const testOutput = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import assert from 'node:assert/strict';import {forwarded} from ${JSON.stringify(pathToFileURL(path.join(repository, 'src/index.mjs')).href)};assert.equal(forwarded(41),42);console.log('original disposable source behavior: passed');`], {encoding: 'utf8'});
  fs.writeFileSync(path.join(root, 'source.json'), JSON.stringify({repository, base, head, testOutput}));
}
function value(result, prefix) {return result.stored.find(item => item.value.schemaVersion.startsWith(prefix))?.value;}
function classification(en, cs) {
  const a = value(en, 'review-bundle.'), b = value(cs, 'review-bundle.'), ra = value(en, 'review-report.'), rb = value(cs, 'review-report.');
  const same = (x, y) => portableJson(x) === portableJson(y);
  return {profile: en.profile, bundleValueSame: same(a, b), bundleDigestSame: en.bundleDigest === cs.bundleDigest,
    revisionsSame: same(a.revisions, b.revisions), policyDigestSame: a.policyDigest === b.policyDigest,
    contextSelectionSame: same(a.selection, b.selection), sourceContextSame: same(a.context, b.context),
    evidence: a.evidence.map((item, i) => ({kind: item.kind, digestSame: item.digest === b.evidence[i]?.digest,
      contentSame: item.content === b.evidence[i]?.content})),
    governorBaselineSame: same(ra.governor.baseline, rb.governor.baseline),
    governorBaselineIdSame: ra.governor.baselineId === rb.governor.baselineId,
    reportBundleDigestSame: ra.bundleDigest === rb.bundleDigest};
}

test('fresh original registered Review producers preserve actual semantic authority across en/cs', {timeout: 120000}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-producer-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  repository(root); const classifications = [];
  for (const profile of ['gate', 'lean', 'audit']) {
    const results = [];
    for (const [locale, expected] of [['en_US.UTF-8', 'en-US'], ['cs_CZ.UTF-8', 'cs-CZ']]) {
      const env = {...process.env, LANG: locale, LC_ALL: locale}; delete env.NODE_TEST_CONTEXT;
      const raw = execFileSync(process.execPath, [child, root, profile, mode], {encoding: 'utf8', env, timeout: 45000, maxBuffer: 16 * 1024 * 1024});
      const result = JSON.parse(raw); t.diagnostic(JSON.stringify(result));
      assert.equal(result.locale, expected); assert.equal(result.status, 'succeeded'); assert.equal(result.validReport, true);
      assert.equal(result.postCount, 1); assert.ok(result.lifecycle.some(record => record.entry.type === 'attempt.completed'));
      assert.ok(result.lifecycle.some(record => record.entry.type === 'run.succeeded'));
      const bundle = value(result, 'review-bundle.'); assert.deepEqual(bundle, result.dispatched[0]);
      if (profile !== 'gate') assert.ok(bundle.evidence.some(item => item.kind === 'simplification-facts'));
      results.push(result);
    }
    classifications.push(classification(...results));
  }
  t.diagnostic(JSON.stringify({classification: classifications, mode, actualFreshProducer: true, nativeGatewayOrModelProof: false}));
  assert.ok(classifications.every(row => row.bundleValueSame && row.bundleDigestSame && row.governorBaselineIdSame && row.reportBundleDigestSame),
    'actual fresh en/cs producer semantic identities differ; retain inner-owner classification instead of precomputing opaque hashes');
});
