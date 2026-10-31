import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildSourceSurfaceMap, assertSourceSurfaceMap, assertAuthorityMatrix,
  requiredSurfaceFamilies, generatedPageFreshnessChecks } from '../lib/docs-source-surface-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapFile = path.join(root, 'docs/site/reference/generated-documentation-map.json');
const committed = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const build = (file, mutate, pages = committed.pages) => buildSourceSurfaceMap(root, pages, candidate => {
  const value = read(candidate);
  if (candidate === file) mutate(value);
  return value;
});
let baselineCache;
const currentBaseline = () => baselineCache ??= buildSourceSurfaceMap(root, committed.pages);
const stale = changed => assert.throws(() => assertSourceSurfaceMap(typeof changed === 'function' ? changed() : changed, currentBaseline()), /source-map stale\/orphan|authority-matrix/u);

function authorityFixture() {
  const families = requiredSurfaceFamilies.map(id => ({ id, title: id,
    canonicalTarget: 'docs/site/product-surfaces.md', owner: 'fixture documentation owner' }));
  const records = families.map(family => ({ normalizedIdentity: `manual:${family.id}`,
    surFamily: family.id, sourceAuthority: 'fixture/current-source-boundary',
    consumerBoundary: 'Authored family explanation; actual consumer review required.',
    canonicalTarget: family.canonicalTarget, owner: family.owner,
    scopeLimit: 'Manual review route only, not generated or runtime evidence.',
    checks: ['independent affected source/reader/quality review'], generator: null,
    recordKind: 'manual-review-route', primaryMechanicalAuthority: false,
    freshness: 'manual-review-required', classification: 'authored-high-level-surface',
    classificationBasis: 'Explicit fixture review route; no source discovery claim.' }));
  records.push({ normalizedIdentity: 'schema-property:fixture/schema.json:/properties/timeout',
    surFamily: 'SUR-API-03', sourceAuthority: 'fixture/schema.json',
    consumerBoundary: 'Declared schema annotation, not consumer insertion.',
    canonicalTarget: 'docs/site/reference/schemas.md', owner: 'fixture schema owner',
    scopeLimit: 'Declaration only; no runtime or validation execution.',
    checks: ['fixture schema owner check'], generator: 'fixture schema owner',
    inventory: 'fixture/schema-index.json', factsSha256: '1'.repeat(64),
    recordKind: 'source-bound-fact', primaryMechanicalAuthority: true,
    classification: 'declaration-only', classificationBasis: 'Explicit fixture declaration.' });
  for (const family of families) {
    const typedIdentities = records.filter(record => record.recordKind !== 'manual-review-route'
      && record.surFamily === family.id).map(record => record.normalizedIdentity).sort();
    family.authorityAvailability = typedIdentities.length
      ? { disposition: 'named-admitted-typed-authorities', typedIdentities }
      : { disposition: 'no-admitted-typed-inventory-for-high-level-surface', typedIdentities,
        selectedInventories: ['fixture/schema-index.json'], reason: 'Fixture inventory covers schema properties only, not this high-level family.' };
  }
  const inverse = new Map();
  for (const record of records) {
    if (!inverse.has(record.canonicalTarget)) inverse.set(record.canonicalTarget, []);
    inverse.get(record.canonicalTarget).push(record.normalizedIdentity);
  }
  return { schemaVersion: 'source-authority-matrix.v1', families, records,
    inverse: [...inverse].sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([canonicalTarget, identities]) => ({ canonicalTarget, identities: identities.sort() })) };
}

test('generated page freshness preserves declared generator and bounded configuration classes', () => {
  const configuration = new Set(['docs/site/reference/environment-variables.md']);
  const generated = new Set(['cli', 'workflows', 'verification-commands', 'sdk-exports', 'configuration']
    .map(name => `docs/site/reference/${name}.md`));
  for (const page of [...configuration, ...generated].filter(page => !page.endsWith('/configuration.md'))) {
    assert.deepEqual(generatedPageFreshnessChecks(page, configuration, generated), ['npm run docs:generate:check']);
  }
  const bounded = generatedPageFreshnessChecks('docs/site/reference/configuration.md', configuration, generated, 'a'.repeat(40));
  assert.equal(bounded.length, 2);
  assert(bounded[0].includes('--configuration-reference-only --check'));
  assert(bounded[1].includes('--only configuration-hub'));
  assert.deepEqual(generatedPageFreshnessChecks('docs/site/product-surfaces.md', configuration, generated), []);
});

