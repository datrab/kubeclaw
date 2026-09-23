#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseHtml } from 'parse5';

const root = path.resolve(import.meta.dirname, '..');
const p = (...parts) => path.join(root, ...parts);
const contractPath = p('docs/blueprint/AP09-acceptance-contract.md');
const fixturePath = p('docs/blueprint/AP09-acceptance-fixtures.json');
const cataloguePath = p('docs/blueprint/generated/ap09-catalogue.json');
const evidenceRoot = p('docs/blueprint/acceptance-evidence');
const expected = new Map([
  ['A97', 12], ['A98', 14], ['A99', 13], ['A910', 14],
  ['A911', 12], ['A912', 12], ['A913', 12],
]);
const packageForPrefix = new Map([
  ['A97', 'AP09.7'], ['A98', 'AP09.8'], ['A99', 'AP09.9'],
  ['A910', 'AP09.10'], ['A911', 'AP09.11'], ['A912', 'AP09.12'], ['A913', 'AP09.13'],
]);
const mutationKinds = [
  'capability', 'cli', 'config', 'contract', 'endpoint', 'error-code', 'event',
  'ops-tool', 'plugin-registration', 'runtime-service', 'schema', 'secret', 'store', 'workflow',
];
const evidenceClasses = new Set([
  'source', 'unit', 'contract', 'render', 'target-image', 'deployment',
  'live', 'manual-reader', 'mutation', 'reviewer',
]);
const manualRunIds = new Set([
  'A97-11', 'A98-13', 'A99-12', 'A910-11', 'A912-10', 'A912-12',
  'A913-03', 'A913-04', 'A913-05', 'A913-06', 'A913-11', 'A913-12',
]);
const renderRunIds = new Set(['A912-01', 'A912-04', 'A912-05', 'A912-06', 'A912-07', 'A912-08', 'A912-09']);
const deploymentRunIds = new Set([
  'A98-03', 'A98-04', 'A98-05', 'A98-06', 'A98-07', 'A98-08', 'A98-09', 'A98-12',
  'A99-06', 'A99-07', 'A99-08', 'A910-01', 'A910-08', 'A910-09',
]);
const mutationRunIds = new Set(['A97-12', 'A98-14', 'A99-13', 'A910-14', 'A911-11', 'A913-08']);
const productLimitIds = new Set(['A97-04', 'A97-06', 'A97-07', 'A910-13', 'A913-10', 'A913-12']);
const requiredExecutionScenarioIds = [
  'EXEC-PLATFORM-SUCCESS', 'EXEC-WAIT-RESUME', 'EXEC-CANCELLATION', 'EXEC-RESTART-RECOVERY',
  'EXEC-UPGRADE', 'EXEC-ROLLBACK', 'EXEC-DECOMMISSION', 'EXEC-PRISM-JOURNEY', 'EXEC-DEMO-JOURNEY',
  'EXEC-FAIL-REDIS', 'EXEC-FAIL-POSTGRESQL', 'EXEC-FAIL-REGISTRY-BUILDKIT', 'EXEC-FAIL-TAILSCALE',
  'EXEC-FAIL-LITELLM', 'EXEC-FAIL-GIT', 'EXEC-FAIL-WORKER-ABORT', 'EXEC-FAIL-UNCERTAIN-EFFECT',
  'EXEC-FAIL-DEMO-REJECTION',
];
function primaryEvidenceClass(id) {
  if (manualRunIds.has(id)) return 'manual-reader';
  if (renderRunIds.has(id)) return 'render';
  if (deploymentRunIds.has(id)) return 'deployment';
  if (mutationRunIds.has(id)) return 'mutation';
  return 'contract';
}
function requiredRunIds(id) {
  return id === 'A98-13' ? ['A98-13-OPERATOR-1', 'A98-13-OPERATOR-2'] : [`${id}-PRIMARY`];
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options }).trim();
}
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function text(value, label, minimum = 1) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert(value.trim().length >= minimum, `${label} must contain at least ${minimum} characters`);
}
function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}
function exactIds(actual, authority, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  unique(actual, label);
  assert.deepEqual([...actual].sort(), [...authority].sort(), `${label} does not match its authority`);
}
function regularFilesBelow(directory, label) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      assert(!fs.lstatSync(absolute).isSymbolicLink(), `${label} contains a symlink`);
      if (entry.isDirectory()) visit(absolute);
      else {
        assert(entry.isFile(), `${label} contains a special entry`);
        files.push(absolute);
      }
    }
  };
  visit(directory);
  return files;
}
function gitTreeEntries(revision, relative, label) {
  assert(!path.isAbsolute(relative), `${label} must be repository-relative`);
  const normalized = path.posix.normalize(relative.replaceAll('\\', '/'));
  assert(!normalized.startsWith('../') && normalized !== '..', `${label} escapes the repository`);
  const output = execFileSync('git', ['ls-tree', '-r', '-z', revision, '--', normalized], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  return output.split('\0').filter(Boolean).map((entry) => {
    const match = entry.match(/^(\d{6}) (\w+) ([a-f0-9]{40})\t([\s\S]+)$/u);
    assert(match, `${label} contains an invalid Git tree entry`);
    return { mode: match[1], type: match[2], object: match[3], path: match[4] };
  });
}
function gitBlob(revision, relative, label) {
  assert(!path.isAbsolute(relative), `${label} must be repository-relative`);
  const normalized = path.posix.normalize(relative.replaceAll('\\', '/'));
  assert(!normalized.startsWith('../') && normalized !== '..', `${label} escapes the repository`);
  const entries = gitTreeEntries(revision, normalized, label);
  assert.equal(entries.length, 1, `${label} is not exactly one tracked file at ${revision}`);
  assert.equal(entries[0].path, normalized, `${label} resolved to a different Git path`);
  assert(['100644', '100755'].includes(entries[0].mode) && entries[0].type === 'blob',
    `${label} must be a regular tracked file, not a symlink or special entry`);
  return execFileSync('git', ['show', `${revision}:${normalized}`], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
}
function slug(value) {
  return value.trim().toLowerCase().replace(/<[^>]+>/gu, '').replace(/[`*_~]/gu, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/gu, '-').replace(/-+/gu, '-');
}
function physicalLineCount(source) {
  if (source === '') return 0;
  return source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
}
function renderedAnchors(source) {
  const anchors = [];
  const visit = (node) => {
    if (node.tagName && Array.isArray(node.attrs)) {
      const id = node.attrs.find((attribute) => attribute.name === 'id')?.value;
      if (id !== undefined) anchors.push(id);
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parseHtml(source));
  return anchors;
}
assert.deepEqual(renderedAnchors('<!-- <p id="comment"> --><script>const x = \' id="script"\';</script><p title=\' id="attribute"\'> id="text"</p><template><h2 id="inert-template">x</h2></template><h2 id="real&amp;anchor">x</h2>'),
  ['real&anchor'], 'HTML anchor parser accepted non-element ID text or failed entity decoding');
assert.equal(physicalLineCount(''), 0, 'empty blob line count changed');
assert.equal(physicalLineCount('one\n'), 1, 'terminated blob has a phantom line');
assert.equal(physicalLineCount('one\ntwo'), 2, 'unterminated blob line count changed');
let publicationAnchors = null;
let publicationPageHashes = null;
function canonicalPage(value, revision, label) {
  text(value, label);
  assert(!value.includes('\\'), `${label} must use canonical POSIX separators`);
  const [relative, fragment, ...extra] = value.split('#');
  assert.equal(extra.length, 0, `${label} has too many fragment separators`);
  const normalized = path.posix.normalize(relative);
  assert.equal(relative, normalized, `${label} path is not canonical`);
  assert(normalized.startsWith('docs/site/') && !normalized.includes('/../') && normalized.endsWith('.md'),
    `${label} must be a published Markdown page below docs/site`);
  const source = gitBlob(revision, normalized, label);
  if (publicationAnchors) assert(publicationAnchors.has(normalized),
    `${label} is absent from the publication anchor inventory`);
  if (fragment) {
    const withoutFences = source.replace(/^(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?:`{3,}|~{3,})\s*$/gmu, '');
    const anchors = publicationAnchors?.get(normalized)
      ?? [...withoutFences.matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) => slug(match[1]));
    assert(anchors.includes(decodeURIComponent(fragment)), `${label} fragment does not exist`);
  }
}
function sourceLink(value, revision, label) {
  text(value, label);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${label} must use HTTPS`);
  assert.equal(url.hostname, 'github.com', `${label} must use github.com`);
  assert(!url.username && !url.password && !url.port && !url.search, `${label} contains unauthorized URL parts`);
  const match = decodeURIComponent(url.pathname).match(/^\/datrab\/kubeclaw\/blob\/([a-f0-9]{40})\/(.+)$/u);
  assert(match, `${label} must reference datrab/kubeclaw/blob/<commit>/<path>`);
  assert.equal(match[1], revision, `${label} uses a different revision`);
  const range = url.hash.match(/^#L(\d+)(?:-L(\d+))?$/u);
  assert(range, `${label} needs an explicit line range`);
  const first = Number(range[1]);
  const last = Number(range[2] ?? range[1]);
  assert(first >= 1 && last >= first && last - first <= 60, `${label} range is invalid or too wide`);
  const source = gitBlob(revision, match[2], label);
  const lineCount = physicalLineCount(source);
  assert(last <= lineCount, `${label} ends after the blob's ${lineCount} lines`);
}

