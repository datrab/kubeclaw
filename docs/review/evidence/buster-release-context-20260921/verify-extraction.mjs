import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const read = file => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const find = (source, name) => source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const printer = ts.createPrinter({ removeComments: true });
function tokens(node, source) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard,
    printer.printNode(ts.EmitHint.Unspecified, node, source));
  const result = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) result.push([kind, scanner.getTokenText()]);
  return result;
}
function verify(file, snapshot, name, helpers) {
  const before = read(new URL(`./before/${snapshot}`, import.meta.url).pathname);
  const after = read(file);
  const expanded = ts.transform(find(after, name), [context => {
    const substitute = node => ts.isIdentifier(node) && node.text === 'code'
      ? ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('receipt'), 'code')
      : ts.visitEachChild(node, substitute, context);
    const visit = node => {
      if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
        const helper = node.expression.expression.getText(after);
        if (Object.hasOwn(helpers, helper)) {
          assert.deepEqual(node.expression.arguments.map(arg => arg.getText(after)), helpers[helper], `${helper} arguments`);
          const statements = [...find(after, helper).body.statements];
          if (helper === 'validateSelectedCodeBundle') return statements.map(statement => ts.visitNode(statement, substitute));
          return statements.flatMap(statement => visit(statement));
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  }]).transformed[0];
  assert.deepEqual(tokens(expanded, after), tokens(find(before, name), before), name);
  process.stdout.write(`PASS ${name}: original literal/operator/statement tokens after exact-argument helper expansion.\n`);
}
verify('scripts/updates/deployment-release.mjs', '0-deployment-release.mjs.snapshot', 'validateBundle', {
  validateBundleControl: ['container', 'actual', 'name', 'slot', 'receipt', 'requireBundle'],
  validateBundleRevision: ['actual', 'prefix', 'slot', 'receipt', 'enabled'],
  validateSelectedCodeBundle: ['container', 'actual', 'prefix', 'slot', 'receipt.code'],
});
verify('scripts/gitops.mjs', '3-gitops.mjs.snapshot', 'bootstrapDocuments', {
  validateBootstrapAddress: ['url', 'argoNamespace'],
});
verify('scripts/native-buster-deployment-preflight.mjs', '4-native-buster-deployment-preflight.mjs.snapshot', 'nativeBusterDeploymentSelection', {
  requireAuthority: ['container'], requireImage: ['container'],
});
