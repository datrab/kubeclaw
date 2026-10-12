import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const evidence = 'docs/review/evidence/prism-native-test-quality-20260921';
const records = JSON.parse(fs.readFileSync(path.join(evidence, 'before-identities.json'), 'utf8'));
const readBefore = name => fs.readFileSync(path.join(evidence, 'before', records.find(item => item.source === name).snapshot), 'utf8');
const oldNative = records.filter(item => item.source.endsWith('.native.mts'));
const expected = oldNative.map(item => path.basename(item.source.replace('.native.mts', '-native.mts'))).sort();
const actual = fs.readdirSync('skills/prism/tests').filter(name => name.endsWith('-native.mts')).sort();
assert.deepEqual(actual, expected);
assert.equal(fs.readdirSync('skills/prism/tests').filter(name => name.endsWith('.native.mts')).length, 0);
const renamed = oldNative.map(item => {
  const target = item.source.replace('.native.mts', '-native.mts');
  const bytes = fs.readFileSync(target); assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  return { original: item.source, current: target, sha256: item.sha256, bytesUnchanged: true };
});
for (const name of ['package.json', 'skills/prism/package.json']) {
  const expectedPackage = readBefore(name).replace('tests/*.native.mts', 'tests/*-native.mts');
  assert.equal(fs.readFileSync(name, 'utf8'), expectedPackage, 'only the native glob changes');
}
const file = 'skills/prism/integration/worker-concurrent-resource-attribution.mts';
const before = readBefore(file), after = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, after, ts.ScriptTarget.Latest, true);
const helper = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'startControlledArtifactService');
assert(helper);
const body = helper.body.statements;
assert.equal(body.at(-1).getText(ast), 'return { origin, readStarted, releaseRead };');
const inlined = after.slice(0, helper.getStart(ast)) + after.slice(helper.end);
const restored = inlined.replace("import test, { type TestContext } from 'node:test';", "import test from 'node:test';")
  .replace('const { origin, readStarted, releaseRead } = await startControlledArtifactService(t, store);', body.slice(0, -1).map(node => node.getText(ast)).join('\n'));
function tokens(source) {
  const parsed = ts.createSourceFile('comparison.mts', source, ts.ScriptTarget.Latest, true), result = [];
  function visit(node) {
    const children = node.getChildren(parsed);
    if (!children.length) { if (node.kind !== ts.SyntaxKind.EndOfFileToken) result.push(node.getText(parsed)); }
    else for (const child of children) visit(child);
  }
  visit(parsed); return result;
}
assert.deepEqual(tokens(restored), tokens(before), 'inlining helper restores every original non-trivia token');
function inventory(source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true), assertions = [], tests = [], numbers = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(parsed);
      if (expression === 'assert' || expression.startsWith('assert.')) assertions.push(tokens(node.getText(parsed)));
      if (expression === 'test') tests.push(node.arguments[0].getText(parsed));
    }
    if (ts.isNumericLiteral(node)) numbers.push(node.getText(parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed); return { assertions, tests, numbers: numbers.sort() };
}
assert.deepEqual(inventory(after), inventory(before));
console.log(JSON.stringify({ renamed, activeGlobsUpdated: 2, originalGlobEmpty: true, unchangedMembership: actual,
  attributionOriginalTokensRestoredByInlining: true, unchangedAssertionsDeadlinesAndNumericConstants: inventory(after) }, null, 2));