function contract() {
  const source = fs.readFileSync(contractPath, 'utf8');
  const rows = [...source.matchAll(/^\| (A9\d{1,2}-\d{2}) \| (.+) \| (.+) \|$/gmu)]
    .map((match) => ({ id: match[1], pass: match[2], fail: match[3] }));
  unique(rows.map((row) => row.id), 'acceptance IDs');
  assert.equal(rows.length, [...expected.values()].reduce((sum, count) => sum + count, 0));
  for (const [prefix, count] of expected) {
    assert.deepEqual(rows.filter((row) => row.id.startsWith(`${prefix}-`)).map((row) => row.id),
      Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`));
  }
  for (const row of rows) {
    assert(row.pass.length >= 80 && row.fail.length >= 40, `${row.id} is underspecified`);
    assert(!/\b(?:TODO|TBD|later|as needed)\b/iu.test(`${row.pass} ${row.fail}`), `${row.id} is vague`);
  }
  const antiCheating = source.split('## 2. Nicht verhandelbare Regeln gegen Scheinabnahmen')[1]
    .split('## 3. Drei getrennte Beweisebenen')[0];
  assert.equal([...antiCheating.matchAll(/^\d+\. \*\*/gmu)].length, 15, 'anti-cheating rules changed');
  assert(source.includes('261 Anforderungsbefunde') && source.includes('AP09-acceptance-fixtures.json'),
    'contract lacks individual findings or fixtures');
  assert(fs.readFileSync(p('docs/blueprint/AP09-execution-plan.md'), 'utf8').includes('(AP09-acceptance-contract.md)'),
    'execution plan does not bind the contract');
  return rows;
}
function catalogue() {
  const value = json(cataloguePath);
  assert.equal(value.total, 261);
  assert.equal(value.requirements.length, 261);
  unique(value.requirements.map((item) => item.id), 'catalogue IDs');
  for (const [name, count] of new Map([
    ['AP09.7', 53], ['AP09.8', 30], ['AP09.9', 17], ['AP09.10', 27],
    ['AP09.11', 36], ['AP09.12', 10], ['AP09.13', 10],
  ])) assert.equal(value.requirements.filter((item) => item.workPackage === name).length, count, `${name} count changed`);
  return value;
}
function fixture() {
  const value = json(fixturePath);
  assert.equal(value.schemaVersion, 'kubeclaw-ap09-acceptance-fixtures.v1');
  assert.deepEqual(value.readerDelivery, {
    participantVisibleFields: ['id', 'persona', 'startPath', 'objective', 'taskInput', 'allowedAssistance', 'failureThreshold'],
    facilitatorOnlyFields: ['fixturePaths', 'injectedFaultId', 'facilitatorSetup', 'requiredOutcomes', 'participantRequirements'],
  });
  assert.equal(value.searchQueries.length, 5);
  assert.deepEqual(value.renderScenarios.map((item) => item.browser).sort(), ['chromium', 'firefox', 'webkit']);
  const readerPersonaMinimums = new Map([
    ['operator', 4], ['pipeline-author', 4], ['platform-developer', 2],
    ['plugin-developer', 1], ['prism-buster-specialist', 1],
  ]);
  for (const [persona, minimum] of readerPersonaMinimums) assert(
    value.readerTasks.filter((item) => item.persona === persona).length >= minimum,
    `reader tasks need at least ${minimum} ${persona} fixture(s)`,
  );
  exactIds(value.mutationTests.map((item) => item.kind), mutationKinds, 'fixture mutation kinds');
  unique([...value.searchQueries, ...value.renderScenarios, ...value.readerTasks].map((item) => item.id), 'fixture IDs');
  const head = git(['rev-parse', 'HEAD']);
  for (const item of value.searchQueries) {
    text(item.query, `${item.id}.query`, 12);
    canonicalPage(item.expectedPath, head, `${item.id}.expectedPath`);
    assert(Number.isInteger(item.maximumRank) && item.maximumRank >= 1 && item.maximumRank <= 3);
  }
  for (const item of value.renderScenarios) {
    assert(item.viewport.width >= 320 && item.viewport.height >= 600);
    assert(item.paths.length >= 3 && item.assertions.length >= 4, `${item.id} is underspecified`);
    item.paths.forEach((page, index) => canonicalPage(page, head, `${item.id}.paths[${index}]`));
  }
  unique(value.renderCriteria.map((item) => item.id), 'render criterion IDs');
  for (const criterion of value.renderCriteria) text(criterion.passCondition, `${criterion.id}.passCondition`, 80);
  const criterionIds = new Set(value.renderCriteria.map((item) => item.id));
  for (const scenario of value.renderScenarios) scenario.assertions.forEach((id) =>
    assert(criterionIds.has(id), `${scenario.id} references unknown render criterion ${id}`));
  for (const item of value.readerTasks) {
    assert(Array.isArray(item.acceptanceIds) && item.acceptanceIds.length > 0,
      `${item.id}.acceptanceIds must bind the task to gates`);
    unique(item.acceptanceIds, `${item.id}.acceptanceIds`);
    item.acceptanceIds.forEach((id) => assert(expected.has(id.split('-')[0]), `${item.id} has unknown gate ${id}`));
    text(item.objective, `${item.id}.objective`, 80);
    canonicalPage(item.startPath, head, `${item.id}.startPath`);
    assert(item.requiredOutcomes.length >= 4);
    unique(item.requiredOutcomes.map((outcome) => outcome.id), `${item.id}.requiredOutcomes`);
    item.requiredOutcomes.forEach((outcome) => text(outcome.passCondition,
      `${item.id}.${outcome.id}.passCondition`, 50));
    text(item.taskInput, `${item.id}.taskInput`, 80);
    text(item.allowedAssistance, `${item.id}.allowedAssistance`, 80);
    text(item.failureThreshold, `${item.id}.failureThreshold`, 80);
    assert(Array.isArray(item.fixturePaths), `${item.id}.fixturePaths must be an array`);
    if (item.supportState) {
      assert(['supported-component-scope', 'unsupported-boundary'].includes(item.supportState.status),
        `${item.id}.supportState.status is invalid`);
      assert.equal(item.supportState.declaredAtFixtureRevision, true,
        `${item.id}.supportState must bind the fixture revision`);
      assert(item.supportState.authorities.length > 0, `${item.id}.supportState needs authorities`);
      item.supportState.authorities.forEach((page, index) => canonicalPage(page, head,
        `${item.id}.supportState.authorities[${index}]`));
    }
    text(item.injectedFaultId, `${item.id}.injectedFaultId`, 3);
    assert.deepEqual(item.participantRequirements,
      { freshContext: true, priorContribution: false, requiredRole: item.persona });
    assert.deepEqual(item.forbiddenSources, ['package-readme', 'review-file', 'migration-note', 'chat-context']);
  }
  assert(Array.isArray(value.dynamicReaderTaskAuthorities) && value.dynamicReaderTaskAuthorities.length > 0,
    'dynamic reader-task authorities are required');
  unique(value.dynamicReaderTaskAuthorities.map((item) => item.id), 'dynamic reader-task authority IDs');
  for (const item of value.dynamicReaderTaskAuthorities) {
    text(item.path, `${item.id}.path`, 20);
    assert(item.path.startsWith('docs/generated/inventory/') && item.path.endsWith('.json'),
      `${item.id}.path must be a generated inventory`);
    text(item.schemaVersion, `${item.id}.schemaVersion`, 10);
    text(item.generatorCommand, `${item.id}.generatorCommand`, 20);
    assert.deepEqual(item.coverageKinds, ['extension-class', 'complex-plugin']);
    exactIds(item.coverageAuthorities.map((authority) => authority.kind), item.coverageKinds,
      `${item.id}.coverageAuthorities`);
    const extensionAuthority = item.coverageAuthorities.find((authority) => authority.kind === 'extension-class');
    assert.equal(extensionAuthority.taskKind, 'create-new');
    assert.equal(extensionAuthority.mode, 'generated-discovery');
    assert(extensionAuthority.path.startsWith('docs/generated/inventory/') && extensionAuthority.path.endsWith('.json'));
    for (const field of ['schemaVersion', 'arrayField', 'identityField'])
      text(extensionAuthority[field], `${item.id}.extensionAuthority.${field}`, 2);
    exactIds(extensionAuthority.requiredFamilies, ['pipeline', 'host', 'worker-engine'],
      `${item.id}.extension families`);
    const complexAuthority = item.coverageAuthorities.find((authority) => authority.kind === 'complex-plugin');
    assert.equal(complexAuthority.taskKind, 'change-existing');
    assert.equal(complexAuthority.mode, 'generated-classification');
    assert(complexAuthority.path.startsWith('docs/generated/inventory/') && complexAuthority.path.endsWith('.json'));
    for (const field of ['schemaVersion', 'arrayField', 'identityField', 'classificationField', 'acceptedValue'])
      text(complexAuthority[field], `${item.id}.complexAuthority.${field}`, 2);
    assert(item.requiredTaskFields.length >= 9, `${item.id} lacks required task fields`);
    text(item.passCondition, `${item.id}.passCondition`, 100);
    assert(item.acceptanceIds.includes('A910-13'), `${item.id} must bind A910-13`);
  }
  exactIds(value.executionScenarios.map((item) => item.id), requiredExecutionScenarioIds,
    'execution scenario IDs');
  for (const scenario of value.executionScenarios) {
    assert(Array.isArray(scenario.acceptanceIds) && scenario.acceptanceIds.length > 0,
      `${scenario.id}.acceptanceIds is empty`);
    unique(scenario.acceptanceIds, `${scenario.id}.acceptanceIds`);
    text(scenario.commandAuthority, `${scenario.id}.commandAuthority`, 20);
    text(scenario.objective, `${scenario.id}.objective`, 40);
    text(scenario.setup, `${scenario.id}.setup`, 30);
    text(scenario.injectedFaultId, `${scenario.id}.injectedFaultId`, 3);
    assert(evidenceClasses.has(scenario.evidenceClass), `${scenario.id}.evidenceClass is invalid`);
    assert(scenario.expectedObservations.length >= 4, `${scenario.id} needs four observations`);
    unique(scenario.expectedObservations.map((item) => item.id), `${scenario.id}.observation IDs`);
    scenario.expectedObservations.forEach((item) => text(item.passCondition,
      `${scenario.id}.${item.id}.passCondition`, 30));
    text(scenario.failureThreshold, `${scenario.id}.failureThreshold`, 30);
  }
  for (const item of value.mutationTests) {
    assert.equal(item.gate, `docs:drift:${item.kind}:check`);
    assert.equal(item.command, `npm run ${item.gate}`);
    assert.deepEqual(item.operations, ['add', 'change', 'remove']);
    assert.match(item.diagnosticCode, /^DOC_DRIFT_[A-Z_]+$/u);
    assert(Array.isArray(item.variants) && item.variants.length > 0, `${item.kind} needs concrete variants`);
    unique(item.variants.map((variant) => variant.id), `${item.kind} variant IDs`);
    for (const variant of item.variants) {
      assert.match(variant.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, `${item.kind} variant ID is invalid`);
      assert(fs.existsSync(p(variant.sourceAuthority)) && fs.statSync(p(variant.sourceAuthority)).isFile(),
        `${item.kind}:${variant.id} source authority is missing`);
      text(variant.constructor, `${item.kind}:${variant.id}.constructor`, 8);
      assert(Array.isArray(variant.expectedPages) && variant.expectedPages.length > 0,
        `${item.kind}:${variant.id} needs expected pages`);
      text(variant.semanticChange, `${item.kind}:${variant.id}.semanticChange`, 20);
    }
  }
  return value;
}

function artifacts(evidence) {
  assert(Array.isArray(evidence.artifacts) && evidence.artifacts.length > 0);
  unique(evidence.artifacts.map((item) => item.id), 'artifact IDs');
  const rootReal = fs.realpathSync(evidenceRoot);
  assert.equal(rootReal, path.resolve(evidenceRoot), 'evidence root must not be a symlink');
  return new Map(evidence.artifacts.map((item) => {
    assert(evidenceClasses.has(item.evidence_class), `${item.id} has an unknown evidence class`);
    assert.equal(item.status, 'captured', `${item.id} was not captured`);
    assert.match(item.sha256, /^[a-f0-9]{64}$/u);
    assert(Number.isInteger(item.bytes) && item.bytes > 0);
    const normalized = path.posix.normalize(item.path.replaceAll('\\', '/'));
    assert.equal(normalized, item.path, `${item.id} path is not canonical`);
    assert(normalized.startsWith('docs/blueprint/acceptance-evidence/'), `${item.id} is outside evidence root`);
    const absolute = path.resolve(root, normalized);
    assert(fs.existsSync(absolute) && fs.statSync(absolute).isFile(), `${item.id} is missing`);
    for (let cursor = absolute; cursor !== evidenceRoot; cursor = path.dirname(cursor)) {
      assert(!fs.lstatSync(cursor).isSymbolicLink(), `${item.id} path contains a symlink`);
    }
    assert(fs.realpathSync(absolute).startsWith(`${rootReal}${path.sep}`), `${item.id} escapes evidence root`);
    const content = fs.readFileSync(absolute);
    const treeEntry = git(['ls-tree', 'HEAD', '--', normalized]);
    assert.match(treeEntry, /^100(?:644|755) blob [a-f0-9]{40}\t/u, `${item.id} is not a regular tracked blob`);
    const committed = execFileSync('git', ['show', `HEAD:${normalized}`], { cwd: root });
    assert(content.equals(committed), `${item.id} differs from its committed blob`);
    assert.equal(content.length, item.bytes, `${item.id} byte count differs`);
    assert.equal(crypto.createHash('sha256').update(content).digest('hex'), item.sha256, `${item.id} hash differs`);
    return [item.id, item];
  }));
}
function artifactRefs(values, index, label, evidenceClass) {
  assert(Array.isArray(values) && values.length > 0, `${label} must reference artifacts`);
  unique(values, label);
  for (const id of values) {
    assert(index.has(id), `${label} references unknown artifact ${id}`);
    if (evidenceClass) assert.equal(index.get(id).evidence_class, evidenceClass, `${label} needs ${evidenceClass}`);
  }
}
function evidence(file, rows, catalog, fixtures) {
  const ledgerPath = path.resolve(file);
  assert(ledgerPath.startsWith(`${path.resolve(evidenceRoot)}${path.sep}`), 'ledger must be below acceptance-evidence');
  assert(fs.realpathSync(ledgerPath).startsWith(`${fs.realpathSync(evidenceRoot)}${path.sep}`),
    'ledger must not escape acceptance-evidence through a symlink');
  const ledgerRelative = path.relative(root, ledgerPath).split(path.sep).join('/');
  assert.equal(path.posix.normalize(ledgerRelative), ledgerRelative, 'ledger path is not canonical');
  assert.match(git(['ls-tree', 'HEAD', '--', ledgerRelative]), /^100(?:644|755) blob [a-f0-9]{40}\t/u,
    'ledger is not a regular tracked blob at HEAD');
  const value = json(ledgerPath);
  assert.equal(value.schemaVersion, 'kubeclaw-ap09-evidence.v2');
  assert.match(value.reviewed_revision, /^[a-f0-9]{40}$/u);
  const head = git(['rev-parse', 'HEAD']);
  assert.notEqual(value.reviewed_revision, head, 'reviewed revision and evidence commit must differ');
  git(['merge-base', '--is-ancestor', value.reviewed_revision, head]);
  assert.equal(git(['status', '--porcelain']), '', 'acceptance requires a clean worktree');
  const changed = git(['diff', '--name-only', `${value.reviewed_revision}..${head}`]).split('\n').filter(Boolean);
  assert(changed.length > 0 && changed.every((item) => item.startsWith('docs/blueprint/acceptance-evidence/')),
    'only evidence files may change after reviewed_revision');
  const fixtureSource = gitBlob(value.reviewed_revision, 'docs/blueprint/AP09-acceptance-fixtures.json', 'fixtures');
  assert.equal(value.fixture_sha256, crypto.createHash('sha256').update(fixtureSource).digest('hex'));
  const artifactIndex = artifacts(value);
  artifactRefs([value.publication.build_report_artifact_id, value.publication.anchor_inventory_artifact_id,
    value.publication.route_inventory_artifact_id, value.publication.allowlist_probe_artifact_id],
    artifactIndex, 'publication artifacts', 'render');
  const buildReport = json(p(artifactIndex.get(value.publication.build_report_artifact_id).path));
  const anchorInventoryArtifact = artifactIndex.get(value.publication.anchor_inventory_artifact_id);
  const anchorInventory = json(p(anchorInventoryArtifact.path));
  const routeInventoryArtifact = artifactIndex.get(value.publication.route_inventory_artifact_id);
  const routeInventory = json(p(routeInventoryArtifact.path));
  const allowlistProbe = json(p(artifactIndex.get(value.publication.allowlist_probe_artifact_id).path));
  const outputRootRelative = path.posix.normalize(value.publication.output_root);
  assert(outputRootRelative.startsWith('docs/blueprint/acceptance-evidence/')
    && !outputRootRelative.includes('/../'), 'publication output root is outside evidence');
  const outputRoot = p(outputRootRelative);
  assert(fs.existsSync(outputRoot) && fs.statSync(outputRoot).isDirectory(), 'publication output root is missing');
  const capturedOutputFiles = regularFilesBelow(outputRoot, 'publication output root');
  const artifactByPath = new Map([...artifactIndex.values()].map((item) => [item.path, item]));
  for (const outputFile of capturedOutputFiles) {
    const relativeOutput = path.relative(root, outputFile).split(path.sep).join('/');
    assert.equal(artifactByPath.get(relativeOutput)?.evidence_class, 'render',
      `${relativeOutput} is not a captured render artifact`);
  }
  const publicationTree = gitTreeEntries(value.reviewed_revision, 'docs/site', 'publication tree');
  const markdownEntries = publicationTree.filter((item) => item.path.endsWith('.md'));
  assert(markdownEntries.every((item) => ['100644', '100755'].includes(item.mode) && item.type === 'blob'),
    'publication tree contains a Markdown symlink or special entry');
  const sourceManifestBytes = gitBlob(value.reviewed_revision,
    value.publication.source_manifest_path, 'publication source manifest');
  const sourceManifest = JSON.parse(sourceManifestBytes);
  assert.equal(sourceManifest.schemaVersion, 'kubeclaw-publication-manifest.v1');
  assert(Array.isArray(sourceManifest.pages) && sourceManifest.pages.length > 0,
    'publication source manifest has no pages');
  unique(sourceManifest.pages.map((item) => item.sourcePath), 'publication source paths');
  unique(sourceManifest.pages.map((item) => item.route), 'publication routes');
  unique(sourceManifest.pages.map((item) => item.canonicalUrl), 'publication canonical URLs');
  const trackedMarkdown = new Set(markdownEntries.map((item) => item.path));
  const publishedPages = sourceManifest.pages.map((item) => {
    canonicalPage(item.sourcePath, value.reviewed_revision, 'publication source page');
    assert(trackedMarkdown.has(item.sourcePath), `${item.sourcePath} is not tracked Markdown`);
    text(item.route, `${item.sourcePath}.route`, 1);
    text(item.canonicalUrl, `${item.sourcePath}.canonicalUrl`, 1);
    return item.sourcePath;
  }).sort();
  const pageDigest = crypto.createHash('sha256');
  for (const page of publishedPages) pageDigest.update(gitBlob(value.reviewed_revision, page, 'publication page'));
  assert.equal(buildReport.schemaVersion, 'kubeclaw-docs-publication.v1');
  assert.equal(buildReport.revision, value.reviewed_revision, 'publication report revision differs');
  assert.equal(buildReport.sourceManifestSha256,
    crypto.createHash('sha256').update(sourceManifestBytes).digest('hex'),
    'publication report is not bound to the source manifest');
  assert.equal(buildReport.pageCount, publishedPages.length, 'publication page count differs');
  assert.equal(buildReport.pageDigest, pageDigest.digest('hex'), 'publication source digest differs');
  assert.equal(buildReport.anchorInventorySha256, anchorInventoryArtifact.sha256,
    'publication report is not bound to the anchor inventory');
  assert.equal(buildReport.routeInventorySha256, routeInventoryArtifact.sha256,
    'publication report is not bound to the emitted route inventory');
  assert.equal(anchorInventory.schemaVersion, 'kubeclaw-publication-anchors.v1');
  assert.equal(anchorInventory.revision, value.reviewed_revision);
  exactIds(anchorInventory.pages.map((item) => item.path), publishedPages, 'publication anchor pages');
  assert.equal(allowlistProbe.schemaVersion, 'kubeclaw-publication-allowlist-probe.v1');
  assert.equal(allowlistProbe.revision, value.reviewed_revision);
  assert.equal(allowlistProbe.status, 'excluded');
  assert(allowlistProbe.injectedPath.startsWith('docs/site/') && allowlistProbe.injectedPath.endsWith('.md'));
  assert(!publishedPages.includes(allowlistProbe.injectedPath), 'allowlist probe path was published');
  assert.equal(allowlistProbe.outputRoot, outputRootRelative);
  assert.equal(buildReport.allowlistProbeId, allowlistProbe.id,
    'publication report is not bound to the allowlist probe run');
  assert.equal(allowlistProbe.exitCode, 0, 'allowlist probe renderer did not exit zero');
  text(allowlistProbe.command, 'publication allowlist probe command', 10);
  text(allowlistProbe.expectedOutputPath, 'publication allowlist probe expected output path', 3);
  text(allowlistProbe.expectedRoute, 'publication allowlist probe expected route', 1);
  artifactRefs([allowlistProbe.injectedSourceArtifactId], artifactIndex,
    'publication allowlist injected source', 'render');
  const injectedArtifact = artifactIndex.get(allowlistProbe.injectedSourceArtifactId);
  assert.equal(allowlistProbe.injectedSourceSha256, injectedArtifact.sha256,
    'allowlist probe is not bound to injected source bytes');
  const capturedRelativeOutputs = capturedOutputFiles.map((file) => path.relative(outputRoot, file)
    .split(path.sep).join('/'));
  assert(!capturedRelativeOutputs.includes(allowlistProbe.expectedOutputPath),
    'allowlist probe produced an output page');
  assert.equal(routeInventory.schemaVersion, 'kubeclaw-publication-routes.v1');
  assert.equal(routeInventory.revision, value.reviewed_revision);
  assert(Array.isArray(routeInventory.routes), 'emitted route inventory has no routes');
  unique(routeInventory.routes.map((item) => item.route), 'emitted publication routes');
  assert(!routeInventory.routes.some((item) => item.route === allowlistProbe.expectedRoute
    || item.sourcePath === allowlistProbe.injectedPath
    || item.outputPath === allowlistProbe.expectedOutputPath),
  'allowlist probe appears in emitted route inventory');
  text(allowlistProbe.observation, 'publication allowlist probe observation', 30);
  publicationAnchors = new Map();
  publicationPageHashes = new Map();
  assert(Array.isArray(buildReport.pages), 'publication report lacks rendered page records');
  exactIds(buildReport.pages.map((item) => item.sourcePath), publishedPages, 'publication report pages');
  for (const page of anchorInventory.pages) {
    unique(page.anchors, `${page.path}.anchors`);
    assert.match(page.output_sha256, /^[a-f0-9]{64}$/u, `${page.path} output hash is invalid`);
    artifactRefs([page.output_artifact_id], artifactIndex, `${page.path}.rendered_output`, 'render');
    const outputArtifact = artifactIndex.get(page.output_artifact_id);
    const outputBytes = fs.readFileSync(p(outputArtifact.path));
    const actualOutputHash = crypto.createHash('sha256').update(outputBytes).digest('hex');
    assert.equal(page.output_sha256, actualOutputHash, `${page.path} output hash differs from rendered bytes`);
    const manifestPage = sourceManifest.pages.find((item) => item.sourcePath === page.path);
    const reportPage = buildReport.pages.find((item) => item.sourcePath === page.path);
    const outputPath = path.relative(outputRoot, p(outputArtifact.path)).split(path.sep).join('/');
    assert.deepEqual(reportPage, {
      sourcePath: page.path,
      route: manifestPage.route,
      canonicalUrl: manifestPage.canonicalUrl,
      outputPath,
      outputArtifactId: page.output_artifact_id,
      outputSha256: actualOutputHash,
    }, `${page.path} build report does not bind manifest route to rendered output`);
    const rendered = outputBytes.toString('utf8');
    const actualAnchors = renderedAnchors(rendered);
    unique(actualAnchors, `${page.path}.rendered anchors`);
    exactIds(page.anchors, actualAnchors, `${page.path}.anchors from rendered output`);
    publicationAnchors.set(page.path, page.anchors);
    publicationPageHashes.set(page.path, page.output_sha256);
  }
  exactIds(capturedRelativeOutputs.filter((item) => item.endsWith('.html')),
    buildReport.pages.map((item) => item.outputPath), 'complete rendered HTML output inventory');
  exactIds(routeInventory.routes.map((item) => item.route),
    buildReport.pages.map((item) => item.route), 'complete emitted route inventory');
  for (const route of routeInventory.routes) {
    const reportPage = buildReport.pages.find((item) => item.route === route.route);
    assert.deepEqual(route, {
      route: reportPage.route,
      sourcePath: reportPage.sourcePath,
      outputPath: reportPage.outputPath,
      canonicalUrl: reportPage.canonicalUrl,
    }, `${route.route} emitted route differs from the build report`);
  }
  const outputPageDigest = crypto.createHash('sha256').update(anchorInventory.pages
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((page) => `${page.path}\0${page.output_sha256}\n`).join('')).digest('hex');
  assert.equal(buildReport.outputPageDigest, outputPageDigest, 'publication output digest differs');
  const catalogueById = new Map(catalog.requirements.map((item) => [item.id, item]));
  const gateIds = rows.map((row) => row.id);
  const gateSet = new Set(gateIds);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const dynamicReaderTasks = [];
  assert(Array.isArray(value.dynamic_task_authorities), 'dynamic_task_authorities must be recorded');
  exactIds(value.dynamic_task_authorities.map((item) => item.id),
    fixtures.dynamicReaderTaskAuthorities.map((item) => item.id), 'dynamic task authority results');
  for (const authority of fixtures.dynamicReaderTaskAuthorities) {
    const result = value.dynamic_task_authorities.find((item) => item.id === authority.id);
    assert.equal(result.command, authority.generatorCommand, `${authority.id} used a different generator command`);
    assert.equal(result.exit_code, 0, `${authority.id} generator check did not pass`);
    artifactRefs(result.artifact_ids, artifactIndex, `${authority.id}.artifacts`, 'contract');
    const generated = JSON.parse(gitBlob(value.reviewed_revision, authority.path, authority.id));
    assert.equal(generated.schemaVersion, authority.schemaVersion, `${authority.id} schema differs`);
    assert(Array.isArray(generated.tasks) && generated.tasks.length > 0, `${authority.id} has no tasks`);
    unique(generated.tasks.map((item) => item.id), `${authority.id} task IDs`);
    for (const task of generated.tasks) {
      for (const field of authority.requiredTaskFields) assert(Object.hasOwn(task, field),
        `${authority.id}.${task.id} lacks ${field}`);
      assert(authority.coverageKinds.includes(task.coverageKind), `${task.id} has unknown coverage kind`);
      const coverageAuthority = authority.coverageAuthorities.find((item) => item.kind === task.coverageKind);
      assert.equal(task.taskKind, coverageAuthority.taskKind, `${task.id} has the wrong task kind`);
      text(task.coveredIdentity, `${task.id}.coveredIdentity`, 2);
      text(task.sourceAuthority, `${task.id}.sourceAuthority`, 5);
      gitBlob(value.reviewed_revision, task.sourceAuthority, `${task.id}.sourceAuthority`);
      assert.deepEqual(task.acceptanceIds, authority.acceptanceIds, `${task.id} changed acceptance binding`);
      assert(task.requiredOutcomes.length >= 4, `${task.id} lacks executable outcomes`);
      assert.deepEqual(task.participantRequirements,
        { freshContext: true, priorContribution: false, requiredRole: task.persona });
      assert.deepEqual(task.forbiddenSources, ['package-readme', 'review-file', 'migration-note', 'chat-context']);
      canonicalPage(task.startPath, value.reviewed_revision, `${task.id}.startPath`);
      task.fixturePaths.forEach((fixtureFile) => gitBlob(value.reviewed_revision, fixtureFile,
        `${task.id}.fixturePaths`));
      dynamicReaderTasks.push(task);
    }
    for (const coverage of authority.coverageAuthorities) {
      let expectedIdentities;
      if (coverage.mode === 'generated-discovery') {
        const discovery = JSON.parse(gitBlob(value.reviewed_revision, coverage.path,
          `${authority.id}.${coverage.kind}.discovery`));
        assert.equal(discovery.schemaVersion, coverage.schemaVersion);
        assert(Array.isArray(discovery[coverage.arrayField]), `${coverage.path} lacks ${coverage.arrayField}`);
        expectedIdentities = discovery[coverage.arrayField].map((item) => item[coverage.identityField]);
        exactIds([...new Set(discovery[coverage.arrayField].map((item) => item.family))],
          coverage.requiredFamilies, `${authority.id}.${coverage.kind}.families`);
      } else {
        const classification = JSON.parse(gitBlob(value.reviewed_revision, coverage.path,
          `${authority.id}.${coverage.kind}.classification`));
        assert.equal(classification.schemaVersion, coverage.schemaVersion);
        assert(Array.isArray(classification[coverage.arrayField]), `${coverage.path} lacks ${coverage.arrayField}`);
        expectedIdentities = classification[coverage.arrayField]
          .filter((item) => item[coverage.classificationField] === coverage.acceptedValue)
          .map((item) => item[coverage.identityField]);
      }
      assert(expectedIdentities.length > 0, `${authority.id} has no ${coverage.kind} identities`);
      exactIds(generated.tasks.filter((task) => task.coverageKind === coverage.kind)
        .map((task) => task.coveredIdentity), expectedIdentities, `${authority.id}.${coverage.kind} coverage`);
    }
  }
  const allReaderTasks = [...fixtures.readerTasks, ...dynamicReaderTasks];
  unique(allReaderTasks.map((item) => item.id), 'all reader task IDs');

  exactIds(value.requirements.map((item) => item.id), [...catalogueById.keys()], 'requirement findings');
  for (const finding of value.requirements) {
    const authority = catalogueById.get(finding.id);
    assert.equal(finding.work_package, authority.workPackage);
    assert.equal(finding.owner, authority.owner);
    assert.equal(finding.canonical_target, authority.canonicalTarget);
    assert.equal(finding.revision, value.reviewed_revision);
    assert.equal(finding.verdict, 'PASS');
    text(finding.reader_question, `${finding.id}.reader_question`, 30);
    text(finding.finding, `${finding.id}.finding`, 60);
    canonicalPage(finding.canonical_target, value.reviewed_revision, `${finding.id}.canonical_target`);
    assert(finding.source_evidence.length > 0);
    finding.source_evidence.forEach((link, index) => sourceLink(link, value.reviewed_revision,
      `${finding.id}.source_evidence[${index}]`));
    artifactRefs(finding.artifact_ids, artifactIndex, `${finding.id}.artifact_ids`);
    assert(Array.isArray(finding.acceptance_ids) && finding.acceptance_ids.length > 0);
    unique(finding.acceptance_ids, `${finding.id}.acceptance_ids`);
    finding.acceptance_ids.forEach((id) => assert(gateSet.has(id), `${finding.id} references unknown ${id}`));
    const ownPrefix = [...packageForPrefix].find(([, workPackage]) => workPackage === finding.work_package)?.[0];
    assert(finding.acceptance_ids.some((id) => id.startsWith(`${ownPrefix ?? 'A913'}-`)),
      `${finding.id} lacks a gate in its package or AP09.13`);
  }

  assert(Array.isArray(value.reviewers) && value.reviewers.length === 3);
  assert.deepEqual(value.reviewers.map((item) => item.role).sort(), ['quality', 'reader', 'source']);
  unique(value.reviewers.map((item) => item.id), 'reviewer IDs');
  const reviewerIds = value.reviewers.map((item) => item.id);
  for (const reviewer of value.reviewers) {
    text(reviewer.assignment, `${reviewer.id}.assignment`, 80);
    assert.equal(reviewer.fresh_context, true);
    assert.equal(reviewer.initial_read_only, true);
    assert.equal(reviewer.verdict, 'PASS');
    artifactRefs([reviewer.report_artifact_id], artifactIndex, `${reviewer.id}.report`, 'reviewer');
  }
  assert(Array.isArray(value.participants) && value.participants.length >= allReaderTasks.length,
    'reader executions need separate participant records');
  unique(value.participants.map((item) => item.id), 'participant IDs');
  assert(value.participants.every((item) => !reviewerIds.includes(item.id)),
    'reviewers and execution participants must use different identities');
  const participantById = new Map();
  for (const participant of value.participants) {
    assert(allReaderTasks.some((item) => item.persona === participant.role),
      `${participant.id} has an unknown participant role`);
    assert.equal(participant.fresh_context, true, `${participant.id} lacks fresh context`);
    assert.equal(participant.prior_contribution, false, `${participant.id} contributed before the test`);
    assert.equal(participant.prohibited_assistance_acknowledged, true,
      `${participant.id} did not acknowledge the assistance boundary`);
    artifactRefs([participant.report_artifact_id], artifactIndex, `${participant.id}.report`, 'manual-reader');
    participantById.set(participant.id, participant);
  }
  assert(value.participants.filter((item) => item.role === 'operator').length >= 2,
    'at least two distinct operators are required');
  for (const task of fixtures.readerTasks) task.fixturePaths.forEach((fixtureFile) =>
    gitBlob(value.reviewed_revision, fixtureFile, `${task.id}.fixturePaths`));

  assert(Array.isArray(value.reader_attempts), 'reader_attempts must retain every declared attempt');
  unique(value.reader_attempts.map((item) => item.attempt_id), 'reader attempt IDs');
  const attemptById = new Map();
  for (const attempt of value.reader_attempts) {
    assert(allReaderTasks.some((item) => item.id === attempt.fixture_id),
      `${attempt.attempt_id} has an unknown fixture`);
    assert(participantById.has(attempt.participant_id), `${attempt.attempt_id} has no participant`);
    assert(['PASS', 'FAIL'].includes(attempt.verdict), `${attempt.attempt_id} has an invalid verdict`);
    assert.match(attempt.started_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
    artifactRefs(attempt.artifact_ids, artifactIndex, `${attempt.attempt_id}.artifact_ids`, 'manual-reader');
    attemptById.set(attempt.attempt_id, attempt);
  }

  assert(Array.isArray(value.scenario_results), 'scenario_results must be recorded');
  exactIds(value.scenario_results.map((item) => item.scenario_id),
    fixtures.executionScenarios.map((item) => item.id), 'execution scenario results');
  for (const result of value.scenario_results) {
    const scenario = fixtures.executionScenarios.find((item) => item.id === result.scenario_id);
    assert.equal(result.revision, value.reviewed_revision, `${result.scenario_id}.revision differs`);
    assert.equal(result.verdict, 'PASS', `${result.scenario_id} did not pass`);
    assert.equal(result.objective, scenario.objective, `${result.scenario_id}.objective changed`);
    assert.equal(result.injected_fault_id, scenario.injectedFaultId,
      `${result.scenario_id}.injected fault changed`);
    assert.equal(result.command_authority, scenario.commandAuthority,
      `${result.scenario_id}.command authority changed`);
    canonicalPage(result.command_authority, value.reviewed_revision,
      `${result.scenario_id}.command_authority`);
    text(result.environment, `${result.scenario_id}.environment`, 20);
    assert(Array.isArray(result.steps) && result.steps.length > 0, `${result.scenario_id} has no steps`);
    for (const [index, step] of result.steps.entries()) {
      text(step.command ?? step.action, `${result.scenario_id}.steps[${index}]`, 3);
      assert(['passed', 'expected-failure'].includes(step.status),
        `${result.scenario_id}.steps[${index}] has invalid status`);
      if (step.command) assert(Number.isInteger(step.exit_code), `${result.scenario_id}.steps[${index}] needs exit code`);
      text(step.observation, `${result.scenario_id}.steps[${index}].observation`, 20);
    }
    exactIds(result.observed_outcomes, scenario.expectedObservations.map((item) => item.id),
      `${result.scenario_id}.observed_outcomes`);
    artifactRefs(result.artifact_ids, artifactIndex, `${result.scenario_id}.artifacts`, scenario.evidenceClass);
    if (scenario.injectedFaultId !== 'NONE') {
      artifactRefs([result.fault_injection_artifact_id], artifactIndex,
        `${result.scenario_id}.fault_injection`, scenario.evidenceClass);
    }
  }

  exactIds(value.points.map((item) => item.acceptance_id), gateIds, 'acceptance points');
  for (const point of value.points) {
    const label = point.acceptance_id;
    assert.equal(point.revision, value.reviewed_revision);
    assert.equal(point.verdict, 'PASS');
    text(point.reader_task, `${label}.reader_task`, 40);
    text(point.reason, `${label}.reason`, 80);
    const mapped = value.requirements.filter((item) => item.acceptance_ids.includes(label)).map((item) => item.id);
    exactIds(point.catalogue_ids, mapped, `${label}.catalogue_ids`);
    exactIds(point.reader_fixture_ids,
      allReaderTasks.filter((task) => task.acceptanceIds.includes(label)).map((task) => task.id),
      `${label}.reader_fixture_ids`);
    exactIds(point.execution_scenario_ids,
      fixtures.executionScenarios.filter((scenario) => scenario.acceptanceIds.includes(label))
        .map((scenario) => scenario.id), `${label}.execution_scenario_ids`);
    assert(mapped.length > 0, `${label} has no individual findings`);
    assert(point.canonical_pages.length > 0 && point.source_evidence.length > 0);
    point.canonical_pages.forEach((page, index) => canonicalPage(page, value.reviewed_revision,
      `${label}.canonical_pages[${index}]`));
    point.source_evidence.forEach((link, index) => sourceLink(link, value.reviewed_revision,
      `${label}.source_evidence[${index}]`));
    text(point.execution.environment, `${label}.execution.environment`, 20);
    const runs = [...(point.execution.commands ?? []), ...(point.execution.manual_steps ?? [])];
    assert(runs.length > 0, `${label} has no execution`);
    unique(runs.map((run) => run.run_id), `${label}.execution.run_ids`);
    exactIds(runs.filter((run) => requiredRunIds(label).includes(run.run_id)).map((run) => run.run_id),
      requiredRunIds(label), `${label}.required_runs`);
    for (const [index, run] of runs.entries()) {
      assert(['passed', 'failed', 'blocked', 'skipped'].includes(run.status),
        `${label}.execution[${index}] has an invalid status`);
      text(run.command ?? run.action, `${label}.execution[${index}].action`, 3);
      if (run.command) assert(Number.isInteger(run.exit_code), `${run.run_id} needs an exit code`);
      text(run.observation, `${label}.execution[${index}].observation`, 20);
      assert(evidenceClasses.has(run.evidence_class), `${run.run_id} has an invalid evidence class`);
      artifactRefs(run.artifact_ids, artifactIndex, `${label}.execution[${index}].artifact_ids`, run.evidence_class);
      if (requiredRunIds(label).includes(run.run_id)) {
        assert.equal(run.status, 'passed', `${run.run_id} is required and did not pass`);
        if (run.command) assert.equal(run.exit_code, 0, `${run.run_id} did not exit zero`);
        assert.equal(run.evidence_class, primaryEvidenceClass(label), `${run.run_id} has the wrong evidence class`);
        assert.equal(run.expected_outcome, rowById.get(label).pass, `${run.run_id} changed its expected outcome`);
      }
    }
    if (label === 'A98-13') {
      const actors = requiredRunIds(label).map((id) => runs.find((run) => run.run_id === id).participant_id);
      unique(actors, `${label} operator participants`);
      actors.forEach((id) => assert.equal(participantById.get(id)?.role, 'operator', `${id} is not an operator`));
    }
    assert(point.negative_proof.length > 0 && point.limits.length > 0);
    for (const [index, proof] of point.negative_proof.entries()) {
      text(proof.scenario, `${label}.negative_proof[${index}].scenario`, 20);
      text(proof.expected_failure, `${label}.negative_proof[${index}].expected_failure`, 20);
      text(proof.observed, `${label}.negative_proof[${index}].observed`, 20);
      artifactRefs(proof.artifact_ids, artifactIndex, `${label}.negative_proof[${index}].artifact_ids`);
      for (const artifactId of proof.artifact_ids) assert(!['source', 'reviewer'].includes(artifactIndex.get(artifactId).evidence_class),
        `${label}.negative_proof[${index}] cannot use passive source or reviewer evidence`);
    }
    for (const [index, limit] of point.limits.entries()) {
      assert(['none', 'documented-product-limit'].includes(limit.status));
      if (limit.status === 'documented-product-limit') assert(productLimitIds.has(label),
        `${label} cannot substitute a product limit for its required evidence`);
      for (const key of ['reason', 'effect', 'owner', 'acceptance_condition']) text(limit[key], `${label}.limits[${index}].${key}`, key === 'owner' ? 2 : 20);
      artifactRefs(limit.artifact_ids, artifactIndex, `${label}.limits[${index}].artifact_ids`);
    }
    exactIds(point.reviewer_ids, reviewerIds, `${label}.reviewer_ids`);
  }

  const allFixtures = [...fixtures.searchQueries, ...fixtures.renderScenarios, ...allReaderTasks];
  exactIds(value.fixture_results.map((item) => item.fixture_id), allFixtures.map((item) => item.id), 'fixture results');
  for (const result of value.fixture_results) {
    assert.equal(result.verdict, 'PASS');
    text(result.observation, `${result.fixture_id}.observation`, 30);
    artifactRefs(result.artifact_ids, artifactIndex, `${result.fixture_id}.artifact_ids`);
    const search = fixtures.searchQueries.find((item) => item.id === result.fixture_id);
    if (search) {
      assert.equal(result.query, search.query, `${result.fixture_id} query changed`);
      assert.equal(result.observed_path, search.expectedPath);
      assert(Number.isInteger(result.observed_rank) && result.observed_rank >= 1
        && result.observed_rank <= search.maximumRank);
      assert(Array.isArray(result.ranked_results) && result.ranked_results.length >= result.observed_rank,
        `${result.fixture_id} lacks complete ranked results`);
      result.ranked_results.forEach((page, index) => canonicalPage(page, value.reviewed_revision,
        `${result.fixture_id}.ranked_results[${index}]`));
      assert.equal(result.ranked_results[result.observed_rank - 1], result.observed_path,
        `${result.fixture_id} rank and result list disagree`);
      artifactRefs(result.artifact_ids, artifactIndex, `${result.fixture_id}.artifact_ids`, 'render');
    }
    const reader = allReaderTasks.find((item) => item.id === result.fixture_id);
    if (reader) {
      assert.equal(result.task_input, reader.taskInput, `${result.fixture_id} received a different task input`);
      exactIds(result.observed_outcomes, reader.requiredOutcomes.map((item) => item.id),
        `${result.fixture_id}.outcomes`);
      const participant = participantById.get(result.participant_id);
      assert(participant, `${result.fixture_id} has no registered participant`);
      assert.equal(participant.role, reader.participantRequirements.requiredRole,
        `${result.fixture_id} used the wrong participant role`);
      assert(result.assistance_attestation && typeof result.assistance_attestation === 'object',
        `${result.fixture_id} lacks an assistance attestation`);
      assert.equal(result.assistance_attestation.within_registered_boundary, true,
        `${result.fixture_id} exceeded the registered assistance boundary`);
      assert(Array.isArray(result.assistance_attestation.resources_used),
        `${result.fixture_id} did not record resources used`);
      assert(Array.isArray(result.assistance_attestation.facilitator_actions),
        `${result.fixture_id} did not record facilitator actions`);
      const attempt = attemptById.get(result.accepted_attempt_id);
      assert(attempt && attempt.fixture_id === result.fixture_id && attempt.participant_id === result.participant_id
        && attempt.verdict === 'PASS', `${result.fixture_id} has no matching accepted attempt`);
      artifactRefs(result.artifact_ids, artifactIndex, `${result.fixture_id}.artifact_ids`, 'manual-reader');
    }
    const render = fixtures.renderScenarios.find((item) => item.id === result.fixture_id);
    if (render) {
      assert(Array.isArray(result.path_results), `${result.fixture_id}.path_results must be an array`);
      exactIds(result.path_results.map((item) => item.path), render.paths, `${result.fixture_id}.paths`);
      for (const pathResult of result.path_results) {
        assert.equal(pathResult.browser, render.browser, `${result.fixture_id} used the wrong browser`);
        assert.deepEqual(pathResult.viewport, render.viewport, `${result.fixture_id} used the wrong viewport`);
        text(pathResult.browser_version, `${result.fixture_id}.browser_version`, 2);
        text(pathResult.operating_system, `${result.fixture_id}.operating_system`, 3);
        assert.equal(pathResult.renderer_revision, value.reviewed_revision,
          `${result.fixture_id}.renderer_revision differs from reviewed_revision`);
        assert.equal(pathResult.publication_page_sha256, publicationPageHashes.get(pathResult.path),
          `${result.fixture_id}.${pathResult.path} was rendered from a different publication output`);
        exactIds(pathResult.observed_assertions, render.assertions,
          `${result.fixture_id}.${pathResult.path}.assertions`);
        artifactRefs(pathResult.artifact_ids, artifactIndex,
          `${result.fixture_id}.${pathResult.path}.artifact_ids`, 'render');
      }
    }
  }
  const readerResults = value.fixture_results.filter((result) =>
    allReaderTasks.some((task) => task.id === result.fixture_id));
  unique(readerResults.map((result) => result.participant_id),
    'accepted reader-task participant identities');
  const mutationIds = fixtures.mutationTests.flatMap((item) => item.variants.flatMap((variant) =>
    item.operations.map((operation) => `${item.kind}:${variant.id}:${operation}`)));
  exactIds(value.mutations.map((item) => item.mutation_id), mutationIds, 'mutation matrix');
  for (const mutation of value.mutations) {
    const authority = fixtures.mutationTests.find((item) => item.kind === mutation.kind);
    const variant = authority?.variants.find((item) => item.id === mutation.variant);
    assert(variant, `${mutation.mutation_id} has an unregistered variant`);
    assert.equal(mutation.mutation_id, `${mutation.kind}:${mutation.variant}:${mutation.operation}`);
    assert(authority.operations.includes(mutation.operation), `${mutation.mutation_id} operation is not registered`);
    assert.equal(mutation.status, 'rejected');
    assert.equal(mutation.source_authority, variant.sourceAuthority,
      `${mutation.mutation_id} changed a different source surface`);
    assert.equal(mutation.constructor, variant.constructor,
      `${mutation.mutation_id} used a different mutation constructor`);
    assert.equal(mutation.semantic_change, variant.semanticChange,
      `${mutation.mutation_id} changed different semantics`);
    exactIds(mutation.expected_pages, variant.expectedPages, `${mutation.mutation_id}.expected_pages`);
    gitBlob(value.reviewed_revision, variant.sourceAuthority, `${mutation.mutation_id}.source_authority`);
    variant.expectedPages.forEach((page, index) => canonicalPage(page, value.reviewed_revision,
      `${mutation.mutation_id}.expected_pages[${index}]`));
    assert.equal(mutation.command, authority.command, `${mutation.kind} used an unregistered command`);
    assert.equal(mutation.expected_gate, authority.gate, `${mutation.kind} expected gate differs from fixture`);
    assert.equal(mutation.observed_gate, mutation.expected_gate, `${mutation.kind} failed at an unrelated gate`);
    assert.equal(mutation.diagnostic_code, authority.diagnosticCode,
      `${mutation.kind} did not emit the registered documentation-drift diagnostic`);
    assert.equal(mutation.baseline_exit_code, 0, `${mutation.mutation_id} baseline was not green`);
    assert(Number.isInteger(mutation.mutated_exit_code) && mutation.mutated_exit_code > 0,
      `${mutation.mutation_id} mutated gate did not fail`);
    text(mutation.failure_observation, `${mutation.kind}.failure_observation`, 20);
    artifactRefs([mutation.patch_artifact_id, mutation.baseline_artifact_id], artifactIndex,
      `${mutation.kind}.setup_artifacts`, 'mutation');
    artifactRefs(mutation.artifact_ids, artifactIndex, `${mutation.kind}.artifact_ids`, 'mutation');
    const patchArtifact = artifactIndex.get(mutation.patch_artifact_id);
    const recordedPatch = fs.readFileSync(p(patchArtifact.path));
    const expectedPatch = execFileSync(process.execPath,
      [p('scripts/docs-ap09-mutation-fixture.mjs'), '--emit', mutation.mutation_id], {
        cwd: root, maxBuffer: 32 * 1024 * 1024,
      });
    assert(recordedPatch.equals(expectedPatch), `${mutation.mutation_id} patch differs from preregistered constructor`);
    const patchText = recordedPatch.toString('utf8');
    const touchedPaths = [...patchText.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)]
      .flatMap((match) => [match[1], match[2]]);
    assert(touchedPaths.length > 0 && touchedPaths.every((item) => item === variant.sourceAuthority),
      `${mutation.mutation_id} patch touches an unregistered source`);
  }
}

const rows = contract();
const catalog = catalogue();
const fixtures = fixture();
const evidenceIndex = process.argv.indexOf('--evidence');
if (evidenceIndex >= 0) {
  assert(process.argv[evidenceIndex + 1], '--evidence requires a JSON path');
  evidence(process.argv[evidenceIndex + 1], rows, catalog, fixtures);
}
process.stdout.write(`${JSON.stringify({
  ok: true,
  acceptancePoints: rows.length,
  packageCounts: Object.fromEntries([...expected].map(([prefix, count]) => [packageForPrefix.get(prefix), count])),
  catalogueRequirements: catalog.total,
  fixtures: fixtures.searchQueries.length + fixtures.renderScenarios.length + fixtures.readerTasks.length
    + fixtures.executionScenarios.length
    + fixtures.mutationTests.reduce((sum, item) => sum + (item.operations.length * item.variants.length), 0),
  evidenceValidated: evidenceIndex >= 0,
})}\n`);
