import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const root = new URL('../../../../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('./before-identities.json', import.meta.url), 'utf8'));
const parse = (text) => ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const printer = ts.createPrinter({ removeComments: true });
function collect(text, select) {
  const file = parse(text), values = [];
  const visit = node => {
    if (select(node)) values.push(printer.printNode(ts.EmitHint.Unspecified, node, file));
    ts.forEachChild(node, visit);
  };
  visit(file); return values.sort();
}
const before = name => fs.readFileSync(new URL(manifest.find(item => item.path === name).snapshot, root), 'utf8');
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const assertion = node => ts.isCallExpression(node) && node.expression.getText().startsWith('assert.');
for (const file of ['tests/verification/contracts/check-pipeline-remote-runtime-config.mts',
  'tests/verification/reliability/buster-shutdown-storage.test.mts',
  'tests/verification/deployment/prism-swarm-config.test.mjs']) {
  const expected = collect(before(file), assertion), actual = collect(read(file), assertion);
  for (const item of expected) {
    const index = actual.indexOf(item); assert.notEqual(index, -1, `original assertion changed: ${item}`); actual.splice(index, 1);
  }
  console.log(JSON.stringify({ file, originalAssertionsPreserved: expected.length, addedAssertions: actual.length }));
}
const production = 'skills/buster/engine/test-gates/production.ts';
const source = /(?:directCommand|containerBuild|kubernetesFixture|tailscaleExposure|networkHttp|browserAxe|browserLighthouse|browserVisual|browserPlaywright|securityScan|kubernetesRuntimeSecurity)Source\./;
const scalarBinding = node => ts.isPropertyAssignment(node) && !ts.isObjectLiteralExpression(node.initializer)
  && source.test(node.initializer.getText());
const expected = collect(before(production), scalarBinding);
const files = ['production', 'production-command-options', 'production-browser-options', 'production-cluster-options'];
const actual = files.flatMap(name => collect(read(`skills/buster/engine/test-gates/${name}.ts`), scalarBinding)).sort();
assert.deepEqual(actual, expected);
console.log(JSON.stringify({ originalProviderScalarBindingsPreserved: expected.length }));
