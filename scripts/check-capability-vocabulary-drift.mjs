#!/usr/bin/env node
// Bounded Nova vocabulary-to-reader-table check, not the full capability-family gate.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const authority = 'skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts';
const page = 'docs/site/reference/capabilities.md';
if (process.argv.includes('--describe-discovery')) {
  console.log(JSON.stringify({ owner: 'scripts/check-capability-vocabulary-drift.mjs', mode: 'finite-authority-reader-comparison', authority, page, parser: 'installed TypeScript AST: CAPABILITY_DEFINITIONS literal definition calls with three string arrays', exclusions: ['effective deployment', 'role translation', 'independent acceptance'] }));
  process.exit(0);
}
try {
  const source = ts.createSourceFile(authority, fs.readFileSync(path.join(root, authority), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error('invalid capability vocabulary TypeScript');
  const declaration = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(source) === 'CAPABILITY_DEFINITIONS');
  let object = declaration?.initializer?.arguments?.[0];
  if (object && ts.isSatisfiesExpression(object)) object = object.expression;
  if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('unsupported capability vocabulary authority');
  const expected = new Map();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name) || !ts.isCallExpression(property.initializer) || property.initializer.expression.getText(source) !== 'definition' || property.initializer.arguments.length !== 3) throw new Error('unsupported capability definition');
    const lists = property.initializer.arguments.map(argument => {
      if (!ts.isArrayLiteralExpression(argument) || !argument.elements.every(ts.isStringLiteral)) throw new Error('unsupported capability list');
      return argument.elements.map(element => element.text);
    });
    if (expected.has(property.name.text)) throw new Error('duplicate capability identity');
    expected.set(property.name.text, lists);
  }
  if (!expected.size) throw new Error('empty capability vocabulary');
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const start = markdown.indexOf('## Nova Grant Vocabulary\n');
  const end = markdown.indexOf('## Buster Test-Provider Runtime Capabilities\n', start);
  if (start < 0 || end < start) throw new Error('missing reader table boundaries');
  const actual = new Map();
  for (const line of markdown.slice(start, end).split('\n').filter(line => line.startsWith('| `'))) {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 5 || !/^`[^`]+`$/u.test(cells[0])) throw new Error('unsupported reader table row');
    const id = cells[0].slice(1, -1);
    if (actual.has(id)) throw new Error('duplicate reader capability');
    const lists = cells.slice(1, 4).map(cell => {
      if (!/^`[^`]+`(?:, `[^`]+`)*$/u.test(cell)) throw new Error('unsupported reader capability list');
      return [...cell.matchAll(/`([^`]+)`/gu)].map(match => match[1]);
    });
    actual.set(id, lists);
  }
  const changed = [...new Set([...expected.keys(), ...actual.keys()])].filter(id => JSON.stringify(expected.get(id)) !== JSON.stringify(actual.get(id)));
  if (changed.length) {
    console.error(`DOC_DRIFT_CAPABILITY: ${page}: Nova identity/operation/resource/constraint mismatch: ${changed.join(', ')}`);
    process.exitCode = 1;
  } else console.log(`Nova vocabulary matches ${page}; ${expected.size} definitions. Role grants, provider/consumer bindings and denial semantics NOT checked.`);
} catch (error) { console.error(`Capability vocabulary input/tool error: ${error.message}`); process.exitCode = 2; }
