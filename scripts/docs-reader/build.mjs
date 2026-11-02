#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildReader, readerOutputLayout, renderReaderMarkdown} from './renderer.mjs';
import {collectDocumentationDiagrams, prepareDiagramPages} from './diagrams.mjs';
import {pinnedReaderRouteBaseline} from './redirects.mjs';

export function selectDocumentation(root) {
  const docs = path.join(root, 'docs'), pages = [], assets = [];
  assert.equal(fs.realpathSync(docs), docs, 'Documentation root must be a physical directory');
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      assert(!entry.isSymbolicLink(), `Documentation must not contain symlinks: ${file}`);
      if (entry.isDirectory()) { visit(file); continue; }
      assert(entry.isFile(), `Documentation must contain regular files: ${file}`);
      const relative = path.relative(docs, file).split(path.sep).join('/');
      if (relative.endsWith('.md')) {
        const text = fs.readFileSync(file, 'utf8');
        assert(/^# .+/mu.test(text), `Page needs a title: ${relative}`);
        const owner = /^Owner: (.+)$/mu.exec(text)?.[1];
        assert(owner?.trim(), `Page needs an owner: ${relative}`);
        pages.push({relative, text, owner});
      } else assets.push(relative);
    }
  }
  visit(docs);
  pages.sort((a, b) => a.relative.localeCompare(b.relative));
  assets.sort();
  assert(pages.some(page => page.relative === 'README.md'), 'Documentation home missing');
  return {docs, pages, assets};
}

export function checkDocumentation(root) {
  const selected = selectDocumentation(root);
  const {routes, allAssets} = readerOutputLayout(selected);
  const sourceLink = target => {
    const relative = path.posix.normalize('docs/' + target);
    assert(!relative.startsWith('../') && !path.posix.isAbsolute(relative), 'Source link escapes repository');
    const file = path.join(root, relative);
    assert(fs.existsSync(file), `Missing linked source: ${relative}`);
    assert.equal(fs.realpathSync(file), file, `Linked source must not follow symlinks: ${relative}`);
    return `https://github.com/datrab/kubeclaw/blob/HEAD/${relative}`;
  };
  for (const page of selected.pages) renderReaderMarkdown(page.text, page.relative, routes, new Set(allAssets), sourceLink);
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'scripts/docs-reader/diagram-registry.json'), 'utf8'));
  collectDocumentationDiagrams(selected.pages, registry);
  return {...selected, registry};
}

export async function buildDocumentation(root) {
  const selected = checkDocumentation(root);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'docs', 'scripts/docs-reader'], {cwd: root, encoding: 'utf8'}).trim() !== '';
  // This is the sole disposable output, never a caller-selected path.
  const outputRoot = path.join(root, '.tmp/docs-publication');
  fs.mkdirSync(path.dirname(outputRoot), {recursive: true});
  assert.equal(fs.realpathSync(path.dirname(outputRoot)), path.dirname(outputRoot), 'Build parent must be physical');
  if (fs.existsSync(outputRoot)) assert.equal(fs.realpathSync(outputRoot), outputRoot, 'Build output must be physical');
  const prepared = await prepareDiagramPages(selected.pages, selected.registry);
  fs.rmSync(outputRoot, {recursive: true, force: true});
  fs.mkdirSync(outputRoot);
  for (const asset of selected.assets) {
    const target = path.join(outputRoot, asset);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(selected.docs, asset), target);
  }
  const manifest = buildReader({outputRoot, pages: prepared.pages, assets: selected.assets,
    generatedAssets: prepared.assets, diagramManifest: prepared.manifest, revision,
    redirectRegistry: JSON.parse(fs.readFileSync(path.join(selected.docs, 'reference/documentation-route-registry.json'), 'utf8')),
    routeBaseline: pinnedReaderRouteBaseline(root),
    sourceLink: target => {
      const relative = path.posix.normalize('docs/' + target);
      assert(!relative.startsWith('../') && !path.posix.isAbsolute(relative), 'Source link escapes repository');
      return `https://github.com/datrab/kubeclaw/blob/${revision}/${relative}`;
    }});
  fs.writeFileSync(path.join(outputRoot, 'build-report.json'), JSON.stringify({revision, dirty,
    pageCount: manifest.pageCount, sourceRoot: 'docs/', outputRoot: '.tmp/docs-publication',
    scope: 'Reader build only; no runtime, reference-regeneration or full acceptance claim.'}, null, 2) + '\n');
  return {outputRoot, pageCount: manifest.pageCount, revision, dirty};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/u, '');
  const command = process.argv[2] ?? 'check';
  assert(process.argv.length <= 3 && ['check', 'build'].includes(command), 'Usage: build.mjs [check|build]');
  if (command === 'build') console.log(JSON.stringify(await buildDocumentation(root)));
  else {
    const selected = checkDocumentation(root);
    console.log(`Documentation sources: ${selected.pages.length} pages, ${selected.assets.length} assets; links and diagram sources checked.`);
  }
}
