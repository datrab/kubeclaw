import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { publicationMetadata } from '../docs-reader/metadata.mjs';
import { buildReader, renderReaderMarkdown, searchReaderPages } from '../docs-reader/renderer.mjs';

test('search ranks declared reader synonyms, headings and technical IDs without admitting missing or internal pages', () => {
  const index = [
    { route: 'reference/other.html', title: 'Other', headings: [], text: 'backup restore disaster recovery '.repeat(100) },
    { route: 'use/recovery.html', title: 'Recover durable state', headings: ['Back up'], text: 'Durable snapshots.' },
    { route: 'reference/configuration.html', title: 'Configuration', headings: ['minimumLinePercent'], text: 'minimumLinePercent' },
  ];
  assert.equal(searchReaderPages(index, 'DISASTER recovery')[0].route, 'use/recovery.html');
  assert.equal(searchReaderPages(index, 'minimumLinePercent')[0].route, 'reference/configuration.html');
  assert.deepEqual(searchReaderPages(index, 'missing technical identifier'), []);
  assert.deepEqual(searchReaderPages(index, 'create first plugin'), []);
  assert.deepEqual(searchReaderPages(index, ' !!! '), []);
});

function elements(html) {
  const result = [];
  function walk(node) { if (node.tagName) result.push(node); for (const child of node.childNodes ?? []) walk(child); }
  walk(parse(html));
  return result;
}
const attr = (node, name) => node.attrs.find(a => a.name === name)?.value;

test('real Markdown constructs retain canonical heading fragments, links, examples and safe disclosures', () => {
  const routes = new Map([['guide.md', '/guide.html'], ['next.md', '/next.html']]);
  const text = '# Guide\n\n## `a.b` & Values\n\n[Next](next.md?q=one#hello)\n\n```md\n[not rewritten](next.md)\n```\n\n| Name | Value |\n| --- | --- |\n| x | <code>a&amp;b</code><br>next |\n\n<details><summary>More</summary>\n\nText.\n\n</details>\n\n<a id="explicit"></a>\n\n<script>alert(1)</script>\n<img src="https://example.com/a.png" onerror="alert(2)">\n';
  const rendered = renderReaderMarkdown(text, 'guide.md', routes, new Set());
  const nodes = elements(rendered.html);
  assert(nodes.some(n => n.tagName === 'h2' && attr(n, 'id') === 'ab--values'));
  assert(nodes.some(n => n.tagName === 'a' && attr(n, 'href') === 'next.html?q=one#hello'));
  assert(nodes.some(n => n.tagName === 'table'));
  assert(nodes.some(n => n.tagName === 'details'));
  assert(nodes.some(n => attr(n, 'id') === 'explicit'));
  assert.match(rendered.html, /\[not rewritten\]\(next.md\)/u);
  assert(!nodes.some(n => n.tagName === 'script' || n.attrs.some(a => a.name.startsWith('on'))));
  assert.throws(() => renderReaderMarkdown('[private](secret.json)', 'guide.md', routes, new Set()), /not a published/u);
  const explicitHeading = renderReaderMarkdown('<a id="same"></a>\n\n## Same\n', 'guide.md', routes, new Set());
  assert.equal(elements(explicitHeading.html).filter(n => attr(n, 'id') === 'same').length, 1);
  const scoped = renderReaderMarkdown('# Guide\n\nStatus: bounded\nEvidence: [Next](next.md)\n\n## Task\n', 'guide.md', routes, new Set());
  assert.match(scoped.html, /<summary>Page scope and sources<\/summary>/u);
  assert(elements(scoped.html).some(n => attr(n, 'href') === 'next.html'));
});

test('artifact is deterministic, searchable, positive-selected and bound to exact rendered output bytes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-reader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pages = [{ relative: 'README.md', text: '# Home\n\n[Guide](use/guide.md)\n' }, { relative: 'use/guide.md', text: '# Guide\n\n## Duplicate\n\n## Duplicate\n\nUniqueConfigName and `<script>` are searchable.\n\n[Example](examples/)\n' }];
  const options = { outputRoot: root, pages, assets: ['use/examples/input.json'], revision: 'a'.repeat(40) };
  const first = buildReader(options);
  assert.equal(first.pageCount, 2);
  for (const output of first.outputs) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, output.path))).digest('hex'), output.sha256);
  assert.deepEqual(buildReader(options), first);
  const guide = fs.readFileSync(path.join(root, 'use/guide.html'), 'utf8');
  assert.match(guide, /id="duplicate-1"/u);
  assert.match(guide, /href="examples\/index.html"/u);
  assert.match(guide, /href="..\/reader.css"/u);
  assert.match(fs.readFileSync(path.join(root, 'search-index.js'), 'utf8'), /UniqueConfigName/u);
  assert(!fs.readFileSync(path.join(root, 'search-index.js'), 'utf8').includes('<script>'));
  assert.equal(fs.existsSync(path.join(root, 'secret.md')), false);
});

