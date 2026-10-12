import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const directory='docs/review/evidence/attempt-closure-projection-20260921/';
const before=fs.readFileSync(directory+'admission-retirement.before.mjs','utf8');
const after=fs.readFileSync('tests/verification/reliability/admission-retirement.test.mjs','utf8');
function tests(source) {
  const file=ts.createSourceFile('source.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  return file.statements.filter(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(file)==='test').map(node=>node.getText(file));
}
assert.equal(tests(before).length,14);assert.deepEqual(tests(after),tests(before));
const fixture=fs.readFileSync('tests/verification/reliability/attempt-retirement-fixture.mjs','utf8');
function helpers(source) {
  const file=ts.createSourceFile('source.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  return file.statements.filter(node=>ts.isFunctionDeclaration(node)&&['fixture','resultFor','importCompletion','projectionFixture'].includes(node.name.text)).map(node=>node.getText(file).replace(/^export /u,''));
}
assert.deepEqual(helpers(fixture),helpers(before));
console.log(JSON.stringify({originalTestBodiesIdentical:14,fixtureFunctionBodiesIdentical:4}));
