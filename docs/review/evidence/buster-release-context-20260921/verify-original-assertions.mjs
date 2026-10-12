import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const printer = ts.createPrinter({ removeComments: true });
function inventory(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const assertions = [], names = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'assert') {
        assertions.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
      }
      if (node.expression.getText(source) === 'test' && ts.isStringLiteral(node.arguments[0])) names.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { assertions, names };
}
for (const [index, basename] of [[1, 'gitops-release.test.mjs'], [2, 'release-images.test.mjs']]) {
  const before = inventory(new URL(`./before/${index}-${basename}.snapshot`, import.meta.url).pathname);
  const after = inventory(`tests/verification/deployment/${basename}`);
  let cursor = 0;
  for (const original of before.assertions) {
    const next = after.assertions.indexOf(original, cursor);
    assert.ok(next >= cursor, `Missing/changed original assertion in ${basename}: ${original}`);
    cursor = next + 1;
  }
  for (const name of before.names) assert.ok(after.names.includes(name), `Missing test ${name}`);
  process.stdout.write(`${basename}: all ${before.names.length} original cases and ${before.assertions.length} original assertion ASTs retained in order.\n`);
}
