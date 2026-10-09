import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertMarkdownVisibleCoverage,
  assertSvgVisibleCoverage,
  extractionBindingDigest,
  extractMarkdown,
  extractSvg,
  extractorVersion,
  runCli,
  sourceSetAuthorityDigest,
} from '../docs-parity-extract.mjs';

const sourceRoot = path.resolve(import.meta.dirname, '../..');

function run(root, command, args = [], capture = false) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'ignore',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function write(root, relative, value) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function sourceRecord(originalPath, legacyPath) {
  return { path: legacyPath, class: 'legacy-extraction-source', purpose: 'test', originalPath,
    expectedPath: legacyPath, introducedAfterBaseline: false };
}

function directSource(originalPath, kind = 'markdown') {
  return { ...sourceRecord(originalPath, `docs/_legacy-source/${originalPath.slice('docs/'.length)}`),
    gitObject: 'a'.repeat(40), kind, baselineRevision: 'b'.repeat(40) };
}

function fixture(files, { objectFormat = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-doc-parity-'));
  write(root, 'scripts/docs-parity-extract.mjs', fs.readFileSync(path.join(sourceRoot, 'scripts/docs-parity-extract.mjs')));
  for (const [pathname, value] of Object.entries(files)) write(root, pathname, value);
  run(root, 'git', ['init', '-q', ...(objectFormat ? [`--object-format=${objectFormat}`] : [])]);
  run(root, 'git', ['config', 'user.name', 'Docs Test']);
  run(root, 'git', ['config', 'user.email', 'docs-test@example.invalid']);
  run(root, 'git', ['add', '.']);
  run(root, 'git', ['commit', '-qm', 'immutable documentation baseline']);
  const baselineRevision = run(root, 'git', ['rev-parse', 'HEAD'], true).trim();
  const baselineFiles = Object.keys(files).sort().map((originalPath) => ({
    originalPath,
    gitObject: run(root, 'git', ['rev-parse', `${baselineRevision}:${originalPath}`], true).trim(),
    mode: '100644',
    kind: path.extname(originalPath) === '.svg' ? 'diagram' : 'markdown',
  }));
  for (const record of baselineFiles) {
    const legacyPath = `docs/_legacy-source/${record.originalPath.slice('docs/'.length)}`;
    fs.mkdirSync(path.dirname(path.join(root, legacyPath)), { recursive: true });
    fs.renameSync(path.join(root, record.originalPath), path.join(root, legacyPath));
  }
  write(root, 'docs/config/documentation-tree-baseline.json', `${JSON.stringify({
    schemaVersion: 'kubeclaw-documentation-tree-baseline.v1', baselineRevision, files: baselineFiles,
  }, null, 2)}\n`);
  write(root, 'docs/config/documentation-tree-classification.json', `${JSON.stringify({
    schemaVersion: 'kubeclaw-documentation-tree-classification.v1', baselineRevision,
    files: baselineFiles.map((record) => sourceRecord(record.originalPath,
      `docs/_legacy-source/${record.originalPath.slice('docs/'.length)}`)),
  }, null, 2)}\n`);
  run(root, 'git', ['add', '-A']);
  run(root, 'git', ['commit', '-qm', 'freeze documentation parity source set']);
  const sourceSetAuthorityRevision = run(root, 'git', ['rev-parse', 'HEAD'], true).trim();
  const authoritySources = baselineFiles.map((record) => ({
    originalPath: record.originalPath,
    legacyPath: `docs/_legacy-source/${record.originalPath.slice('docs/'.length)}`,
    gitObject: record.gitObject,
    kind: record.kind,
  }));
  write(root, 'docs/config/documentation-parity-batches.json', `${JSON.stringify({
    schemaVersion: 'kubeclaw-documentation-parity-batches.v1', purpose: 'test source-set authority',
    sourceSetAuthorityRevision,
    sourceSetAuthoritySha256: sourceSetAuthorityDigest(sourceSetAuthorityRevision, baselineRevision, authoritySources),
    batches: [{ id: 'test-batch', owner: 'docs-test', patterns: ['^docs/.+'] }],
  }, null, 2)}\n`);
  write(root, 'docs/generated/inventory/documentation-parity-batches.json', `${JSON.stringify({
    schemaVersion: 'kubeclaw-documentation-parity-batch-inventory.v1',
    sourceCount: baselineFiles.length,
    batchCount: 1,
    counts: { 'test-batch': baselineFiles.length },
    assignments: baselineFiles.map((record) => ({
      originalPath: record.originalPath,
      legacyPath: `docs/_legacy-source/${record.originalPath.slice('docs/'.length)}`,
      batchId: 'test-batch',
      owner: 'docs-test',
    })),
  }, null, 2)}\n`);
  return root;
}

function supportsGitObjectFormat(objectFormat) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-git-format-'));
  try {
    run(root, 'git', ['init', '-q', `--object-format=${objectFormat}`]);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function readUnits(root) {
  return fs.readFileSync(path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(JSON.parse);
}

function failFileSystem(method, failAt) {
  const injected = Object.create(fs);
  let calls = 0;
  const failures = new Set(Array.isArray(failAt) ? failAt : [failAt]);
  injected[method] = (...args) => {
    calls += 1;
    if (failures.has(calls)) throw Object.assign(new Error(`injected ${method} failure`), { code: 'EIO' });
    return fs[method](...args);
  };
  return injected;
}

function outputState(root) {
  return ['documentation-parity-units.jsonl', 'documentation-parity-summary.json'].map((name) => {
    const pathname = path.join(root, 'docs/generated/inventory', name);
    const status = fs.statSync(pathname, { bigint: true });
    return { pathname, bytes: fs.readFileSync(pathname), ino: status.ino, mtimeNs: status.mtimeNs };
  });
}

function assertOutputState(before) {
  for (const record of before) {
    const status = fs.statSync(record.pathname, { bigint: true });
    assert.deepEqual(fs.readFileSync(record.pathname), record.bytes);
    assert.equal(status.ino, record.ino);
    assert.equal(status.mtimeNs, record.mtimeNs);
  }
  const directory = path.dirname(before[0].pathname);
  assert.deepEqual(fs.readdirSync(directory).filter((name) => /\.(?:tmp|bak)-/u.test(name)), []);
}

const richMarkdown = `---
title: Exact metadata
owner: docs
---
# Primary heading

A paragraph with [reader link](guide.md), ![diagram words](flow.svg), and literal &lt;tag&gt; text.

- First item with a
  continued visible line
  - Nested item
2. Second item with \`literal.code\`

| Name | Meaning |
| :--- | ---: |
| alpha | retained value |

~~~json fixture=yes
{"visible":"code words"}
~~~

<aside>Visible <strong>HTML words</strong>. <img src="map.png" alt="HTML image label"></aside>
`;

test('extracts Markdown semantic units with exact spans, context, references, and hashes', () => {
  const buffer = Buffer.from(richMarkdown);
  const source = directSource('docs/guide.md');
  const units = extractMarkdown(buffer, source);
  const kinds = new Set(units.map((unit) => unit.kind));
  for (const kind of ['frontmatter', 'heading', 'paragraph', 'list-item', 'table-header', 'table-row', 'code-block', 'html']) {
    assert(kinds.has(kind), `missing ${kind}`);
  }
  for (const unit of units) {
    assert.equal(buffer.subarray(unit.byteStart, unit.byteEnd).toString('utf8'), unit.exact);
    assert.match(unit.exactSha256, /^[0-9a-f]{64}$/u);
    assert.match(unit.normalizedSha256, /^[0-9a-f]{64}$/u);
    assert.match(unit.unitId, /^dpu_[0-9a-f]{32}$/u);
    assert.equal(unit.extractorVersion, extractorVersion);
  }
  const paragraph = units.find((unit) => unit.kind === 'paragraph');
  assert.deepEqual(paragraph.headingPath, ['Primary heading']);
  assert(paragraph.text.includes('literal <tag> text'));
  assert.deepEqual(paragraph.references.map(({ kind, label, destination }) => ({ kind, label, destination })), [
    { kind: 'link', label: 'reader link', destination: 'guide.md' },
    { kind: 'image', label: 'diagram words', destination: 'flow.svg' },
  ]);
  const items = units.filter((unit) => unit.kind === 'list-item');
  assert.equal(items.length, 3);
  assert.equal(items[0].text, 'First item with a continued visible line');
  assert.equal(items[1].depth, 1);
  assert.equal(items[1].indent, 2);
  assert.equal(items[2].ordered, true);
  assert.equal(units.find((unit) => unit.kind === 'frontmatter').text, 'title: Exact metadata\nowner: docs');
  const tableRow = units.find((unit) => unit.kind === 'table-row');
  assert.deepEqual(tableRow.tableHeaders, ['Name', 'Meaning']);
  assert.deepEqual(tableRow.cells, ['alpha', 'retained value']);
  const code = units.find((unit) => unit.kind === 'code-block');
  assert.equal(code.language, 'json');
  assert.equal(code.info, 'json fixture=yes');
  assert.equal(code.text, '{"visible":"code words"}');
  const html = units.find((unit) => unit.kind === 'html');
  assert.equal(html.visibleText, 'Visible HTML words . HTML image label');
  assert.deepEqual(html.references.at(-1), {
    kind: 'html-image', label: 'HTML image label', destination: 'map.png', title: null,
  });
});

test('coverage assertion rejects a mutation that omits visible Markdown', () => {
  const buffer = Buffer.from('# Heading\n\nFirst retained sentence.\n\nSecond retained sentence.\n');
  const source = directSource('docs/mutation.md');
  const units = extractMarkdown(buffer, source);
  const firstParagraph = units.find((unit) => unit.normalized === 'First retained sentence.');
  assert(firstParagraph);
  assert.throws(
    () => assertMarkdownVisibleCoverage(buffer, units.filter((unit) => unit !== firstParagraph), source.originalPath),
    /visible Markdown content was omitted.*First retained sentence/u,
  );
});

test('extracts deterministic atomic segments for prose, list, table, and code subclaims', () => {
  const buffer = Buffer.from(`First fact. Second fact.

- First item fact; second item fact.

| Left claim | Right claim |
| --- | --- |
| One value. Another value. | Two values |

\`\`\`js
start(); finish();
verify()
\`\`\`
`);
  const units = extractMarkdown(buffer, directSource('docs/atomic.md'));
  const segmentText = (unit) => unit.atomicSegments.map((segment) =>
    buffer.subarray(segment.byteStart, segment.byteEnd).toString('utf8'));
  assert.deepEqual(segmentText(units.find((unit) => unit.kind === 'paragraph')),
    ['First fact.', 'Second fact.']);
  assert.deepEqual(segmentText(units.find((unit) => unit.kind === 'list-item')),
    ['- First item fact; second item fact.']);
  assert.deepEqual(segmentText(units.find((unit) => unit.kind === 'table-header')),
    ['Left claim', 'Right claim']);
  assert.deepEqual(segmentText(units.find((unit) => unit.kind === 'table-row')),
    ['One value.', 'Another value.', 'Two values']);
  assert.deepEqual(segmentText(units.find((unit) => unit.kind === 'code-block')),
    ['start(); finish();', 'verify()']);
  for (const unit of units) {
    for (const [index, segment] of unit.atomicSegments.entries()) {
      assert.equal(segment.index, index);
      assert(segment.byteStart >= unit.byteStart && segment.byteEnd <= unit.byteEnd);
      assert.match(segment.exactSha256, /^[0-9a-f]{64}$/u);
      assert.match(segment.normalizedSha256, /^[0-9a-f]{64}$/u);
    }
  }
});

test('semicolon-like syntax never creates language-blind atomic boundaries', () => {
  const buffer = Buffer.from(`Use \`left;right\` and keep this prose; it is one sentence.

\`\`\`js
const message = "left;right"; // keep; together
for (let index = 0; index < 2; index += 1) run(index);
\`\`\`
`);
  const units = extractMarkdown(buffer, directSource('docs/semicolon-syntax.md'));
  const segmentText = (unit) => unit.atomicSegments.map((segment) =>
    buffer.subarray(segment.byteStart, segment.byteEnd).toString('utf8'));
  assert.deepEqual(segmentText(units.find((unit) => unit.kind === 'paragraph')),
    ['Use `left;right` and keep this prose; it is one sentence.']);
  assert.deepEqual(segmentText(units.find((unit) => unit.kind === 'code-block')), [
    'const message = "left;right"; // keep; together',
    'for (let index = 0; index < 2; index += 1) run(index);',
  ]);
});

test('omits invisible HTML units but retains visible HTML and referenced images', () => {
  const buffer = Buffer.from(`<!-- reviewer-only note -->

<div></div>

<template>Template-only text.</template>

<div hidden>Hidden text.</div>

<div title=" hidden ">Reader-visible attribute text.</div>

<div title=x/hidden>Reader-visible unquoted attribute text.</div>

<aside>Reader-visible HTML.</aside>

<img src="diagram.svg" alt="">
`);
  const units = extractMarkdown(buffer, directSource('docs/html-visibility.md'));
  const html = units.filter((unit) => unit.kind === 'html');
  assert.equal(html.length, 4);
  assert.equal(html[0].visibleText, 'Reader-visible attribute text.');
  assert.equal(html[1].visibleText, 'Reader-visible unquoted attribute text.');
  assert.equal(html[2].visibleText, 'Reader-visible HTML.');
  assert.deepEqual(html[3].references, [{
    kind: 'html-image', label: '', destination: 'diagram.svg', title: null,
  }]);
  assert(!units.some((unit) => unit.exact.includes('reviewer-only note') || unit.exact.includes('<div></div>')
    || unit.exact.includes('Template-only text') || unit.exact.includes('Hidden text')));
  assert.doesNotThrow(() => assertMarkdownVisibleCoverage(buffer, units, 'docs/html-visibility.md'));
});

test('groups YAML multiline values and lists by top-level frontmatter field', () => {
  const buffer = Buffer.from(`---
title: >
  A multiline
  title
tags:
  - parity
  - review
owner: docs
---
# Guide
`);
  const units = extractMarkdown(buffer, directSource('docs/frontmatter-fields.md'));
  const frontmatter = units.find((unit) => unit.kind === 'frontmatter');
  const segmentText = frontmatter.atomicSegments.map((segment) =>
    buffer.subarray(segment.byteStart, segment.byteEnd).toString('utf8'));
  assert.deepEqual(segmentText, [
    'title: >\n  A multiline\n  title',
    'tags:\n  - parity\n  - review',
    'owner: docs',
  ]);
  for (const invalid of ['---\n- item: value\n---\n', '---\n{title: Hello, owner: docs}\n---\n',
    '---\n!!map {foo: bar}\n---\n', '---\n&root {foo: bar}\n---\n',
    '---\n%YAML 1.2\ntitle: Probe\n---\n', '---\n  orphan: value\ntitle: Probe\n---\n']) {
    assert.throws(() => extractMarkdown(Buffer.from(invalid), directSource('docs/invalid-frontmatter.md')),
      /top-level mapping field/u);
  }
});

test('extracts SVG labels plus deterministic node, edge, and group relations', () => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">
  <title>System map</title><desc>Node and relation description</desc>
  <g id="workers" class="group"><rect id="worker" x="1" y="2"/><text>Worker &amp; Queue</text></g>
  <path id="dispatch" d="M 1 2 L 3 4" class="edge"/>
</svg>\n`);
  const units = extractSvg(svg, directSource('docs/map.svg', 'diagram'));
  assert.deepEqual(units.filter((unit) => unit.kind.startsWith('svg-')).map((unit) => unit.kind), [
    'svg-boundary', 'svg-title', 'svg-description', 'svg-group', 'svg-node', 'svg-text', 'svg-edge',
  ]);
  assert.equal(units.find((unit) => unit.kind === 'svg-text').text, 'Worker & Queue');
  assert.equal(units.find((unit) => unit.kind === 'svg-group').attributes.id, 'workers');
  assert.equal(units.find((unit) => unit.kind === 'svg-node').attributes.id, 'worker');
  assert.equal(units.find((unit) => unit.kind === 'svg-edge').attributes.id, 'dispatch');
  for (const unit of units) assert.equal(svg.subarray(unit.byteStart, unit.byteEnd).toString('utf8'), unit.exact);
});

test('preserves inline code and resolves links and images in every Markdown unit kind', () => {
  const buffer = Buffer.from(`# [Linked heading](guide_(v2).md)

Use \`agent-<role>\`, \`RUN_ID\`, [full][target], [collapsed][], [shortcut], and ![diagram][flow].

| Source | Value |
| --- | --- |
| [table link](table_(v2).md) | \`run_<id>|exact_value\` |

> [!WARNING]
> Keep [callout link][target] and \`WARN_ID\`.

[target]: <target guide.md> "Target title"
[collapsed]: collapsed.md
[shortcut]: shortcut.md
[flow]: flow.svg "Flow title"
`);
  const units = extractMarkdown(buffer, directSource('docs/inline.md'));
  const heading = units.find((unit) => unit.kind === 'heading');
  assert.equal(heading.text, 'Linked heading');
  assert.equal(heading.references[0].destination, 'guide_(v2).md');
  const paragraph = units.find((unit) => unit.kind === 'paragraph');
  assert(paragraph.text.includes('agent-<role>'));
  assert(paragraph.text.includes('RUN_ID'));
  assert.deepEqual(paragraph.references.map((item) => [item.kind, item.label, item.destination]), [
    ['link-reference', 'full', 'target guide.md'],
    ['link-reference', 'collapsed', 'collapsed.md'],
    ['link-reference', 'shortcut', 'shortcut.md'],
    ['image-reference', 'diagram', 'flow.svg'],
  ]);
  const row = units.find((unit) => unit.kind === 'table-row');
  assert.deepEqual(row.cells, ['table link', 'run_<id>|exact_value']);
  assert.equal(row.references[0].destination, 'table_(v2).md');
  const callout = units.find((unit) => unit.kind === 'callout');
  assert.equal(callout.calloutType, 'WARNING');
  assert.equal(callout.text, 'Keep callout link and WARN_ID.');
  assert.equal(callout.references[0].destination, 'target guide.md');
});

test('code spans close only on an exactly equal backtick run', () => {
  const units = extractMarkdown(Buffer.from('Before `` code ``` [not](link.md) `` after.\n'),
    directSource('docs/code-runs.md'));
  assert.equal(units[0].text, 'Before code ``` [not](link.md) after.');
  assert.deepEqual(units[0].references, []);
});

test('resolves CommonMark definitions inside list and blockquote containers', () => {
  const units = extractMarkdown(Buffer.from(`Use [quoted] and [listed].

> [quoted]: quoted.md
- [listed]: listed.md
`), directSource('docs/container-definitions.md'));
  assert.deepEqual(units[0].references.map(({ label, destination }) => ({ label, destination })), [
    { label: 'quoted', destination: 'quoted.md' },
    { label: 'listed', destination: 'listed.md' },
  ]);
  assert.deepEqual(units.slice(1).map((unit) => [unit.kind, unit.destination, unit.containers]), [
    ['link-definition', 'quoted.md', ['blockquote']],
    ['link-definition', 'listed.md', ['list-item']],
  ]);
});

test('does not resolve definitions or require semantic claims inside invisible raw HTML blocks', () => {
  const units = extractMarkdown(Buffer.from(`<script>
[target]: evil.md
</script>

Use [target].
`), directSource('docs/raw-html-definitions.md'));
  assert.equal(units.length, 1);
  assert.equal(units[0].text, 'Use [target].');
  assert.deepEqual(units[0].references, []);
  assert(!units.some((unit) => unit.kind === 'link-definition'));
});

test('Markdown coverage rejects omitted bytes within an otherwise covered line', () => {
  const buffer = Buffer.from('VISIBLE OMITTED\n');
  assert.throws(
    () => assertMarkdownVisibleCoverage(buffer, [{ byteStart: 0, byteEnd: 1, lineStart: 1, lineEnd: 1 }], 'partial.md'),
    /visible Markdown content was omitted.*ISIBLE OMITTED/u,
  );
});

test('extracts nested callout fences as non-overlapping code blocks', () => {
  const buffer = Buffer.from(`> [!WARNING]
> Run this:
>
> \`\`\`sh
> echo dangerous
> \`\`\`
> Then verify it.
`);
  const units = extractMarkdown(buffer, directSource('docs/callout-code.md'));
  assert.deepEqual(units.map((unit) => unit.kind), ['callout', 'code-block', 'callout']);
  const code = units[1];
  assert.equal(code.language, 'sh');
  assert.equal(code.text, 'echo dangerous');
  assert.equal(code.containerKind, 'callout');
  assert.equal(code.calloutType, 'WARNING');
  assert.equal(units[0].byteEnd, code.byteStart);
  assert.equal(code.byteEnd, units[2].byteStart);
  assert.equal(units.reduce((total, unit) => total + unit.byteEnd - unit.byteStart, 0), buffer.length);
  assert.equal(units[2].text, 'Then verify it.');
});

test('supports CommonMark URI and email autolinks without inventing malformed links', () => {
  const units = extractMarkdown(Buffer.from(
    'Contact <reader@example.com>, fetch <ftp://example.com/file>, and retain [literal](target with spaces).\n'),
  directSource('docs/autolinks.md'));
  assert.equal(units.length, 1);
  assert.equal(units[0].text,
    'Contact reader@example.com, fetch ftp://example.com/file, and retain [literal](target with spaces).');
  assert.deepEqual(units[0].references, [
    { kind: 'autolink', label: 'reader@example.com', destination: 'mailto:reader@example.com', title: null },
    { kind: 'autolink', label: 'ftp://example.com/file', destination: 'ftp://example.com/file', title: null },
  ]);
});

test('preserves visible angle-bracket comparisons while still removing real HTML tags', () => {
  const units = extractMarkdown(Buffer.from('Budget < 5 GiB > and <strong>required</strong>.\n'),
    directSource('docs/angles.md'));
  assert.equal(units[0].text, 'Budget < 5 GiB > and required .');
  assert.deepEqual(units[0].references, []);
});

test('retains nested image and containing link references and folds HTML attribute names', () => {
  const units = extractMarkdown(Buffer.from(
    '[![Diagram](diagram.svg "Image")](guide.md "Guide") and <A HREF="html.md"><IMG SRC="html.svg" ALT="HTML diagram"></A>.\n'),
  directSource('docs/nested-image.md'));
  assert.equal(units[0].text, 'Diagram and HTML diagram.');
  assert.deepEqual(units[0].references, [
    { kind: 'link', label: 'Diagram', destination: 'guide.md', title: 'Guide' },
    { kind: 'image', label: 'Diagram', destination: 'diagram.svg', title: 'Image', containingLink: 'guide.md' },
    { kind: 'html-link', label: 'HTML diagram', destination: 'html.md', title: null },
    { kind: 'html-image', label: 'HTML diagram', destination: 'html.svg', title: null, containingLink: 'html.md' },
  ]);
});

test('recognizes case-insensitive unquoted HTML link and image attributes', () => {
  const units = extractMarkdown(Buffer.from('<A HREF=guide.md><IMG SRC=diagram.svg ALT=Diagram></A>\n'),
    directSource('docs/unquoted-html.md'));
  assert.deepEqual(units[0].references, [
    { kind: 'html-link', label: 'Diagram', destination: 'guide.md', title: null },
    { kind: 'html-image', label: 'Diagram', destination: 'diagram.svg', title: null, containingLink: 'guide.md' },
  ]);
});

test('treats lone CR as a Markdown line ending with byte-accurate line spans', () => {
  const buffer = Buffer.from('# Heading\r\rParagraph.\r');
  const units = extractMarkdown(buffer, directSource('docs/cr.md'));
  assert.deepEqual(units.map(({ kind, lineStart, lineEnd, byteStart, byteEnd }) =>
    ({ kind, lineStart, lineEnd, byteStart, byteEnd })), [
    { kind: 'heading', lineStart: 1, lineEnd: 1, byteStart: 0, byteEnd: 10 },
    { kind: 'paragraph', lineStart: 3, lineEnd: 3, byteStart: 11, byteEnd: 22 },
  ]);
  assert.equal(units[0].text, 'Heading');
  assert.equal(units[1].text, 'Paragraph.');
});

test('Markdown coverage rejects omitted symbol-only visible content', () => {
  const buffer = Buffer.from('⚠️\n');
  assert.throws(() => assertMarkdownVisibleCoverage(buffer, [], 'symbols.md'),
    /visible Markdown content was omitted/u);
});

test('retains list nesting depth across blank lines', () => {
  const units = extractMarkdown(Buffer.from('- parent\n\n  - child\n'), directSource('docs/list-depth.md'));
  const items = units.filter((unit) => unit.kind === 'list-item');
  assert.deepEqual(items.map((unit) => [unit.text, unit.depth, unit.indent]), [
    ['parent', 0, 0],
    ['child', 1, 2],
  ]);
});

test('retains list continuation and child depth across a blank plus indented continuation', () => {
  const units = extractMarkdown(Buffer.from('- parent\n\n  continued paragraph\n\n  - child\n'),
    directSource('docs/list-continuation.md'));
  const items = units.filter((unit) => unit.kind === 'list-item');
  assert.deepEqual(items.map((unit) => [unit.text, unit.depth, unit.indent, unit.exact]), [
    ['parent continued paragraph', 0, 0, '- parent\n\n  continued paragraph\n'],
    ['child', 1, 2, '  - child\n'],
  ]);
});

test('extracts SVG boundaries, styles, markers, symbols, uses, legends, and relationships', () => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <style>.edge { stroke: #123456; marker-end: url(#arrow); } .legend { fill: #eeeeee; }</style>
  <defs><marker id="arrow" orient="auto"><path d="M0,0 L1,1"/></marker><symbol id="box"><rect width="2" height="2"/></symbol></defs>
  <g id="key" class="legend"><text>Legend 😀</text></g>
  <use id="copy" href="#box"/><path id="relation" class="edge" d="M0 0 L2 2"/>
</svg>`);
  const units = extractSvg(svg, directSource('docs/semantic.svg', 'diagram'));
  const kinds = new Set(units.map((unit) => unit.kind));
  for (const kind of ['svg-boundary', 'svg-style', 'svg-marker', 'svg-symbol', 'svg-legend', 'svg-use', 'svg-edge']) {
    assert(kinds.has(kind), `missing ${kind}`);
  }
  const boundary = units.find((unit) => unit.kind === 'svg-boundary');
  assert.equal(boundary.attributes.viewBox, '0 0 200 100');
  const relation = units.find((unit) => unit.attributes.id === 'relation');
  assert(!Object.hasOwn(relation, 'computedStyle'));
  assert.deepEqual(relation.styleSources.matchedSimpleRules, [{
    selector: '.edge', declarations: { 'marker-end': 'url(#arrow)', stroke: '#123456' }, sourceOrder: 0,
  }]);
  assert.deepEqual(relation.markerReferences, [{
    position: 'end', value: 'url(#arrow)', markerId: 'arrow', source: 'stylesheet:.edge@0',
    matchStatus: 'matched', matchReason: 'supported-selector-match',
  }]);
  const markerPath = units.find((unit) => unit.element === 'path' && unit.parentElement === 'marker');
  assert.equal(markerPath.parentId, 'arrow');
  assert.equal(units.find((unit) => unit.kind === 'svg-use').attributes.href, '#box');
  assert.throws(() => assertSvgVisibleCoverage(svg,
    units.filter((unit) => unit.kind !== 'svg-marker'), 'semantic.svg'), /structural SVG content was omitted.*marker/u);
});

test('preserves conflicting and inherited SVG style sources without claiming a false computed style', () => {
  const svg = Buffer.from(`<svg><style>.edge { stroke: red; }</style>
  <g id="parent" style="stroke: green"><path id="inherited" d="M0 0 L1 1"/></g>
  <path id="conflict" class="edge" stroke="blue" style="stroke: purple" d="M0 0 L1 1"/>
</svg>`);
  const units = extractSvg(svg, directSource('docs/styles.svg', 'diagram'));
  const inherited = units.find((unit) => unit.attributes.id === 'inherited');
  const parent = units.find((unit) => unit.attributes.id === 'parent');
  const conflict = units.find((unit) => unit.attributes.id === 'conflict');
  assert(!Object.hasOwn(inherited, 'computedStyle'));
  assert.deepEqual(parent.styleSources.inlineDeclarations, { stroke: 'green' });
  assert.deepEqual(conflict.styleSources.presentationAttributes, { stroke: 'blue' });
  assert.deepEqual(conflict.styleSources.inlineDeclarations, { stroke: 'purple' });
  assert.deepEqual(conflict.styleSources.matchedSimpleRules,
    [{ selector: '.edge', declarations: { stroke: 'red' }, sourceOrder: 0 }]);
});

test('binds complex descendant SVG style rules and their marker candidates', () => {
  const svg = Buffer.from(`<svg><style>g .edge { stroke: red; marker-end: url(#arrow); }</style>
  <defs><marker id="arrow"><path d="M0 0 L1 1"/></marker></defs>
  <g id="flow"><path id="relation" class="edge" d="M0 0 L1 1"/></g>
</svg>`);
  const units = extractSvg(svg, directSource('docs/complex-style.svg', 'diagram'));
  const relation = units.find((unit) => unit.attributes.id === 'relation');
  assert.deepEqual(relation.styleSources.matchedComplexRules, [{
    selector: 'g .edge', declarations: { 'marker-end': 'url(#arrow)', stroke: 'red' }, sourceOrder: 0,
  }]);
  assert.deepEqual(relation.markerReferences, [{
    position: 'end', value: 'url(#arrow)', markerId: 'arrow', source: 'stylesheet:g .edge@0',
    matchStatus: 'matched', matchReason: 'supported-selector-match',
  }]);
});

test('preserves marker candidates for unsupported CSS selectors and normalizes property names', () => {
  const svg = Buffer.from(`<svg><style>
    g > path.edge { MARKER-END: url(#child); }
    path[data-flow] { marker-start: url(#attribute); }
    path.edge:first-child { marker-mid: url(#pseudo); }
    circle { marker-end: url(#circle); }
  </style><defs>
    <marker id="child"/><marker id="attribute"/><marker id="pseudo"/><marker id="circle"/>
  </defs><g><path id="relation" class="edge" data-flow="yes" d="M0 0 L1 1"/></g></svg>`);
  const units = extractSvg(svg, directSource('docs/selector-candidates.svg', 'diagram'));
  const relation = units.find((unit) => unit.attributes.id === 'relation');
  assert.deepEqual(relation.styleSources.markerRuleCandidates.map((candidate) => ({
    selector: candidate.selector,
    property: Object.keys(candidate.declarations).find((name) => name.startsWith('marker-')),
    matchStatus: candidate.matchStatus,
    matchReason: candidate.matchReason,
  })), [
    { selector: 'g > path.edge', property: 'marker-end', matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' },
    { selector: 'path[data-flow]', property: 'marker-start', matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' },
    { selector: 'path.edge:first-child', property: 'marker-mid', matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' },
    { selector: 'circle', property: 'marker-end', matchStatus: 'not-matched', matchReason: 'supported-selector-no-match' },
  ]);
  assert.deepEqual(relation.markerReferences.map(({ position, markerId, matchStatus, matchReason }) =>
    ({ position, markerId, matchStatus, matchReason })), [
    { position: 'start', markerId: 'attribute', matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' },
    { position: 'mid', markerId: 'pseudo', matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' },
    { position: 'end', markerId: 'child', matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' },
  ]);
});

test('expands SVG marker shorthand and keeps functional-selector candidates intact', () => {
  const svg = Buffer.from(`<svg><style>
    path:is(.edge,.flow), circle { marker-end: url(#selected); }
  </style><defs><marker id="short"/><marker id="selected"/></defs>
  <path id="inline" style="marker: url('#short')" d="M0 0 L1 1"/>
  <path id="selected-path" class="edge" d="M0 0 L1 1"/>
</svg>`);
  const units = extractSvg(svg, directSource('docs/marker-shorthand.svg', 'diagram'));
  const inline = units.find((unit) => unit.attributes.id === 'inline');
  assert.deepEqual(inline.markerReferences.filter((reference) => reference.source === 'inline-style:marker')
    .map(({ position, markerId, source }) => ({ position, markerId, source })), [
    { position: 'start', markerId: 'short', source: 'inline-style:marker' },
    { position: 'mid', markerId: 'short', source: 'inline-style:marker' },
    { position: 'end', markerId: 'short', source: 'inline-style:marker' },
  ]);
  const selected = units.find((unit) => unit.attributes.id === 'selected-path');
  assert.deepEqual(selected.styleSources.markerRuleCandidates.map((candidate) => candidate.selector), [
    'path:is(.edge,.flow)', 'circle',
  ]);
  assert(selected.markerReferences.some((reference) => reference.markerId === 'selected'
    && reference.matchStatus === 'unresolved'));
});

test('SVG coverage uses UTF-8 byte offsets and rejects later omitted text', () => {
  const buffer = Buffer.from(`<svg><text>${'😀'.repeat(10)}</text><text>OMITTED</text></svg>`);
  const units = extractSvg(buffer, directSource('docs/unicode.svg', 'diagram'));
  const omitted = units.find((unit) => unit.kind === 'svg-text' && unit.text === 'OMITTED');
  assert(omitted);
  assert.throws(() => assertSvgVisibleCoverage(buffer, units.filter((unit) => unit !== omitted), 'unicode.svg'),
    /visible SVG text was omitted.*OMITTED/u);
  for (const unit of units) assert.equal(buffer.subarray(unit.byteStart, unit.byteEnd).toString('utf8'), unit.exact);
});

test('classification schema and derived legacy paths are fail-closed', () => {
  for (const [mutate, pattern] of [
    [(record) => { record.expectedPath = 'docs/_legacy-source/wrong.md'; }, /path differs from expectedPath/u],
    [(record) => { record.path = 'wrong/outside.md'; record.expectedPath = record.path; }, /does not preserve the original relative path/u],
    [(record, classification) => { classification.files.push({ ...record }); }, /duplicate path/u],
    [(record) => { record.extra = true; }, /unexpected object keys/u],
  ]) {
    const root = fixture({ 'docs/guide.md': '# Guide\n' });
    const pathname = path.join(root, 'docs/config/documentation-tree-classification.json');
    const classification = JSON.parse(fs.readFileSync(pathname, 'utf8'));
    mutate(classification.files[0], classification);
    fs.writeFileSync(pathname, `${JSON.stringify(classification)}\n`);
    assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
      (error) => pattern.test(`${error.stderr ?? ''}${error.stdout ?? ''}`));
  }
  const root = fixture({ 'docs/guide.md': '# Guide\n' });
  const pathname = path.join(root, 'docs/config/documentation-tree-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  baseline.files[0].mode = '100755';
  fs.writeFileSync(pathname, `${JSON.stringify(baseline)}\n`);
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('files must exactly enumerate'));
});

test('immutable docs tree rejects a coordinated baseline, classification, and batch shrink', () => {
  const root = fixture({ 'docs/first.md': '# First\n', 'docs/second.md': '# Second\n' });
  const baselinePath = path.join(root, 'docs/config/documentation-tree-baseline.json');
  const classificationPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const inventoryPath = path.join(root, 'docs/generated/inventory/documentation-parity-batches.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  baseline.files = baseline.files.filter((record) => record.originalPath !== 'docs/second.md');
  classification.files = classification.files.filter((record) => record.originalPath !== 'docs/second.md');
  inventory.assignments = inventory.assignments.filter((record) => record.originalPath !== 'docs/second.md');
  inventory.sourceCount = 1;
  inventory.counts['test-batch'] = 1;
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  fs.writeFileSync(classificationPath, `${JSON.stringify(classification, null, 2)}\n`);
  fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('files must exactly enumerate'));
});

test('baseline kind is derived strictly from the original path extension', () => {
  const root = fixture({ 'docs/diagram.svg': '<svg/>\n' });
  const pathname = path.join(root, 'docs/config/documentation-tree-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  baseline.files[0].kind = 'markdown';
  fs.writeFileSync(pathname, `${JSON.stringify(baseline, null, 2)}\n`);
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('kind must be derived from its file extension'));
});

test('classification cannot shrink or reclassify the batch-authoritative extraction source set', () => {
  const root = fixture({ 'docs/guide.md': '# Guide\n' });
  const pathname = path.join(root, 'docs/config/documentation-tree-classification.json');
  const classification = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  classification.files[0].class = 'internal-documentation-input';
  fs.writeFileSync(pathname, `${JSON.stringify(classification, null, 2)}\n`);
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('legacy extraction source set differs'));
});

test('committed transition authority rejects coordinated current classification and batch shrink', () => {
  const root = fixture({ 'docs/guide.md': '# Guide\n' });
  const classificationPath = path.join(root, 'docs/config/documentation-tree-classification.json');
  const inventoryPath = path.join(root, 'docs/generated/inventory/documentation-parity-batches.json');
  const classification = JSON.parse(fs.readFileSync(classificationPath, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  classification.files[0].class = 'internal-documentation-input';
  inventory.assignments = [];
  inventory.sourceCount = 0;
  inventory.counts['test-batch'] = 0;
  fs.writeFileSync(classificationPath, `${JSON.stringify(classification, null, 2)}\n`);
  fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('differs from the committed transition authority'));
});

test('source-set authority must resolve directly to an ancestor commit', () => {
  for (const authorityKind of ['tree', 'tag', 'unrelated-commit']) {
    const root = fixture({ 'docs/guide.md': '# Guide\n' });
    const pathname = path.join(root, 'docs/config/documentation-parity-batches.json');
    const config = JSON.parse(fs.readFileSync(pathname, 'utf8'));
    if (authorityKind === 'tree') {
      config.sourceSetAuthorityRevision = run(root, 'git', ['rev-parse', 'HEAD^{tree}'], true).trim();
    } else if (authorityKind === 'tag') {
      run(root, 'git', ['tag', '-a', 'source-set-tag', '-m', 'source set tag']);
      config.sourceSetAuthorityRevision = run(root, 'git', ['rev-parse', 'source-set-tag^{tag}'], true).trim();
    } else {
      const tree = run(root, 'git', ['rev-parse', 'HEAD^{tree}'], true).trim();
      config.sourceSetAuthorityRevision = run(root, 'git', ['commit-tree', tree, '-m', 'unrelated authority'], true).trim();
    }
    fs.writeFileSync(pathname, `${JSON.stringify(config, null, 2)}\n`);
    const expected = authorityKind === 'unrelated-commit'
      ? 'sourceSetAuthorityRevision must be an ancestor of HEAD'
      : 'sourceSetAuthorityRevision must resolve directly to a commit';
    assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
      (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes(expected));
  }
});

test('source-set authority pointer is fixed by its one-time introduction commit', () => {
  const root = fixture({ 'docs/guide.md': '# Guide\n' });
  run(root, 'git', ['add', '-A']);
  run(root, 'git', ['commit', '-qm', 'introduce transition authority']);
  write(root, 'later.txt', 'later history\n');
  run(root, 'git', ['add', 'later.txt']);
  run(root, 'git', ['commit', '-qm', 'later history']);
  const pathname = path.join(root, 'docs/config/documentation-parity-batches.json');
  const config = JSON.parse(fs.readFileSync(pathname, 'utf8'));
  config.sourceSetAuthorityRevision = run(root, 'git', ['rev-parse', 'HEAD'], true).trim();
  fs.writeFileSync(pathname, `${JSON.stringify(config, null, 2)}\n`);
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes(
      'sourceSetAuthorityRevision differs from the immutable authority introduction parent'));
});

test('baselineRevision must identify a commit object directly', () => {
  for (const revisionKind of ['tree', 'tag']) {
    const root = fixture({ 'docs/guide.md': '# Guide\n' });
    let revision;
    if (revisionKind === 'tree') revision = run(root, 'git', ['rev-parse', 'HEAD^{tree}'], true).trim();
    else {
      run(root, 'git', ['tag', '-a', 'baseline-tag', '-m', 'annotated baseline']);
      revision = run(root, 'git', ['rev-parse', 'baseline-tag^{tag}'], true).trim();
    }
    for (const relative of ['docs/config/documentation-tree-baseline.json',
      'docs/config/documentation-tree-classification.json']) {
      const pathname = path.join(root, relative);
      const value = JSON.parse(fs.readFileSync(pathname, 'utf8'));
      value.baselineRevision = revision;
      fs.writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`);
    }
    assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs'], true),
      (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('baselineRevision must resolve directly to a commit'));
  }
});

test('extraction digest binds semantic metadata, not only exact source spans', () => {
  const source = directSource('docs/digest.md');
  const units = extractMarkdown(Buffer.from('[label](target.md)\n'), source);
  const sourceBinding = { originalPath: source.originalPath, legacyPath: source.path,
    baselineRevision: source.baselineRevision, gitObject: source.gitObject };
  const before = extractionBindingDigest(sourceBinding, units);
  const changed = structuredClone(units);
  changed[0].references[0].destination = 'different.md';
  changed[0].text = 'different visible text';
  changed[0].textSha256 = '0'.repeat(64);
  assert.notEqual(extractionBindingDigest(sourceBinding, changed), before);
});

test('does not resolve reference definitions written inside code fences', () => {
  const units = extractMarkdown(Buffer.from('````text\n[shortcut]: wrong.md\n````\n\n[shortcut]\n'),
    directSource('docs/fenced-definition.md'));
  const paragraph = units.find((unit) => unit.kind === 'paragraph');
  assert.equal(paragraph.text, '[shortcut]');
  assert.deepEqual(paragraph.references, []);
});

test('CLI rejects changed or missing current legacy source bytes', () => {
  const root = fixture({ 'docs/guide.md': richMarkdown });
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  const beforeOutput = fs.readFileSync(path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl'), 'utf8');
  fs.appendFileSync(path.join(root, 'docs/_legacy-source/guide.md'), '\nWORKTREE MUTATION MUST NOT BE READ\n');
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('current legacy source bytes differ'));
  assert.equal(fs.readFileSync(path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl'), 'utf8'), beforeOutput);
  assert(!beforeOutput.includes('WORKTREE MUTATION'));

  const missingRoot = fixture({ 'docs/missing.md': '# Missing\n' });
  fs.unlinkSync(path.join(missingRoot, 'docs/_legacy-source/missing.md'));
  assert.throws(() => run(missingRoot, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('path is missing'));
});

test('Git replacement refs cannot substitute recorded baseline blob bytes', () => {
  const root = fixture({ 'docs/guide.md': '# Original\n' });
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/config/documentation-tree-baseline.json'), 'utf8'));
  const replacement = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: root, encoding: 'utf8', input: '# REPLACED\n', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  run(root, 'git', ['replace', baseline.files[0].gitObject, replacement]);
  run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check']);
  const units = readUnits(root);
  assert.equal(units[0].exact, '# Original\n');
  assert.equal(units[0].baselineGitObject, baseline.files[0].gitObject);
  const summary = JSON.parse(fs.readFileSync(path.join(root,
    'docs/generated/inventory/documentation-parity-summary.json'), 'utf8'));
  assert.equal(summary.batchAuthority, 'docs/generated/inventory/documentation-parity-batches.json');
  assert.match(summary.sourceSetSha256, /^[0-9a-f]{64}$/u);
});

test('supports immutable extraction in a SHA-256 Git repository', { skip: !supportsGitObjectFormat('sha256') }, () => {
  const root = fixture({ 'docs/guide.md': '# SHA-256 Guide\n\nRetained content.\n' }, { objectFormat: 'sha256' });
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check']);

  const baseline = JSON.parse(fs.readFileSync(path.join(root,
    'docs/config/documentation-tree-baseline.json'), 'utf8'));
  assert.match(baseline.baselineRevision, /^[0-9a-f]{64}$/u);
  assert.match(baseline.files[0].gitObject, /^[0-9a-f]{64}$/u);
  const units = readUnits(root);
  assert(units.length > 0);
  assert(units.every((unit) => /^[0-9a-f]{64}$/u.test(unit.baselineRevision)
    && /^[0-9a-f]{64}$/u.test(unit.baselineGitObject)));
});

test('--check rejects stale unit output', () => {
  const root = fixture({ 'docs/guide.md': '# Guide\n\nRetained content.\n' });
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  fs.appendFileSync(path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl'), '{}\n');
  assert.throws(
    () => run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('documentation-parity-units.jsonl is stale'),
  );
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  const summaryPath = path.join(root, 'docs/generated/inventory/documentation-parity-summary.json');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  summary.unitCount += 1;
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  assert.throws(
    () => run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('documentation-parity-summary.json is stale'),
  );
});

test('write and rename failures preserve the existing units/summary pair exactly', () => {
  for (const [method, failAt] of [['writeFileSync', 2],
    ['renameSync', 1], ['renameSync', 2], ['renameSync', 3], ['renameSync', 4]]) {
    const root = fixture({ 'docs/guide.md': '# Guide\n\nRetained content.\n' });
    run(root, 'node', ['scripts/docs-parity-extract.mjs']);
    const before = outputState(root);
    assert.throws(() => runCli({ root, fileSystem: failFileSystem(method, failAt) }),
      new RegExp(`injected ${method} failure`, 'u'));
    assertOutputState(before);
    run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check']);
  }
});

test('failed pair rollback preserves recoverable backups instead of deleting the last valid copies', () => {
  const root = fixture({ 'docs/guide.md': '# Guide\n\nRetained content.\n' });
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  const before = outputState(root);
  assert.throws(() => runCli({ root, fileSystem: failFileSystem('renameSync', [4, 5, 6]) }),
    /output rollback failed; preserved backups:/u);

  const directory = path.dirname(before[0].pathname);
  const backups = fs.readdirSync(directory).filter((name) => /\.bak-/u.test(name));
  assert.equal(backups.length, 2);
  for (const record of before) {
    const prefix = `.${path.basename(record.pathname)}.bak-`;
    const backup = backups.find((name) => name.startsWith(prefix));
    assert(backup, `missing preserved backup for ${record.pathname}`);
    assert.deepEqual(fs.readFileSync(path.join(directory, backup)), record.bytes);
    fs.renameSync(path.join(directory, backup), record.pathname);
  }
  run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check']);
});

test('--check is read-only, rejects symlinks, and unknown arguments fail closed', () => {
  const root = fixture({ 'docs/guide.md': '# Guide\n\nRetained content.\n' });
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  const unitsPath = path.join(root, 'docs/generated/inventory/documentation-parity-units.jsonl');
  const summaryPath = path.join(root, 'docs/generated/inventory/documentation-parity-summary.json');
  const before = [unitsPath, summaryPath].map((pathname) => ({
    pathname, bytes: fs.readFileSync(pathname), mtimeNs: fs.statSync(pathname, { bigint: true }).mtimeNs,
  }));
  run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check']);
  for (const record of before) {
    assert.deepEqual(fs.readFileSync(record.pathname), record.bytes);
    assert.equal(fs.statSync(record.pathname, { bigint: true }).mtimeNs, record.mtimeNs);
  }
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs', '--unknown'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('unsupported arguments'));
  const target = path.join(root, 'units-copy.jsonl');
  fs.copyFileSync(unitsPath, target);
  fs.unlinkSync(unitsPath);
  fs.symlinkSync(path.relative(path.dirname(unitsPath), target), unitsPath);
  assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs', '--check'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('symbolic-link path component is forbidden'));
});

test('check and write modes reject symlinked output ancestors and authority inputs', () => {
  const root = fixture({ 'docs/guide.md': '# Guide\n' });
  run(root, 'node', ['scripts/docs-parity-extract.mjs']);
  const inventory = path.join(root, 'docs/generated/inventory');
  const outside = path.join(root, 'outside-inventory');
  fs.renameSync(inventory, outside);
  fs.symlinkSync(path.relative(path.dirname(inventory), outside), inventory, 'dir');
  for (const args of [['--check'], []]) {
    assert.throws(() => run(root, 'node', ['scripts/docs-parity-extract.mjs', ...args], true),
      (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('symbolic-link path component is forbidden'));
  }

  const authorityRoot = fixture({ 'docs/guide.md': '# Guide\n' });
  const classification = path.join(authorityRoot, 'docs/config/documentation-tree-classification.json');
  const outsideClassification = path.join(authorityRoot, 'classification.json');
  fs.renameSync(classification, outsideClassification);
  fs.symlinkSync(path.relative(path.dirname(classification), outsideClassification), classification);
  assert.throws(() => run(authorityRoot, 'node', ['scripts/docs-parity-extract.mjs'], true),
    (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('symbolic-link path component is forbidden'));

  const danglingRoot = fixture({ 'docs/guide.md': '# Guide\n' });
  run(danglingRoot, 'node', ['scripts/docs-parity-extract.mjs']);
  const units = path.join(danglingRoot, 'docs/generated/inventory/documentation-parity-units.jsonl');
  fs.unlinkSync(units);
  fs.symlinkSync('missing-units.jsonl', units);
  for (const args of [['--check'], []]) {
    assert.throws(() => run(danglingRoot, 'node', ['scripts/docs-parity-extract.mjs', ...args], true),
      (error) => `${error.stderr ?? ''}${error.stdout ?? ''}`.includes('symbolic-link path component is forbidden'));
  }
});
