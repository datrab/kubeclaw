import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const parse = file => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const old = parse('docs/review/evidence/attempt-closure-projection-20260921/admission-retirement.before.mjs');
const current = parse('tests/verification/reliability/admission-retirement.test.mjs');
const fixture = parse('tests/verification/reliability/attempt-retirement-fixture.mjs');
function tests(ast) {
  return ast.statements.filter(s => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)
    && s.expression.expression.getText(ast) === 'test').map(s => s.getText(ast));
}
assert.deepEqual(tests(current), tests(old), 'every original test body, assertion and timeout remains byte-identical');
for (const name of ['resultFor', 'fixture', 'importCompletion', 'projectionFixture']) {
  const a = old.statements.find(s => ts.isFunctionDeclaration(s) && s.name.text === name);
  const b = fixture.statements.find(s => ts.isFunctionDeclaration(s) && s.name.text === name);
  assert(a && b, name);
  assert.equal(b.getText(fixture).replace(/^export /u, ''), a.getText(old).replace(/^export /u, ''), name);
}
console.log(JSON.stringify({ originalTestsByteIdentical: tests(old).length,
  originalFixtureFunctionsPreserved: ['resultFor', 'fixture', 'importCompletion', 'projectionFixture'] }, null, 2));
