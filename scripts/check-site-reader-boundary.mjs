#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(root, 'docs');
const siteRoot = path.join(docsRoot, 'site');
const errors = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() ? [target] : [];
  });
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function report(file, text, index, message) {
  errors.push(`${path.relative(root, file)}:${lineAt(text, index)}: ${message}`);
}

const forbiddenText = [
  [/\bAP0[1-9](?:\.[0-9]+)?\b/giu, 'work-package label'],
  [/\b(?:documentation|source) migration\b/giu, 'documentation migration language'],
  [/\b(?:documentation|source|original) review\b/giu, 'documentation review language'],
  [/\bsource assessment\b/giu, 'internal assessment language'],
  [/\b(?:command|review|migration) ledger\b/giu, 'temporary ledger language'],
  [/\bworking draft\b/giu, 'draft-status language'],
  [/\bcompletion report\b/giu, 'temporary completion-report language'],
  [/\b(?:source|decision) extraction\b/giu, 'source-extraction language'],
  [/\binventory slice\b/giu, 'incremental inventory language'],
  [/docs\/(?:review|blueprint)\//giu, 'reference to a non-reader documentation area'],
];

for (const file of walk(siteRoot).filter((target) => target.endsWith('.md'))) {
  const text = fs.readFileSync(file, 'utf8');

  for (const [pattern, description] of forbiddenText) {
    for (const match of text.matchAll(pattern)) {
      report(file, text, match.index, description);
    }
  }

  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const raw = match[1].trim();
    const targetPart = raw.split('#', 1)[0].split('?', 1)[0];
    if (!targetPart || /^(?:https?:|mailto:)/u.test(targetPart)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(targetPart));
    const inDocs = resolved === docsRoot || resolved.startsWith(`${docsRoot}${path.sep}`);
    const inSite = resolved === siteRoot || resolved.startsWith(`${siteRoot}${path.sep}`);
    if (inDocs && !inSite) {
      report(file, text, match.index, `link leaves docs/site: ${raw}`);
    }
  }

  for (const match of text.matchAll(/https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[^/]+\/docs\/(?!site\/)/gu)) {
    report(file, text, match.index, 'pinned link targets documentation outside docs/site');
  }
}

if (errors.length) {
  console.error('Reader-site boundary check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Reader-site boundary check passed.');
