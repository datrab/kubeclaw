#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const topicMapPath = 'docs/site/product-surfaces.md';

const vagueTopicLanguage = /\bremaining weakness\b|\bunresolved weakness\b|\bvague weakness\b/i;

const errors = [];

function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function normalizeRef(raw) {
  let ref = raw.trim().replace(/^[`'"]+|[`'",.;)]+$/g, '');
  ref = ref.replace(/^git-repo\//, '');
  ref = ref.replace(/^\.\/+/, '');
  ref = ref.replace(/:\d+(:\d+)?$/, '');
  ref = ref.split('#')[0];
  return ref;
}

function checkTopicMap() {
  const text = fs.readFileSync(path.join(root, topicMapPath), 'utf8');
  if (vagueTopicLanguage.test(text)) {
    errors.push(`${topicMapPath} contains vague unresolved weakness language`);
  }

  const pathRe = /`?(docs\/[A-Za-z0-9._/@*{}<>=-]+)`?/g;
  let match;
  while ((match = pathRe.exec(text))) {
    const ref = normalizeRef(match[1]);
    if (!ref || ref.includes('*') || ref.includes('<') || ref.includes('>') || ref.endsWith('/')) continue;
    if (ref.startsWith('docs/archive/')) continue;
    if (!fs.existsSync(path.join(root, ref))) {
      errors.push(`${topicMapPath} cites missing docs path: ${ref}`);
    }
  }
}

checkTopicMap();

if (errors.length) {
  console.error('docs coverage check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`docs coverage check passed (${rel(path.join(root, topicMapPath))} topic-map references are current)`);
