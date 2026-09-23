#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(root, 'docs');
const siteRoot = path.join(docsRoot, 'site');
const statusSource = path.join(docsRoot, 'status', 'open-issues.json');
const errors = [];
const textualExtensions = new Set(['.md', '.json', '.js', '.mjs', '.txt', '.yaml', '.yml']);

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

function proseOutsideFences(text) {
  const output = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const marker = /^\s*(?:>\s*)*(?:(?:[-+*]|\d+[.)])\s+)?(`{3,}|~{3,})/u.exec(line)?.[1] ?? null;
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence && marker.length >= 3) fence = null;
      output.push('');
      continue;
    }
    output.push(fence ? '' : line);
  }
  return output.join('\n');
}

const forbiddenText = [
  [/\bAP[\s._-]*\d{1,2}(?:[\s._-]*\d+)?\b/giu, 'work-package label'],
  [/\bG(?:0[1-9]|1[0-5])\b/gu, 'internal acceptance-gate identifier'],
  [/\b(?:PCR|PATH|IFR)-[A-Z0-9-]+\b/gu, 'internal review identifier'],
  [/\b(?:GITOPS-REVISION|PRISM-PREFERENCE|PRISM-DEPLOY-CHECK|PLUGIN-BOUNDARY|EFFECT-RECONCILIATION|RUNTIME-VERIFICATION|PRISM-TOOL-LIMITS)-\d+\b|\bGITHUB-\d+\b/gu, 'internal issue-register identifier'],
  [/\b(?:F-T\d{2}-\d+|T\d{2}-F\d+)\b/gu, 'internal traceability identifier'],
  [/\bC0\d{2}\b/gu, 'internal command-ledger identifier'],
  [/\bA9(?:7|8|9|10|11|12|13)-\d+\b/gu, 'internal acceptance identifier'],
  [/\bEXEC-[A-Z0-9-]+\b/gu, 'internal execution-fixture identifier'],
  [/\bcurrent documentation branch\b/giu, 'temporary documentation-branch language'],
  [/\b(?:documentation|source) migration\b/giu, 'documentation migration language'],
  [/\bdocumentation (?:review|verification|recheck|check)s?\b/giu, 'documentation-workflow language'],
  [/\bsource inspection\b/giu, 'source-inspection bookkeeping'],
  [/\brecorded verification\b/giu, 'verification-ledger bookkeeping'],
  [/\bsource assessment\b/giu, 'internal assessment language'],
  [/\b(?:command|review|migration) ledger\b/giu, 'temporary ledger language'],
  [/\bworking draft\b/giu, 'draft-status language'],
  [/\bcompletion report\b/giu, 'temporary completion-report language'],
  [/\b(?:source|decision) extraction\b/giu, 'source-extraction language'],
  [/\binventory slice\b/giu, 'incremental inventory language'],
  [/\b(?:implementation|schema)-only-blocker\b/giu, 'internal inventory-blocker status'],
  [/\bnot-applicable-unused\b/giu, 'internal inventory fallback status'],
  [/\bcandidate runtime consumer\b/giu, 'unresolved discovery language'],
  [/\bAdd a (?:maintained|source-backed)\b/gu, 'documentation-work instruction'],
  [/docs\/(?:review|blueprint)\//giu, 'reference to a non-reader documentation area'],
  [/docs\/(?:deployment|operations|operators|reference)\//giu, 'reference to a superseded documentation area'],
  [/\b(?:und|oder|der|das|für|wird|werden|kann|muss|nicht|wenn|dann|zum|zur|einer|einem|einen|dieser|diese|dieses|sowie|bevor|nachdem|teilweise|vollständig|geprüft|fehlgeschlagene|dauerhafte|tatsächliche|ursachen|bleiben|wartet|laufende|quoten|sperr|korruptionsfälle|typprüfung|daten|unverändert|lokal|dateisystem|helmtests|kommandos|explizite|unvollständig|dokumentation|entscheidung|prüfung|fehler|ergebnis|quelle|schritte?|verwenden|ausführen|ändern)\b|[äöüß]/giu, 'non-English reader prose'],
];

const findViolations = text => forbiddenText.flatMap(([pattern, description]) =>
  [...text.matchAll(pattern)].map(match => ({ index: match.index, description })));

function h1Errors(documents) {
  const result = [];
  const titleOwners = new Map();
  for (const { file, text } of documents) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const headings = [...text.matchAll(/^#\s+(.+?)\s*$/gmu)];
    if (headings.length !== 1) {
      result.push(`${relative}: expected exactly one reader-visible H1 title, found ${headings.length}`);
      continue;
    }
    const title = headings[0][1].trim().toLocaleLowerCase('en-US');
    const owner = titleOwners.get(title);
    if (owner) result.push(`${relative}: duplicate reader-visible H1 title also used by ${owner}`);
    else titleOwners.set(title, relative);
  }
  return result;
}

function assertNegativeFixtures() {
  const fixtures = [
    ['German generator prose', 'Teilweise geprüft; vollständige Recovery bleibt unvollständig.', 'non-English reader prose'],
    ['work-package label', 'AP9.8 implementation notes', 'work-package label'],
    ['acceptance ID', 'Complete G07 before release.', 'internal acceptance-gate identifier'],
    ['review ID', 'See PCR-BUSTER-ENGINE-001.', 'internal review identifier'],
    ['ledger ID', 'Commands C023 and C079 failed.', 'internal command-ledger identifier'],
    ['workflow prose', 'A documentation verification run passed.', 'documentation-workflow language'],
    ['inspection prose', 'Source inspection only.', 'source-inspection bookkeeping'],
  ];
  for (const [name, text, expected] of fixtures) {
    if (!findViolations(text).some(item => item.description === expected)) {
      throw new Error(`Reader-boundary negative fixture was not detected: ${name}`);
    }
  }
  const duplicates = h1Errors([
    { file: path.join(siteRoot, '__fixture-one.md'), text: '# Duplicate fixture\n' },
    { file: path.join(siteRoot, '__fixture-two.md'), text: '# Duplicate fixture\n' },
  ]);
  if (!duplicates.some(message => message.includes('duplicate reader-visible H1 title'))) {
    throw new Error('Reader-boundary duplicate-H1 fixture was not detected');
  }
}

assertNegativeFixtures();

const siteFiles = walk(siteRoot).filter(target => textualExtensions.has(path.extname(target)));
const markdownDocuments = [];
for (const file of siteFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const markdown = file.endsWith('.md');
  const prose = markdown ? proseOutsideFences(text) : text;

  for (const violation of findViolations(text)) report(file, text, violation.index, violation.description);

  if (!markdown) continue;
  markdownDocuments.push({ file, text: prose });

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

errors.push(...h1Errors(markdownDocuments));

const ignoredStatusKeys = new Set(['id', 'origin', 'dependencies', 'path', 'url', 'original_scope']);
const statusStrings = [];
function collectStatusStrings(value, key = '') {
  if (ignoredStatusKeys.has(key)) return;
  if (typeof value === 'string') statusStrings.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectStatusStrings(item, key));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => collectStatusStrings(child, childKey));
}
collectStatusStrings(JSON.parse(fs.readFileSync(statusSource, 'utf8')));
const statusProse = statusStrings.join('\n');
for (const violation of findViolations(statusProse)) report(statusSource, statusProse, violation.index, `${violation.description} in reader-page generator source`);

if (errors.length) {
  console.error('Reader-site boundary check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Reader-site boundary check passed.');
