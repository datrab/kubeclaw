#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(root, 'docs');

const repoPathPrefixes = [
  '.github/',
  'charts/',
  'deploy/',
  'docker/',
  'docs/',
  'my-values/',
  'plugins/',
  'scripts/',
  'skills/',
  'tests/',
];

const repoPathFiles = new Set([
  'CONTRIBUTING.md',
  'README.md',
  'package.json',
]);

const optionalRefs = new Set([
  'package-lock.json',
]);

const historicalRepoRefDocs = new Set([
  'docs/DOCUMENTATION_AUDIT.md',
  'docs/DOCUMENTATION_PLAN.md',
  'docs/DOCUMENTATION_REBUILD_PLAN.md',
  'docs/DOCUMENTATION_TARGET_PAGE_LIST.md',
  'docs/_legacy-source/ROADMAP.md',
  'docs/future-implementation-ideas.md',
  'docs/open-issues.md',
  'docs/architecture/pipeline-test-gate-unit-baseline.md',
]);

const plannedRepoRefs = new Map([
  ['docs/blueprint/AP09-acceptance-contract.md', new Set(['docs/_legacy-source/'])],
  ['docs/blueprint/AP09-execution-plan.md', new Set(['docs/_legacy-source/'])],
]);

const errors = [];
const scanCounts = { markdownLinks: 0, markdownAnchors: 0, repoRefs: 0, pinnedSourceLinks: 0 };
const anchorCache = new Map();
const pinnedObjectCache = new Map();

function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function walk(dir, predicate = () => true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(filePath, predicate));
    else if (entry.isFile() && predicate(filePath)) out.push(filePath);
  }
  return out;
}

function docsToScan() {
  return walk(docsRoot, (filePath) => filePath.endsWith('.md')).filter((filePath) => {
    return !rel(filePath).startsWith('docs/archive/')
      && !rel(filePath).startsWith('docs/_legacy-source/');
  });
}

function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, '\n');
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '\n');
}

