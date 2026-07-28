import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const BUILTINS = new Set([
  ...module.builtinModules,
  ...module.builtinModules.map((name) => `node:${name}`),
]);

export function walkModuleFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return walkModuleFiles(target);
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [target] : [];
  });
}

export function moduleSpecifiers(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  const add = (node, kind, typeOnly = false) => {
    if (!node || !ts.isStringLiteralLike(node)) return;
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    found.push({
      specifier: node.text,
      kind,
      typeOnly,
      line: position.line + 1,
      column: position.character + 1,
    });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, 'import', Boolean(node.importClause?.isTypeOnly));
    if (ts.isExportDeclaration(node)) add(node.moduleSpecifier, 'export', Boolean(node.isTypeOnly));
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, 'import-equals');
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], 'dynamic-import');
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') add(node.arguments[0], 'require');
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function nonLiteralModuleLoads(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((dynamicImport || requireCall) && !ts.isStringLiteralLike(node.arguments[0])) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.arguments[0].getStart(sourceFile));
        found.push({
          kind: dynamicImport ? 'dynamic-import' : 'require',
          line: position.line + 1,
          column: position.character + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function resolveLocalModule(containingFile, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    {
      allowJs: true,
      checkJs: false,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ESNext,
    },
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  return resolved ? path.resolve(resolved) : null;
}

export function packageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

export function verifyModuleGraph({
  root,
  runtimeRoot = root,
  allowedPackages = [],
  allowPackage = () => false,
  forbiddenRoots = [],
}) {
  const allowed = new Set(allowedPackages);
  const violations = [];
  const files = walkModuleFiles(root);
  let edgeCount = 0;
  for (const file of files) {
    for (const reference of moduleSpecifiers(file)) {
      edgeCount += 1;
      const { specifier } = reference;
      if (BUILTINS.has(specifier)) continue;
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        const resolved = resolveLocalModule(file, specifier);
        if (!resolved) {
          violations.push({ file, ...reference, issue: 'unresolved-local-module' });
          continue;
        }
        if (!resolved.startsWith(`${path.resolve(runtimeRoot)}${path.sep}`) && resolved !== path.resolve(runtimeRoot)) {
          violations.push({ file, ...reference, resolved, issue: 'escaped-runtime-root' });
        }
        for (const forbiddenRoot of forbiddenRoots) {
          const absoluteForbidden = path.resolve(forbiddenRoot);
          if (resolved === absoluteForbidden || resolved.startsWith(`${absoluteForbidden}${path.sep}`)) {
            violations.push({ file, ...reference, resolved, issue: 'forbidden-local-dependency' });
          }
        }
        continue;
      }
      if (reference.typeOnly) continue;
      const dependency = packageName(specifier);
      if (!allowed.has(dependency) && !allowPackage({ file, dependency, reference })) {
        violations.push({ file, ...reference, package: dependency, issue: 'undeclared-runtime-package' });
      }
    }
  }
  return { files: files.length, edges: edgeCount, violations };
}

export { BUILTINS };
