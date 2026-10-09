#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = 'docs/generated/inventory/documentation-tree.json';
const classificationPath = 'docs/config/documentation-tree-classification.json';
const baselinePath = 'docs/config/documentation-tree-baseline.json';
const derivedParityRoots = [
  'docs/config/documentation-parity',
  'docs/config/documentation-parity-reviews',
];
const allowedClasses = new Set([
  'canonical-reader-documentation',
  'internal-documentation-input',
  'legacy-extraction-source',
  'deletable-remainder',
]);

export function parseTreeArguments(args) {
  assert(Array.isArray(args), 'arguments must be an array');
  if (args.length === 0) return { mode: 'generate' };
  assert.equal(args.length, 1,
    'use exactly one mode: --check, --bootstrap-classification, or --capture-baseline=<revision>');
  const [argument] = args;
  if (argument === '--check') return { mode: 'check' };
  if (argument === '--bootstrap-classification') return { mode: 'bootstrap-classification' };
  if (argument.startsWith('--capture-baseline=')) {
    const revision = argument.slice('--capture-baseline='.length);
    assert(revision.length > 0, '--capture-baseline requires a Git revision');
    return { mode: 'capture-baseline', revision };
  }
  assert.fail(`unknown argument: ${argument}`);
}

function lstatIfPresent(pathname) {
  try { return fs.lstatSync(pathname); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

function safeTreePath(baseRoot, pathname, { mustExist = true, finalType = 'file', createParents = false } = {}) {
  assert(typeof pathname === 'string' && pathname.length > 0 && !path.isAbsolute(pathname)
    && !pathname.includes('\\') && path.posix.normalize(pathname) === pathname
    && !pathname.split('/').includes('..'), `${pathname}: unsafe repository path`);
  const absoluteRoot = path.resolve(baseRoot);
  const rootStatus = fs.lstatSync(absoluteRoot);
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), 'repository root must be a real directory');
  const parts = pathname.split('/');
  let current = absoluteRoot;
  for (const [index, component] of parts.entries()) {
    current = path.join(current, component);
    const final = index === parts.length - 1;
    const status = lstatIfPresent(current);
    if (!status) {
      if (!final && createParents) {
        fs.mkdirSync(current);
        continue;
      }
      assert(!mustExist, `${pathname}: path is missing`);
      break;
    }
    assert(!status.isSymbolicLink(),
      `${pathname}: symbolic-link path component is forbidden: ${parts.slice(0, index + 1).join('/')}`);
    if (!final) assert(status.isDirectory(),
      `${pathname}: non-directory path component: ${parts.slice(0, index + 1).join('/')}`);
    else if (finalType === 'file') assert(status.isFile(), `${pathname}: must be a regular file`);
    else if (finalType === 'directory') assert(status.isDirectory(), `${pathname}: must be a directory`);
  }
  return path.join(absoluteRoot, ...parts);
}

export function atomicWriteTreeOutput(baseRoot, pathname, content, fileSystem = fs) {
  const absolute = safeTreePath(baseRoot, pathname, { mustExist: false, createParents: true });
  const temporary = path.join(path.dirname(absolute),
    `.${path.basename(absolute)}.tmp-${process.pid}-${crypto.randomBytes(12).toString('hex')}`);
  let descriptor;
  try {
    const flags = fileSystem.constants.O_WRONLY | fileSystem.constants.O_CREAT
      | fileSystem.constants.O_EXCL | fileSystem.constants.O_NOFOLLOW;
    descriptor = fileSystem.openSync(temporary, flags, 0o666);
    fileSystem.writeFileSync(descriptor, content);
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = undefined;
    fileSystem.renameSync(temporary, absolute);
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor);
    try { if (fileSystem.existsSync(temporary)) fileSystem.unlinkSync(temporary); } catch { /* preserve primary error */ }
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function trackedAndUntrackedDocs() {
  const physicalFiles = [];
  const visit = (relativeDirectory) => {
    const absoluteDirectory = path.join(root, relativeDirectory);
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const pathname = path.posix.join(relativeDirectory, entry.name);
      assert(!entry.isSymbolicLink(), `${pathname}: documentation paths may not contain symlinks`);
      if (entry.isDirectory()) visit(pathname);
      else if (entry.isFile()) physicalFiles.push(pathname);
      else assert.fail(`${pathname}: documentation path must be a regular file`);
    }
  };
  if (fs.existsSync(path.join(root, 'docs'))) visit('docs');
  const files = [...new Set([
    ...git(['ls-files', '-z', '--cached', '--others', '--ignored', '--exclude-standard', 'docs'])
      .split('\0').filter(Boolean),
    ...git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'docs'])
      .split('\0').filter(Boolean),
    ...physicalFiles,
  ])].map((value) => value.replaceAll('\\', '/'))
    .filter((value) => {
      try {
        assert(value.startsWith('docs/') && path.posix.normalize(value) === value && !value.split('/').includes('..'),
          `${value}: unsafe documentation path`);
        let cursor = root;
        for (const component of value.split('/')) {
          cursor = path.join(cursor, component);
          const entry = fs.lstatSync(cursor);
          assert(!entry.isSymbolicLink(), `${value}: documentation paths may not contain symlinks`);
        }
        assert(fs.lstatSync(cursor).isFile(), `${value}: documentation path must be a regular file`);
        return true;
      }
      catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
    });
  for (const required of [outputPath, classificationPath, baselinePath]) {
    if (!files.includes(required)) files.push(required);
  }
  return [...new Set(files)].sort();
}

