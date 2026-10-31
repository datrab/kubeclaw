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
const packageCommands = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {})
  .map(name => `npm run ${name}`));

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
  [/\bthe retained source\b|\b(?:original|old|legacy) documentation\b|\bthe old design discussion\b/giu, 'documentation provenance language'],
  [/\b(?:earlier|previous) branch(?:-only)? (?:evidence|status)\b/giu, 'temporary branch-history language'],
  [/\breplace(?:s|d)? older candidate shapes\b/giu, 'documentation transformation language'],
  [/\b(?:old|older) (?:candidate list|requirement|repository production verifier|startup\/runbook statements|prose)\b/giu, 'historical transformation language'],
  [/\bpast task counts\b|\b\d+ remaining\b/giu, 'temporary task-tracking language'],
  [/\b(?:review said|as per (?:the )?review|according to (?:the )?review)\b/giu, 'review-provenance language'],
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

function isCryptoEncodingToken(text, match) {
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  if (match[0] === 'DER') {
    return /\bSPKI\s+$/u.test(before) && /^\s+bytes\b/u.test(after);
  }
  if (match[0] !== 'der') return false;
  const format = /\bformat\s*:\s*(["'])$/u.exec(before);
  return Boolean(format && after.startsWith(format[1]));
}

function isRegisteredCommandToken(text, match) {
  // A complete quoted, existing CLI command is reader-facing machine data,
  // not a work-package label. Never exempt arbitrary AP-prefixed prose.
  for (const token of text.matchAll(/"(?:\\.|[^"\\])*"/gu)) {
    if (token.index > match.index) break;
    if (token.index + token[0].length <= match.index + match[0].length) continue;
    try { return packageCommands.has(JSON.parse(token[0])); } catch { return false; }
  }
  return false;
}

const findViolations = text => forbiddenText.flatMap(([pattern, description]) =>
  [...text.matchAll(pattern)]
    .filter(match => description !== 'non-English reader prose' || !isCryptoEncodingToken(text, match))
    .filter(match => description !== 'work-package label' || !isRegisteredCommandToken(text, match))
    .map(match => ({ index: match.index, description })));

function withoutExternalUrls(text) {
  return text.replace(/https?:\/\/[^\s)>]+/gu, value => ' '.repeat(value.length));
}

// Machine provenance is not reader navigation. Admit only typed leaf roles;
// unknown fields and every human-readable description still pass prose rules.
const repositoryPath = /^(?:\.?github|docs|scripts|skills|contracts|charts|packaging|tests|packages|blueprint)\/[A-Za-z0-9_./@%+:-]+$/u;
const identityKeys = new Set(['sourceId', 'sourceIds', 'normalizedIdentity', 'primaryIdentity', 'typedIdentities', 'identities']);
const sourcePathKeys = new Set(['source', 'path', 'sourceAuthority', 'sourceDependencies', 'consumer', 'inventory', 'assignmentManifest', 'mechanicalSource']);
function machineLeaf(key, value) {
  if (key === 'sourceAuthority' && value.includes('; ')) return value.split('; ').every(part => repositoryPath.test(part) && !part.split('/').includes('..'));
  if (identityKeys.has(key)) return /^[a-z][a-z0-9-]*:\S+$/u.test(value);
  return sourcePathKeys.has(key) && repositoryPath.test(value) && !value.split('/').includes('..');
}
const registeredMachineNames = [...packageCommands].flatMap(command => [command, command.slice('npm run '.length)])
  .filter(name => /\bap\d/iu.test(name)).sort((a, b) => b.length - a.length);
