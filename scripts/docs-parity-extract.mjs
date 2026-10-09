#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const extractorVersion = 'kubeclaw-documentation-parity-extractor.v7';
export const unitsPath = 'docs/generated/inventory/documentation-parity-units.jsonl';
export const summaryPath = 'docs/generated/inventory/documentation-parity-summary.json';

const baselinePath = 'docs/config/documentation-tree-baseline.json';
const classificationPath = 'docs/config/documentation-tree-classification.json';
const batchConfigPath = 'docs/config/documentation-parity-batches.json';
const batchInventoryPath = 'docs/generated/inventory/documentation-parity-batches.json';
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeExcerpt(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\s+/gu, ' ').trim();
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function git(root, args, encoding = null, input = undefined) {
  return execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root,
    encoding,
    input,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
    maxBuffer: 256 * 1024 * 1024,
  });
}

function repositoryObjectFormat(root) {
  let name;
  try {
    name = git(root, ['rev-parse', '--show-object-format'], 'utf8').trim();
  } catch {
    assert.fail('cannot determine repository Git object format');
  }
  assert(['sha1', 'sha256'].includes(name), `unsupported repository Git object format: ${name}`);
  return { name, oidLength: name === 'sha1' ? 40 : 64 };
}

function validGitOid(value, objectFormat) {
  return typeof value === 'string'
    && new RegExp(`^[0-9a-f]{${objectFormat.oidLength}}$`, 'u').test(value);
}

function fixedSourceSetAuthorityRevision(root, objectFormat) {
  const additions = git(root,
    ['log', '--format=%H', '--diff-filter=A', 'HEAD', '--', batchConfigPath], 'utf8')
    .trim().split('\n').filter(Boolean);
  if (additions.length === 0) {
    const head = git(root, ['rev-parse', 'HEAD'], 'utf8').trim();
    assert(validGitOid(head, objectFormat), `${batchConfigPath}: bootstrap HEAD is invalid`);
    return { revision: head, bootstrap: true };
  }
  assert.equal(additions.length, 1,
    `${batchConfigPath}: authority file must have exactly one immutable introduction commit`);
  const parents = git(root, ['show', '-s', '--format=%P', additions[0]], 'utf8').trim().split(/\s+/u).filter(Boolean);
  assert.equal(parents.length, 1,
    `${batchConfigPath}: authority introduction must have exactly one parent commit`);
  assert(validGitOid(parents[0], objectFormat), `${batchConfigPath}: authority introduction parent is invalid`);
  return { revision: parents[0], bootstrap: false };
}

function documentationKind(repositoryPath) {
  const extension = path.extname(repositoryPath).toLowerCase();
  if (extension === '.md') return 'markdown';
  if (extension === '.json' || extension === '.jsonl') return 'structured-json';
  if (extension === '.yaml' || extension === '.yml') return 'structured-yaml';
  if (extension === '.svg') return 'diagram';
  return extension ? extension.slice(1) : 'extensionless';
}

function immutableDocumentationTree(root, revision, objectFormat) {
  return git(root, ['ls-tree', '-r', '-z', '--full-tree', revision, '--', 'docs'], 'utf8')
    .split('\0').filter(Boolean).map((entry) => {
      const match = /^(\d+)\s+(\S+)\s+([0-9a-f]+)\t(.+)$/u.exec(entry);
      assert(match, `cannot parse immutable documentation tree entry: ${entry}`);
      assert.equal(match[2], 'blob', `${match[4]}: immutable documentation entry is not a blob`);
      assert(['100644', '100755'].includes(match[1]), `${match[4]}: immutable documentation entry is not a regular file`);
      assert(validGitOid(match[3], objectFormat), `${match[4]}: invalid Git object`);
      return { originalPath: match[4], gitObject: match[3], mode: match[1], kind: documentationKind(match[4]) };
    }).sort((left, right) => compareText(left.originalPath, right.originalPath));
}

function normalizedRepositoryPath(pathname, label = pathname) {
  assert(typeof pathname === 'string' && pathname.length > 0, `${label}: path must be non-empty`);
  assert(!path.isAbsolute(pathname) && !pathname.includes('\\') && path.posix.normalize(pathname) === pathname
    && !pathname.split('/').includes('..'), `${label}: path must be normalized and repository-relative`);
  return pathname.split('/');
}

function lstatIfPresent(pathname) {
  try { return fs.lstatSync(pathname); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

function safeRepositoryPath(root, pathname, { mustExist = true, finalType = 'file', label = pathname } = {}) {
  const absoluteRoot = path.resolve(root);
  const rootStatus = fs.lstatSync(absoluteRoot);
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), `${label}: repository root must be a real directory`);
  const parts = normalizedRepositoryPath(pathname, label);
  let current = absoluteRoot;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const status = lstatIfPresent(current);
    if (!status) {
      assert(!mustExist, `${label}: path is missing`);
      break;
    }
    assert(!status.isSymbolicLink(), `${label}: symbolic-link path component is forbidden: ${parts.slice(0, index + 1).join('/')}`);
    const final = index === parts.length - 1;
    if (!final) assert(status.isDirectory(), `${label}: non-directory path component: ${parts.slice(0, index + 1).join('/')}`);
    else if (finalType === 'file') assert(status.isFile(), `${label}: must be a regular file`);
    else if (finalType === 'directory') assert(status.isDirectory(), `${label}: must be a directory`);
  }
  return path.join(absoluteRoot, ...parts);
}

function safeReadFile(root, pathname, encoding = null) {
  return fs.readFileSync(safeRepositoryPath(root, pathname), encoding);
}

function readJson(root, pathname) {
  return JSON.parse(safeReadFile(root, pathname, 'utf8'));
}

function ensureSafeOutputPath(root, pathname) {
  const parts = normalizedRepositoryPath(pathname);
  const absoluteRoot = safeRepositoryPath(root, '.', { finalType: 'directory', label: 'repository root' });
  let current = absoluteRoot;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const final = index === parts.length - 1;
    const status = lstatIfPresent(current);
    if (!status) {
      if (!final) fs.mkdirSync(current);
      continue;
    }
    assert(!status.isSymbolicLink(), `${pathname}: symbolic-link path component is forbidden: ${parts.slice(0, index + 1).join('/')}`);
    if (final) assert(status.isFile(), `${pathname}: must be a regular file`);
    else assert(status.isDirectory(), `${pathname}: non-directory path component: ${parts.slice(0, index + 1).join('/')}`);
  }
  return current;
}

function uniqueSibling(absolute, kind) {
  return path.join(path.dirname(absolute),
    `.${path.basename(absolute)}.${kind}-${process.pid}-${crypto.randomBytes(12).toString('hex')}`);
}

function writeOutputPairAtomically(root, outputs, fileSystem = fs) {
  const records = outputs.map(([pathname, content]) => {
    const absolute = ensureSafeOutputPath(root, pathname);
    return { pathname, content, absolute, temporary: uniqueSibling(absolute, 'tmp'),
      backup: uniqueSibling(absolute, 'bak'), installed: false, backedUp: false };
  });
  let committed = false;
  let rollbackFailed = false;
  try {
    for (const record of records) {
      const flags = fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT
        | fileSystem.constants.O_EXCL | fileSystem.constants.O_NOFOLLOW;
      const descriptor = fileSystem.openSync(record.temporary, flags, 0o666);
      try {
        fileSystem.writeFileSync(descriptor, record.content);
        fileSystem.fsyncSync(descriptor);
      } finally {
        fileSystem.closeSync(descriptor);
      }
    }
    for (const record of records) {
      if (fileSystem.existsSync(record.absolute)) {
        fileSystem.renameSync(record.absolute, record.backup);
        record.backedUp = true;
      }
      fileSystem.renameSync(record.temporary, record.absolute);
      record.installed = true;
    }
    committed = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const record of [...records].reverse()) {
      try {
        if (record.backedUp) fileSystem.renameSync(record.backup, record.absolute);
        else if (record.installed && fileSystem.existsSync(record.absolute)) fileSystem.unlinkSync(record.absolute);
      } catch (rollbackFailure) {
        rollbackErrors.push(rollbackFailure);
      }
    }
    rollbackFailed = rollbackErrors.length > 0;
    if (rollbackFailed) {
      const preserved = records.map((record) => record.backup).filter((backup) => fileSystem.existsSync(backup));
      throw new AggregateError([error, ...rollbackErrors],
        `documentation parity output rollback failed; preserved backups: ${preserved.join(', ')}`);
    }
    throw error;
  } finally {
    for (const record of records) {
      const disposables = committed || !rollbackFailed
        ? [record.temporary, record.backup] : [record.temporary];
      for (const disposable of disposables) {
        try { if (fileSystem.existsSync(disposable)) fileSystem.unlinkSync(disposable); } catch { /* preserve primary error */ }
      }
    }
  }
}

function readVerifiedGitBlob(root, gitObject, label) {
  const buffer = git(root, ['cat-file', 'blob', gitObject]);
  const actualObject = git(root, ['hash-object', '--stdin'], 'utf8', buffer).trim();
  assert.equal(actualObject, gitObject, `${label}: Git returned bytes that do not match the recorded blob identity`);
  return buffer;
}

function sourceSetBinding(records) {
  return records.map((record) => ({
    originalPath: record.originalPath,
    legacyPath: record.legacyPath ?? record.path,
    gitObject: record.gitObject,
    kind: record.kind,
  })).sort((left, right) => compareText(left.originalPath, right.originalPath));
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: must be an object`);
  assert.deepEqual(Object.keys(value).sort(compareText), [...expected].sort(compareText), `${label}: unexpected object keys`);
}

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"', nbsp: ' ' };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function normalizeReferenceLabel(value) {
  return decodeEntities(value).replace(/\\([\\`*{}\[\]()#+.!_>-])/gu, '$1')
    .replace(/\s+/gu, ' ').trim().toLowerCase();
}