function documentationKind(pathname) {
  const extension = path.extname(pathname).toLowerCase();
  if (extension === '.md') return 'markdown';
  if (extension === '.json' || extension === '.jsonl') return 'structured-json';
  if (extension === '.yaml' || extension === '.yml') return 'structured-yaml';
  if (extension === '.svg') return 'diagram';
  return extension ? extension.slice(1) : 'extensionless';
}

function captureBaseline(revision) {
  const resolved = git(['rev-parse', `${revision}^{commit}`]).trim();
  const records = git(['ls-tree', '-r', '-z', '--full-tree', resolved, '--', 'docs'])
    .split('\0').filter(Boolean).map((line) => {
      const match = /^(\d+)\s+(\S+)\s+([0-9a-f]+)\t(.+)$/u.exec(line);
      assert(match, `cannot parse baseline tree record: ${line}`);
      const [, mode, objectType, gitObject, originalPath] = match;
      assert.equal(objectType, 'blob', `${originalPath}: baseline entry is not a blob`);
      return { originalPath, gitObject, mode, kind: documentationKind(originalPath) };
    }).sort((a, b) => a.originalPath.localeCompare(b.originalPath));
  const value = {
    schemaVersion: 'kubeclaw-documentation-tree-baseline.v1',
    baselineRevision: resolved,
    files: records,
  };
  atomicWriteTreeOutput(root, baselinePath, `${JSON.stringify(value, null, 2)}\n`);
  process.stdout.write(`captured ${records.length} documentation files from ${resolved}\n`);
}

