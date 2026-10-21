import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import MarkdownIt from 'markdown-it';
import { githubSourceTarget, readPrimarySource } from './source-links.mjs';

const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

// Retrieved source is inert text. Only committed regular blobs are eligible;
// current worktree bytes and execution/import of retrieved programs are excluded.
export async function prepareSourcePreviews(pages, repositoryRoot, { readRemote = readPrimarySource } = {}) {
  const git = (...args) => execFileSync('git', ['-C', repositoryRoot, '--literal-pathspecs', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const origin = git('remote', 'get-url', 'origin').toString().trim();
  const repository = /^(?:git@github\.com:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/u.exec(origin)?.[1];
  assert(repository, 'Source previews require a canonical GitHub repository origin');
  const md = new MarkdownIt({ html: true });
  const objects = new Map(), commits = new Set(), plans = [];
  let sourceBoxes = 0;
  for (const page of pages) {
    const lines = page.text.split('\n'), tokens = md.parse(page.text, {}), blocks = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'blockquote_open' || token.level !== 0) continue;
      const raw = lines.slice(...token.map).join('\n');
      if (!/^>\s*(?:\*\*)?(?:Source|Code evidence)/iu.test(raw)) continue;
      sourceBoxes++;
      const links = new Map();
      for (let next = i + 1; next < tokens.length && !(tokens[next].type === 'blockquote_close' && tokens[next].level === token.level); next++) {
        for (const inline of tokens[next].children ?? []) {
          if (inline.type !== 'link_open') continue;
          const href = inline.attrGet('href');
          if (!/^https?:/iu.test(href)) continue;
          const target = githubSourceTarget(href);
          if (!target || target.view !== 'blob' || target.fragment && !/^L\d+(?:-L\d+)?$/u.test(target.fragment)) continue;
          const key = `${target.repository}@${target.revision}:${target.file}`;
          if (!objects.has(key)) objects.set(key, { target });
          links.set(href, { href, target, key });
        }
      }
      if (links.size) blocks.push({ end: token.map[1], line: token.map[0] + 1, links: [...links.values()] });
    }
    plans.push({ page, lines, blocks });
  }
  const pending = [...objects.values()]; let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < pending.length) {
      const object = pending[cursor++], target = object.target;
      let bytes;
      if (target.repository === repository) {
        if (!commits.has(target.revision)) { assert.equal(git('cat-file', '-t', target.revision).toString().trim(), 'commit'); commits.add(target.revision); }
        const entry = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(git('ls-tree', '-z', target.revision, '--', target.file).toString());
        assert(entry && entry[3] === target.file, `Preview source is not a committed regular blob: ${target.file}`);
        bytes = git('cat-file', 'blob', entry[2]);
      } else bytes = await readRemote(target);
      object.sourceSha256 = sha256(bytes);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const display = text.replaceAll('\r\n', '\n');
      assert(!display.includes('\r') && !display.includes('\0'), `Unsupported source control character: ${target.file}`);
      object.lines = display.split('\n'); if (display.endsWith('\n')) object.lines.pop();
      if (!text) object.lines = [];
      await new Promise(resolve => setImmediate(resolve));
    }
  }));
  const excerpts = [], prepared = []; let boxesWithPreviews = 0;
  for (const { page, lines, blocks } of plans) {
    // Reverse insertions preserve original source line positions and box order.
    for (const block of [...blocks].reverse()) {
      const snippets = [];
      for (const { href, target, key } of block.links) {
        const object = objects.get(key), range = /^L(\d+)(?:-L(\d+))?$/u.exec(target.fragment);
        if (!object.lines.length && !range) continue;
        const start = range ? Number(range[1]) : 1, end = range ? Number(range[2] ?? range[1]) : Math.min(80, object.lines.length);
        assert(start >= 1 && end >= start && end <= object.lines.length, `Preview source range is invalid: ${href}`);
        const excerpt = object.lines.slice(start - 1, end).join('\n');
        const sourceHref = range ? href : `${href.split('#')[0]}#L${start}-L${end}`;
        excerpts.push({ page: page.relative, boxLine: block.line, href: sourceHref, repository: target.repository, revision: target.revision, file: target.file, startLine: start, endLine: end, sourceSha256: object.sourceSha256, excerptSha256: sha256(excerpt) });
        snippets.push(`<details>\n<summary>Source: ${escape(target.file)} · lines ${start}–${end}</summary>\n\n<p><a href="${escape(sourceHref)}">Open these exact source lines</a> · revision <code>${escape(target.revision)}</code>. Source excerpt only; not an execution result${range ? '' : '; the first ' + end + ' lines are shown'}.</p>\n\n<pre><code class="source-preview-code">${escape(excerpt)}</code></pre>\n\n</details>`);
      }
      if (snippets.length) { boxesWithPreviews++; lines.splice(block.end, 0, '>', ...snippets.join('\n\n').split('\n').map(line => '> ' + line)); }
    }
    prepared.push({ ...page, searchSourceText: page.text, text: lines.join('\n') });
  }
  excerpts.sort((a, b) => a.page.localeCompare(b.page) || a.boxLine - b.boxLine || a.href.localeCompare(b.href));
  return { pages: prepared, manifest: { schemaVersion: 'kubeclaw-source-previews.v1', displayLineEndings: 'LF; CRLF normalized without changing code content', pages: pages.map(page => ({ path: page.relative, sourceMarkdownSha256: sha256(page.text) })), sourceBoxes, boxesWithPreviews, uniqueSourceObjects: objects.size, excerpts } };
}

