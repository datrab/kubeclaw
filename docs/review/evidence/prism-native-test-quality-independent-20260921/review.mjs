import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const evidence = 'docs/review/evidence/prism-native-test-quality-20260921';
const before = JSON.parse(fs.readFileSync(`${evidence}/before-identities.json`, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function original(file) {
  const record = before.find(r => r.source === file);
  const bytes = fs.readFileSync(`${evidence}/before/${record.snapshot}`);
  assert.equal(digest(bytes), record.sha256, 'original snapshot hash'); return bytes.toString();
}
const renamed = before.filter(r => r.source.endsWith('.native.mts'));
for (const r of renamed) {
  const old = original(r.source), current = r.source.replace('.native.mts', '-native.mts');
  assert.equal(fs.readFileSync(current, 'utf8'), old);
  assert.equal(fs.existsSync(r.source), false);
}
assert.deepEqual(fs.readdirSync('skills/prism/tests').filter(n => n.endsWith('-native.mts')).sort(),
  renamed.map(r => path.basename(r.source.replace('.native.mts', '-native.mts'))).sort());
for (const file of ['package.json', 'skills/prism/package.json']) {
  assert.equal(fs.readFileSync(file, 'utf8'), original(file).replace('tests/*.native.mts', 'tests/*-native.mts'));
}
const file = 'skills/prism/integration/worker-concurrent-resource-attribution.mts';
const parse = text => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const old = parse(original(file));
const current = fs.readFileSync(file, 'utf8');
// Compare syntax tree shape + terminal tokens, not formatting or source positions.
function tree(node, source) {
  const children = node.getChildren(source);
  return [ts.SyntaxKind[node.kind], children.length ? children.map(c => tree(c, source)) : node.getText(source)];
}
function verify(text) {
  const ast = parse(text);
  const helpers = ast.statements.filter(s => ts.isFunctionDeclaration(s));
  assert.equal(helpers.length, 1);
  const helper = helpers[0];
  assert.equal(helper.name.text, 'startControlledArtifactService');
  assert.equal(helper.parameters.map(p => p.getText(ast)).join(','), 't: TestContext,store: ContentAddressedArtifactStore');
  assert.equal(helper.body.statements.at(-1).getText(ast), 'return { origin, readStarted, releaseRead };');
  const invocation = 'const { origin, readStarted, releaseRead } = await startControlledArtifactService(t, store);';
  assert.equal(text.split(invocation).length, 2);
  const body = helper.body.statements.slice(0, -1).map(s => s.getText(ast)).join('\n');
  const expanded = (text.slice(0, helper.getStart(ast)) + text.slice(helper.end))
    .replace(invocation, body).replace("import test, { type TestContext } from 'node:test';", "import test from 'node:test';");
  const restored = parse(expanded);
  assert.deepEqual(tree(restored, restored), tree(old, old));
}
verify(current);
assert.throws(() => verify(current.replace('timeout: 60000', 'timeout: 60001')));
assert.throws(() => verify(current.replace('t.after(() => rm(root, { recursive: true, force: true }));', '')));
console.log(JSON.stringify({ renameBytesIdentical: 3, oldPathsRemoved: true, globMembershipIdentical: true,
  packageOnlyGlobChanges: 2, inlinedSyntaxTreeEquivalent: true,
  negativeControlsDetected: ['modified test deadline', 'removed cleanup registration'],
  conclusion: 'bounded mechanical/helper refactor only; no native execution conclusion' }, null, 2));