function sourceConsumers(documentPaths) {
  const currentByToken = new Map();
  for (const pathname of documentPaths) {
    currentByToken.set(pathname, pathname);
    if (pathname.startsWith('docs/_legacy-source/')) {
      currentByToken.set(`docs/${pathname.slice('docs/_legacy-source/'.length)}`, pathname);
    }
  }
  const consumers = new Map(documentPaths.map((value) => [value, []]));
  const recordConsumer = (currentPath, sourcePath, token, inputUse = false) => {
    if (!currentPath || sourcePath === currentPath) return;
    const values = consumers.get(currentPath);
    const existing = values.find((item) => item.sourcePath === sourcePath && item.token === token);
    if (existing) existing.inputUse ||= inputUse;
    else values.push({ sourcePath, token, inputUse });
  };
  const fileInputAnalysis = (text) => {
    const names = new Set(['readFileSync', 'readFile', 'createReadStream', 'openSync']);
    for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:fs\s*\.\s*)?(readFileSync|readFile|createReadStream|openSync)\b/gu)) {
      names.add(match[1]);
    }
    for (const match of text.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*["']node:fs["']/gu)) {
      for (const binding of match[1].split(',')) {
        const alias = /^\s*(readFileSync|readFile|createReadStream|openSync)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?\s*$/u.exec(binding);
        if (alias) names.add(alias[2] ?? alias[1]);
      }
    }
    for (const match of text.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*fs\b/gu)) {
      for (const binding of match[1].split(',')) {
        const alias = /^\s*(readFileSync|readFile|createReadStream|openSync)(?:\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*))?\s*$/u.exec(binding);
        if (alias) names.add(alias[2] ?? alias[1]);
      }
    }
    const pendingOpenings = new Set();
    const parentheses = [];
    const ranges = [];
    const identifiers = new Set();
    const templateExpressions = [];
    let cursor = 0;
    while (cursor < text.length) {
      const character = text[cursor];
      const next = text[cursor + 1];
      if (character === '/' && next === '/') {
        cursor = text.indexOf('\n', cursor + 2);
        if (cursor < 0) break;
        continue;
      }
      if (character === '/' && next === '*') {
        const close = text.indexOf('*/', cursor + 2);
        cursor = close < 0 ? text.length : close + 2;
        continue;
      }
      if (character === '`') {
        cursor += 1;
        while (cursor < text.length) {
          if (text[cursor] === '\\') { cursor += 2; continue; }
          if (text[cursor] === '`') { cursor += 1; break; }
          if (text[cursor] === '$' && text[cursor + 1] === '{') {
            const start = cursor + 2;
            let end = start;
            let depth = 1;
            let quote = null;
            for (; end < text.length && depth > 0; end += 1) {
              const nested = text[end];
              if (quote) {
                if (nested === '\\') end += 1;
                else if (nested === quote) quote = null;
                continue;
              }
              if (nested === '"' || nested === "'") { quote = nested; continue; }
              if (nested === '{') depth += 1;
              else if (nested === '}') depth -= 1;
            }
            if (depth === 0) templateExpressions.push([start, end - 1]);
            cursor = end;
            continue;
          }
          cursor += 1;
        }
        continue;
      }
      if (character === '"' || character === "'") {
        const quote = character;
        cursor += 1;
        while (cursor < text.length) {
          if (text[cursor] === '\\') cursor += 2;
          else if (text[cursor] === quote) { cursor += 1; break; }
          else cursor += 1;
        }
        continue;
      }
      if (/[A-Za-z_$]/u.test(character)) {
        let end = cursor + 1;
        while (end < text.length && /[A-Za-z0-9_$]/u.test(text[end])) end += 1;
        const identifier = text.slice(cursor, end);
        if (parentheses.some((entry) => entry.fileInput)) identifiers.add(identifier);
        let opening = end;
        while (/\s/u.test(text[opening] ?? '')) opening += 1;
        if (names.has(identifier) && text[opening] === '(') pendingOpenings.add(opening);
        cursor = end;
        continue;
      }
      if (character === '(') parentheses.push({ opening: cursor, fileInput: pendingOpenings.delete(cursor) });
      else if (character === ')') {
        const opened = parentheses.pop();
        if (opened?.fileInput) ranges.push([opened.opening, cursor]);
      }
      cursor += 1;
    }
    for (const opened of parentheses) if (opened.fileInput) ranges.push([opened.opening, text.length]);
    for (const [start, end] of templateExpressions) {
      const nested = fileInputAnalysis(text.slice(start, end));
      for (const [opening, closing] of nested.ranges) ranges.push([opening + start, closing + start]);
      for (const identifier of nested.identifiers) identifiers.add(identifier);
    }
    return { ranges: ranges.sort((left, right) => left[0] - right[0]), identifiers };
  };
  const fileInputUse = (text, start, callRanges) => {
    const prefix = text.slice(Math.max(0, start - 240), start);
    return callRanges.some(([opening, closing]) => opening < start && start < closing)
      || /(?:\bcat\s+[^\n;]*|(?:^|[;&|]\s*)<\s*)$/u.test(prefix);
  };
  const staticPathAssignments = (text, sourcePath, inputIdentifiers) => {
    const assignments = [];
    const values = new Map();
    const declarations = () => {
      const result = [];
      const startPattern = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/gu;
      for (const match of text.matchAll(startPattern)) {
        let cursor = match.index + match[0].length;
        const start = cursor;
        let quote = null;
        const stack = [];
        for (; cursor < text.length; cursor += 1) {
          const character = text[cursor];
          if (quote) {
            if (character === '\\') cursor += 1;
            else if (character === quote) quote = null;
            continue;
          }
          if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
          if ('([{'.includes(character)) stack.push(character);
          else if (')]}'.includes(character)) stack.pop();
          else if (stack.length === 0 && (character === ';' || character === '\n')) break;
        }
        const parts = splitTopLevel(text.slice(start, cursor), ',');
        result.push({ identifier: match[1], expression: parts[0], index: match.index });
        for (const [offset, part] of parts.slice(1).entries()) {
          const additional = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([\s\S]+)$/u.exec(part);
          if (additional) result.push({ identifier: additional[1], expression: additional[2],
            index: match.index + offset + 1 });
        }
      }
      for (const match of text.matchAll(/(?:^|[;\n])\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;\n]+)/gmu)) {
        result.push({ identifier: match[1], expression: match[2], index: match.index });
      }
      return result.sort((left, right) => left.index - right.index);
    };
    const splitTopLevel = (source, separator) => {
      const pieces = [];
      let start = 0;
      let quote = null;
      const stack = [];
      for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
          if (character === '\\') index += 1;
          else if (character === quote) quote = null;
          continue;
        }
        if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
        if ('([{'.includes(character)) stack.push(character);
        else if (')]}'.includes(character)) stack.pop();
        else if (character === separator && stack.length === 0) {
          pieces.push(source.slice(start, index));
          start = index + 1;
        }
      }
      pieces.push(source.slice(start));
      return pieces;
    };
    const literal = (source) => {
      const match = /^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`([^`$]*)`)$/u.exec(source.trim());
      if (!match) return null;
      const raw = match[1] ?? match[2] ?? match[3];
      return raw.replace(/\\([\\"'`])/gu, '$1');
    };
    const evaluate = (source) => {
      let trimmed = source.trim();
      if (/^\([\s\S]*\)$/u.test(trimmed)) trimmed = trimmed.slice(1, -1).trim();
      const direct = literal(trimmed);
      if (direct !== null) return direct;
      const template = /^`((?:\\.|[^`])*)`$/u.exec(trimmed);
      if (template) {
        let valid = true;
        const expanded = template[1].replace(/\$\{([A-Za-z_$][A-Za-z0-9_$]*)\}/gu, (_whole, identifier) => {
          const replacement = values.get(identifier);
          if (replacement === undefined) { valid = false; return ''; }
          return replacement;
        });
        return valid && !/\$\{/u.test(expanded) ? expanded : null;
      }
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(trimmed)) return values.get(trimmed) ?? null;
      const plus = splitTopLevel(trimmed, '+');
      if (plus.length > 1) {
        const parts = plus.map(evaluate);
        return parts.every((part) => part !== null) ? parts.join('') : null;
      }
      const joined = /^\[([\s\S]*)\]\.join\(\s*(["'`])\/\2\s*\)$/u.exec(trimmed);
      if (joined) {
        const parts = splitTopLevel(joined[1], ',').map(evaluate);
        return parts.length > 0 && parts.every((part) => part !== null) ? parts.join('/') : null;
      }
      const pathJoin = /^path(?:\.posix)?\.join\(([\s\S]*)\)$/u.exec(trimmed);
      if (pathJoin) {
        const parts = splitTopLevel(pathJoin[1], ',').filter((part) => part.trim()).map(evaluate);
        return parts.length > 0 && parts.every((part) => part !== null) ? path.posix.join(...parts) : null;
      }
      const pathResolve = /^path(?:\.posix)?\.resolve\(([\s\S]*)\)$/u.exec(trimmed);
      if (pathResolve) {
        const parts = splitTopLevel(pathResolve[1], ',').filter((part) => part.trim()).map(evaluate);
        if (parts.length > 0 && parts.every((part) => part !== null)) {
          return path.relative(root, path.resolve(root, ...parts)).split(path.sep).join('/');
        }
      }
      const url = /^new\s+URL\s*\(\s*([\s\S]+),\s*import\.meta\.url\s*\)$/u.exec(trimmed);
      if (url) {
        const target = evaluate(url[1]);
        if (target === null) return null;
        return target.startsWith('docs/') ? path.posix.normalize(target)
          : path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), target));
      }
      return null;
    };
    for (const { identifier, expression } of declarations()) {
      const token = evaluate(expression);
      if (token !== null) values.set(identifier, token);
      if (!token || !currentByToken.has(token)) continue;
      assignments.push({ token, inputUse: inputIdentifiers.has(identifier) });
    }
    const calls = [];
    for (const [opening, closing] of fileInputAnalysis(text).ranges) {
      const firstArgument = splitTopLevel(text.slice(opening + 1, closing), ',')[0] ?? '';
      const token = evaluate(firstArgument);
      if (token && currentByToken.has(token)) calls.push({ token, inputUse: true });
    }
    return [...assignments, ...calls];
  };
  const sourceFiles = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)
    .filter((value) => !value.startsWith('docs/_legacy-source/')
      && value !== outputPath
      && !value.startsWith('docs/generated/inventory/documentation-parity-')
      && !value.startsWith('docs/blueprint/generated/'));
  for (const sourcePath of sourceFiles) {
    const absolute = path.join(root, sourcePath);
    let buffer;
    try {
      buffer = fs.readFileSync(absolute);
    } catch {
      continue;
    }
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    const javascriptSource = /\.(?:[cm]?[jt]sx?|mts|cts)$/u.test(sourcePath);
    const inputAnalysis = javascriptSource ? fileInputAnalysis(text) : { ranges: [], identifiers: new Set() };
    const callRanges = inputAnalysis.ranges;
    if (javascriptSource) {
      for (const assignment of staticPathAssignments(text, sourcePath, inputAnalysis.identifiers)) {
        recordConsumer(currentByToken.get(assignment.token), sourcePath, assignment.token, assignment.inputUse);
      }
    }
    let cursor = 0;
    while ((cursor = text.indexOf('docs/', cursor)) >= 0) {
      let end = cursor + 5;
      while (end < text.length && /[A-Za-z0-9_./@+:-]/u.test(text[end])) end += 1;
      const token = text.slice(cursor, end).replace(/[.:]+$/u, '');
      const currentPath = currentByToken.get(token);
      recordConsumer(currentPath, sourcePath, token, fileInputUse(text, cursor, callRanges));
      cursor = Math.max(end, cursor + 5);
    }
    const joinedPath = /\[\s*((?:["'][^"']+["']\s*,\s*)*["'][^"']+["'])\s*\]\s*\.join\(\s*["']\/["']\s*\)/gu;
    for (const match of text.matchAll(joinedPath)) {
      const pieces = [...match[1].matchAll(/["']([^"']+)["']/gu)].map((item) => item[1]);
      const token = pieces.join('/');
      recordConsumer(currentByToken.get(token), sourcePath, token, fileInputUse(text, match.index, callRanges));
    }
    const pathJoin = /\bpath(?:\.posix)?\.join\(\s*((?:["'][^"']*["']\s*,\s*)+["'][^"']*["'])\s*\)/gu;
    for (const match of text.matchAll(pathJoin)) {
      const pieces = [...match[1].matchAll(/["']([^"']*)["']/gu)].map((item) => item[1]);
      const token = path.posix.join(...pieces);
      recordConsumer(currentByToken.get(token), sourcePath, token, fileInputUse(text, match.index, callRanges));
    }
  }
  for (const values of consumers.values()) values.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)
    || a.token.localeCompare(b.token));
  return consumers;
}

