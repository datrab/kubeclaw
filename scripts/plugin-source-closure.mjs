import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Follow implementation imports without executing plugins or loading their dependencies.
export function pluginSourceClosure(entry, repositoryRoot) {
  const sources = new Map();
  const externalImports = new Set();
  const unresolved = new Set();
  function resolveLocal(candidate) {
    const choices = [candidate];
    if (/\.m?js$/u.test(candidate)) choices.push(candidate.replace(/\.m?js$/u, '.ts'));
    if (!path.extname(candidate)) choices.push(...['.ts', '.js', '.mjs', '/index.ts', '/index.js'].map((suffix) => candidate + suffix));
    return choices.find((item) => fs.existsSync(item) && fs.statSync(item).isFile());
  }
  function visit(candidate) {
    const file = resolveLocal(candidate);
    if (!file) { unresolved.add(candidate); return; }
    const relative = path.relative(repositoryRoot, file);
    if (relative.startsWith('../') || path.isAbsolute(relative)) { unresolved.add(candidate); return; }
    if (sources.has(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    sources.set(file, text);
    if (!/\.[cm]?[jt]sx?$/u.test(file)) return;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function follow(specifier) {
      if (!ts.isStringLiteralLike(specifier)) {
        unresolved.add(`${file}:${source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1}: dynamic module`);
      } else if (specifier.text.startsWith('.')) visit(path.resolve(path.dirname(file), specifier.text));
      else if (!specifier.text.startsWith('node:')) externalImports.add(specifier.text);
    }
    function scan(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const allNamedTypes = clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((item) => item.isTypeOnly);
        if (!clause?.isTypeOnly && !allNamedTypes) follow(node.moduleSpecifier);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) follow(node.moduleSpecifier);
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        if (node.arguments[0]) follow(node.arguments[0]);
      }
      ts.forEachChild(node, scan);
    }
    scan(source);
  }
  if (entry) visit(entry);
  return { sources, externalImports: [...externalImports].sort(), unresolved: [...unresolved].sort() };
}