test('manual route cannot replace an available selected typed authority', () => {
  assertAuthorityMatrix(authorityFixture());
  const missing = authorityFixture();
  const removed = missing.records.pop();
  missing.inverse = missing.inverse.filter(row => row.canonicalTarget !== removed.canonicalTarget);
  assert.throws(() => assertAuthorityMatrix(missing), /available typed authority cannot be replaced/u);
  const undisposed = authorityFixture(); delete undisposed.families[0].authorityAvailability;
  assert.throws(() => assertAuthorityMatrix(undisposed), /availability disposition/u);
  const unsupported = authorityFixture(); unsupported.families[0].authorityAvailability.reason = '';
  assert.throws(() => assertAuthorityMatrix(unsupported), /bounded inventory disposition/u);
});

test('authority matrix cannot promote a manual route to generated or mechanical proof', () => {
  assertAuthorityMatrix(authorityFixture());
  for (const change of [record => { record.generator = 'fictional generator'; },
    record => { record.primaryMechanicalAuthority = true; },
    record => { record.freshness = 'current-and-complete'; }]) {
    const matrix = authorityFixture(); change(matrix.records[0]);
    assert.throws(() => assertAuthorityMatrix(matrix), /authority-matrix manual route/u);
  }
});

test('authority matrix refuses unowned or ambiguous facts rather than silently excluding them', () => {
  for (const field of ['sourceAuthority', 'consumerBoundary', 'canonicalTarget', 'owner',
    'scopeLimit', 'checks', 'generator', 'inventory', 'classificationBasis']) {
    const matrix = authorityFixture(); delete matrix.records.at(-1)[field];
    assert.throws(() => assertAuthorityMatrix(matrix), /authority-matrix/u, field);
  }
  const duplicate = authorityFixture(); duplicate.records.push(structuredClone(duplicate.records.at(-1)));
  assert.throws(() => assertAuthorityMatrix(duplicate), /duplicate identity\/primary authority/u);
  const ambiguous = authorityFixture(); ambiguous.records.at(-1).surFamily = ['SUR-API-02', 'SUR-API-03'];
  assert.throws(() => assertAuthorityMatrix(ambiguous), /ambiguous or missing SUR assignment/u);
  const missingFamily = authorityFixture(); missingFamily.families.pop();
  assert.throws(() => assertAuthorityMatrix(missingFamily), /missing SUR family/u);
});

test('authority matrix retains exact inverse and one real primary for projection references', () => {
  const staleInverse = authorityFixture(); staleInverse.inverse[0].identities.pop();
  assert.throws(() => assertAuthorityMatrix(staleInverse), /inverse identity relation/u);
  const competing = authorityFixture();
  competing.records.push({ ...competing.records.at(-1), normalizedIdentity: 'projection:timeout',
    recordKind: 'projection-reference', primaryMechanicalAuthority: false,
    primaryIdentity: competing.records.at(-1).normalizedIdentity, sourceAuthority: 'fixture/competing.json' });
  assert.throws(() => assertAuthorityMatrix(competing), /orphan or competing primary authority/u);
});