function executableConsumers(values) {
  const documentationOnlyConsumer = (sourcePath) => sourcePath === 'scripts/ap08-review-scope.mjs'
    || sourcePath.startsWith('scripts/check-ap08-')
    || sourcePath.startsWith('scripts/docs-');
  const executableYaml = (sourcePath) => sourcePath.startsWith('.github/workflows/')
    || sourcePath.startsWith('.github/actions/')
    || sourcePath.startsWith('charts/')
    || sourcePath.startsWith('config/')
    || sourcePath.startsWith('deploy/')
    || sourcePath.startsWith('docker/')
    || sourcePath.startsWith('my-values/')
    || sourcePath.startsWith('skills/')
    || ['.gitlab-ci.yml', 'azure-pipelines.yml', 'docker-compose.yml', 'docker-compose.yaml',
      'compose.yml', 'compose.yaml'].includes(sourcePath);
  return values.filter(({ sourcePath }) => {
    if (sourcePath.startsWith('docs/') || documentationOnlyConsumer(sourcePath) || sourcePath.endsWith('.md')) return false;
    if (sourcePath.endsWith('.yaml') || sourcePath.endsWith('.yml')) return executableYaml(sourcePath);
    return true;
  });
}

function canonicalDocumentationTooling(sourcePath) {
  return sourcePath.startsWith('scripts/docs-')
    || sourcePath.startsWith('scripts/tests/docs-')
    || /^scripts\/check-(?:ap08-[^/]*guide|[^/]+-guides)\.mjs$/u.test(sourcePath)
    || /^scripts\/check-configuration-(?:cli-)?drift(?:-mutations)?\.mjs$/u.test(sourcePath)
    || /^scripts\/generate-[^/]+-(?:reference|registry)\.mjs$/u.test(sourcePath)
    || /^tests\/verification\/[^/]+\/[^/]*documentation\.[cm]?[jt]s$/u.test(sourcePath)
    || sourcePath === 'scripts/ap08-review-scope.mjs'
    || sourcePath === 'scripts/check-suite-migration-workflow.mjs';
}