function markdownDestination(raw) {
  const value = raw.trim();
  if (value.startsWith('<')) {
    const end = value.indexOf('>');
    return end < 0 ? value : value.slice(1, end);
  }
  return value.split(/\s+["']/u, 1)[0];
}

function githubHeadingText(raw) {
  return raw
    .replace(/\s+#+\s*$/u, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/<[^>]+>/gu, '')
    .replace(/[`*_~]/gu, '')
    .trim();
}

function githubSlug(value) {
  return value.toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]/gu, '')
    .replace(/\s/gu, '-');
}

function markdownAnchors(filePath) {
  if (anchorCache.has(filePath)) return anchorCache.get(filePath);
  const source = stripFencedCode(stripHtmlComments(fs.readFileSync(filePath, 'utf8')));
  const anchors = new Set();
  const counts = new Map();
  for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+)$/gmu)) {
    const base = githubSlug(githubHeadingText(match[1]));
    if (!base) continue;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  for (const match of source.matchAll(/<(?:a|[A-Za-z][A-Za-z0-9:-]*)\b[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gu)) {
    anchors.add(match[1]);
  }
  anchorCache.set(filePath, anchors);
  return anchors;
}

function normalizeReference(raw) {
  let ref = raw.trim();
  if (!ref) return null;
  if (ref.startsWith('<') && ref.endsWith('>')) ref = ref.slice(1, -1);
  if (/^(https?:|mailto:|tel:|#)/.test(ref)) return null;
  ref = ref.split('#')[0];
  ref = ref.replace(/^[`'"]+|[`'",.;)]+$/g, '');
  ref = ref.split(/\s+/)[0];
  ref = ref.replace(/^git-repo\//, '');
  ref = ref.replace(/^\.\//, '');
  ref = ref.replace(/:\d+(?:-\d+)?(?::\d+)?$/, '');
  return ref || null;
}

function isRepoReference(ref) {
  if (ref.startsWith('docs/archive/')) return false;
  if (repoPathFiles.has(ref)) return true;
  return repoPathPrefixes.some((prefix) => ref.startsWith(prefix));
}

function shouldSkipRepoReference(ref) {
  const extension = path.extname(ref);
  return (
    optionalRefs.has(ref) ||
    ref.includes('*') ||
    ref.includes('<') ||
    ref.includes('>') ||
    ref.includes('${') ||
    ref.includes('...') ||
    ref.endsWith('.test') ||
    (!extension && !ref.endsWith('/')) ||
    ref.endsWith('/**') ||
    ref.endsWith('/*')
  );
}

function existsRepoReference(ref) {
  if (ref.endsWith('/')) return fs.existsSync(path.join(root, ref));
  return fs.existsSync(path.join(root, ref));
}

function checkMarkdownLinks(filePath, text) {
  text = text.replace(/`[^`\n]*`/gu, '');
  const linkRe = /!?(?<!\\)\[(?:\\.|[^\]\\])*(?<!\\)]\(([^)]+)\)/g;
  for (const match of text.matchAll(linkRe)) {
    const destination = markdownDestination(match[1]);
    if (/^(https?:|mailto:|tel:)/u.test(destination)) continue;
    const [rawPath, rawFragment] = destination.split('#', 2);
    const target = normalizeReference(rawPath || rel(filePath));
    if (!target) continue;
    const resolved = rawPath
      ? path.resolve(path.dirname(filePath), decodeURI(target))
      : filePath;
    if (rel(resolved).startsWith('docs/archive/')) continue;
    scanCounts.markdownLinks += 1;
    if (!fs.existsSync(resolved)) {
      errors.push(`${rel(filePath)} links to missing local path: ${match[1]}`);
      continue;
    }
    if (rawFragment && resolved.endsWith('.md') && rel(filePath).startsWith('docs/site/')) {
      let fragment;
      try { fragment = decodeURIComponent(rawFragment); } catch { fragment = rawFragment; }
      scanCounts.markdownAnchors += 1;
      if (!markdownAnchors(resolved).has(fragment)) {
        errors.push(`${rel(filePath)} links to missing Markdown anchor: ${match[1]}`);
      }
    }
  }
}

function candidateRefs(text) {
  const refs = new Set();
  const inlineCodeRe = /`([^`\n]+)`/g;
  let match;
  while ((match = inlineCodeRe.exec(text))) refs.add(match[1]);

  const plainPathRe = /(^|[\s([{])((?:\.github|charts|deploy|docker|docs|my-values|plugins|scripts|skills|tests)\/[A-Za-z0-9._/@:+#*{}<>=-]+|(?:CONTRIBUTING|README|package-lock|package)\.json|(?:CONTRIBUTING|README)\.md)(?=$|[\s.,;)\]}])/gm;
  while ((match = plainPathRe.exec(text))) refs.add(match[2]);

  return refs;
}

function checkRepoRefs(filePath, text) {
  // Review reports describe dated source snapshots, not the current checkout.
  // Their explicit Markdown links are still checked by checkMarkdownLinks.
  if (historicalRepoRefDocs.has(rel(filePath)) || rel(filePath).startsWith('docs/review/')) return;
  for (const raw of candidateRefs(text)) {
    const ref = normalizeReference(raw);
    if (!ref || !isRepoReference(ref) || shouldSkipRepoReference(ref)) continue;
    if (plannedRepoRefs.get(rel(filePath))?.has(ref)) continue;
    scanCounts.repoRefs += 1;
    if (!existsRepoReference(ref)) {
      errors.push(`${rel(filePath)} cites missing repository path: ${ref}`);
    }
  }
}

const linkParserProbe = '[valid](target.md) and \\[a-z\\](?:not-a-link)';
const linkParserMatches = [...linkParserProbe.matchAll(
  /!?(?<!\\)\[(?:\\.|[^\]\\])*(?<!\\)]\(([^)]+)\)/g,
)].map((match) => match[1]);
if (JSON.stringify(linkParserMatches) !== JSON.stringify(['target.md'])) {
  throw new Error('reference link parser must retain valid links and ignore escaped schema regex syntax');
}

for (const [reference, expected] of [
  ['scripts/docs-check-refs.mjs:71', 'scripts/docs-check-refs.mjs'],
  ['scripts/docs-check-refs.mjs:71-77', 'scripts/docs-check-refs.mjs'],
  ['scripts/docs-check-refs.mjs:71:12', 'scripts/docs-check-refs.mjs'],
]) {
  if (normalizeReference(reference) !== expected) {
    throw new Error(`reference line suffix parser failed for ${reference}`);
  }
}

function checkSourceCalloutRevisions(filePath, text) {
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('> **Source evidence')) continue;
    const startLine = index + 1;
    const block = [];
    while (index < lines.length && (lines[index].startsWith('>') || !lines[index].trim())) {
      block.push(lines[index]);
      index += 1;
    }
    index -= 1;
    const value = block.join('\n');
    const declared = value.match(/\*\*Revision:\*\* `([0-9a-f]{40})`/u)?.[1];
    if (!declared) continue;
    const linked = [...value.matchAll(
      /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\//gu,
    )].map((match) => match[1]);
    const other = [...new Set(linked.filter((revision) => revision !== declared))];
    if (other.length) {
      errors.push(`${rel(filePath)}:${startLine} source callout declares ${declared} but links ${other.join(', ')}`);
    }
  }
}

function physicalLineCount(source) {
  if (!source) return 0;
  const lines = source.split('\n').length;
  return source.endsWith('\n') ? lines - 1 : lines;
}

function pinnedObject(revision, sourcePath) {
  const key = `${revision}:${sourcePath}`;
  if (pinnedObjectCache.has(key)) return pinnedObjectCache.get(key);
  try {
    const source = execFileSync('git', ['show', key], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = { exists: true, lines: physicalLineCount(source) };
    pinnedObjectCache.set(key, result);
    return result;
  } catch {
    const result = { exists: false, lines: 0 };
    pinnedObjectCache.set(key, result);
    return result;
  }
}

function pinnedLinkErrors(text) {
  const findings = [];
  const linkPattern = /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^#)\s>"']+)(?:#L(\d+)(?:-L(\d+))?)?/gu;
  for (const match of text.matchAll(linkPattern)) {
    scanCounts.pinnedSourceLinks += 1;
    const [, revision, encodedPath, rawStart, rawEnd] = match;
    let sourcePath;
    try { sourcePath = decodeURIComponent(encodedPath); } catch { sourcePath = encodedPath; }
    const object = pinnedObject(revision, sourcePath);
    if (!object.exists) {
      findings.push(`pinned source object does not exist: ${revision}:${sourcePath}`);
      continue;
    }
    if (!rawStart) continue;
    const start = Number(rawStart);
    const end = Number(rawEnd ?? rawStart);
    if (start < 1 || end < start || end > object.lines) {
      findings.push(`pinned source range L${start}-L${end} is outside ${revision}:${sourcePath} (1-${object.lines})`);
    }
  }
  return findings;
}

const fixtureRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const fixtureLineCount = pinnedObject(fixtureRevision, 'package.json').lines;
const missingFixture = pinnedLinkErrors(`https://github.com/datrab/kubeclaw/blob/${fixtureRevision}/__missing-reference-fixture__.md#L1-L1`);
if (!missingFixture.some((finding) => finding.includes('does not exist'))) {
  throw new Error('pinned-reference fixture did not detect a missing object');
}
const rangeFixture = pinnedLinkErrors(`https://github.com/datrab/kubeclaw/blob/${fixtureRevision}/package.json#L${fixtureLineCount + 1}-L${fixtureLineCount + 1}`);
if (!rangeFixture.some((finding) => finding.includes('is outside'))) {
  throw new Error('pinned-reference fixture did not detect an out-of-bounds line range');
}
scanCounts.pinnedSourceLinks = 0;

for (const filePath of docsToScan()) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const text = stripHtmlComments(stripFencedCode(raw));
  checkMarkdownLinks(filePath, text);
  checkRepoRefs(filePath, text);
  if (rel(filePath).startsWith('docs/site/')) {
    checkSourceCalloutRevisions(filePath, raw);
    for (const finding of pinnedLinkErrors(raw)) errors.push(`${rel(filePath)} ${finding}`);
  }
}

if (errors.length) {
  console.error('docs reference check failed:');
  for (const error of errors) console.error(`- ${error}`);
  console.error('');
  console.error('Intentional exclusions: docs/archive/**, docs/_legacy-source/**, fenced code blocks, external URLs, globs, placeholders, and generated example data are not treated as source-path claims.');
  process.exit(1);
}

console.log(`docs reference check passed (${scanCounts.markdownLinks} local links, ${scanCounts.markdownAnchors} local anchors, ${scanCounts.repoRefs} repository path refs, ${scanCounts.pinnedSourceLinks} pinned source links)`);