function findClosingBracket(value, start) {
  let depth = 0;
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (value[cursor] === '\\') { cursor += 1; continue; }
    if (value[cursor] === '[') depth += 1;
    else if (value[cursor] === ']') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function findHtmlTagEnd(value, start) {
  let quote = null;
  for (let cursor = start + 1; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return cursor;
  }
  return -1;
}

function isHtmlTagToken(value) {
  return /^<\/?[A-Za-z][\w:-]*(?:\s[^<>]*)?\/?>$/u.test(value)
    || /^<![A-Z][^<>]*>$/u.test(value) || /^<\?[^<>]*\?>$/u.test(value);
}

function parseDestination(value, start) {
  assert.equal(value[start], '(');
  let depth = 1;
  let quote = null;
  let angle = false;
  for (let cursor = start + 1; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    if (character === '\\') { cursor += 1; continue; }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '<' && depth === 1) { angle = true; continue; }
    if (character === '>' && angle) { angle = false; continue; }
    if (!angle && (character === '"' || character === "'")) { quote = character; continue; }
    if (!angle && character === '(') depth += 1;
    else if (!angle && character === ')') {
      depth -= 1;
      if (depth === 0) {
        let inner = value.slice(start + 1, cursor).trim();
        let title = null;
        const titleMatch = /\s+(?:"([^"]*)"|'([^']*)'|\(([^()]*)\))\s*$/u.exec(inner);
        if (titleMatch) {
          title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3];
          inner = inner.slice(0, titleMatch.index).trimEnd();
        }
        const angleDestination = inner.startsWith('<') && inner.endsWith('>');
        if (angleDestination) inner = inner.slice(1, -1);
        else if (/[\s\u0000-\u001f\u007f]/u.test(inner)) return null;
        return { end: cursor + 1, destination: decodeEntities(inner.replace(/\\([\\()])/gu, '$1')), title };
      }
    }
  }
  return null;
}

function codeSpan(value, start) {
  let markerEnd = start;
  while (value[markerEnd] === '`') markerEnd += 1;
  const marker = value.slice(start, markerEnd);
  let close = -1;
  for (let cursor = markerEnd; cursor < value.length;) {
    if (value[cursor] !== '`') { cursor += 1; continue; }
    let runEnd = cursor;
    while (value[runEnd] === '`') runEnd += 1;
    if (runEnd - cursor === marker.length) { close = cursor; break; }
    cursor = runEnd;
  }
  if (close < 0) return null;
  let content = value.slice(markerEnd, close).replace(/[\r\n]+/gu, ' ');
  if (/^ .* $/u.test(content) && /[^ ]/u.test(content)) content = content.slice(1, -1);
  return { end: close + marker.length, content };
}

function inlineSemantics(value, definitions = new Map(), { collectReferences = true } = {}) {
  const references = [];
  let output = '';
  for (let cursor = 0; cursor < value.length;) {
    if (value.startsWith('<!--', cursor)) {
      const end = value.indexOf('-->', cursor + 4);
      cursor = end < 0 ? value.length : end + 3;
      output += ' ';
      continue;
    }
    if (value[cursor] === '`') {
      const span = codeSpan(value, cursor);
      if (span) { output += span.content; cursor = span.end; continue; }
    }
    const image = value[cursor] === '!' && value[cursor + 1] === '[';
    if (image || value[cursor] === '[') {
      const labelStart = cursor + (image ? 1 : 0);
      const labelEnd = findClosingBracket(value, labelStart);
      if (labelEnd >= 0) {
        const rawLabel = value.slice(labelStart + 1, labelEnd);
        const labelSemantics = inlineSemantics(rawLabel, definitions, { collectReferences });
        const label = labelSemantics.text;
        let parsed = null;
        if (value[labelEnd + 1] === '(') parsed = parseDestination(value, labelEnd + 1);
        if (parsed) {
          if (collectReferences) {
            references.push({ kind: image ? 'image' : 'link', label,
              destination: parsed.destination, title: parsed.title });
            references.push(...labelSemantics.references.map((reference) => image ? reference : {
              ...reference, containingLink: parsed.destination,
            }));
          }
          output += label;
          cursor = parsed.end;
          continue;
        }
        let referenceEnd = labelEnd + 1;
        let referenceLabel = rawLabel;
        if (value[labelEnd + 1] === '[') {
          const secondEnd = findClosingBracket(value, labelEnd + 1);
          if (secondEnd >= 0) {
            referenceLabel = value.slice(labelEnd + 2, secondEnd) || rawLabel;
            referenceEnd = secondEnd + 1;
          }
        }
        const definition = definitions.get(normalizeReferenceLabel(referenceLabel));
        if (definition) {
          if (collectReferences) {
            references.push({ kind: image ? 'image-reference' : 'link-reference', label,
              destination: definition.destination, title: definition.title, referenceLabel: definition.label });
            references.push(...labelSemantics.references.map((reference) => image ? reference : {
              ...reference, containingLink: definition.destination,
            }));
          }
          output += label;
          cursor = referenceEnd;
          continue;
        }
      }
    }
    if (value[cursor] === '<') {
      const tagEnd = findHtmlTagEnd(value, cursor);
      if (tagEnd >= 0) {
        const tag = value.slice(cursor, tagEnd + 1);
        const uriAutolink = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s\u0000-\u001f\u007f]*)>$/u.exec(tag);
        const emailAutolink = /^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>$/u.exec(tag);
        const autolink = uriAutolink ?? emailAutolink;
        if (autolink) {
          const destination = emailAutolink ? `mailto:${autolink[1]}` : autolink[1];
          if (collectReferences) references.push({ kind: 'autolink', label: autolink[1], destination, title: null });
          output += autolink[1];
          cursor = tagEnd + 1;
          continue;
        }
        if (/^<img\b/iu.test(tag)) {
          const attributes = parseHtmlAttributes(tag);
          const label = attributes.alt ?? '';
          if (collectReferences && attributes.src) references.push({ kind: 'html-image', label,
            destination: attributes.src, title: attributes.title ?? null });
          output += label;
          cursor = tagEnd + 1;
          continue;
        }
        const anchor = /^<a\b/iu.test(tag) ? /<\/a\s*>/giu : null;
        if (anchor) {
          anchor.lastIndex = tagEnd + 1;
          const close = anchor.exec(value);
          if (close) {
            const inner = inlineSemantics(value.slice(tagEnd + 1, close.index), definitions, { collectReferences });
            const attributes = parseHtmlAttributes(tag);
            if (collectReferences && attributes.href) {
              references.push({ kind: 'html-link', label: inner.text,
                destination: attributes.href, title: attributes.title ?? null });
              references.push(...inner.references.map((reference) => ({
                ...reference, containingLink: attributes.href,
              })));
            } else if (collectReferences) references.push(...inner.references);
            output += inner.text;
            cursor = close.index + close[0].length;
            continue;
          }
        }
        if (!isHtmlTagToken(tag)) {
          output += tag;
          cursor = tagEnd + 1;
          continue;
        }
        output += ' ';
        cursor = tagEnd + 1;
        continue;
      }
    }
    if (value[cursor] === '\\' && /[\\`*{}\[\]()#+.!_>-]/u.test(value[cursor + 1] ?? '')) {
      output += value[cursor + 1];
      cursor += 2;
      continue;
    }
    output += value[cursor];
    cursor += 1;
  }
  return { text: decodeEntities(output).replace(/\s+/gu, ' ').trim(), references };
}

function maskIntrinsicallyHiddenHtml(value) {
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const attributeNames = (raw) => {
    const names = [];
    let cursor = 0;
    while (cursor < raw.length) {
      while (/\s|\//u.test(raw[cursor] ?? '')) cursor += 1;
      if (cursor >= raw.length) break;
      const start = cursor;
      while (cursor < raw.length && !/[\s=/]/u.test(raw[cursor])) cursor += 1;
      if (cursor === start) { cursor += 1; continue; }
      names.push(raw.slice(start, cursor).toLocaleLowerCase('en-US'));
      while (/\s/u.test(raw[cursor] ?? '')) cursor += 1;
      if (raw[cursor] !== '=') continue;
      cursor += 1;
      while (/\s/u.test(raw[cursor] ?? '')) cursor += 1;
      const quote = raw[cursor] === '"' || raw[cursor] === "'" ? raw[cursor] : null;
      if (quote) {
        cursor += 1;
        while (cursor < raw.length && raw[cursor] !== quote) cursor += 1;
        if (raw[cursor] === quote) cursor += 1;
      } else while (cursor < raw.length && !/\s/u.test(raw[cursor])) cursor += 1;
    }
    return names;
  };
  const tokens = [];
  for (let start = value.indexOf('<'); start >= 0; start = value.indexOf('<', start + 1)) {
    if (value.startsWith('<!--', start)) {
      const commentEnd = value.indexOf('-->', start + 4);
      if (commentEnd < 0) break;
      start = commentEnd + 2;
      continue;
    }
    let quote = null;
    let end = start + 1;
    for (; end < value.length; end += 1) {
      const character = value[end];
      if (quote) { if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '>') break;
    }
    if (end >= value.length) break;
    const raw = value.slice(start, end + 1);
    const closing = /^<\s*\/\s*([A-Za-z][\w:-]*)[^>]*>$/u.exec(raw);
    if (closing) tokens.push({ start, end: end + 1, name: closing[1].toLocaleLowerCase('en-US'), closing: true });
    else {
      const opening = /^<\s*([A-Za-z][\w:-]*)([\s\S]*?)>$/u.exec(raw);
      if (opening) {
        const name = opening[1].toLocaleLowerCase('en-US');
        tokens.push({ start, end: end + 1, name, closing: false,
          hidden: name === 'template' || attributeNames(opening[2]).includes('hidden'),
          selfClosing: /\/\s*>$/u.test(raw) || voidElements.has(name) });
      }
    }
    start = end;
  }
  const ranges = [];
  const stack = [];
  for (const token of tokens) {
    if (!token.closing) {
      if (token.selfClosing) { if (token.hidden) ranges.push([token.start, token.end]); }
      else stack.push(token);
      continue;
    }
    const openingIndex = stack.findLastIndex((candidate) => candidate.name === token.name);
    if (openingIndex < 0) continue;
    const [opening] = stack.splice(openingIndex, 1);
    if (opening.hidden) ranges.push([opening.start, token.end]);
  }
  for (const opening of stack) if (opening.hidden) ranges.push([opening.start, value.length]);
  if (!ranges.length) return value;
  let cursor = 0;
  let masked = '';
  for (const [start, end] of ranges.sort((left, right) => left[0] - right[0])) {
    if (start < cursor) continue;
    masked += value.slice(cursor, start);
    masked += ' '.repeat(end - start);
    cursor = end;
  }
  return masked + value.slice(cursor);
}

function visibleText(value, definitions = new Map()) {
  return inlineSemantics(maskIntrinsicallyHiddenHtml(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' '), definitions).text;
}

function lineRecords(buffer) {
  const records = [];
  let start = 0;
  for (let cursor = 0; cursor < buffer.length; cursor += 1) {
    if (buffer[cursor] !== 0x0a && buffer[cursor] !== 0x0d) continue;
    const contentEnd = cursor;
    const crlf = buffer[cursor] === 0x0d && buffer[cursor + 1] === 0x0a;
    const end = cursor + (crlf ? 2 : 1);
    records.push({ start, end, text: buffer.subarray(start, contentEnd).toString('utf8') });
    start = end;
    if (crlf) cursor += 1;
  }
  if (start < buffer.length) records.push({ start, end: buffer.length, text: buffer.subarray(start).toString('utf8') });
  return records;
}

function lineAtOffset(lines, offset) {
  if (!lines.length) return 1;
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].start <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high) + 1;
}

function inlineReferences(raw, definitions = new Map()) {
  return inlineSemantics(raw, definitions).references;
}

function splitTableRow(raw, definitions = new Map()) {
  let value = raw.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  const cells = [];
  let current = '';
  let escaped = false;
  let codeMarker = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '`' && !escaped) {
      let end = index;
      while (value[end] === '`') end += 1;
      const marker = value.slice(index, end);
      if (!codeMarker) codeMarker = marker;
      else if (marker === codeMarker) codeMarker = null;
    }
    if (character === '|' && !escaped && !codeMarker) {
      cells.push(visibleText(current, definitions));
      current = '';
    } else current += character;
    escaped = character === '\\' && !escaped;
    if (character !== '\\') escaped = false;
  }
  cells.push(visibleText(current, definitions));
  return cells;
}

