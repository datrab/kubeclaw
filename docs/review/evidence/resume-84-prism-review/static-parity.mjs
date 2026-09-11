import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import parser from '@typescript-eslint/parser';
const [baselineRoot, candidateRoot] = process.argv.slice(2);
const read = (root, path) => fs.readFileSync(`${root}/${path}`, 'utf8');
const source = text => ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const syntaxTree = node => { const children = []; ts.forEachChild(node, child => { children.push(child); }); return [node.kind, children.length ? children.map(syntaxTree) : node.getText()]; };
const before = source(read(baselineRoot, 'skills/prism/engine/index.ts'));
const after = source(read(candidateRoot, 'skills/prism/engine/design-providers.ts'));
for (const name of ['DeterministicDesignProvider', 'OpenAICompatibleDesignProvider']) {
  const original = before.statements.find(node => ts.isClassDeclaration(node) && node.name.text === name);
  const extracted = after.statements.find(node => ts.isClassDeclaration(node) && node.name.text === name);
  assert(original && extracted);
  assert.deepEqual(syntaxTree(extracted), syntaxTree(original));
  console.log(`${name}: identical TypeScript syntax tree and leaf tokens (trivia and optional trailing commas excluded)`);
}
for (const path of ['skills/prism/engine/execution-cache.ts', 'skills/prism/engine/browser-capture.ts', 'skills/prism/package.json', 'skills/prism/runtime.ts']) {
  assert.equal(read(candidateRoot, path), read(baselineRoot, path));
  console.log(`${path}: unchanged bytes`);
}
const callbackSource = read(candidateRoot, 'skills/prism/engine/capture-findings.ts');
const javascript = ts.transpileModule(callbackSource, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
const parsed = parser.parseForESLint(javascript, { ecmaVersion: 2024, sourceType: 'module' });
const externalNames = [...new Set(parsed.scopeManager.globalScope.through.map(ref => ref.identifier.name))].sort();
assert.deepEqual(externalNames, ['Array', 'Math', 'Number', 'getComputedStyle', 'undefined', 'window']);
console.log(`Browser callback free identifiers are only browser globals: ${externalNames.join(', ')}`);
console.log('Static closure/AST inspection only; no native browser, screenshot, or model execution claimed.');
