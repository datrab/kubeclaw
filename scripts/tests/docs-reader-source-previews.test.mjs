import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parse } from 'parse5';
import test from 'node:test';
import { prepareSourcePreviews, verifySourcePreviewArtifact } from '../docs-reader/source-previews.mjs';
import { renderReaderMarkdown, buildReader } from '../docs-reader/renderer.mjs';

function repository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-preview-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test'); git('remote', 'add', 'origin', 'git@github.com:fixture/source.git');
  return { root, git };
}
const page = href => [{ relative: 'README.md', text: `# Reader\n\n> **Source evidence — bounded claim**\n>\n> Implementation: [exact code](${href}).\n>\n> Contract: fixture.\n> Test: this is not a runtime claim.\n> Limit: source bytes only.\n\n## Next task\n\nUnchanged instructions.\n` }];

test('preview shows the linked historical committed lines, never newer worktree bytes or executable HTML', async t => {
  const { root, git } = repository(t), original = 'first\r\n<script>throw new Error("must stay inert")</script>\r\nthird\r\n';
  fs.writeFileSync(path.join(root, 'source.js'), original); git('add', '.'); git('commit', '-qm', 'original'); const revision = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'source.js'), 'new worktree bytes\n');
  const href = `https://github.com/fixture/source/blob/${revision}/source.js#L2-L3`, input = page(href);
  const result = await prepareSourcePreviews(input, root);
  assert.equal(result.manifest.excerpts.length, 1);
  assert.equal(result.pages[0].searchSourceText, input[0].text);
  assert.equal(input[0].text.includes('source-preview-code'), false);
  assert(result.pages[0].text.endsWith('## Next task\n\nUnchanged instructions.\n'));
  const { html } = renderReaderMarkdown(result.pages[0].text, 'README.md', new Map([['README.md', '/README.html']]), new Set());
  const nodes = []; function walk(n) { nodes.push(n); for (const c of n.childNodes ?? []) walk(c); } walk(parse(html));
  assert(!nodes.some(n => n.tagName === 'script'));
  const code = nodes.find(n => n.tagName === 'code' && n.attrs.some(a => a.name === 'class' && a.value === 'source-preview-code'));
  const text = n => n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(text).join('');
  const expected = '<script>throw new Error("must stay inert")</script>\nthird';
  assert.equal(text(code), expected);
  assert.equal(result.manifest.excerpts[0].excerptSha256, crypto.createHash('sha256').update(expected).digest('hex'));
  assert.equal(result.manifest.excerpts[0].sourceSha256, crypto.createHash('sha256').update(original).digest('hex'));
  assert(html.includes(href)); assert(!html.includes('new worktree bytes'));
});

test('preview rejects absent, symlink, mutable-revision and out-of-bounds sources', async t => {
  const { root, git } = repository(t); fs.writeFileSync(path.join(root, 'source.js'), 'one\n'); fs.symlinkSync('source.js', path.join(root, 'alias.js')); git('add', '.'); git('commit', '-qm', 'fixture'); const revision = git('rev-parse', 'HEAD');
  for (const suffix of ['absent.js#L1', 'alias.js#L1', 'source.js#L0', 'source.js#L1-L2']) await assert.rejects(prepareSourcePreviews(page(`https://github.com/fixture/source/blob/${revision}/${suffix}`), root));
  await assert.rejects(prepareSourcePreviews(page('https://github.com/fixture/source/blob/main/source.js#L1'), root));
});

test('all excerpts of one upstream object use the same returned source bytes while unrelated examples remain untouched', async t => {
  const { root } = repository(t), revision = 'a'.repeat(40), href = `https://github.com/upstream/source/blob/${revision}/source.ts`, bytes = Buffer.from('one\ntwo\nthree\n'); let reads = 0;
  const input = page(href + '#L1-L2'); input[0].text = input[0].text.replace('Contract: fixture.', `Contract: [other lines](${href}#L3).`);input[0].text += '\n```md\n> **Source evidence**\n> [not a real source box](https://github.com/upstream/source/blob/main/missing.ts#L1)\n```\n';
  const result = await prepareSourcePreviews(input, root, { readRemote: async target => { reads++; assert.equal(target.revision, revision); return bytes; } });
  assert.equal(reads, 1); assert.equal(result.manifest.excerpts.length, 2);
  assert.equal(result.manifest.sourceBoxes, 1); assert.equal(result.manifest.boxesWithPreviews, 1);
  assert(result.pages[0].text.endsWith('```md\n> **Source evidence**\n> [not a real source box](https://github.com/upstream/source/blob/main/missing.ts#L1)\n```\n'));
});

test('actual artifact verifier rejects digest-consistent changed source excerpts and keeps preview code out of search', async t => {
  const { root, git } = repository(t); fs.writeFileSync(path.join(root, 'source.js'), 'UNIQUE_PREVIEW_ONLY_TOKEN\n'); git('add', '.'); git('commit', '-qm', 'fixture'); const revision = git('rev-parse', 'HEAD');
  const input = page(`https://github.com/fixture/source/blob/${revision}/source.js#L1`), prepared = await prepareSourcePreviews(input, root), output = path.join(root, 'publication');
  fs.mkdirSync(path.join(root, 'docs/config'), { recursive: true }); fs.writeFileSync(path.join(root, 'docs/config/documentation-publication-manifest.json'), JSON.stringify({ pages: [{ sourcePath: 'docs/site/README.md' }] }));
  fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'README.md'), input[0].text);
  buildReader({ outputRoot: output, pages: prepared.pages, sourcePreviews: prepared.manifest, assets: [], revision });
  assert.equal((await verifySourcePreviewArtifact(output, root)).excerpts, 1);
  assert(!fs.readFileSync(path.join(output, 'search-index.js'), 'utf8').includes('UNIQUE_PREVIEW_ONLY_TOKEN'));
  const file = path.join(output, 'README.html'); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('UNIQUE_PREVIEW_ONLY_TOKEN', 'ALTERED_SNIPPET'));
  const manifestFile = path.join(output, 'reader-manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')), entry = manifest.outputs.find(e => e.path === 'README.html');
  entry.bytes = fs.statSync(file).size; entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  await assert.rejects(verifySourcePreviewArtifact(output, root), /Rendered snippets differ/u);
});