function maskRegisteredCommands(text) {
  // Complete registered names only, never an arbitrary AP-prefixed phrase.
  for (const name of registeredMachineNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    text = text.replace(new RegExp(`(?<![\\w:.-])${escaped}(?![\\w:.-])`, 'gu'), (value, index, fullText) => {
      for (const quoted of fullText.matchAll(/"(?:\\.|[^"\\])*"/gu)) {
        if (index <= quoted.index || index >= quoted.index + quoted[0].length) continue;
        try { if (JSON.parse(quoted[0]) !== name) return value; } catch { return value; }
      }
      return ' '.repeat(value.length);
    });
  }
  return text;
}
function technicalProse(text) {
  // These describe actual parser/reader operations, not a past review result.
  return maskRegisteredCommands(text)
    .replace(/Source extraction protocol does not grant/gu, value => value.replace('Source extraction', ' '.repeat('Source extraction'.length)))
    .replace(/source extraction reads actual declarations without runtime owner execution/gu, value => value.replace('source extraction', ' '.repeat('source extraction'.length)))
    .replace(/Required before use: Add a source-backed template\/Application\/deploy binding or remove the unused value\./gu, value => value.replace('Add a source-backed', ' '.repeat('Add a source-backed'.length)))
    .replace(/existing generated-documentation checks/gu, value => value.replace('documentation', ' '.repeat('documentation'.length)));
}
function jsonProseViolations(value, keys = [], result = []) {
  if (typeof value === 'string') {
    const key = keys.filter(k => typeof k === 'string').at(-1);
    if (machineLeaf(key, value)) return result;
    if (['classificationBasis', 'consumerBoundary'].includes(key) && /^[\[{]/u.test(value)) {
      try { return jsonProseViolations(JSON.parse(value), [...keys, 'encodedData'], result); } catch { /* ordinary prose below */ }
    }
    for (const violation of findViolations(withoutExternalUrls(technicalProse(value)))) {
      result.push({ ...violation, location: keys.join('.') });
    }
  } else if (Array.isArray(value)) value.forEach((item, i) => jsonProseViolations(item, [...keys, i], result));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      // Dictionary identity keys do not authorize free-text field values.
      for (const violation of findViolations(key)) result.push({ ...violation, location: [...keys, key, '<key>'].join('.') });
      jsonProseViolations(item, [...keys, key], result);
    }
  }
  return result;
}
function immutableSourceCitation(label, target, sourceColumn = false) {
  const match = /^https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[a-f0-9]{40}\/(docs\/[^?#]+)(?:#[^\s]*)?$/u.exec(target);
  if (!match) return false;
  let sourcePath;
  try { sourcePath = decodeURIComponent(match[1]); } catch { return false; }
  if (sourcePath.split('/').includes('..') || sourcePath === 'docs/blueprint/documentation-completion-matrix.json' || (sourcePath.startsWith('docs/blueprint/acceptance-evidence/') && sourcePath.endsWith('.json') && !(sourceColumn && sourcePath.endsWith('/package.json') && /^declaration \/scripts\/[A-Za-z0-9:_-]+$/u.test(label)))) return false;
  const plain = label.replace(/`/gu, '');
  const data = /^docs\/(?:config|generated)\/.*\.json$/u.test(match[1]) && plain === match[1];
  const citation = /^(?:Historical authority|original .+ authority|source(?:[: ].*)?|source authority: .+)$/iu.test(plain);
  const declaration = sourceColumn && /^declaration \/scripts\/[A-Za-z0-9:_-]+$/u.test(plain) && match[1].endsWith('/package.json');
  return data || citation || declaration || (sourceColumn && plain === match[1]);
}
function markdownRoles(text) {
  let table = [];
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    let result = line;
    if (line.startsWith('|') && /^\|[\s:|-]+\|$/u.test(lines[lineIndex + 1] ?? '')) {
      table = line.split(/(?<!\\)\|/u).slice(1, -1).map(cell => cell.trim());
    } else if (!line.startsWith('|')) table = [];
    const cells = line.startsWith('|') ? line.split(/(?<!\\)\|/u).slice(1, -1) : [];
    let offset = 1;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i], heading = table[i];
      // Source/entry cells expose literal paths and selectors; a prose cell is
      // never hidden merely because the surrounding table is generated.
      if (['Source', 'Entry', 'Manifest / JSON property', 'Working directory'].includes(heading)) {
        result = result.slice(0, offset) + cell.replace(/(?:docs|scripts|skills|contracts|charts|packaging|tests)\/[A-Za-z0-9_./@%+:-]+/gu, token => ' '.repeat(token.length)) + result.slice(offset + cell.length);
      }
      if (((heading === 'Outcome / source policy' && /^\s*source-throw-completion:/u.test(cell)) || (heading === 'Applies when' && /^\s*when /u.test(cell) && /\| source-throw-completion:/u.test(line))) && /\[source:\d+\]\(https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[a-f0-9]{40}\//u.test(line)) {
        result = result.slice(0, offset) + ' '.repeat(cell.length) + result.slice(offset + cell.length);
      }
      offset += cell.length + 1;
    }
    if (/^Evidence:|^#### (?:scripts|docs|tests|skills|contracts)\//u.test(line)) {
      result = result.replace(/(?:docs|scripts|skills|contracts|charts|packaging|tests)\/[A-Za-z0-9_./@%+:-]+/gu, token => ' '.repeat(token.length));
    }
    result = result.replace(/`((?:docs|scripts|tests|skills|contracts)\/[A-Za-z0-9_./@%+:-]+)`/gu, token => ' '.repeat(token.length));
    // Literal command programs in fenced examples retain their source names.
    if (/^(?:node|python3?|bash|sh) (?:scripts|tests)\//u.test(line)) result = result.replace(/(?:scripts|tests)\/[A-Za-z0-9_./@%+:-]+/gu, token => ' '.repeat(token.length));
    // Link destination checks below remain independent of label/data masking.
    result = result.replace(/\[([^\]]*)\]\((https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[^)]+)\)/gu,
      (whole, label, target) => immutableSourceCitation(label, target, line.startsWith('|') || /^- /u.test(line)) ? ' '.repeat(whole.length) : whole);
    return technicalProse(result);
  }).join('\n');
}

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
    ['German article in prose', 'Stop: der Controller fails.', 'non-English reader prose'],
    ['German article in code comment', '```js\n// der Controller fails\n```', 'non-English reader prose'],
    ['German display string', "console.log('der Controller');", 'non-English reader prose'],
    ['German after crypto token', "SPKI DER bytes; der Controller fails.", 'non-English reader prose'],
    ['work-package label', 'AP9.8 implementation notes', 'work-package label'],
    ['acceptance ID', 'Complete G07 before release.', 'internal acceptance-gate identifier'],
    ['review ID', 'See PCR-BUSTER-ENGINE-001.', 'internal review identifier'],
    ['ledger ID', 'Commands C023 and C079 failed.', 'internal command-ledger identifier'],
    ['workflow prose', 'A documentation verification run passed.', 'documentation-workflow language'],
    ['inspection prose', 'Source inspection only.', 'source-inspection bookkeeping'],
    ['retained source prose', 'The retained source gives no approval date.', 'documentation provenance language'],
    ['old design prose', 'The old design discussion is not required.', 'documentation provenance language'],
    ['branch-history prose', 'Earlier branch-only status no longer applies.', 'temporary branch-history language'],
    ['shape-replacement prose', 'This replaces older candidate shapes.', 'documentation transformation language'],
    ['historical transformation prose', 'The old candidate list is obsolete.', 'historical transformation language'],
    ['task-count prose', 'Past task counts are not authoritative.', 'temporary task-tracking language'],
    ['review-provenance prose', 'As per the review, use this value.', 'review-provenance language'],
  ];
  for (const [name, text, expected] of fixtures) {
    if (!findViolations(text).some(item => item.description === expected)) {
      throw new Error(`Reader-boundary negative fixture was not detected: ${name}`);
    }
  }
  for (const text of [
    'Compare the approved fingerprint of the public key SPKI DER bytes.',
    "publicKey.export({ type: 'spki', format: 'der' })",
    'publicKey.export({ type: "spki", format: "der" })',
  ]) {
    if (findViolations(text).length) {
      throw new Error('Reader-boundary check mistook a crypto encoding token for German prose');
    }
  }
  if (findViolations(withoutExternalUrls('See https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.35/.')).length) {
    throw new Error('Reader-boundary check mistook an external API URL for a superseded repository path');
  }
  if (findViolations('"npm run docs:ap09:platform-inventory:check"').length) {
    throw new Error('Reader-boundary check mistook a registered command for a work-package label');
  }
  for (const text of ['"npm run docs:ap09:unregistered"', '"AP09.7 implementation notes"', '"npm run docs:ap09:platform-inventory:check draft"']) {
    if (!findViolations(text).some(item => item.description === 'work-package label')) {
      throw new Error('Reader-boundary command exception admitted unregistered command or work-package prose');
    }
  }
  const structuredCases = [
    ['typed identity', { normalizedIdentity: 'cli-declaration:scripts%2FAP09-owner.mjs:exit' }, false],
    ['source path', { sourceAuthority: 'docs/blueprint/authority.json' }, false],
    ['human field', { readerTask: 'Complete AP09.7 first.' }, true],
    ['mixed source vector', { sourceAuthority: 'scripts/owner.mjs; Complete G07 first.' }, true],
    ['typed source vector', { sourceAuthority: 'scripts/owner.mjs; docs/blueprint/authority.json' }, false],
    ['malformed identity', { normalizedIdentity: 'AP09.7 implementation notes' }, true],
    ['unknown field', { unexpectedDescription: 'Commands C023 failed.' }, true],
    ['encoded source contract', { classificationBasis: JSON.stringify({ source: 'docs/blueprint/authority.json', boundary: 'Complete G07 first.' }) }, true],
    ['technical parser limit', { consumerBoundary: 'Source extraction protocol does not grant an operator invocation.' }, false],
    ['unused-value prerequisite', { readerTask: 'Required before use: Add a source-backed template/Application/deploy binding or remove the unused value.' }, false],
    ['documentation work placeholder', { readerTask: 'Add a source-backed documentation index.' }, true],
    ['review bookkeeping', { consumerBoundary: 'Source extraction completed our review.' }, true],
  ];
  for (const [name, value, fail] of structuredCases) {
    if (Boolean(jsonProseViolations(value).length) !== fail) throw new Error(`Reader-boundary structural fixture failed: ${name}`);
  }
  const sourceTarget = 'https://github.com/datrab/kubeclaw/blob/' + 'a'.repeat(40) + '/docs/review/decision.md#choice';
  if (!immutableSourceCitation('Historical authority', sourceTarget) ||
      immutableSourceCitation('User guide', sourceTarget) ||
      immutableSourceCitation('Historical authority', sourceTarget.replace('a'.repeat(40), 'main'))) {
    throw new Error('Reader-boundary source citation/navigation distinction failed');
  }
  for (const [name, value, fail] of [
    ['source cell', '| Source | Boundary |\n| --- | --- |\n| docs/blueprint/AP09-fact.json | No runtime grant. |', false],
    ['prose cell', '| Source | Boundary |\n| --- | --- |\n| scripts/owner.mjs | Complete AP09.7 first. |', true],
    ['generated-looking prose', '<!-- BEGIN GENERATED -->\nComplete G07 first.', true],
    ['registered command', '`npm run docs:ap09:platform-inventory:check`', false],
    ['quoted non-command suffix', '"npm run docs:ap09:platform-inventory:check draft"', true],
    ['unregistered command', '`npm run docs:ap09:unregistered`', true],
    ['German code comment', '```js\n// der Controller fails\n```', true],
  ]) {
    if (Boolean(findViolations(withoutExternalUrls(markdownRoles(value))).length) !== fail) throw new Error(`Reader-boundary Markdown role fixture failed: ${name}`);
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

  if (path.extname(file) === '.json') {
    for (const violation of jsonProseViolations(JSON.parse(text))) errors.push(`${path.relative(root, file)}:${violation.location}: ${violation.description}`);
  } else {
    const classified = markdown ? markdownRoles(text) : text;
    for (const violation of findViolations(withoutExternalUrls(classified))) report(file, text, violation.index, violation.description);
  }

  if (!markdown) continue;
  markdownDocuments.push({ file, text: prose });

  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const raw = match[1].trim();
    const targetPart = raw.split('#', 1)[0].split('?', 1)[0];
    if (!targetPart || /^(?:https?:|mailto:)/u.test(targetPart)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(targetPart));
    const inDocs = resolved === docsRoot || resolved.startsWith(`${docsRoot}${path.sep}`);
    const inSite = resolved === siteRoot || resolved.startsWith(`${siteRoot}${path.sep}`);
    const dataReference = /^docs\/(?:config|generated)\/.*\.json$/u.test(path.relative(root, resolved).split(path.sep).join('/')) && fs.existsSync(resolved);
    if (inDocs && !inSite && !dataReference) {
      report(file, text, match.index, `link leaves docs/site: ${raw}`);
    }
  }

  for (const match of text.matchAll(/\[([^\]]*)\]\((https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[^)]+)\)/gu)) {
    if (!/^https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[^/]+\/docs\/(?!site\/)/u.test(match[2])) continue;
    const line = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index) < 0 ? text.length : text.indexOf('\n', match.index));
    if (!immutableSourceCitation(match[1], match[2], line.startsWith('|') || /^- /u.test(line))) report(file, text, match.index, 'pinned link targets documentation outside docs/site');
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
for (const violation of findViolations(withoutExternalUrls(technicalProse(statusProse)))) report(statusSource, statusProse, violation.index, `${violation.description} in reader-page generator source`);

if (errors.length) {
  console.error('Reader-site boundary check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Reader-site boundary check passed.');