test('prompt library routes through the actual governance owner and rejects missing source, owner or package check', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-owner-route-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  // Execute the genuine owner in a disposable repository-shaped fixture. Only
  // this fixture's guide, copied owner and generated map may be written.
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (['docs', 'scripts', 'skills', '.git'].includes(entry.name)) continue;
    fs.symlinkSync(path.join(root, entry.name), path.join(temporary, entry.name));
  }
  fs.mkdirSync(path.join(temporary, 'skills/common/plugins'), { recursive: true });
  fs.cpSync(path.join(root, 'skills/common/plugins/prompt-contract'), path.join(temporary, 'skills/common/plugins/prompt-contract'), { recursive: true });
  for (const name of fs.readdirSync(path.join(root, 'skills'))) {
    if (name !== 'common') fs.symlinkSync(path.join(root, 'skills', name), path.join(temporary, 'skills', name));
  }
  for (const name of fs.readdirSync(path.join(root, 'skills/common'))) {
    if (name !== 'plugins') fs.symlinkSync(path.join(root, 'skills/common', name), path.join(temporary, 'skills/common', name));
  }
  for (const name of fs.readdirSync(path.join(root, 'skills/common/plugins'))) {
    if (name !== 'prompt-contract') fs.symlinkSync(path.join(root, 'skills/common/plugins', name), path.join(temporary, 'skills/common/plugins', name));
  }

  fs.mkdirSync(path.join(temporary, 'docs'));
  for (const entry of fs.readdirSync(path.join(root, 'docs'), { withFileTypes: true })) {
    const source = path.join(root, 'docs', entry.name), target = path.join(temporary, 'docs', entry.name);
    if (entry.name === 'site') fs.cpSync(source, target, { recursive: true });
    else fs.symlinkSync(source, target);
  }
  fs.mkdirSync(path.join(temporary, 'scripts'));
  for (const name of fs.readdirSync(path.join(root, 'scripts'))) {
    if (name !== 'docs-governance.mjs') fs.symlinkSync(path.join(root, 'scripts', name), path.join(temporary, 'scripts', name));
  }
  const ownerPath = path.join(temporary, 'scripts/docs-governance.mjs');
  const guidePath = path.join(temporary, 'docs/site/extend/contracts.md');
  const owner = fs.readFileSync(path.join(root, 'scripts/docs-governance.mjs'), 'utf8');
  const guide = fs.readFileSync(guidePath, 'utf8');
  fs.writeFileSync(ownerPath, owner);
  const run = (...args) => spawnSync(process.execPath, [ownerPath, ...args], { cwd: temporary, encoding: 'utf8' });
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  result = run('--check');
  assert.equal(result.status, 0, result.stderr);
  const actual = JSON.parse(fs.readFileSync(path.join(temporary, 'docs/site/reference/generated-documentation-map.json'), 'utf8'));
  const page = actual.pages.find(item => item.page === 'docs/site/extend/contracts.md');
  assert.equal(page.owner, 'plugin-foundation');
  assert.ok(page.sourceDependencies.includes('skills/common/plugins/prompt-contract'));
  for (const command of ['npm run build --workspace @kubeclaw/prompt-contract', 'npm test --workspace @kubeclaw/prompt-contract']) assert.ok(page.checks.includes(command));
  for (const changed of [guide.replace('; skills/common/plugins/prompt-contract\n', '\n'), guide.replace('Owner: plugin-foundation', 'Owner: unrelated-component')]) {
    assert.notEqual(changed, guide);
    fs.writeFileSync(guidePath, changed);
    result = run('--check');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Prompt-contract source\/owner\/package-check route is incomplete/u);
  }
  fs.writeFileSync(guidePath, guide);
  const exportedSource = path.join(temporary, 'skills/common/plugins/prompt-contract/src/index.ts');
  const sourceBytes = fs.readFileSync(exportedSource);
  fs.rmSync(exportedSource);
  result = run('--check');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Prompt-contract source\/owner\/package-check route is incomplete/u);
  fs.writeFileSync(exportedSource, sourceBytes);
  const packagePath = path.join(temporary, 'skills/common/plugins/prompt-contract/package.json');
  const packageBytes = fs.readFileSync(packagePath);
  const declaration = JSON.parse(packageBytes);
  for (const changed of [{ ...declaration, exports: { '.': './src/unrelated.ts' } },
    { ...declaration, scripts: { ...declaration.scripts, test: '' } }]) {
    fs.writeFileSync(packagePath, JSON.stringify(changed));
    result = run('--check');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Prompt-contract source\/owner\/package-check route is incomplete/u);
  }
  fs.writeFileSync(packagePath, packageBytes);
  const wrongCheck = owner.replace('checks.unshift(...promptContractChecks);', 'checks.unshift(promptContractChecks[0]);');
  assert.notEqual(wrongCheck, owner);
  fs.writeFileSync(ownerPath, wrongCheck);
  result = run('--check');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Prompt-contract source\/owner\/package-check route is incomplete/u);
  fs.writeFileSync(ownerPath, owner);
  assert.equal(run('--check').status, 0);
});

