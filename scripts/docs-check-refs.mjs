#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
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
  'docs/ROADMAP.md',
  'docs/future-implementation-ideas.md',
  'docs/open-issues.md',
]);

const errors = [];
const scanCounts = { markdownLinks: 0, repoRefs: 0 };

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
    return !rel(filePath).startsWith('docs/archive/');
  });
}

function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, '\n');
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '\n');
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
  ref = ref.replace(/:\d+(:\d+)?$/, '');
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
  const linkRe = /!?\[[^\]]*]\(([^)]+)\)/g;
  let match;
  while ((match = linkRe.exec(text))) {
    const target = normalizeReference(match[1]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(filePath), decodeURI(target));
    if (rel(resolved).startsWith('docs/archive/')) continue;
    scanCounts.markdownLinks += 1;
    if (!fs.existsSync(resolved)) {
      errors.push(`${rel(filePath)} links to missing local path: ${match[1]}`);
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
  if (historicalRepoRefDocs.has(rel(filePath))) return;
  for (const raw of candidateRefs(text)) {
    const ref = normalizeReference(raw);
    if (!ref || !isRepoReference(ref) || shouldSkipRepoReference(ref)) continue;
    scanCounts.repoRefs += 1;
    if (!existsRepoReference(ref)) {
      errors.push(`${rel(filePath)} cites missing repository path: ${ref}`);
    }
  }
}

for (const filePath of docsToScan()) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const text = stripHtmlComments(stripFencedCode(raw));
  checkMarkdownLinks(filePath, text);
  checkRepoRefs(filePath, text);
}

if (errors.length) {
  console.error('docs reference check failed:');
  for (const error of errors) console.error(`- ${error}`);
  console.error('');
  console.error('Intentional exclusions: docs/archive/**, fenced code blocks, external URLs, globs, placeholders, and generated example data are not treated as source-path claims.');
  process.exit(1);
}

console.log(`docs reference check passed (${scanCounts.markdownLinks} local links, ${scanCounts.repoRefs} repository path refs)`);