function tableDelimiter(value) {
  const cells = value.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|');
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/u.test(cell));
}

function fenceStart(value) {
  return /^\s*(`{3,}|~{3,})(.*)$/u.exec(value);
}

function headingMatch(value) {
  return /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(value);
}

function listMatch(value) {
  return /^(\s*)([-+*]|\d+[.)])\s+(.*)$/u.exec(value);
}

function htmlStart(value) {
  return /^\s*<(?:[A-Za-z][\w:-]*(?:\s|>|\/)|!--)/u.test(value);
}

function definitionMatch(value) {
  const match = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^()]*)\)))?\s*$/u.exec(value);
  if (!match) return null;
  return { label: match[1], destination: decodeEntities(match[2] ?? match[3]),
    title: match[4] ?? match[5] ?? match[6] ?? null };
}

function blockquoteMatch(value) {
  return /^ {0,3}>\s?(.*)$/u.exec(value);
}

function stripMarkdownContainerPrefixes(value) {
  let stripped = value;
  const containers = [];
  for (;;) {
    const quote = blockquoteMatch(stripped);
    if (quote) {
      containers.push('blockquote');
      stripped = quote[1];
      continue;
    }
    const list = /^ {0,3}(?:[-+*]|\d+[.)])(?:[ \t]+|$)(.*)$/u.exec(stripped);
    if (list) {
      containers.push('list-item');
      stripped = list[1];
      continue;
    }
    break;
  }
  return { stripped, containers };
}

function rawHtmlBlockStart(value) {
  const script = /^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/iu.exec(value);
  if (script) return { close: new RegExp(`</${script[1]}\\s*>`, 'iu'), endOnBlank: false };
  if (/^ {0,3}<!--/u.test(value)) return { close: /-->/u, endOnBlank: false };
  if (/^ {0,3}<\?/u.test(value)) return { close: /\?>/u, endOnBlank: false };
  if (/^ {0,3}<!\[CDATA\[/u.test(value)) return { close: /\]\]>/u, endOnBlank: false };
  if (/^ {0,3}<![A-Z]/u.test(value)) return { close: />/u, endOnBlank: false };
  if (htmlStart(value)) return { close: null, endOnBlank: true };
  return null;
}

function markdownDefinitions(lines) {
  const definitions = new Map();
  const rawHtmlLines = new Set();
  let fence = null;
  let rawHtml = null;
  let frontmatter = lines[0]?.text === '---' || lines[0]?.text === '+++' ? lines[0].text : null;
  for (let index = frontmatter ? 1 : 0; index < lines.length; index += 1) {
    const { stripped: value } = stripMarkdownContainerPrefixes(lines[index].text);
    if (frontmatter) {
      if ((frontmatter === '---' && /^(?:---|\.\.\.)\s*$/u.test(value))
        || (frontmatter === '+++' && /^\+\+\+\s*$/u.test(value))) frontmatter = null;
      continue;
    }
    if (rawHtml) {
      if (rawHtml.endOnBlank && !value.trim()) { rawHtml = null; continue; }
      rawHtmlLines.add(index);
      if (rawHtml.close?.test(value)) rawHtml = null;
      continue;
    }
    if (fence) {
      if (new RegExp(`^\\s*${fence.marker}{${fence.length},}\\s*$`, 'u').test(value)) fence = null;
      continue;
    }
    const start = fenceStart(value);
    if (start) { fence = { marker: start[1][0], length: start[1].length }; continue; }
    const html = rawHtmlBlockStart(value);
    if (html) {
      rawHtmlLines.add(index);
      if (!html.close?.test(value)) rawHtml = html;
      continue;
    }
    if (/^ {4}/u.test(value)) continue;
    const definition = definitionMatch(value);
    if (!definition) continue;
    const key = normalizeReferenceLabel(definition.label);
    if (!definitions.has(key)) definitions.set(key, definition);
  }
  return { definitions, rawHtmlLines };
}

function isBlockStart(lines, index) {
  const value = lines[index]?.text ?? '';
  if (!value.trim()) return true;
  if (fenceStart(value) || headingMatch(value) || listMatch(value) || definitionMatch(value) || blockquoteMatch(value)) return true;
  if (htmlStart(value) || /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(value)) return true;
  if (index + 1 < lines.length && (/^\s*(?:=+|-+)\s*$/u.test(lines[index + 1].text)
    || (value.includes('|') && tableDelimiter(lines[index + 1].text)))) return true;
  return false;
}

function markdownNormalized(kind, raw, metadata = {}, definitions = new Map()) {
  const lines = raw.replace(/\r\n?/gu, '\n').split('\n');
  if (kind === 'heading') return visibleText(metadata.headingText ?? raw, definitions);
  if (kind === 'list-item') return visibleText(lines.map((line) => line.replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, '')).join(' '), definitions);
  if (kind === 'blockquote' || kind === 'callout') return visibleText(lines
    .map((line) => line.replace(/^ {0,3}>\s?/u, '')).join(' ')
    .replace(/^\[![A-Za-z0-9_-]+\]\s*/u, ''), definitions);
  if (kind === 'code-block') {
    const body = lines.slice(1);
    if (metadata.closed !== false && body.at(-1) === '') body.pop();
    if (metadata.closed !== false) body.pop();
    return body.join('\n').replace(/[ \t]+$/gmu, '').trimEnd();
  }
  if (kind === 'table-header' || kind === 'table-row') return (metadata.cells ?? splitTableRow(raw, definitions)).join(' | ');
  if (kind === 'frontmatter') {
    const body = lines.slice(1);
    if (body.at(-1) === '') body.pop();
    body.pop();
    return body.map((line) => line.trimEnd()).join('\n').trim();
  }
  if (kind === 'link-definition') return `${metadata.label}: ${metadata.destination}${metadata.title ? ` ${metadata.title}` : ''}`;
  return visibleText(raw, definitions);
}

function normalizedFencedBody(contentLines, closed) {
  const body = contentLines.slice(1);
  if (closed) body.pop();
  return body.join('\n').replace(/[ \t]+$/gmu, '').trimEnd();
}

function stableId(source, kind, byteStart, byteEnd) {
  return `dpu_${sha256(Buffer.from([
    source.originalPath, source.gitObject, kind, String(byteStart), String(byteEnd),
  ].join('\0'))).slice(0, 32)}`;
}

function trimmedCharacterRange(value, start, end) {
  while (start < end && /\s/u.test(value[start])) start += 1;
  while (end > start && /\s/u.test(value[end - 1])) end -= 1;
  return start < end ? [start, end] : null;
}

function proseAtomicRanges(raw) {
  const ranges = [];
  let start = 0;
  const boundary = /[.!?](?:[\])}"'\u2019\u201d]*)(?=\s|$)/gu;
  for (const match of raw.matchAll(boundary)) {
    const end = match.index + match[0].length;
    const range = trimmedCharacterRange(raw, start, end);
    if (range) ranges.push(range);
    start = end;
  }
  const tail = trimmedCharacterRange(raw, start, raw.length);
  if (tail) ranges.push(tail);
  return ranges;
}

function tableAtomicRanges(raw) {
  const cells = [];
  let start = 0;
  let escaped = false;
  let codeTicks = 0;
  const close = (end) => {
    const range = trimmedCharacterRange(raw, start, end);
    if (range && /[^|]/u.test(raw.slice(range[0], range[1]))) cells.push(range);
    start = end + 1;
  };
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === '`') {
      let length = 1;
      while (raw[index + length] === '`') length += 1;
      codeTicks = codeTicks === 0 ? length : codeTicks === length ? 0 : codeTicks;
      index += length - 1;
      continue;
    }
    if (character === '|' && codeTicks === 0) close(index);
  }
  const tail = trimmedCharacterRange(raw, start, raw.length);
  if (tail && /[^|]/u.test(raw.slice(tail[0], tail[1]))) cells.push(tail);
  return cells.flatMap(([cellStart, cellEnd]) => proseAtomicRanges(raw.slice(cellStart, cellEnd))
    .map(([startOffset, endOffset]) => [cellStart + startOffset, cellStart + endOffset]));
}

function codeAtomicRanges(raw, metadata) {
  const lines = raw.match(/.*?(?:\r\n|\r|\n|$)/gu) ?? [];
  if (lines.at(-1) === '') lines.pop();
  let characterOffset = lines[0]?.length ?? 0;
  const body = lines.slice(1, metadata.closed === false ? undefined : -1);
  const ranges = [];
  for (const line of body) {
    const contentEnd = line.replace(/(?:\r\n|\r|\n)$/u, '').length;
    const range = trimmedCharacterRange(line, 0, contentEnd);
    if (range) ranges.push([characterOffset + range[0], characterOffset + range[1]]);
    characterOffset += line.length;
  }
  return ranges;
}

