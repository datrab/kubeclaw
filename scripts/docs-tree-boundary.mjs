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
const checkOnly = process.argv.includes('--check');
const bootstrapClassification = process.argv.includes('--bootstrap-classification');
const captureBaselineArgument = process.argv.find((value) => value.startsWith('--capture-baseline='));
const allowedClasses = new Set([
  'canonical-reader-documentation',
  'internal-documentation-input',
  'legacy-extraction-source',
  'deletable-remainder',
]);

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function trackedAndUntrackedDocs() {
  const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'docs'])
    .split('\0').filter(Boolean).map((value) => value.replaceAll('\\', '/'))
    .filter((value) => fs.existsSync(path.join(root, value)));
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
  fs.mkdirSync(path.dirname(path.join(root, baselinePath)), { recursive: true });
  fs.writeFileSync(path.join(root, baselinePath), `${JSON.stringify(value, null, 2)}\n`);
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
  const sourceFiles = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)
    .filter((value) => !value.startsWith('docs/_legacy-source/')
      && value !== outputPath
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
    let cursor = 0;
    while ((cursor = text.indexOf('docs/', cursor)) >= 0) {
      let end = cursor + 5;
      while (end < text.length && /[A-Za-z0-9_./@+:-]/u.test(text[end])) end += 1;
      const token = text.slice(cursor, end).replace(/[.:]+$/u, '');
      const currentPath = currentByToken.get(token);
      if (currentPath && sourcePath !== currentPath) consumers.get(currentPath).push({ sourcePath, token });
      cursor = Math.max(end, cursor + 5);
    }
  }
  for (const values of consumers.values()) values.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)
    || a.token.localeCompare(b.token));
  return consumers;
}

function executableConsumers(values) {
  const metadataOnly = new Set(['scripts/docs-blueprint-generate.mjs', 'scripts/docs-check-refs.mjs']);
  return values.filter(({ sourcePath }) => !sourcePath.startsWith('docs/')
    && !metadataOnly.has(sourcePath)
    && !sourcePath.endsWith('.md')
    && !sourcePath.endsWith('.yaml') && !sourcePath.endsWith('.yml'));
}

function provenanceOnlyDocument(pathname) {
  return pathname === baselinePath
    || pathname === classificationPath
    || pathname === outputPath
    || pathname.startsWith('docs/site/')
    || pathname.startsWith('docs/blueprint/')
    || pathname.startsWith('docs/review/')
    || pathname.startsWith('docs/generated/')
    || pathname.startsWith('docs/config/')
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

function sha256(pathname) {
  if (pathname === outputPath) return null;
  const absolute = path.join(root, pathname);
  return fs.existsSync(absolute) ? crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') : null;
}

function readJson(pathname) {
  return JSON.parse(fs.readFileSync(path.join(root, pathname), 'utf8'));
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
  assert(/^[0-9a-f]{40}$/u.test(value.baselineRevision), `${baselinePath}: invalid baselineRevision`);
  const records = new Map();
  for (const record of value.files ?? []) {
    assert(typeof record.originalPath === 'string' && /^[0-9a-f]{40}$/u.test(record.gitObject),
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
  const files = paths.map((pathname) => {
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
  fs.writeFileSync(path.join(root, classificationPath), `${JSON.stringify(value, null, 2)}\n`);
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
  const current = new Set(paths);
  const unclassified = paths.filter((pathname) => !classification.records.has(pathname));
  const absentClassifications = [...classification.records.keys()].filter((pathname) => !current.has(pathname));
  assert.equal(unclassified.length, 0,
    `unclassified documentation files: ${unclassified.slice(0, 30).join(', ')}`);
  assert.equal(absentClassifications.length, 0,
    `classification records have no current file: ${absentClassifications.slice(0, 30).join(', ')}`);
  const files = paths.map((pathname) => {
    const declared = classification.records.get(pathname);
    const directExecutable = executableConsumers(consumers.get(pathname) ?? []);
    const indirectExecutable = dependencies.indirect.get(pathname) ?? [];
    assert(allowedClasses.has(declared.class), `${pathname}: invalid documentation class`);
    if (pathname.startsWith('docs/site/')) assert.equal(declared.class, 'canonical-reader-documentation',
      `${pathname}: every site file must be canonical reader documentation`);
    if (declared.class === 'canonical-reader-documentation') assert(pathname.startsWith('docs/site/'),
      `${pathname}: canonical reader documentation must be under docs/site/`);
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

if (captureBaselineArgument) {
  const revision = captureBaselineArgument.slice('--capture-baseline='.length);
  assert(revision, '--capture-baseline requires a Git revision');
  captureBaseline(revision);
  process.exit(0);
}
if (bootstrapClassification) {
  writeInitialClassification();
  process.exit(0);
}

const value = build();
const rendered = `${JSON.stringify(value, null, 2)}\n`;
const absoluteOutput = path.join(root, outputPath);
if (checkOnly) {
  assert(fs.existsSync(absoluteOutput), `${outputPath} is missing; run npm run docs:tree:generate`);
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
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, rendered);
  process.stdout.write(`generated ${outputPath} (${value.files.length} files; ${value.misplaced.length} misplaced legacy sources)\n`);
}