test('current inventory join and inverse bindings match the generated map', () => {
  assertSourceSurfaceMap(committed.sourceSurfaceMap, currentBaseline());
  for (const domain of currentBaseline().domains) {
    assert(domain.readerTask && domain.generator && domain.checks.length);
    for (const surface of domain.surfaces) {
      assert(surface.source && surface.owner);
      assert(currentBaseline().pageSources.find(page => page.page === surface.target.split('#')[0]).sourceIds.includes(surface.sourceId));
    }
  }
});

// These are join-adapter tests, not substitutes for raw source/parser mutation
// suites. Each adapter consumes the real inventory shape and owning page roster.
const cases = [
  ['sdk-reference', data => data.exports, item => { item.name += 'Mutation'; }, item => { item.signature += ' mutation'; }],
  ['platform-surfaces', data => data.endpoints, item => { item.source = 'package.json'; }, item => { item.activationCondition = 'changed condition'; }],
  ['workflows', data => data.workflows, item => { item.path += '.mutation'; }, item => { item.triggers.push('mutation'); }],
  ['plugin-system', data => data.registrations, item => { item.id += '.mutation'; item.registrationId += '.mutation'; }, item => { item.kind += '.mutation'; }],
  ['configuration-helm-values', data => data.files[0].documents[0].fields, item => { item.path += '.mutation'; }, item => { item.type = 'mutation'; }],
  ['configuration-schemas', data => data.files[0].fields, item => { item.path += '.mutation'; }, item => { item.type = 'mutation'; }],
  ['configuration-runtime-inputs', data => data.cliFlags, item => { item.name += '-mutation'; item.surface = 'operator-runtime'; }, item => { item.default += ' mutation'; }],
];
for (const [name, collection, rename, change] of cases) {
  const file = `docs/generated/inventory/${name}.json`;
  test(`${name}: add/change/remove modifies the join without count shortcuts`, () => {
    // The SDK name determines its real anchor. Add another entrypoint for an
    // existing name to exercise addition while keeping the target valid.
    stale(() => build(file, data => {
      const item = structuredClone(collection(data)[0]);
      if (name === 'sdk-reference') item.entrypoint += '/mutation';
      else rename(item);
      collection(data).push(item);
    }));
    stale(() => build(file, data => {
      const item = name === 'configuration-runtime-inputs'
        ? collection(data).find(item => item.surface === 'operator-runtime') : collection(data)[0];
      change(item);
    }));
    stale(() => build(file, data => {
      const list = collection(data);
      const index = name === 'configuration-runtime-inputs' ? list.findIndex(item => item.surface === 'operator-runtime') : list.length - 1;
      list.splice(index, 1);
    }));
  });
}

test('internal workflow and each package route to their actual owning reader page', () => {
  const workflows = currentBaseline().domains.find(item => item.domain === 'workflow');
  assert(workflows.surfaces.filter(item => item.source === '.github/workflows/docs-checks.yaml')
    .every(item => item.target === 'docs/site/extend/documentation-maintenance.md#generate-only-owned-facts-then-check'));
  const plugins = currentBaseline().domains.find(item => item.domain === 'plugin');
  for (const item of read('docs/generated/inventory/plugin-system.json').packages) {
    assert(plugins.surfaces.some(surface => surface.source === item.manifest && surface.target === `docs/site/extend/plugin-catalogue/${item.id}.md#package-reference`));
  }
});

