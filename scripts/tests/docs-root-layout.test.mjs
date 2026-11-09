import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {selectDocumentation, checkDocumentation} from '../docs-reader/build.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/u, '');
test('documentation has one root and no parallel legacy source trees', () => {
  const selected = checkDocumentation(root);
  assert(selected.pages.some(page => page.relative === 'use/quickstart.md'));
  for (const directory of ['site', '_legacy-source', 'blueprint', 'generated', 'review', 'architecture', 'implementation', 'spikes', 'config']) {
    assert(!fs.existsSync(path.join(root, 'docs', directory)), `Legacy directory remains: ${directory}`);
  }
  for (const page of selected.pages) assert(fs.existsSync(path.join(root, 'docs', page.relative)));
});
test('source selection refuses symlinks rather than publishing outside files', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-root-layout-'));
  try {
    fs.mkdirSync(path.join(fixture, 'docs'));
    fs.writeFileSync(path.join(fixture, 'docs/README.md'), '# Home\n\nOwner: docs\n');
    fs.writeFileSync(path.join(fixture, 'private.txt'), 'not public');
    fs.symlinkSync('../private.txt', path.join(fixture, 'docs/leak.txt'));
    assert.throws(() => selectDocumentation(fixture), /symlink/);
  } finally { fs.rmSync(fixture, {recursive: true, force: true}); }
});
test('moved executable examples resolve relative imports in the repository', () => {
  const {assets} = selectDocumentation(root);
  for (const asset of assets.filter(name => /\.(?:mjs|js|ts)$/u.test(name))) {
    const file = path.join(root, 'docs', asset), text = fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        assert(fs.existsSync(path.resolve(path.dirname(file), specifier.text)), `Broken moved example import: ${asset}: ${specifier.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
});