test('artifact checker rejects changed output bytes and a digest-consistent broken fragment', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-reader-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checker = fileURLToPath(new URL('../docs-reader/check-artifact.mjs', import.meta.url));
  const options = { outputRoot: root, pages: [{ relative: 'README.md', text: '# Home\n\n[Task](#task)\n\n## Task\n' }], assets: [], revision: 'b'.repeat(40) };
  const check = () => spawnSync(process.execPath, [checker, root], { encoding: 'utf8' });
  buildReader(options);
  assert.equal(check().status, 0);
  fs.appendFileSync(path.join(root, 'README.html'), '<p>changed</p>');
  assert.notEqual(check().status, 0);
  buildReader(options);
  const file = path.join(root, 'README.html');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('id="task"', 'id="lost"'));
  const manifestFile = path.join(root, 'reader-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const entry = manifest.outputs.find(item => item.path === 'README.html');
  entry.bytes = fs.statSync(file).size;
  entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const broken = check();
  assert.notEqual(broken.status, 0);
  assert.match(broken.stderr, /Missing rendered fragment/u);
  buildReader(options);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('src="reader.js"', 'src="missing.js"'));
  const scriptManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const scriptEntry = scriptManifest.outputs.find(item => item.path === 'README.html');
  scriptEntry.bytes = fs.statSync(file).size;
  scriptEntry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(manifestFile, JSON.stringify(scriptManifest));
  const missingScript = check();
  assert.notEqual(missingScript.status, 0);
  assert.match(missingScript.stderr, /missing\.js/u);
});

test('publication transforms only the first metadata header and never evidence prose or executable examples', () => {
  const body = '\n## Procedure\n\nEvidence: [Chart](https://example.test/source),\n\n```md\nEvidence: example.json\nLast verified: generated during publication\n```\n';
  const input = '# Page\n\nStatus: implemented\nAudience: operator\nOwner: platform\nEvidence: source.go; source-directory\nApplies to: local\nLast verified: generated during publication\n' + body;
  const selected = [];
  const actual = publicationMetadata(input, 'a'.repeat(40), item => { selected.push(item); return `https://example.test/${item}`; });
  assert.deepEqual(selected, ['source.go', 'source-directory']);
  assert.match(actual, /Evidence: \[source.go\]\(https:\/\/example.test\/source.go\); \[source-directory\]\(https:\/\/example.test\/source-directory\)/u);
  assert.match(actual, new RegExp(`Last verified: ${'a'.repeat(40)}`));
  assert(actual.endsWith(body));
});

test('authored metadata links stay intact and documents without a metadata header remain unchanged', () => {
  const text = '# Page\n\nStatus: implemented\nEvidence: [Existing](https://example.test/exact); https://example.test/other\nLast verified: yesterday\n\nBody.\n';
  const actual = publicationMetadata(text, 'b'.repeat(40), () => { throw new Error('not a repository path'); });
  assert.match(actual, /Evidence: \[Existing\]\(https:\/\/example.test\/exact\); \[https:\/\/example.test\/other\]\(https:\/\/example.test\/other\)/u);
  assert.equal(publicationMetadata('# Example\n\nEvidence: fixture\n', 'b'.repeat(40), () => { throw new Error('not metadata'); }), '# Example\n\nEvidence: fixture\n');
});

// Existing decision/status pages use blank-line-separated metadata fields.
test('publication recognizes the existing spaced metadata header without consuming the body', () => {
  const body = '\n## Decision\n\nEvidence: this is prose, not a path\n';
  const input = '# Decision\n\nStatus: implemented\n\nAudience: maintainer\n\nOwner: platform\n\nEvidence: source.go\n\nLast verified: generated during publication\n' + body;
  const actual = publicationMetadata(input, 'c'.repeat(40), item => `https://example.test/${item}`);
  assert.match(actual, /Evidence: \[source.go\]\(https:\/\/example.test\/source.go\)/u);
  assert.match(actual, new RegExp(`Last verified: ${'c'.repeat(40)}`));
  assert(actual.endsWith(body));
});

test('publication recognizes metadata on every existing reader page, including source-inventory fields', () => {
  const root = fileURLToPath(new URL('../../docs/site/', import.meta.url));
  function pages(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? pages(path.join(dir, item.name)) : item.name.endsWith('.md') ? [path.join(dir, item.name)] : []); }
  for (const file of pages(root)) {
    const text = fs.readFileSync(file, 'utf8').replace(/^Last verified: .+$/mu, 'Last verified: generated during publication');
    const actual = publicationMetadata(text, 'd'.repeat(40), item => `https://example.test/${item}`);
    assert.match(actual, new RegExp(`Last verified: ${'d'.repeat(40)}`), file);
    assert(!actual.includes('Last verified: generated during publication'), file);
  }
});