test('complete SDK support closure keeps declarations, members and qualified reference destinations', () => {
  const inventory = read('docs/generated/inventory/sdk-reference.json');
  const support = currentBaseline().domains.find(item => item.domain === 'sdk-support');
  assert.equal(support.surfaces.length, inventory.supportTypes.reduce((count, item) =>
    count + 1 + item.members.length + item.referencedSupport.length, 0));
  const declarations = new Map(support.surfaces.filter(item => item.sourceId.includes(':declaration:'))
    .map(item => [decodeURIComponent(item.sourceId.split(':').at(-1)), item]));
  for (const item of inventory.supportTypes) {
    assert.equal(declarations.get(item.qualifiedName).source, item.source.source);
    assert.notEqual(declarations.get(item.qualifiedName).target.split('#')[1], item.name.toLowerCase());
    for (const qualified of item.referencedSupport) {
      const edge = support.surfaces.find(surface => surface.sourceId.endsWith(
        `:reference:${encodeURIComponent(item.qualifiedName)}:${encodeURIComponent(qualified)}`));
      assert(edge, `missing qualified reference: ${item.qualifiedName} -> ${qualified}`);
      if (declarations.has(qualified)) assert.equal(edge.target, declarations.get(qualified).target);
      assert(edge.owner && support.checks.includes('node scripts/docs-sdk-reference.mjs --check'));
    }
  }
});

test('SDK support member changes/removal and complete declaration removal are not count-only matches', () => {
  const file = 'docs/generated/inventory/sdk-reference.json';
  stale(() => build(file, data => { data.supportTypes[0].members[0].signature += ' | null'; }));
  stale(() => build(file, data => { data.supportTypes[0].members.pop(); }));
  const data = read(file);
  const referenced = new Set(data.supportTypes.flatMap(item => item.referencedSupport));
  const removable = data.supportTypes.find(item => !referenced.has(item.qualifiedName));
  assert(removable, 'control requires a reachable declaration without incoming support edges');
  stale(() => build(file, value => {
    value.supportTypes = value.supportTypes.filter(item => item.qualifiedName !== removable.qualifiedName);
  }));
});

test('new undocumented SDK support, forged identity, unresolved edge and named-export promotion fail closed', () => {
  const file = 'docs/generated/inventory/sdk-reference.json';
  assert.throws(() => build(file, data => {
    const item = structuredClone(data.supportTypes[0]);
    item.name += 'New';
    item.source.symbol = item.name;
    item.qualifiedName = `${item.source.source}#${item.name}`;
    data.supportTypes.push(item);
  }), /missing\/ambiguous SDK support heading/u);
  assert.throws(() => build(file, data => { data.supportTypes[0].qualifiedName += 'Forged'; }), /invalid qualified SDK support identity/u);
  assert.throws(() => build(file, data => { data.supportTypes[0].referencedSupport.push('unknown/source.ts#Missing'); }), /unresolved qualified SDK reference/u);
  assert.throws(() => build(file, data => { data.supportTypes[0].publicNamedExport = true; }), /support declaration is a named export/u);
  assert.throws(() => build(file, data => {
    const item = data.supportTypes[0];
    item.name = data.supportTypes.find(other => other.source.source === item.source.source && other.name !== item.name).name;
  }), /support heading differs from declaration/u);
});

test('wrong existing SDK support destination and inverse omission remain detectable', () => {
  const bad = structuredClone(currentBaseline());
  const support = bad.domains.find(item => item.domain === 'sdk-support');
  const wrongTarget = support.surfaces.find(item => item.target !== support.surfaces[0].target).target;
  support.surfaces[0].target = wrongTarget;
  stale(bad);
  const inverse = structuredClone(currentBaseline());
  const page = inverse.pageSources.find(item => item.page === 'docs/site/reference/sdk-exports.md');
  page.sourceIds = page.sourceIds.filter(sourceId => !sourceId.startsWith('sdk-support:'));
  stale(inverse);
});

test('wrong existing page, valid existing source ID, member omission and inverse omission fail', () => {
  let bad = structuredClone(currentBaseline());
  bad.domains[0].surfaces[0].target = 'docs/site/reference/cli.md#defined-flags';
  stale(bad);
  bad = structuredClone(currentBaseline());
  bad.domains[0].surfaces[0].sourceId = bad.domains[0].surfaces[1].sourceId;
  stale(bad);
  bad = structuredClone(currentBaseline());
  const sdk = bad.domains.find(item => item.domain === 'sdk');
  sdk.surfaces.splice(sdk.surfaces.findIndex(item => item.sourceId.includes(':member:')), 1);
  // All present lengths/counts can be refreshed; exact membership still differs.
  bad.pageSources = bad.pageSources.map(page => ({ ...page, sourceIds: page.sourceIds.filter(sourceId => sdk.surfaces.some(item => item.sourceId === sourceId) || !sourceId.startsWith('sdk:')) }));
  stale(bad);
  bad = structuredClone(currentBaseline());
  bad.pageSources[0].sourceIds.pop();
  stale(bad);
});