function canonicalExecutableConsumers(values) {
  return executableConsumers(values)
    .filter(({ sourcePath, inputUse }) => inputUse && !canonicalDocumentationTooling(sourcePath));
}

function provenanceOnlyDocument(pathname) {
  return pathname === baselinePath
    || pathname === classificationPath
    || pathname === outputPath
    || pathname === 'docs/config/documentation-parity-batches.json'
    || pathname === 'docs/config/documentation-parity-review-assignments.json'
    || pathname.startsWith('docs/config/documentation-parity/')
    || pathname.startsWith('docs/config/documentation-parity-reviews/')
    || pathname.startsWith('docs/site/')
    || pathname.startsWith('docs/blueprint/')
    || pathname.startsWith('docs/review/')
    || pathname.startsWith('docs/generated/')
    || pathname.startsWith('docs/status/');
}

function structuredDependencyDocument(pathname) {
  return ['.json', '.jsonl', '.yaml', '.yml', '.tsv', '.csv']
    .includes(path.extname(pathname).toLowerCase());
}

function executableDocumentDependencies(documentPaths, consumers) {
  const direct = new Map();
  const indirect = new Map(documentPaths.map((pathname) => [pathname, []]));
  const targetsByDocument = new Map();

  for (const pathname of documentPaths) {
    const roots = executableConsumers(consumers.get(pathname) ?? []).map(({ sourcePath }) => sourcePath);
    direct.set(pathname, [...new Set(roots)].sort());
    for (const { sourcePath } of consumers.get(pathname) ?? []) {
      if (!sourcePath.startsWith('docs/')) continue;
      const targets = targetsByDocument.get(sourcePath) ?? new Set();
      targets.add(pathname);
      targetsByDocument.set(sourcePath, targets);
    }
  }

  const queue = [];
  const visited = new Set();
  for (const [pathname, roots] of direct) {
    for (const rootSource of roots) queue.push({ pathname, rootSource, chain: [pathname], direct: true });
  }

  while (queue.length) {
    const current = queue.shift();
    const visitKey = `${current.pathname}\0${current.rootSource}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    if (provenanceOnlyDocument(current.pathname)) continue;
    if (!current.direct && !structuredDependencyDocument(current.pathname)) continue;

    for (const target of targetsByDocument.get(current.pathname) ?? []) {
      if (target === current.pathname) continue;
      const evidence = {
        executableSource: current.rootSource,
        via: current.chain,
      };
      const evidenceKey = JSON.stringify(evidence);
      const existing = indirect.get(target);
      if (!existing.some((item) => JSON.stringify(item) === evidenceKey)) existing.push(evidence);
      queue.push({
        pathname: target,
        rootSource: current.rootSource,
        chain: [...current.chain, target],
        direct: false,
      });
    }
  }

  for (const values of indirect.values()) values.sort((a, b) => a.executableSource.localeCompare(b.executableSource)
    || a.via.join('\0').localeCompare(b.via.join('\0')));
  return { direct, indirect };
}

function historicalReferenceConsumer(sourcePath) {
  return sourcePath === baselinePath
    || sourcePath === classificationPath
    || sourcePath === 'docs/config/documentation-parity-review-assignments.json'
    || sourcePath === 'docs/config/documentation-parity-batches.json'
    || sourcePath.startsWith('docs/config/documentation-parity/')
    || sourcePath.startsWith('docs/config/documentation-parity-reviews/')
    || sourcePath.startsWith('docs/generated/inventory/documentation-parity-')
    || sourcePath.startsWith('docs/blueprint/')
    || sourcePath.startsWith('docs/architecture/')
    || sourcePath.startsWith('docs/review/')
    || sourcePath.startsWith('docs/implementation/')
    || sourcePath.startsWith('docs/spikes/')
    || sourcePath.startsWith('docs/status/')
    || sourcePath === 'scripts/docs-blueprint-generate.mjs'
    || sourcePath === 'scripts/docs-check-refs.mjs';
}

function internalRoot(pathname) {
  if (pathname === 'docs/README.md') return 'documentation-tree boundary entry';
  if (pathname === 'docs/operator-tasks.json') return 'operator task registry authority';
  if (pathname === 'docs/decisions/fallback-cleanup-ledger.tsv') return 'decision extraction ledger';
  if (pathname.startsWith('docs/blueprint/')) return 'documentation governance and acceptance input';
  if (pathname.startsWith('docs/generated/')) return 'generated documentation support';
  if (pathname.startsWith('docs/config/')) return 'documentation configuration authority';
  if (pathname.startsWith('docs/examples/')) return 'documentation fixture input';
  if (pathname.startsWith('docs/status/')) return 'machine-readable product status authority';
  return null;
}

function classify(pathname, consumers, dependencies) {
  if (pathname.startsWith('docs/site/')) return {
    class: 'canonical-reader-documentation',
    purpose: 'Published, user-facing KubeClaw documentation.',
    originalPath: pathname,
    expectedPath: pathname,
  };
  if (pathname.startsWith('docs/_legacy-source/')) {
    const originalPath = `docs/${pathname.slice('docs/_legacy-source/'.length)}`;
    const executable = executableConsumers(consumers.get(pathname) ?? []);
    const indirectExecutable = dependencies.indirect.get(pathname) ?? [];
    if (executable.length || indirectExecutable.length) return {
      class: 'internal-documentation-input',
      purpose: 'Executable contract, fixture, or evidence input used outside the documentation tree.',
      originalPath,
      expectedPath: originalPath,
    };
    return {
      class: 'legacy-extraction-source',
      purpose: 'Temporary source retained only until statement-level parity and AP10 deletion approval.',
      originalPath,
      expectedPath: pathname,
    };
  }
  const internalPurpose = internalRoot(pathname);
  if (internalPurpose) return {
    class: 'internal-documentation-input',
    purpose: internalPurpose,
    originalPath: pathname,
    expectedPath: pathname,
  };
  const executable = executableConsumers(consumers.get(pathname) ?? []);
  const indirectExecutable = dependencies.indirect.get(pathname) ?? [];
  if (executable.length || indirectExecutable.length) return {
    class: 'internal-documentation-input',
    purpose: 'Executable contract, fixture, or evidence input used outside the documentation tree.',
    originalPath: pathname,
    expectedPath: pathname,
  };
  if (pathname.startsWith('docs/review/')
    || pathname.startsWith('docs/implementation/')
    || pathname.startsWith('docs/spikes/')
    || (pathname.startsWith('docs/architecture/') && path.extname(pathname) !== '.md')) return {
    class: 'deletable-remainder',
    purpose: 'Historical work output with no detected executable consumer; AP10 owns deletion proof.',
    originalPath: pathname,
    expectedPath: pathname,
  };
  return {
    class: 'legacy-extraction-source',
    purpose: 'Previous reader-facing source awaiting statement-level parity and AP10 deletion approval.',
    originalPath: pathname,
    expectedPath: `docs/_legacy-source/${pathname.slice('docs/'.length)}`,
  };
}

function parityRoot(pathname) {
  return derivedParityRoots.find((candidate) => pathname.startsWith(`${candidate}/`)) ?? null;
}

function derivedParityClassification(pathname, classification) {
  const rootPath = parityRoot(pathname);
  if (!rootPath) return null;
  const entry = fs.lstatSync(path.join(root, pathname));
  assert(!entry.isSymbolicLink() && entry.isFile(),
    `${pathname}: documentation parity input must be a repository-internal regular file`);
  assert.equal(path.extname(pathname), '.json',
    `${pathname}: documentation parity decision and review inputs must be JSON files`);
  const expected = new Set(classification.value.files
    .filter((record) => record.class === 'legacy-extraction-source')
    .map((record) => `${rootPath}/${record.originalPath.slice('docs/'.length)}.json`));
  assert(expected.has(pathname),
    `${pathname}: documentation parity input does not belong to a classified legacy source`);
  return {
    path: pathname,
    class: 'internal-documentation-input',
    purpose: rootPath.endsWith('-reviews')
      ? 'documentation parity review input'
      : 'documentation parity decision input',
    originalPath: pathname,
    expectedPath: pathname,
    introducedAfterBaseline: true,
  };
}

function sha256(pathname) {
  if (pathname === outputPath) return null;
  const absolute = path.join(root, pathname);
  return fs.existsSync(absolute) ? crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') : null;
}

function readJson(pathname) {
  return JSON.parse(fs.readFileSync(safeTreePath(root, pathname), 'utf8'));
}

function classificationRegistry() {
  assert(fs.existsSync(path.join(root, classificationPath)),
    `${classificationPath} is missing; each documentation file needs an explicit classification`);
  const value = readJson(classificationPath);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-tree-classification.v1',
    `${classificationPath}: unsupported schemaVersion`);
  assert(Array.isArray(value.files), `${classificationPath}: files must be an array`);
  const records = new Map();
  for (const record of value.files) {
    assert(record && typeof record === 'object' && typeof record.path === 'string',
      `${classificationPath}: invalid record`);
    assert(!records.has(record.path), `${classificationPath}: duplicate path ${record.path}`);
    assert(allowedClasses.has(record.class), `${record.path}: invalid explicit documentation class`);
    for (const field of ['purpose', 'originalPath', 'expectedPath']) {
      assert(typeof record[field] === 'string' && record[field], `${record.path}: missing ${field}`);
    }
    assert.equal(typeof record.introducedAfterBaseline, 'boolean',
      `${record.path}: introducedAfterBaseline must be Boolean`);
    records.set(record.path, record);
  }
  return { value, records };
}

function baselineRegistry() {
  assert(fs.existsSync(path.join(root, baselinePath)), `${baselinePath} is missing`);
  const value = readJson(baselinePath);
  assert.equal(value.schemaVersion, 'kubeclaw-documentation-tree-baseline.v1',
    `${baselinePath}: unsupported schemaVersion`);
  const objectFormat = git(['rev-parse', '--show-object-format']).trim();
  assert(['sha1', 'sha256'].includes(objectFormat), `unsupported Git object format ${objectFormat}`);
  const objectId = objectFormat === 'sha256' ? /^[0-9a-f]{64}$/u : /^[0-9a-f]{40}$/u;
  assert(objectId.test(value.baselineRevision), `${baselinePath}: invalid baselineRevision for ${objectFormat}`);
  const records = new Map();
  for (const record of value.files ?? []) {
    assert(typeof record.originalPath === 'string' && objectId.test(record.gitObject),
      `${baselinePath}: invalid baseline record`);
    assert(!records.has(record.originalPath), `${baselinePath}: duplicate ${record.originalPath}`);
    records.set(record.originalPath, record);
  }
  return { value, records };
}

function writeInitialClassification() {
  const paths = trackedAndUntrackedDocs();
  const consumers = sourceConsumers(paths);
  const dependencies = executableDocumentDependencies(paths, consumers);
  const baseline = baselineRegistry();
  const files = paths.filter((pathname) => !parityRoot(pathname)).map((pathname) => {
    const value = classify(pathname, consumers, dependencies);
    return {
      path: pathname,
      class: value.class,
      purpose: value.purpose,
      originalPath: value.originalPath,
      expectedPath: value.expectedPath,
      introducedAfterBaseline: !baseline.records.has(value.originalPath),
    };
  });
  const value = {
    schemaVersion: 'kubeclaw-documentation-tree-classification.v1',
    baselineRevision: baseline.value.baselineRevision,
    files,
  };
  atomicWriteTreeOutput(root, classificationPath, `${JSON.stringify(value, null, 2)}\n`);
  process.stdout.write(`created explicit classifications for ${files.length} documentation files\n`);
}

function build() {
  const paths = trackedAndUntrackedDocs();
  const consumers = sourceConsumers(paths);
  const dependencies = executableDocumentDependencies(paths, consumers);
  const classification = classificationRegistry();
  const baseline = baselineRegistry();
  assert.equal(classification.value.baselineRevision, baseline.value.baselineRevision,
    'classification and immutable baseline revisions differ');
  for (const pathname of classification.records.keys()) {
    assert(!parityRoot(pathname),
      `${pathname}: documentation parity decision and review classifications are derived, not explicit`);
  }
  const derived = new Map(paths.filter((pathname) => parityRoot(pathname))
    .map((pathname) => [pathname, derivedParityClassification(pathname, classification)]));
  const current = new Set(paths);
  const unclassified = paths.filter((pathname) => !classification.records.has(pathname) && !derived.has(pathname));
  const absentClassifications = [...classification.records.keys()].filter((pathname) => !current.has(pathname));
  assert.equal(unclassified.length, 0,
    `unclassified documentation files: ${unclassified.slice(0, 30).join(', ')}`);
  assert.equal(absentClassifications.length, 0,
    `classification records have no current file: ${absentClassifications.slice(0, 30).join(', ')}`);
  const files = paths.map((pathname) => {
    const declared = derived.get(pathname) ?? classification.records.get(pathname);
    const directExecutable = executableConsumers(consumers.get(pathname) ?? []);
    const canonicalExecutable = canonicalExecutableConsumers(consumers.get(pathname) ?? []);
    const indirectExecutable = dependencies.indirect.get(pathname) ?? [];
    assert(allowedClasses.has(declared.class), `${pathname}: invalid documentation class`);
    if (pathname.startsWith('docs/site/')) assert.equal(declared.class, 'canonical-reader-documentation',
      `${pathname}: every site file must be canonical reader documentation`);
    if (declared.class === 'canonical-reader-documentation') assert(pathname.startsWith('docs/site/'),
      `${pathname}: canonical reader documentation must be under docs/site/`);
    if (declared.class === 'canonical-reader-documentation') {
      assert.equal(canonicalExecutable.length, 0,
        `${pathname}: canonical reader documentation cannot be an executable input`);
    }
    if (declared.class === 'legacy-extraction-source') {
      assert(pathname.startsWith('docs/_legacy-source/'), `${pathname}: legacy source is outside the legacy root`);
      assert.equal(directExecutable.length, 0,
        `${pathname}: an executable source consumes this file, so it cannot be a legacy reader source`);
      assert.equal(indirectExecutable.length, 0,
        `${pathname}: an executable source consumes this file through a documentation dependency, so it cannot be a legacy reader source: ${JSON.stringify(indirectExecutable.slice(0, 5))}`);
    }
    if (!pathname.startsWith('docs/site/') && (directExecutable.length || indirectExecutable.length)) {
      assert.equal(declared.class, 'internal-documentation-input',
        `${pathname}: executable-reachable documentation must be classified as internal-documentation-input`);
    }
    if (declared.class !== 'legacy-extraction-source') assert(!pathname.startsWith('docs/_legacy-source/'),
      `${pathname}: non-legacy input was placed in the legacy root`);
    return {
      path: pathname,
      class: declared.class,
      purpose: declared.purpose,
      originalPath: declared.originalPath,
      expectedPath: declared.expectedPath,
      introducedAfterBaseline: declared.introducedAfterBaseline,
      locationValid: pathname === declared.expectedPath,
      consumers: consumers.get(pathname) ?? [],
      executableConsumers: directExecutable.map((item) => item.sourcePath),
      indirectExecutableConsumers: indirectExecutable,
      sha256: sha256(pathname),
    };
  });
  const byOriginal = new Map();
  for (const file of files) {
    assert(!byOriginal.has(file.originalPath), `two current files claim baseline path ${file.originalPath}`);
    byOriginal.set(file.originalPath, file);
    assert.equal(file.introducedAfterBaseline, !baseline.records.has(file.originalPath),
      `${file.path}: introducedAfterBaseline disagrees with the immutable baseline`);
  }
  const missingBaselineFiles = [...baseline.records.keys()].filter((originalPath) => !byOriginal.has(originalPath));
  assert.equal(missingBaselineFiles.length, 0,
    `baseline documentation disappeared without deletion approval: ${missingBaselineFiles.slice(0, 30).join(', ')}`);
  for (const file of files.filter((item) => item.class === 'legacy-extraction-source')) {
    const baselineRecord = baseline.records.get(file.originalPath);
    assert(baselineRecord, `${file.path}: legacy source has no immutable baseline identity`);
    const object = git(['hash-object', '--', file.path]).trim();
    assert.equal(object, baselineRecord.gitObject,
      `${file.path}: legacy extraction bytes changed; extract to docs/site instead of editing the source`);
  }
  const counts = Object.fromEntries([...allowedClasses].map((value) => [value,
    files.filter((file) => file.class === value).length]));
  const misplaced = files.filter((file) => !file.locationValid)
    .map((file) => ({ path: file.path, expectedPath: file.expectedPath }));
  const staleLegacyReferences = files.filter((file) => file.class === 'legacy-extraction-source')
    .flatMap((file) => file.consumers
      .filter(({ sourcePath, token }) => !historicalReferenceConsumer(sourcePath)
        && (token === file.originalPath || sourcePath.startsWith('docs/site/')))
      .map(({ sourcePath, token }) => ({ sourcePath, referencedPath: token, legacyPath: file.path })))
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)
      || a.referencedPath.localeCompare(b.referencedPath));
  return {
    schemaVersion: 'kubeclaw-documentation-tree.v1',
    authority: 'docs/blueprint/AP09-acceptance-contract.md#pflichtuebergang-zwischen-ap098-und-ap099',
    canonicalReaderRoot: 'docs/site/',
    legacyExtractionRoot: 'docs/_legacy-source/',
    internalRoots: ['docs/blueprint/', 'docs/generated/', 'docs/config/', 'docs/examples/', 'docs/status/'],
    baselineRevision: baseline.value.baselineRevision,
    classificationAuthority: classificationPath,
    baselineAuthority: baselinePath,
    baselineFiles: baseline.records.size,
    missingBaselineFiles,
    counts,
    misplaced,
    staleLegacyReferences,
    files,
  };
}

function main() {
  const options = parseTreeArguments(process.argv.slice(2));
  if (options.mode === 'capture-baseline') {
    captureBaseline(options.revision);
    return;
  }
  if (options.mode === 'bootstrap-classification') {
    writeInitialClassification();
    return;
  }

  const value = build();
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  if (options.mode === 'check') {
    const absoluteOutput = safeTreePath(root, outputPath);
    assert.equal(fs.readFileSync(absoluteOutput, 'utf8'), rendered,
      `${outputPath} is stale; run npm run docs:tree:generate`);
    assert.equal(value.misplaced.length, 0,
      `legacy reader sources remain outside docs/_legacy-source/: ${value.misplaced.slice(0, 20)
        .map((item) => `${item.path} -> ${item.expectedPath}`).join(', ')}`);
    assert.equal(value.staleLegacyReferences.length, 0,
      `active files still reference legacy reader paths: ${value.staleLegacyReferences.slice(0, 30)
        .map((item) => `${item.sourcePath} -> ${item.referencedPath}`).join(', ')}`);
    process.stdout.write(`documentation tree boundary passed (${value.files.length} files; ${JSON.stringify(value.counts)})\n`);
  } else {
    atomicWriteTreeOutput(root, outputPath, rendered);
    process.stdout.write(`generated ${outputPath} (${value.files.length} files; ${value.misplaced.length} misplaced legacy sources)\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
