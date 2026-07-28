import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const textExtensions = new Set([...codeExtensions, '.json', '.md', '.yaml', '.yml', '.toml', '.sh']);

function scriptKind(filePath) {
  const extension = path.extname(filePath);
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (['.js', '.mjs', '.cjs'].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function addExportDeclarationNames(statement, names) {
  if (!statement.exportClause) {
    names.add(statement.moduleSpecifier ? `* from ${statement.moduleSpecifier.text}` : '*');
    return;
  }
  if (!ts.isNamedExports(statement.exportClause)) return;
  for (const element of statement.exportClause.elements) names.add(element.name.text);
}

function addVariableExportNames(statement, names) {
  if (!ts.isVariableStatement(statement)) return;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
  }
}

function exportedNames(sourceFile) {
  const names = new Set();
  const hasExportModifier = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of sourceFile.statements) {
    if (hasExportModifier(statement) && statement.name?.text) names.add(statement.name.text);
    if (hasExportModifier(statement)) addVariableExportNames(statement, names);
    if (ts.isExportDeclaration(statement)) addExportDeclarationNames(statement, names);
    if (ts.isExportAssignment(statement)) names.add('default');
  }
  return [...names].sort();
}

function staticModuleSpecifier(statement) {
  if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
    && statement.moduleSpecifier
    && ts.isStringLiteral(statement.moduleSpecifier)) {
    return statement.moduleSpecifier.text;
  }
  if (ts.isImportEqualsDeclaration(statement)
    && ts.isExternalModuleReference(statement.moduleReference)
    && statement.moduleReference.expression
    && ts.isStringLiteral(statement.moduleReference.expression)) {
    return statement.moduleReference.expression.text;
  }
  return null;
}

function addDynamicImport(node, specifiers) {
  if (ts.isCallExpression(node)
    && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && node.arguments.length === 1
    && ts.isStringLiteral(node.arguments[0])) {
    specifiers.add(node.arguments[0].text);
  }
}

function importedSpecifiers(sourceFile) {
  const specifiers = new Set();
  for (const statement of sourceFile.statements) {
    const specifier = staticModuleSpecifier(statement);
    if (specifier) specifiers.add(specifier);
  }
  function visit(node) {
    addDynamicImport(node, specifiers);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...specifiers].sort();
}

function relative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function resolveLocalImport(root, sourceRelPath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const sourceDirectory = path.dirname(path.join(root, sourceRelPath));
  const unresolved = path.resolve(sourceDirectory, specifier);
  const candidates = [
    unresolved,
    ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'].map((extension) => `${unresolved}${extension}`),
    ...['index.ts', 'index.tsx', 'index.js', 'index.mjs', 'index.json'].map((name) => path.join(unresolved, name)),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return found ? relative(root, found) : relative(root, unresolved);
}

function sourceAnalysis(root, relPath, content) {
  if (!codeExtensions.has(path.extname(relPath))) return { exports: [], imports: [] };
  const sourceFile = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true, scriptKind(relPath));
  return {
    exports: exportedNames(sourceFile),
    imports: importedSpecifiers(sourceFile).map((specifier) => ({
      specifier,
      resolved: resolveLocalImport(root, relPath, specifier),
      external: !specifier.startsWith('.'),
    })),
  };
}

function matcherHits(lines, matcher) {
  const hits = [];
  const pattern = new RegExp(matcher.pattern);
  for (let index = 0; index < lines.length; index += 1) {
    if (!pattern.test(lines[index])) continue;
    hits.push({
      id: matcher.id,
      line: index + 1,
      evidence: lines[index].trim().slice(0, 240),
      ...(matcher.adapter ? { adapter: matcher.adapter } : {}),
    });
  }
  return hits;
}

function lineMatches(content, matchers) {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  return matchers.flatMap((matcher) => matcherHits(lines, matcher));
}

function currentArea(relPath, scanRoots) {
  return scanRoots.find((candidate) => relPath === candidate || relPath.startsWith(`${candidate}/`)) ?? 'explicit';
}

function fileScope(relPath) {
  if (relPath.startsWith('tests/')) return 'test';
  if (relPath.startsWith('docs/')) return 'documentation';
  if (relPath.startsWith('contracts/')) return 'contract';
  if (relPath.startsWith('charts/')) return 'configuration';
  return 'runtime';
}

export function ownerKey(target) {
  return `${target.kind}:${target.id}`;
}

export function analyzeInventoryFile(root, relPath, rules, target) {
  const extension = path.extname(relPath);
  const content = textExtensions.has(extension) ? fs.readFileSync(path.join(root, relPath), 'utf8') : '';
  const analysis = sourceAnalysis(root, relPath, content);
  return {
    path: relPath,
    area: currentArea(relPath, rules.scan.roots),
    scope: fileScope(relPath),
    target,
    exports: analysis.exports,
    imports: analysis.imports,
    effects: lineMatches(content, rules.effectMatchers),
    legacyContracts: lineMatches(content, rules.legacyContractMatchers),
    hardcodings: lineMatches(content, rules.hardcodingMatchers),
  };
}

export function aggregateCounts(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, count }));
}

export function dependencyGraph(files, byPath) {
  const edges = new Map();
  for (const file of files) {
    for (const imported of file.imports) {
      if (!imported.resolved || !byPath.has(imported.resolved)) continue;
      const targetFile = byPath.get(imported.resolved);
      const from = ownerKey(file.target);
      const to = ownerKey(targetFile.target);
      if (from === to) continue;
      const key = `${from} -> ${to}`;
      const current = edges.get(key) ?? { from, to, count: 0, samples: [] };
      current.count += 1;
      if (current.samples.length < 12) current.samples.push(`${file.path} -> ${imported.resolved}`);
      edges.set(key, current);
    }
  }
  return [...edges.values()].sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
}