test('orphan source binding, removed canonical page, missing anchor and duplicate identity fail directly', () => {
  assert.throws(() => build('docs/generated/inventory/plugin-system.json', data => {
    const item = structuredClone(data.packages[0]);
    item.id += '.mutation';
    data.packages.push(item);
  }), /source-map orphan page/u);
  assert.throws(() => build('docs/config/platform-surface-map.json', data => {
    delete data.endpoints.identityTargets[Object.keys(data.endpoints.identityTargets)[0]];
  }), /source-map orphan source/u);
  assert.throws(() => build('', () => {}, committed.pages.filter(page => page.page !== 'docs/site/reference/sdk-exports.md')), /source-map orphan page/u);
  assert.throws(() => build('docs/config/platform-surface-map.json', data => {
    data.endpoints.identityTargets[Object.keys(data.endpoints.identityTargets)[0]] = 'docs/site/reference/cli.md#not-an-existing-anchor';
  }), /source-map orphan anchor/u);
  assert.throws(() => build('docs/generated/inventory/workflows.json', data => data.workflows.push(structuredClone(data.workflows[0]))), /source-map duplicate source identity/u);
});

// Finite added adapters: changing actual typed facts must invalidate the same
// owner output. These do not requalify the underlying source parsers.
for (const [file, collection, rename, change] of [
  ['docs/generated/inventory/configuration-families.json', data => data.facts,
    item => { item.setting += '.mutation'; }, item => { item.consumer += ' changed'; }],
  ['docs/generated/inventory/schema-field-drift.json', data => data.schemas,
    item => { item.path = 'package.json'; }, item => { item.status = 'changed-declaration-status'; }],
  ['docs/generated/inventory/cli-surfaces.json', data => data.sources,
    item => { item.path = 'package.json'; }, item => { item.ownership.boundary += ' changed'; }],
  ['docs/config/common-error-catalogue.json', data => data.entries,
    item => { item.id += '.mutation'; }, item => { item.consumer += ' changed'; }],
  ['packaging/runtime/package-ownership.json', data => data.packages,
    item => { item.id += '.mutation'; }, item => { item.owner += '-changed'; }],
  ['docs/operator-tasks.json', data => data.tasks,
    item => { item.taskId += '.mutation'; }, item => { item.owner += '-changed'; }],
]) test(`${file}: added authority adapter detects add/change/remove`, () => {
  for (const mutation of [data => { const item = structuredClone(collection(data)[0]); rename(item); collection(data).push(item); },
    data => change(collection(data)[0]), data => { collection(data).splice(0, 1); }]) {
    stale(() => build(file, mutation));
  }
});

test('source disagreement and native fixture/profile forgery fail closed', () => {
  const inconsistent = authorityFixture();
  inconsistent.records[0].sourceBindingSha256 = '1'.repeat(64);
  inconsistent.records[1].sourceBindingSha256 = '2'.repeat(64);
  assert.throws(() => assertAuthorityMatrix(inconsistent), /source snapshot disagreement/u);
  for (const mutation of [item => { item.activationState = 'public'; },
    item => { item.evidenceLocation = 'unqualified'; }, item => { item.profile = 'unknown-profile'; }]) {
    assert.throws(() => build('docs/generated/inventory/platform-surfaces.json', data => {
      const items = Object.values(data).filter(Array.isArray).flat();
      const fixture = items.find(item => item?.source === 'helm:fixture/buster-runtime-registry');
      assert(fixture, 'real bounded fixture record is required by this control');
      mutation(fixture);
    }), /authority-matrix orphan source/u);
  }
});