function yamlFrontmatterAtomicRanges(raw) {
  const openingEnd = raw.search(/\r\n|\r|\n/u);
  assert(openingEnd >= 0, 'YAML frontmatter opening delimiter has no line ending');
  const openingLength = raw.startsWith('\r\n', openingEnd) ? 2 : 1;
  const bodyStart = openingEnd + openingLength;
  const closing = /(\r\n|\r|\n)(?:---|\.\.\.)[^\S\r\n]*(?:(?:\r\n|\r|\n)|$)$/u.exec(raw);
  assert(closing, 'YAML frontmatter closing delimiter is missing');
  const bodyEnd = closing.index + closing[1].length;
  const body = raw.slice(bodyStart, bodyEnd);
  const fieldStarts = [];
  const lines = body.match(/.*?(?:\r\n|\r|\n|$)/gu) ?? [];
  if (lines.at(-1) === '') lines.pop();
  let offset = 0;
  for (const lineWithEnding of lines) {
    const line = lineWithEnding.replace(/(?:\r\n|\r|\n)$/u, '');
    if (!line.trim() || /^\s*#/u.test(line)) {
      offset += lineWithEnding.length;
      continue;
    }
    if (/^\s/u.test(line)) {
      assert(fieldStarts.length > 0,
        'YAML frontmatter indented content cannot precede the first top-level mapping field');
    } else {
      assert(!'-?:{},[]!&*%'.includes(line[0]),
        'YAML frontmatter must use plain top-level mapping fields, not sequence, flow, tag, or anchor syntax');
      let quote = null;
      let escaped = false;
      let separator = -1;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (escaped) { escaped = false; continue; }
        if (quote === '"' && character === '\\') { escaped = true; continue; }
        if (quote) {
          if (character === quote) quote = null;
          continue;
        }
        if (character === '"' || character === "'") { quote = character; continue; }
        if (character === ':' && (index + 1 === line.length || /\s/u.test(line[index + 1]))) {
          separator = index;
          break;
        }
      }
      assert(separator > 0, 'YAML frontmatter must use top-level mapping fields');
      fieldStarts.push(offset);
    }
    offset += lineWithEnding.length;
  }
  const substantive = body.replace(/^\s*(?:#.*)?$/gmu, '').trim();
  if (!substantive) return [];
  assert(fieldStarts.length > 0, 'YAML frontmatter has content but no top-level mapping field');
  return fieldStarts.map((fieldStart, index) => {
    const rangeStart = index === 0 ? 0 : fieldStart;
    const fieldEnd = fieldStarts[index + 1] ?? body.length;
    const range = trimmedCharacterRange(body, rangeStart, fieldEnd);
    assert(range, 'YAML frontmatter field is empty');
    return [bodyStart + range[0], bodyStart + range[1]];
  });
}

function atomicSegments(raw, draft) {
  let ranges;
  if (draft.kind === 'code-block') ranges = codeAtomicRanges(raw, draft.metadata);
  else if (['table-header', 'table-row'].includes(draft.kind)) ranges = tableAtomicRanges(raw);
  else if (['paragraph', 'list-item', 'blockquote', 'callout', 'html'].includes(draft.kind)) {
    ranges = proseAtomicRanges(raw);
  } else if (draft.kind === 'frontmatter') {
    if (draft.metadata.format === 'yaml') ranges = yamlFrontmatterAtomicRanges(raw);
    else {
      ranges = raw.split(/(?<=\n)/u).map((line, index, all) => {
        const start = all.slice(0, index).reduce((sum, item) => sum + item.length, 0);
        const trimmed = trimmedCharacterRange(line, 0, line.length);
        return trimmed ? [start + trimmed[0], start + trimmed[1]] : null;
      }).filter((range) => range && !/^(?:\+\+\+)$/u.test(raw.slice(range[0], range[1])));
    }
  } else if (draft.kind === 'table-delimiter') ranges = [];
  else ranges = trimmedCharacterRange(raw, 0, raw.length) ? [trimmedCharacterRange(raw, 0, raw.length)] : [];
  return ranges.map(([characterStart, characterEnd], index) => {
    const byteStart = draft.byteStart + Buffer.byteLength(raw.slice(0, characterStart));
    const byteEnd = draft.byteStart + Buffer.byteLength(raw.slice(0, characterEnd));
    const selected = Buffer.from(raw.slice(characterStart, characterEnd));
    return {
      index,
      kind: draft.kind === 'code-block' ? 'code-statement'
        : ['table-header', 'table-row'].includes(draft.kind) ? 'table-cell'
          : 'statement',
      byteStart,
      byteEnd,
      exactSha256: sha256(selected),
      normalizedSha256: sha256(Buffer.from(normalizeExcerpt(selected.toString('utf8')))),
    };
  });
}

function finalizeUnits(buffer, source, drafts) {
  const lines = lineRecords(buffer);
  return drafts.map((draft) => {
    const rawBytes = buffer.subarray(draft.byteStart, draft.byteEnd);
    const raw = rawBytes.toString('utf8');
    const text = draft.text ?? visibleText(raw);
    const normalized = normalizeExcerpt(raw);
    const normalizedHash = sha256(Buffer.from(normalized));
    return {
      schemaVersion: 'kubeclaw-documentation-parity-unit.v1',
      extractorVersion,
      unitId: stableId(source, draft.kind, draft.byteStart, draft.byteEnd),
      originalPath: source.originalPath,
      legacyPath: source.path,
      baselineRevision: source.baselineRevision,
      baselineGitObject: source.gitObject,
      sourceKind: source.kind,
      kind: draft.kind,
      headingPath: draft.headingContext,
      byteStart: draft.byteStart,
      byteEnd: draft.byteEnd,
      lineStart: lineAtOffset(lines, draft.byteStart),
      lineEnd: lineAtOffset(lines, Math.max(draft.byteStart, draft.byteEnd - 1)),
      exact: raw,
      exactSha256: sha256(rawBytes),
      normalized,
      normalizedSha256: normalizedHash,
      text,
      textSha256: sha256(Buffer.from(text)),
      atomicSegments: source.kind === 'markdown' ? atomicSegments(raw, draft) : [],
      ...draft.metadata,
    };
  });
}

export function assertMarkdownVisibleCoverage(buffer, units, sourcePath = '<markdown>') {
  const ranges = [];
  for (const unit of units) {
    assert(Number.isSafeInteger(unit.byteStart) && Number.isSafeInteger(unit.byteEnd)
      && unit.byteStart >= 0 && unit.byteEnd > unit.byteStart && unit.byteEnd <= buffer.length,
    `${sourcePath}: invalid unit byte range`);
    ranges.push([unit.byteStart, unit.byteEnd]);
  }
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  const missing = [];
  let cursor = 0;
  for (const [start, end] of [...merged, [buffer.length, buffer.length]]) {
    if (cursor < start) {
      const raw = buffer.subarray(cursor, start).toString('utf8');
      const operational = raw.replace(/<!--[\s\S]*?-->/gu, ' ');
      const gapVisibleText = visibleText(operational);
      const gapReferences = inlineReferences(operational);
      if (gapVisibleText || gapReferences.length > 0) {
        missing.push({ byteStart: cursor, text: normalizeExcerpt(gapVisibleText || operational) });
      }
    }
    cursor = Math.max(cursor, end);
  }
  assert.equal(missing.length, 0,
    `${sourcePath}: visible Markdown content was omitted at ${missing.slice(0, 5).map((item) => `byte ${item.byteStart}: ${item.text}`).join('; ')}`);
  const lines = lineRecords(buffer);
  const coveredLines = new Set(units.flatMap((unit) => {
    const values = [];
    for (let line = unit.lineStart; line <= unit.lineEnd; line += 1) values.push(line);
    return values;
  }));
  return { nonBlankLines: lines.filter((line) => line.text.trim()).length,
    coveredNonBlankLines: lines.filter((line, index) => line.text.trim() && coveredLines.has(index + 1)).length };
}

export function extractMarkdown(buffer, source) {
  assert(Buffer.isBuffer(buffer), 'Markdown input must be a Buffer');
  assert.equal(Buffer.from(buffer.toString('utf8')).compare(buffer), 0, `${source.originalPath}: content is not valid UTF-8`);
  const lines = lineRecords(buffer);
  const { definitions, rawHtmlLines } = markdownDefinitions(lines);
  const drafts = [];
  let headingContext = [];
  const add = (kind, startLine, endLine, metadata = {}, textOverride = null) => {
    const byteStart = lines[startLine].start;
    const byteEnd = lines[endLine].end;
    const raw = buffer.subarray(byteStart, byteEnd).toString('utf8');
    drafts.push({ kind, byteStart, byteEnd, headingContext: [...headingContext], metadata,
      text: textOverride ?? markdownNormalized(kind, raw, metadata, definitions) });
  };
  const addHtml = (startLine, endLine) => {
    const raw = buffer.subarray(lines[startLine].start, lines[endLine].end).toString('utf8');
    const htmlVisibleText = visibleText(raw, definitions);
    const references = inlineReferences(raw, definitions);
    if (!htmlVisibleText && references.length === 0) return;
    add('html', startLine, endLine, { visibleText: htmlVisibleText, references });
  };
  let index = 0;
  const listIndents = [];
  if (lines[0]?.text === '---' || lines[0]?.text === '+++') {
    const delimiter = lines[0].text;
    let end = 1;
    while (end < lines.length && !(delimiter === '---' ? /^(?:---|\.\.\.)\s*$/u : /^\+\+\+\s*$/u).test(lines[end].text)) end += 1;
    assert(end < lines.length, `${source.originalPath}: unterminated frontmatter`);
    add('frontmatter', 0, end, { format: delimiter === '---' ? 'yaml' : 'toml' });
    index = end + 1;
  }
  while (index < lines.length) {
    const text = lines[index].text;
    if (!text.trim()) { index += 1; continue; }
    if (rawHtmlLines.has(index)) {
      let end = index;
      while (rawHtmlLines.has(end + 1)) end += 1;
      addHtml(index, end);
      index = end + 1;
      continue;
    }
    const currentList = listMatch(text);
    if (!currentList) listIndents.length = 0;
    const fence = fenceStart(text);
    if (fence) {
      const marker = fence[1][0];
      const length = fence[1].length;
      let end = index + 1;
      while (end < lines.length && !new RegExp(`^\\s*${marker === '`' ? '`' : '~'}{${length},}\\s*$`, 'u').test(lines[end].text)) end += 1;
      const closed = end < lines.length;
      if (!closed) end = lines.length - 1;
      const info = fence[2].trim();
      add('code-block', index, end, { language: info.split(/\s+/u)[0] || null, info: info || null, closed });
      index = end + 1;
      continue;
    }
    const heading = headingMatch(text);
    if (heading) {
      const level = heading[1].length;
      const headingText = visibleText(heading[2], definitions);
      add('heading', index, index, { level, headingText, references: inlineReferences(heading[2], definitions) });
      headingContext = [...headingContext.slice(0, level - 1), headingText];
      index += 1;
      continue;
    }
    if (index + 1 < lines.length && text.trim() && /^\s*(=+|-+)\s*$/u.test(lines[index + 1].text)) {
      const level = lines[index + 1].text.includes('=') ? 1 : 2;
      const headingText = visibleText(text, definitions);
      add('heading', index, index + 1, { level, headingText, style: 'setext', references: inlineReferences(text, definitions) });
      headingContext = [...headingContext.slice(0, level - 1), headingText];
      index += 2;
      continue;
    }
    if (index + 1 < lines.length && text.includes('|') && tableDelimiter(lines[index + 1].text)) {
      const headers = splitTableRow(text, definitions);
      add('table-header', index, index, { cells: headers, tableHeaders: headers,
        references: inlineReferences(text, definitions) });
      add('table-delimiter', index + 1, index + 1, { columns: headers.length });
      index += 2;
      while (index < lines.length && lines[index].text.includes('|') && lines[index].text.trim()) {
        const cells = splitTableRow(lines[index].text, definitions);
        add('table-row', index, index, { cells, tableHeaders: headers,
          references: inlineReferences(lines[index].text, definitions) });
        index += 1;
      }
      continue;
    }
    const contained = stripMarkdownContainerPrefixes(text);
    const containedDefinition = contained.containers.length ? definitionMatch(contained.stripped) : null;
    if (containedDefinition) {
      add('link-definition', index, index, { ...containedDefinition, containers: contained.containers,
        references: [{ kind: 'definition', label: containedDefinition.label,
          destination: containedDefinition.destination, title: containedDefinition.title }] },
      `${containedDefinition.label}: ${containedDefinition.destination}${containedDefinition.title ? ` ${containedDefinition.title}` : ''}`);
      index += 1;
      continue;
    }
    const list = currentList;
    if (list) {
      const indent = list[1].length;
      while (listIndents.length && listIndents.at(-1) > indent) listIndents.pop();
      if (!listIndents.length || listIndents.at(-1) < indent) listIndents.push(indent);
      const nestingDepth = listIndents.length - 1;
      const checkbox = /^\[([ xX])\]\s+/u.exec(list[3]);
      const continuationIndent = list[0].length - list[3].length;
      let end = index;
      let cursor = index + 1;
      let separatedByBlank = false;
      while (cursor < lines.length) {
        const continuation = lines[cursor].text;
        if (!continuation.trim()) { separatedByBlank = true; cursor += 1; continue; }
        if (listMatch(continuation) || isBlockStart(lines, cursor)) break;
        const continuationLeadingIndent = /^\s*/u.exec(continuation)?.[0].length ?? 0;
        if (separatedByBlank && continuationLeadingIndent < continuationIndent) break;
        end = cursor;
        separatedByBlank = false;
        cursor += 1;
      }
      const raw = buffer.subarray(lines[index].start, lines[end].end).toString('utf8');
      add('list-item', index, end, {
        marker: list[2], ordered: /^\d/u.test(list[2]), depth: nestingDepth, indent,
        taskChecked: checkbox ? checkbox[1].toLowerCase() === 'x' : null,
        references: inlineReferences(raw, definitions),
      });
      index = end + 1;
      continue;
    }
    const definition = definitionMatch(text);
    if (definition) {
      add('link-definition', index, index, { ...definition,
        references: [{ kind: 'definition', label: definition.label, destination: definition.destination, title: definition.title }] });
      index += 1;
      continue;
    }
    const quote = blockquoteMatch(text);
    if (quote) {
      let end = index;
      while (end + 1 < lines.length && blockquoteMatch(lines[end + 1].text)) end += 1;
      const callout = /^\[!([A-Za-z0-9_-]+)\](?:\s|$)/u.exec(quote[1]);
      const containerKind = callout ? 'callout' : 'blockquote';
      const calloutType = callout?.[1].toUpperCase() ?? null;
      const dequoted = (lineIndex) => blockquoteMatch(lines[lineIndex].text)?.[1] ?? '';
      const addQuoteSegment = (start, finish, continuation) => {
        if (finish < start) return;
        const semanticRaw = Array.from({ length: finish - start + 1 }, (_, offset) => dequoted(start + offset)).join('\n');
        add(containerKind, start, finish, {
          calloutType,
          continuation,
          references: inlineReferences(semanticRaw, definitions),
        });
      };
      let segmentStart = index;
      let cursor = index;
      let continuation = false;
      while (cursor <= end) {
        const nestedFence = fenceStart(dequoted(cursor));
        if (!nestedFence) { cursor += 1; continue; }
        addQuoteSegment(segmentStart, cursor - 1, continuation);
        const marker = nestedFence[1][0];
        const length = nestedFence[1].length;
        let codeEnd = cursor + 1;
        const closeExpression = new RegExp(`^\\s*${marker === '`' ? '`' : '~'}{${length},}\\s*$`, 'u');
        while (codeEnd <= end && !closeExpression.test(dequoted(codeEnd))) codeEnd += 1;
        const closed = codeEnd <= end;
        if (!closed) codeEnd = end;
        const info = nestedFence[2].trim();
        const contentLines = Array.from({ length: codeEnd - cursor + 1 }, (_, offset) => dequoted(cursor + offset));
        add('code-block', cursor, codeEnd, {
          language: info.split(/\s+/u)[0] || null,
          info: info || null,
          closed,
          containerKind,
          calloutType,
        }, normalizedFencedBody(contentLines, closed));
        cursor = codeEnd + 1;
        segmentStart = cursor;
        continuation = true;
      }
      addQuoteSegment(segmentStart, end, continuation);
      index = end + 1;
      continue;
    }
    if (htmlStart(text)) {
      let end = index;
      while (end + 1 < lines.length && lines[end + 1].text.trim() && !isBlockStart(lines, end + 1)) end += 1;
      addHtml(index, end);
      index = end + 1;
      continue;
    }
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(text)) {
      add('thematic-break', index, index);
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < lines.length && !isBlockStart(lines, end + 1)) end += 1;
    const raw = buffer.subarray(lines[index].start, lines[end].end).toString('utf8');
    add('paragraph', index, end, { references: inlineReferences(raw, definitions) });
    index = end + 1;
  }
  const units = finalizeUnits(buffer, source, drafts);
  assertMarkdownVisibleCoverage(buffer, units, source.originalPath);
  return units;
}