// Verify both the actual inert rendered text and a fresh read of the linked
// committed source. Updating an HTML digest cannot authorize a copied snippet.
export async function verifySourcePreviewArtifact(outputRoot, repositoryRoot) {
  const root = fs.realpathSync(path.resolve(outputRoot));
  const reader = JSON.parse(fs.readFileSync(path.join(root, 'reader-manifest.json'), 'utf8'));
  const outputs = new Map(reader.outputs.map(item => [item.path, item]));
  function readOutput(relative) {
    const entry = outputs.get(relative); assert(entry, `Unmanifested preview input: ${relative}`);
    const file = path.join(root, relative); assert.equal(fs.realpathSync(file), file);
    const bytes = fs.readFileSync(file); assert.equal(sha256(bytes), entry.sha256, `Changed preview output: ${relative}`); assert.equal(bytes.length, entry.bytes);
    return bytes;
  }
  const manifest = JSON.parse(readOutput('source-previews.json'));
  assert.equal(manifest.schemaVersion, 'kubeclaw-source-previews.v1');
  const allowed = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'docs/config/documentation-publication-manifest.json'), 'utf8')).pages.map(item => {
    assert(item.sourcePath.startsWith('docs/site/')); return item.sourcePath.slice('docs/site/'.length);
  });
  assert.equal(new Set(manifest.pages.map(item => item.path)).size, manifest.pages.length);
  assert.deepEqual(new Set(manifest.pages.map(item => item.path)), new Set(allowed));
  const inputs = [], actual = [];
  const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
  for (const page of manifest.pages) {
    assert(page.path === path.posix.normalize(page.path) && !page.path.startsWith('../') && !path.isAbsolute(page.path) && !page.path.includes('\\') && page.path.endsWith('.md'));
    const file = path.join(root, page.path); assert.equal(fs.realpathSync(file), file);
    const bytes = fs.readFileSync(file); assert.equal(sha256(bytes), page.sourceMarkdownSha256, `Changed preview Markdown: ${page.path}`);
    inputs.push({ relative: page.path, text: bytes.toString('utf8') });
    function walk(node) {
      if (node.tagName === 'code' && node.attrs?.some(item => item.name === 'class' && item.value.split(/\s+/u).includes('source-preview-code'))) {
        let parent = node.parentNode; while (parent && parent.tagName !== 'details') parent = parent.parentNode;
        assert(parent, 'Source preview is outside its native disclosure');
        const links = []; function find(n) { if (n.tagName === 'a') links.push(n.attrs.find(a => a.name === 'href')?.value); for (const c of n.childNodes ?? []) find(c); } find(parent);
        assert.equal(links.length, 1); actual.push({ page: page.path, href: links[0], excerptSha256: sha256(text(node)) });
      }
      for (const child of node.childNodes ?? []) walk(child);
    }
    walk(parse(readOutput(page.path.replace(/\.md$/u, '.html')).toString('utf8')));
  }
  const ordered = rows => rows.map(row => JSON.stringify([row.page, row.href, row.excerptSha256])).sort();
  assert.deepEqual(ordered(actual), ordered(manifest.excerpts), 'Rendered snippets differ from their source receipts');
  const fresh = await prepareSourcePreviews(inputs, repositoryRoot);
  assert.deepEqual(fresh.manifest, manifest, 'Preview receipts differ from a fresh committed-source read');
  return { pages: inputs.length, sourceBoxes: manifest.sourceBoxes, boxesWithPreviews: manifest.boxesWithPreviews, excerpts: actual.length, uniqueSourceObjects: manifest.uniqueSourceObjects, limit: 'Exact linked source and rendered excerpt verification; no semantic claim or test/runtime result inferred.' };
}