function parseAttributes(value) {
  const attributes = {};
  const expression = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  for (const match of value.matchAll(expression)) attributes[match[1]] = decodeEntities(match[2] ?? match[3] ?? '');
  return Object.fromEntries(Object.entries(attributes).sort(([left], [right]) => compareText(left, right)));
}

function parseHtmlAttributes(value) {
  const attributes = {};
  const expression = /(?:^|\s)([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu;
  for (const match of value.matchAll(expression)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return Object.fromEntries(Object.entries(attributes).sort(([left], [right]) => compareText(left, right)));
}

function svgStructuralRole(tag, attributes) {
  if (tag === 'g') return 'group';
  if (['line', 'path', 'polyline'].includes(tag)) return 'edge';
  if (['circle', 'ellipse', 'polygon', 'rect'].includes(tag)) return 'node';
  if (tag === 'a') return 'group';
  if (tag === 'image') return 'node';
  return attributes.class?.split(/\s+/u).some((value) => /^(?:node|edge|cluster|group)$/u.test(value))
    ? attributes.class.split(/\s+/u).find((value) => /^(?:node|edge|cluster|group)$/u.test(value)) : null;
}

function parseStyleDeclarations(value) {
  const declarations = {};
  for (const item of value.split(';')) {
    const separator = item.indexOf(':');
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim().toLowerCase();
    const declaration = item.slice(separator + 1).trim();
    if (name && declaration) declarations[name] = declaration;
  }
  return Object.fromEntries(Object.entries(declarations).sort(([left], [right]) => compareText(left, right)));
}

function splitCssSelectorList(value) {
  const selectors = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(') parentheses += 1;
    else if (character === ')') parentheses = Math.max(0, parentheses - 1);
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets = Math.max(0, brackets - 1);
    else if (character === ',' && parentheses === 0 && brackets === 0) {
      selectors.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(value.slice(start).trim());
  return selectors.filter(Boolean);
}

function svgStyleRules(text) {
  const rules = [];
  let sourceOrder = 0;
  for (const style of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)) {
    const body = style[1].replace(/\/\*[\s\S]*?\*\//gu, ' ');
    for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
      for (const selector of splitCssSelectorList(rule[1])) {
        rules.push({ selector, declarations: parseStyleDeclarations(rule[2]), sourceOrder });
        sourceOrder += 1;
      }
    }
  }
  return rules;
}

const SVG_PRESENTATION_ATTRIBUTES = new Set([
  'color', 'fill', 'fill-opacity', 'fill-rule', 'font', 'font-family', 'font-size', 'font-style', 'font-weight',
  'marker', 'marker-end', 'marker-mid', 'marker-start', 'opacity', 'paint-order', 'stroke', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
  'text-anchor', 'visibility',
]);

function matchesSvgSimpleSelector(selector, tag, attributes) {
  if (!/^(?:\*|[A-Za-z][\w:-]*)?(?:[.#][A-Za-z_][\w-]*)*$/u.test(selector)) return false;
  const type = /^(\*|[A-Za-z][\w:-]*)/u.exec(selector)?.[1];
  if (type && type !== '*' && type.toLowerCase() !== tag) return false;
  const classes = new Set(attributes.class?.split(/\s+/u).filter(Boolean) ?? []);
  for (const token of selector.matchAll(/([.#])([A-Za-z_][\w-]*)/gu)) {
    if (token[1] === '.' && !classes.has(token[2])) return false;
    if (token[1] === '#' && attributes.id !== token[2]) return false;
  }
  return true;
}

function matchesSvgDescendantSelector(selector, tag, attributes, ancestors) {
  if (/[>+~:\[]/u.test(selector)) return false;
  const parts = selector.trim().split(/\s+/u).filter(Boolean);
  if (!parts.length || !matchesSvgSimpleSelector(parts.at(-1), tag, attributes)) return false;
  let ancestorIndex = ancestors.length - 1;
  for (let partIndex = parts.length - 2; partIndex >= 0; partIndex -= 1) {
    while (ancestorIndex >= 0 && !matchesSvgSimpleSelector(parts[partIndex],
      ancestors[ancestorIndex].tag, ancestors[ancestorIndex].attributes)) ancestorIndex -= 1;
    if (ancestorIndex < 0) return false;
    ancestorIndex -= 1;
  }
  return true;
}

function svgSelectorStatus(selector, tag, attributes, ancestors) {
  if (/:is\(|:where\(/iu.test(selector)) {
    return { matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' };
  }
  if (!/[>+~:\[]/u.test(selector)) {
    return matchesSvgDescendantSelector(selector, tag, attributes, ancestors)
      ? { matchStatus: 'matched', matchReason: 'supported-selector-match' }
      : { matchStatus: 'not-matched', matchReason: 'supported-selector-no-match' };
  }
  const rightmost = selector.trim().split(/\s+|(?=[>+~])/u).filter((part) => part && !/^[>+~]$/u.test(part)).at(-1) ?? '';
  const conservativeTarget = rightmost.replace(/\[[^\]]*\]/gu, '').replace(/:{1,2}[A-Za-z_-][\w-]*(?:\([^)]*\))?/gu, '');
  if (conservativeTarget && !matchesSvgSimpleSelector(conservativeTarget, tag, attributes)) {
    return { matchStatus: 'not-matched', matchReason: 'unsupported-selector-target-mismatch' };
  }
  return { matchStatus: 'unresolved', matchReason: 'unsupported-selector-syntax' };
}

function svgStyleSources(tag, attributes, rules, ancestors) {
  const presentationAttributes = Object.fromEntries(Object.entries(attributes)
    .filter(([name]) => SVG_PRESENTATION_ATTRIBUTES.has(name))
    .sort(([left], [right]) => compareText(left, right)));
  const matchedRules = rules.filter((rule) => matchesSvgDescendantSelector(rule.selector, tag, attributes, ancestors));
  const expose = (rule) => ({ selector: rule.selector, declarations: rule.declarations, sourceOrder: rule.sourceOrder });
  const markerRuleCandidates = rules.filter((rule) => ['marker', 'marker-start', 'marker-mid', 'marker-end']
    .some((name) => Object.hasOwn(rule.declarations, name))).map((rule) => ({
    ...expose(rule),
    ...svgSelectorStatus(rule.selector, tag, attributes, ancestors),
  }));
  return {
    presentationAttributes,
    inlineDeclarations: parseStyleDeclarations(attributes.style ?? ''),
    matchedSimpleRules: matchedRules.filter((rule) => !/\s/u.test(rule.selector)).map(expose),
    matchedComplexRules: matchedRules.filter((rule) => /\s/u.test(rule.selector)).map(expose),
    markerRuleCandidates,
  };
}

function markerReferences(styleSources, inheritedReferences = []) {
  const references = [];
  for (const name of ['marker-start', 'marker-mid', 'marker-end']) {
    const candidates = [];
    if (styleSources.presentationAttributes.marker) candidates.push({ value: styleSources.presentationAttributes.marker,
      source: 'presentation-attribute:marker', matchStatus: 'matched', matchReason: 'direct-presentation-attribute-shorthand' });
    if (styleSources.presentationAttributes[name]) candidates.push({ value: styleSources.presentationAttributes[name],
      source: 'presentation-attribute', matchStatus: 'matched', matchReason: 'direct-presentation-attribute' });
    for (const rule of styleSources.markerRuleCandidates.filter((candidate) => candidate.matchStatus !== 'not-matched')) {
      if (rule.declarations.marker) candidates.push({ value: rule.declarations.marker,
        source: `stylesheet:${rule.selector}@${rule.sourceOrder}:marker`,
        matchStatus: rule.matchStatus, matchReason: rule.matchReason });
      if (rule.declarations[name]) candidates.push({ value: rule.declarations[name],
        source: `stylesheet:${rule.selector}@${rule.sourceOrder}`,
        matchStatus: rule.matchStatus, matchReason: rule.matchReason });
    }
    if (styleSources.inlineDeclarations.marker) candidates.push({ value: styleSources.inlineDeclarations.marker,
      source: 'inline-style:marker', matchStatus: 'matched', matchReason: 'direct-inline-style-shorthand' });
    if (styleSources.inlineDeclarations[name]) candidates.push({ value: styleSources.inlineDeclarations[name],
      source: 'inline-style', matchStatus: 'matched', matchReason: 'direct-inline-style' });
    for (const candidate of candidates) references.push({
      position: name.slice('marker-'.length),
      value: candidate.value,
      markerId: /^url\(\s*(["']?)#([^)'"\s]+)\1\s*\)(?:\s*!important)?$/iu.exec(candidate.value)?.[2] ?? null,
      source: candidate.source,
      matchStatus: candidate.matchStatus,
      matchReason: candidate.matchReason,
    });
    if (!candidates.length) {
      for (const inherited of inheritedReferences.filter((item) => item.position === name.slice('marker-'.length))) {
        references.push({ ...inherited, source: `inherited:${inherited.source}` });
      }
    }
  }
  return references;
}

function svgElementKind(tag, attributes) {
  if (tag === 'svg') return 'svg-boundary';
  if (tag === 'style') return 'svg-style';
  if (tag === 'marker') return 'svg-marker';
  if (tag === 'use') return 'svg-use';
  if (tag === 'symbol') return 'svg-symbol';
  if (tag === 'legend' || /(?:^|[\s_-])legend(?:$|[\s_-])/iu.test(`${attributes.id ?? ''} ${attributes.class ?? ''}`)) return 'svg-legend';
  if (tag === 'title') return 'svg-title';
  if (tag === 'desc') return 'svg-description';
  if (tag === 'text') return 'svg-text';
  const role = svgStructuralRole(tag, attributes);
  return role ? `svg-${role}` : null;
}

function charToByte(text, index) {
  return Buffer.byteLength(text.slice(0, index));
}

function markupTokens(text, includeText = false) {
  const tokens = [];
  for (let cursor = 0; cursor < text.length;) {
    if (text[cursor] !== '<') {
      const end = text.indexOf('<', cursor);
      const tokenEnd = end < 0 ? text.length : end;
      if (includeText) tokens.push({ token: text.slice(cursor, tokenEnd), index: cursor });
      cursor = tokenEnd;
      continue;
    }
    let end;
    if (text.startsWith('<!--', cursor)) {
      const close = text.indexOf('-->', cursor + 4);
      end = close < 0 ? text.length : close + 3;
    } else if (text.startsWith('<![CDATA[', cursor)) {
      const close = text.indexOf(']]>', cursor + 9);
      end = close < 0 ? text.length : close + 3;
    } else {
      const close = findHtmlTagEnd(text, cursor);
      end = close < 0 ? text.length : close + 1;
    }
    tokens.push({ token: text.slice(cursor, end), index: cursor });
    cursor = end;
  }
  return tokens;
}

export function assertSvgVisibleCoverage(buffer, units, sourcePath = '<svg>') {
  const text = buffer.toString('utf8');
  const semanticRanges = units.filter((unit) => ['svg-title', 'svg-description', 'svg-text'].includes(unit.kind))
    .map((unit) => [unit.byteStart, unit.byteEnd]);
  const stack = [];
  const missing = [];
  for (const match of markupTokens(text, true)) {
    const { token } = match;
    if (token.startsWith('</')) stack.pop();
    else if (token.startsWith('<') && !token.startsWith('<!--') && !token.startsWith('<!') && !token.startsWith('<?') && !token.endsWith('/>')) {
      stack.push(/^<\s*([\w:-]+)/u.exec(token)?.[1]?.toLowerCase() ?? '');
    } else if (!token.startsWith('<') && visibleText(token) && !['style', 'script'].some((tag) => stack.includes(tag))) {
      const start = charToByte(text, match.index);
      const end = charToByte(text, match.index + token.length);
      if (!semanticRanges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd)) missing.push({ offset: start, text: visibleText(token) });
    }
  }
  assert.equal(missing.length, 0,
    `${sourcePath}: visible SVG text was omitted at ${missing.slice(0, 5).map((item) => `byte ${item.offset}: ${item.text}`).join('; ')}`);

  const structuralMissing = [];
  for (const match of markupTokens(text)) {
    if (/^<[!?/]/u.test(match.token)) continue;
    const open = /^<\s*([\w:-]+)([\s\S]*?)\/?\s*>$/u.exec(match.token);
    if (!open) continue;
    const tag = open[1].toLowerCase();
    const attributes = parseAttributes(open[2]);
    const kind = svgElementKind(tag, attributes);
    if (!kind) continue;
    const byteStart = charToByte(text, match.index);
    if (!units.some((unit) => unit.kind === kind && unit.byteStart === byteStart)) {
      structuralMissing.push({ byteStart, element: tag, kind });
    }
  }
  assert.equal(structuralMissing.length, 0,
    `${sourcePath}: structural SVG content was omitted at ${structuralMissing.slice(0, 5)
      .map((item) => `byte ${item.byteStart}: ${item.element} (${item.kind})`).join('; ')}`);
}

export function extractSvg(buffer, source) {
  assert(Buffer.isBuffer(buffer), 'SVG input must be a Buffer');
  assert.equal(Buffer.from(buffer.toString('utf8')).compare(buffer), 0, `${source.originalPath}: content is not valid UTF-8`);
  const text = buffer.toString('utf8');
  const styleRules = svgStyleRules(text);
  const stack = [];
  const drafts = [];
  const metadataFor = (tag, attributes, parent) => {
    const styleSources = svgStyleSources(tag, attributes, styleRules, stack);
    const references = markerReferences(styleSources, parent?.markerReferences ?? []);
    return {
      element: tag,
      attributes,
      structuralRole: svgStructuralRole(tag, attributes),
      parentElement: parent?.tag ?? null,
      parentId: parent?.attributes.id ?? null,
      ancestorIds: stack.map((item) => item.attributes.id).filter(Boolean),
      styleSources,
      markerReferences: references,
    };
  };
  const addSvgDraft = (kind, byteStart, byteEnd, tag, attributes, parent, raw, metadata = null) => {
    const semanticMetadata = metadata ?? metadataFor(tag, attributes, parent);
    let semanticText;
    if (['svg-title', 'svg-description', 'svg-text'].includes(kind)) semanticText = visibleText(raw);
    else if (kind === 'svg-style') semanticText = raw.replace(/^<style\b[^>]*>|<\/style>$/giu, '').trim();
    else semanticText = `${tag} ${Object.entries(attributes).map(([key, value]) => `${key}=${value}`).join(' ')}`.trim();
    drafts.push({ kind, byteStart, byteEnd, headingContext: [], text: semanticText, metadata: semanticMetadata });
  };
  for (const match of markupTokens(text)) {
    const { token } = match;
    const close = /^<\/\s*([\w:-]+)[^>]*>/u.exec(token);
    if (close) {
      const tag = close[1].toLowerCase();
      const opened = stack.pop();
      assert(opened && opened.tag === tag, `${source.originalPath}: malformed SVG close tag </${tag}>`);
      const byteEnd = charToByte(text, match.index + token.length);
      const raw = buffer.subarray(opened.byteStart, byteEnd).toString('utf8');
      const kind = svgElementKind(tag, opened.attributes);
      if (kind && kind !== 'svg-boundary') addSvgDraft(kind, opened.byteStart, byteEnd, tag,
        opened.attributes, opened.parent, raw, opened.metadata);
      continue;
    }
    const open = /^<\s*([\w:-]+)([\s\S]*?)\/?\s*>$/u.exec(token);
    if (!open || token.startsWith('<!') || token.startsWith('<?')) continue;
    const tag = open[1].toLowerCase();
    const attributes = parseAttributes(open[2]);
    const byteStart = charToByte(text, match.index);
    const byteEnd = charToByte(text, match.index + token.length);
    const parent = stack.at(-1) ?? null;
    const kind = svgElementKind(tag, attributes);
    const metadata = metadataFor(tag, attributes, parent);
    if (kind === 'svg-boundary') addSvgDraft(kind, byteStart, byteEnd, tag, attributes, parent, token, metadata);
    if (token.endsWith('/>')) {
      if (kind && kind !== 'svg-boundary') addSvgDraft(kind, byteStart, byteEnd, tag, attributes, parent, token, metadata);
    } else stack.push({ tag, attributes, byteStart, parent, metadata, markerReferences: metadata.markerReferences });
  }
  assert.equal(stack.length, 0, `${source.originalPath}: unterminated SVG element <${stack.at(-1)?.tag ?? ''}>`);
  drafts.sort((left, right) => left.byteStart - right.byteStart || left.byteEnd - right.byteEnd || compareText(left.kind, right.kind));
  const units = finalizeUnits(buffer, source, drafts);
  assertSvgVisibleCoverage(buffer, units, source.originalPath);
  return units;
}

export function sourceSetAuthorityDigest(sourceSetAuthorityRevision, baselineRevision, sources) {
  return sha256(canonical({
    schemaVersion: 'kubeclaw-documentation-parity-source-set-authority.v1',
    sourceSetAuthorityRevision,
    baselineRevision,
    sources: sourceSetBinding(sources),
  }));
}

function loadBatchSourceAuthority(root, baselineByPath, baselineRevision, objectFormat) {
  const config = readJson(root, batchConfigPath);
  const inventory = readJson(root, batchInventoryPath);
  exactKeys(config, ['schemaVersion', 'purpose', 'sourceSetAuthorityRevision', 'sourceSetAuthoritySha256', 'batches'], batchConfigPath);
  assert.equal(config.schemaVersion, 'kubeclaw-documentation-parity-batches.v1',
    `${batchConfigPath}: unsupported schemaVersion`);
  assert(typeof config.purpose === 'string' && config.purpose, `${batchConfigPath}: purpose is required`);
  assert(validGitOid(config.sourceSetAuthorityRevision, objectFormat),
    `${batchConfigPath}: invalid sourceSetAuthorityRevision`);
  assert(/^[0-9a-f]{64}$/u.test(config.sourceSetAuthoritySha256),
    `${batchConfigPath}: invalid sourceSetAuthoritySha256`);
  let authorityType;
  try {
    authorityType = git(root, ['cat-file', '-t', config.sourceSetAuthorityRevision], 'utf8').trim();
  } catch {
    assert.fail(`${batchConfigPath}: sourceSetAuthorityRevision does not resolve directly to a commit`);
  }
  assert.equal(authorityType, 'commit', `${batchConfigPath}: sourceSetAuthorityRevision must resolve directly to a commit`);
  try {
    git(root, ['merge-base', '--is-ancestor', config.sourceSetAuthorityRevision, 'HEAD']);
  } catch {
    assert.fail(`${batchConfigPath}: sourceSetAuthorityRevision must be an ancestor of HEAD`);
  }
  const fixedAuthority = fixedSourceSetAuthorityRevision(root, objectFormat);
  assert.equal(config.sourceSetAuthorityRevision, fixedAuthority.revision,
    `${batchConfigPath}: sourceSetAuthorityRevision differs from the immutable authority introduction parent`);
  let authorityClassification;
  try {
    authorityClassification = JSON.parse(git(root,
      ['show', `${config.sourceSetAuthorityRevision}:${classificationPath}`], 'utf8'));
  } catch {
    assert.fail(`${batchConfigPath}: cannot read committed classification from sourceSetAuthorityRevision`);
  }
  exactKeys(authorityClassification, ['schemaVersion', 'baselineRevision', 'files'],
    `${batchConfigPath}: committed classification`);
  assert.equal(authorityClassification.schemaVersion, 'kubeclaw-documentation-tree-classification.v1',
    `${batchConfigPath}: committed classification has unsupported schemaVersion`);
  assert.equal(authorityClassification.baselineRevision, baselineRevision,
    `${batchConfigPath}: committed classification baselineRevision differs from the immutable baseline`);
  assert(Array.isArray(authorityClassification.files), `${batchConfigPath}: committed classification files must be an array`);
  const authoritySeen = new Set();
  const authorityRecords = authorityClassification.files.filter((record) => record.class === 'legacy-extraction-source')
    .map((record, index) => {
      const label = `${batchConfigPath}: committed legacy source[${index}]`;
      exactKeys(record, ['path', 'class', 'purpose', 'originalPath', 'expectedPath', 'introducedAfterBaseline'], label);
      assert(typeof record.originalPath === 'string' && record.originalPath.startsWith('docs/'),
        `${label}: invalid originalPath`);
      assert(!authoritySeen.has(record.originalPath), `${label}: duplicate originalPath ${record.originalPath}`);
      authoritySeen.add(record.originalPath);
      const expectedLegacyPath = `docs/_legacy-source/${record.originalPath.slice('docs/'.length)}`;
      assert.equal(record.path, expectedLegacyPath, `${label}: legacy path does not preserve the original relative path`);
      assert.equal(record.expectedPath, record.path, `${label}: expectedPath differs from path`);
      assert.equal(record.introducedAfterBaseline, false, `${label}: source must exist in the immutable baseline`);
      const immutable = baselineByPath.get(record.originalPath);
      assert(immutable, `${label}: source is absent from the immutable baseline`);
      assert(['markdown', 'diagram'].includes(immutable.kind), `${label}: unsupported source kind ${immutable.kind}`);
      return { originalPath: record.originalPath, legacyPath: record.path,
        gitObject: immutable.gitObject, kind: immutable.kind };
    });
  const authoritySourceSet = sourceSetBinding(authorityRecords);
  assert(authoritySourceSet.length > 0, `${batchConfigPath}: committed classification has no legacy extraction sources`);
  assert.equal(config.sourceSetAuthoritySha256,
    sourceSetAuthorityDigest(config.sourceSetAuthorityRevision, baselineRevision, authoritySourceSet),
  `${batchConfigPath}: sourceSetAuthoritySha256 does not match the committed source identities`);
  assert(Array.isArray(config.batches) && config.batches.length > 0, `${batchConfigPath}: batches must be non-empty`);
  const batchIds = new Set();
  const batches = config.batches.map((batch, index) => {
    const label = `${batchConfigPath}.batches[${index}]`;
    exactKeys(batch, ['id', 'owner', 'patterns'], label);
    assert(typeof batch.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(batch.id), `${label}: invalid id`);
    assert(!batchIds.has(batch.id), `${batchConfigPath}: duplicate batch id ${batch.id}`);
    batchIds.add(batch.id);
    assert(typeof batch.owner === 'string' && batch.owner, `${label}: owner is required`);
    assert(Array.isArray(batch.patterns) && batch.patterns.length > 0
      && batch.patterns.every((pattern) => typeof pattern === 'string' && pattern), `${label}: patterns are required`);
    return { ...batch, expressions: batch.patterns.map((pattern) => new RegExp(pattern, 'u')) };
  });

  exactKeys(inventory, ['schemaVersion', 'sourceCount', 'batchCount', 'counts', 'assignments'], batchInventoryPath);
  assert.equal(inventory.schemaVersion, 'kubeclaw-documentation-parity-batch-inventory.v1',
    `${batchInventoryPath}: unsupported schemaVersion`);
  assert.equal(inventory.batchCount, batches.length, `${batchInventoryPath}: batchCount is stale`);
  assert(Array.isArray(inventory.assignments), `${batchInventoryPath}: assignments must be an array`);
  assert.equal(inventory.sourceCount, inventory.assignments.length, `${batchInventoryPath}: sourceCount is stale`);
  const seen = new Set();
  const counts = Object.fromEntries(batches.map((batch) => [batch.id, 0]));
  const records = inventory.assignments.map((assignment, index) => {
    const label = `${batchInventoryPath}.assignments[${index}]`;
    exactKeys(assignment, ['originalPath', 'legacyPath', 'batchId', 'owner'], label);
    for (const key of ['originalPath', 'legacyPath', 'batchId', 'owner']) {
      assert(typeof assignment[key] === 'string' && assignment[key], `${label}.${key}: must be non-empty`);
    }
    assert(!seen.has(assignment.originalPath), `${batchInventoryPath}: duplicate source ${assignment.originalPath}`);
    seen.add(assignment.originalPath);
    const immutable = baselineByPath.get(assignment.originalPath);
    assert(immutable, `${label}: source is absent from the immutable baseline`);
    assert(['markdown', 'diagram'].includes(immutable.kind), `${label}: unsupported source kind ${immutable.kind}`);
    const expectedLegacyPath = `docs/_legacy-source/${assignment.originalPath.slice('docs/'.length)}`;
    assert.equal(assignment.legacyPath, expectedLegacyPath, `${label}: legacyPath is not derived from originalPath`);
    const matches = batches.filter((batch) => batch.expressions.some((expression) => expression.test(assignment.originalPath)));
    assert.equal(matches.length, 1, `${label}: source must match exactly one configured batch`);
    assert.equal(assignment.batchId, matches[0].id, `${label}: batchId differs from batch configuration`);
    assert.equal(assignment.owner, matches[0].owner, `${label}: owner differs from batch configuration`);
    counts[assignment.batchId] += 1;
    return { originalPath: assignment.originalPath, legacyPath: assignment.legacyPath,
      gitObject: immutable.gitObject, kind: immutable.kind };
  });
  exactKeys(inventory.counts, batches.map((batch) => batch.id), `${batchInventoryPath}.counts`);
  assert.deepEqual(inventory.counts, counts, `${batchInventoryPath}: counts are stale`);
  return { batchSourceSet: sourceSetBinding(records), authoritySourceSet };
}

function loadSources(root) {
  const objectFormat = repositoryObjectFormat(root);
  const baseline = readJson(root, baselinePath);
  const classification = readJson(root, classificationPath);
  exactKeys(baseline, ['schemaVersion', 'baselineRevision', 'files'], baselinePath);
  exactKeys(classification, ['schemaVersion', 'baselineRevision', 'files'], classificationPath);
  assert.equal(baseline.schemaVersion, 'kubeclaw-documentation-tree-baseline.v1', `${baselinePath}: unsupported schemaVersion`);
  assert.equal(classification.schemaVersion, 'kubeclaw-documentation-tree-classification.v1', `${classificationPath}: unsupported schemaVersion`);
  assert(validGitOid(baseline.baselineRevision, objectFormat), `${baselinePath}: invalid baselineRevision`);
  let baselineObjectType;
  try {
    baselineObjectType = git(root, ['cat-file', '-t', baseline.baselineRevision], 'utf8').trim();
  } catch {
    assert.fail(`${baselinePath}: baselineRevision does not resolve directly to a commit`);
  }
  assert.equal(baselineObjectType, 'commit', `${baselinePath}: baselineRevision must resolve directly to a commit`);
  assert.equal(classification.baselineRevision, baseline.baselineRevision, 'classification and baseline revisions differ');
  assert(Array.isArray(baseline.files), `${baselinePath}: files must be an array`);
  assert(Array.isArray(classification.files), `${classificationPath}: files must be an array`);
  const baselineByPath = new Map();
  for (const [index, record] of baseline.files.entries()) {
    exactKeys(record, ['originalPath', 'gitObject', 'mode', 'kind'], `${baselinePath}.files[${index}]`);
    assert(typeof record.originalPath === 'string' && record.originalPath.startsWith('docs/'),
      `${baselinePath}.files[${index}]: invalid originalPath`);
    assert(!baselineByPath.has(record.originalPath), `${baselinePath}: duplicate originalPath ${record.originalPath}`);
    assert(validGitOid(record.gitObject, objectFormat), `${record.originalPath}: invalid Git object`);
    assert(['100644', '100755'].includes(record.mode), `${record.originalPath}: unsupported Git mode ${record.mode}`);
    assert.equal(record.kind, documentationKind(record.originalPath),
      `${record.originalPath}: kind must be derived from its file extension`);
    baselineByPath.set(record.originalPath, record);
  }
  const recordedTree = [...baseline.files].sort((left, right) => compareText(left.originalPath, right.originalPath));
  assert.deepEqual(recordedTree, immutableDocumentationTree(root, baseline.baselineRevision, objectFormat),
    `${baselinePath}: files must exactly enumerate every regular file under docs/ at baselineRevision`);
  const classificationPaths = new Set();
  const classificationOriginalPaths = new Set();
  for (const [index, record] of classification.files.entries()) {
    const label = `${classificationPath}.files[${index}]`;
    exactKeys(record, ['path', 'class', 'purpose', 'originalPath', 'expectedPath', 'introducedAfterBaseline'], label);
    for (const key of ['path', 'class', 'purpose', 'originalPath', 'expectedPath']) {
      assert(typeof record[key] === 'string' && record[key], `${label}.${key}: must be a non-empty string`);
    }
    assert.equal(typeof record.introducedAfterBaseline, 'boolean', `${label}.introducedAfterBaseline: must be boolean`);
    assert(['canonical-reader-documentation', 'internal-documentation-input', 'legacy-extraction-source', 'deletable-remainder'].includes(record.class),
      `${label}: unsupported class ${record.class}`);
    assert.equal(record.path, record.expectedPath, `${label}: path differs from expectedPath`);
    assert(!path.isAbsolute(record.path) && !record.path.split('/').includes('..') && !record.path.includes('\\'),
      `${label}: path must be a normalized repository-relative path`);
    assert(!classificationPaths.has(record.path), `${classificationPath}: duplicate path ${record.path}`);
    assert(!classificationOriginalPaths.has(record.originalPath), `${classificationPath}: duplicate originalPath ${record.originalPath}`);
    classificationPaths.add(record.path);
    classificationOriginalPaths.add(record.originalPath);
    const immutable = baselineByPath.get(record.originalPath);
    assert.equal(Boolean(immutable), !record.introducedAfterBaseline,
      `${label}: introducedAfterBaseline is inconsistent with the immutable baseline`);
    if (record.class === 'legacy-extraction-source') {
      const expectedLegacyPath = `docs/_legacy-source/${record.originalPath.slice('docs/'.length)}`;
      assert(record.originalPath.startsWith('docs/'), `${label}: legacy originalPath must be under docs/`);
      assert.equal(record.path, expectedLegacyPath, `${label}: legacy path does not preserve the original relative path`);
      assert(!record.introducedAfterBaseline, `${label}: legacy source must bind an immutable baseline file`);
      safeRepositoryPath(root, record.path, { label: record.path });
    }
  }
  for (const record of baseline.files) assert(classificationOriginalPaths.has(record.originalPath),
    `${classificationPath}: baseline path is unclassified: ${record.originalPath}`);
  const sources = classification.files.filter((record) => record.class === 'legacy-extraction-source')
    .map((record) => {
      const immutable = baselineByPath.get(record.originalPath);
      assert(immutable, `${record.path}: no immutable baseline record for ${record.originalPath}`);
      assert(['markdown', 'diagram'].includes(immutable.kind), `${record.originalPath}: unsupported legacy source kind ${immutable.kind}`);
      assert(validGitOid(immutable.gitObject, objectFormat), `${record.originalPath}: invalid Git object`);
      const revisionObject = git(root, ['rev-parse', `${baseline.baselineRevision}:${record.originalPath}`], 'utf8').trim();
      assert.equal(revisionObject, immutable.gitObject, `${record.originalPath}: baseline blob does not match baseline revision`);
      const treeEntry = git(root, ['ls-tree', baseline.baselineRevision, '--', record.originalPath], 'utf8').trim();
      const treeMatch = /^(\d{6}) blob ([0-9a-f]+)\t(.+)$/u.exec(treeEntry);
      assert(treeMatch, `${record.originalPath}: baseline path is not a regular blob`);
      assert(validGitOid(treeMatch[2], objectFormat), `${record.originalPath}: ls-tree returned an invalid Git object`);
      assert.equal(treeMatch[1], immutable.mode, `${record.originalPath}: baseline mode does not match baseline revision`);
      assert.equal(treeMatch[2], immutable.gitObject, `${record.originalPath}: ls-tree blob does not match baseline record`);
      assert.equal(treeMatch[3], record.originalPath, `${record.originalPath}: ls-tree path mismatch`);
      return { ...record, gitObject: immutable.gitObject, kind: immutable.kind,
        baselineRevision: baseline.baselineRevision };
    }).sort((left, right) => compareText(left.originalPath, right.originalPath));
  const { batchSourceSet, authoritySourceSet } = loadBatchSourceAuthority(root, baselineByPath,
    baseline.baselineRevision, objectFormat);
  const classifiedSourceSet = sourceSetBinding(sources);
  assert.deepEqual(classifiedSourceSet, authoritySourceSet,
    `${classificationPath}: legacy extraction source set differs from the committed transition authority`);
  assert.deepEqual(classifiedSourceSet, batchSourceSet,
    `${classificationPath}: legacy extraction source set differs from ${batchInventoryPath}`);
  const sourceSetSha256 = sha256(canonical({
    schemaVersion: 'kubeclaw-documentation-parity-source-set.v1',
    baselineRevision: baseline.baselineRevision,
    sources: batchSourceSet,
  }));
  return { baseline, sources, sourceSetSha256 };
}

export function extractionBindingDigest(source, sourceUnits) {
  const digestUnits = [...sourceUnits].sort((left, right) => left.byteStart - right.byteStart
    || compareText(left.unitId, right.unitId));
  return sha256(canonical({
    schemaVersion: 'kubeclaw-documentation-parity-extraction-binding.v2',
    source: {
      originalPath: source.originalPath,
      legacyPath: source.legacyPath ?? source.path,
      baselineRevision: source.baselineRevision,
      gitObject: source.gitObject,
    },
    units: digestUnits,
  }));
}

export function buildParityInventory(root = defaultRoot) {
  const { baseline, sources, sourceSetSha256 } = loadSources(root);
  const units = [];
  const sourceSummaries = [];
  for (const source of sources) {
    const buffer = readVerifiedGitBlob(root, source.gitObject, source.originalPath);
    const legacyBuffer = safeReadFile(root, source.path);
    assert.equal(legacyBuffer.compare(buffer), 0,
      `${source.path}: current legacy source bytes differ from the recorded baseline blob`);
    const sourceUnits = source.kind === 'markdown' ? extractMarkdown(buffer, source) : extractSvg(buffer, source);
    units.push(...sourceUnits);
    const sourceBase = {
      originalPath: source.originalPath,
      legacyPath: source.path,
      baselineRevision: baseline.baselineRevision,
      gitObject: source.gitObject,
    };
    const extractionDigest = extractionBindingDigest(sourceBase, sourceUnits);
    sourceSummaries.push({
      ...sourceBase,
      kind: source.kind,
      bytes: buffer.length,
      sha256: sha256(buffer),
      units: sourceUnits.length,
      unitIdsSha256: sha256(Buffer.from(sourceUnits.map((unit) => unit.unitId).join('\n'))),
      extractionDigest,
    });
  }
  const jsonl = units.length ? `${units.map((unit) => JSON.stringify(unit)).join('\n')}\n` : '';
  const countsByKind = {};
  for (const unit of units) countsByKind[unit.kind] = (countsByKind[unit.kind] ?? 0) + 1;
  const summary = {
    schemaVersion: 'kubeclaw-documentation-parity-summary.v1',
    extractorVersion,
    authority: 'docs/blueprint/AP09-acceptance-contract.md#pflichtuebergang-zwischen-ap098-und-ap099',
    baselineAuthority: baselinePath,
    classificationAuthority: classificationPath,
    batchAuthority: batchInventoryPath,
    baselineRevision: baseline.baselineRevision,
    sourceSetSha256,
    contentReadPolicy: 'git-cat-file-immutable-baseline-blob',
    sourceCount: sources.length,
    markdownSourceCount: sources.filter((source) => source.kind === 'markdown').length,
    svgSourceCount: sources.filter((source) => source.kind === 'diagram').length,
    unitCount: units.length,
    countsByKind: Object.fromEntries(Object.entries(countsByKind).sort(([left], [right]) => compareText(left, right))),
    unitsJsonl: unitsPath,
    unitsJsonlSha256: sha256(Buffer.from(jsonl)),
    sources: sourceSummaries,
  };
  return { units, jsonl, summary, renderedSummary: `${JSON.stringify(summary, null, 2)}\n` };
}

export function runCli({ root = defaultRoot, check = process.argv.includes('--check'), fileSystem = fs } = {}) {
  const built = buildParityInventory(root);
  const outputs = [[unitsPath, built.jsonl], [summaryPath, built.renderedSummary]];
  if (check) {
    for (const [pathname, expected] of outputs) {
      const absolute = safeRepositoryPath(root, pathname, { label: pathname });
      assert.equal(fs.readFileSync(absolute, 'utf8'), expected,
        `${pathname} is stale; run node scripts/docs-parity-extract.mjs`);
    }
    process.stdout.write(`documentation parity inventory passed (${built.summary.sourceCount} sources; ${built.summary.unitCount} units)\n`);
  } else {
    writeOutputPairAtomically(root, outputs, fileSystem);
    process.stdout.write(`generated documentation parity inventory (${built.summary.sourceCount} sources; ${built.summary.unitCount} units)\n`);
  }
  return built;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.every((argument) => argument === '--check') && args.filter((argument) => argument === '--check').length <= 1,
    `unsupported arguments: ${args.join(' ')}`);
  runCli({ check: args.includes('--check') });
}
